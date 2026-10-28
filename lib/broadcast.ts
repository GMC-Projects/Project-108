/**
 * The broadcast worker: works through p108_broadcast_sends (migration 010).
 *
 * Called by /api/broadcast/tick — from cron every minute, and straight away by the
 * gmc-app dashboard after it queues a test or single-person send, so those do not
 * wait for the next tick.
 *
 * Two queues, different rules:
 *   - test and manual rows go out on every tick, whatever the bulk run is doing —
 *     someone is waiting on them;
 *   - bulk rows go out BATCH at a time, at most one batch per BATCH_SPACING_SECONDS,
 *     and only while the broadcast is `sending`. The relay is shared with gmc-app's
 *     own mail, and a burst of thousands is how an IP gets throttled.
 *
 * Every row is claimed before it is sent and marked straight after, so overlapping
 * ticks never send the same row, and a crash costs at most the rows in flight
 * (re-claimed after CLAIM_TTL_MINUTES) rather than the whole run.
 */

import { pool } from "@/lib/db";
import { sendMail, classifyMailError } from "@/lib/mail";
import { livestreamEmail } from "@/lib/emails/livestream";
import { SITE_ORIGIN } from "@/lib/emails/layout";
import { mintUnsubscribeToken, subscribeSecretConfigured } from "@/lib/subscribeToken";

export const BROADCAST_ID = "livestream-2026";

const BATCH = 50;
/** Cron ticks every minute; this keeps bulk batches about two minutes apart. */
const BATCH_SPACING_SECONDS = 110;
/** A row stuck in `sending` this long belongs to a crashed tick and is re-claimed. */
const CLAIM_TTL_MINUTES = 10;
const PRIORITY_LIMIT = 20;
const SEND_PACING_MS = 400;

type Broadcast = {
  link: string | null;
  starts_at: Date | null;
  status: string;
};

type Claimed = { id: string; email: string; to_email: string; kind: string };

export type TickResult = {
  sent: number;
  failed: number;
  skipped: number;
  paused?: string;
  note?: string;
};

function unsubscribeUrl(email: string): string {
  const qs = new URLSearchParams({ e: email, t: mintUnsubscribeToken(email) });
  return `${SITE_ORIGIN}/api/unsubscribe?${qs.toString()}`;
}

async function claim(kinds: string[], limit: number): Promise<Claimed[]> {
  const r = await pool!.query(
    `UPDATE p108_broadcast_sends
        SET status = 'sending', claimed_at = now(), attempts = attempts + 1
      WHERE id IN (
            SELECT id FROM p108_broadcast_sends
             WHERE broadcast_id = $1
               AND kind = ANY($2::text[])
               AND (status = 'waiting'
                    OR (status = 'sending' AND claimed_at < now() - make_interval(mins => $4)))
             ORDER BY id
             LIMIT $3
             FOR UPDATE SKIP LOCKED)
      RETURNING id, email, to_email, kind`,
    [BROADCAST_ID, kinds, limit, CLAIM_TTL_MINUTES],
  );
  return r.rows;
}

async function isUnsubscribed(email: string): Promise<boolean> {
  const r = await pool!.query(
    `SELECT 1 FROM p108_subscribers
      WHERE lower(email) = lower($1) AND unsubscribed_at IS NOT NULL
      LIMIT 1`,
    [email],
  );
  return (r.rowCount ?? 0) > 0;
}

async function mark(
  id: string,
  status: "sent" | "failed" | "skipped" | "waiting",
  error?: string,
  permanent = false,
): Promise<void> {
  await pool!.query(
    `UPDATE p108_broadcast_sends
        SET status = $2,
            sent_at = CASE WHEN $2 = 'sent' THEN now() ELSE sent_at END,
            last_error = $3,
            permanent = $4
      WHERE id = $1`,
    [id, status, error ? error.slice(0, 500) : null, permanent],
  );
}

/**
 * Send one claimed row. Returns "relay" when the relay itself refused us — the
 * caller stops the batch, since every following send would fail the same way.
 */
async function sendOne(
  row: Claimed,
  b: Broadcast,
): Promise<"sent" | "failed" | "skipped" | "relay"> {
  if (row.kind !== "test" && (await isUnsubscribed(row.email))) {
    await mark(row.id, "skipped", "Unsubscribed before this was sent");
    return "skipped";
  }
  try {
    const email = livestreamEmail({
      link: b.link!,
      startsAt: b.starts_at!,
      unsubscribeUrl: unsubscribeUrl(row.email),
    });
    await sendMail({ to: row.to_email, subject: email.subject, html: email.html, text: email.text });
    await mark(row.id, "sent");
    return "sent";
  } catch (err) {
    const kind = classifyMailError(err);
    const code = (err as { responseCode?: number } | null)?.responseCode ?? 0;
    const msg = `[${kind}] ${err instanceof Error ? err.message : String(err)}`;
    console.error(`[broadcast] ${row.kind} to ${row.to_email} failed`, msg);
    if (kind === "relay" && row.kind === "bulk") {
      // Not this person's fault: put them back in the queue for when we resume.
      await mark(row.id, "waiting", msg);
      return "relay";
    }
    await mark(row.id, "failed", msg, kind === "recipient" && code >= 500);
    return "failed";
  }
}

export async function runBroadcastTick(): Promise<TickResult> {
  const result: TickResult = { sent: 0, failed: 0, skipped: 0 };
  if (!pool) return { ...result, note: "no database" };
  if (!subscribeSecretConfigured()) {
    // Every message carries a signed unsubscribe link; without the secret we cannot
    // mint one, and we do not send campaign mail people cannot leave.
    return { ...result, note: "SUBSCRIBE_SECRET is not set" };
  }

  const br = await pool.query(
    `SELECT link, starts_at, status FROM p108_broadcasts WHERE id = $1`,
    [BROADCAST_ID],
  );
  const b: Broadcast | undefined = br.rows[0];
  if (!b?.link || !b.starts_at) return { ...result, note: "link or start time not set" };

  const tally = (o: string) => {
    if (o === "sent") result.sent++;
    else if (o === "skipped") result.skipped++;
    else result.failed++;
  };

  for (const row of await claim(["test", "manual"], PRIORITY_LIMIT)) {
    tally(await sendOne(row, b));
  }

  // The pacing gate doubles as the lock: only the tick that moves last_batch_at
  // forward gets to send this window's batch.
  const gate = await pool.query(
    `UPDATE p108_broadcasts
        SET last_batch_at = now(), updated_at = now()
      WHERE id = $1 AND status = 'sending'
        AND (last_batch_at IS NULL OR last_batch_at < now() - make_interval(secs => $2))
      RETURNING id`,
    [BROADCAST_ID, BATCH_SPACING_SECONDS],
  );
  if (gate.rowCount !== 1) return result;

  const batch = await claim(["bulk"], BATCH);
  for (let i = 0; i < batch.length; i++) {
    const outcome = await sendOne(batch[i], b);
    if (outcome === "relay") {
      // Release the rest of the batch untouched and pause, so a throttle is not
      // made worse by hammering it. Staff resume from the dashboard.
      const rest = batch.slice(i + 1).map((r) => r.id);
      if (rest.length) {
        await pool.query(
          `UPDATE p108_broadcast_sends SET status = 'waiting', attempts = attempts - 1
            WHERE id = ANY($1::bigint[])`,
          [rest],
        );
      }
      const reason = "The mail relay started refusing us. Resume once it settles.";
      await pool.query(
        `UPDATE p108_broadcasts SET status = 'paused', pause_reason = $2, updated_at = now()
          WHERE id = $1 AND status = 'sending'`,
        [BROADCAST_ID, reason],
      );
      result.paused = reason;
      return result;
    }
    tally(outcome);
    if (i < batch.length - 1) await new Promise((r) => setTimeout(r, SEND_PACING_MS));
  }

  // Nothing left in the bulk queue: the run is finished.
  await pool.query(
    `UPDATE p108_broadcasts SET status = 'done', updated_at = now()
      WHERE id = $1 AND status = 'sending'
        AND NOT EXISTS (
              SELECT 1 FROM p108_broadcast_sends
               WHERE broadcast_id = $1 AND kind = 'bulk' AND status IN ('waiting', 'sending'))`,
    [BROADCAST_ID],
  );
  return result;
}
