/**
 * Works the broadcast queue — see lib/broadcast.ts.
 *
 * Invoked by cron every minute, and by the gmc-app dashboard right after it queues a
 * test or single-person send. Authenticated with CRON_SECRET, like the
 * reconciliation sweep:
 *   curl -fsS -X POST https://108.gmc.bt/api/broadcast/tick \
 *        -H "X-Cron-Secret: $CRON_SECRET"
 */

import crypto from "node:crypto";
import { dbEnabled } from "@/lib/db";
import { runBroadcastTick } from "@/lib/broadcast";

export const dynamic = "force-dynamic";

const CRON_SECRET = process.env.CRON_SECRET || "";

function authorised(req: Request): boolean {
  if (!CRON_SECRET) return false; // fail closed: no secret configured, no access
  const provided = req.headers.get("x-cron-secret") || "";
  const a = Buffer.from(provided);
  const b = Buffer.from(CRON_SECRET);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!authorised(req)) {
    // 404, not 401 — do not confirm the endpoint exists to an unauthorised caller.
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  if (!dbEnabled()) {
    return Response.json({ success: false, error: "No database configured." }, { status: 503 });
  }
  try {
    const result = await runBroadcastTick();
    return Response.json({ success: true, ...result });
  } catch (err) {
    console.error("[broadcast] tick failed", err);
    return Response.json({ success: false, error: "Tick failed" }, { status: 500 });
  }
}
