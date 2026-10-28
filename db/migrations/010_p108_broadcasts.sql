-- Project 108 — one-off broadcasts to the updates list (the livestream link first).
--
-- A send to ~4,000 people cannot happen inside one request: the relay throttles a
-- burst, a request times out long before the last address, and a crash halfway
-- leaves no record of who already has it. So, as with the receipt outbox (009), the
-- send is a table: one row per recipient, worked through in small batches by
-- /api/broadcast/tick, each row marked the moment its message is accepted.
--
--   p108_broadcasts       — the message itself (link, start time) and whether the
--                           bulk send is running. One row per broadcast.
--   p108_broadcast_sends  — the checklist. A bulk row per list member (unique, so
--                           "send to the new people" can never mail anyone twice),
--                           plus test and single-person sends requested from the
--                           gmc-app dashboard.
--
-- gmc-app's dashboard writes the control state (settings, start/pause, enqueue);
-- only Project 108 sends, because only it holds the unsubscribe-signing secret.
--
-- Idempotent. Apply after 009.

BEGIN;

CREATE TABLE IF NOT EXISTS p108_broadcasts (
  id               text PRIMARY KEY,
  link             text,
  starts_at        timestamptz,
  -- draft: editable, nothing sent in bulk yet. sending/paused: the bulk run.
  -- done: every bulk row has been worked. The link locks once it leaves draft.
  status           text NOT NULL DEFAULT 'draft'
                   CHECK (status IN ('draft', 'sending', 'paused', 'done')),
  -- Set when the worker pauses itself (e.g. the relay started refusing us), so the
  -- dashboard can say why rather than just "paused".
  pause_reason     text,
  started_at       timestamptz,
  started_by       text,
  -- Paces the bulk run: the worker sends a batch only when this is old enough.
  last_batch_at    timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

INSERT INTO p108_broadcasts (id) VALUES ('livestream-2026') ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS p108_broadcast_sends (
  id             bigserial PRIMARY KEY,
  broadcast_id   text NOT NULL REFERENCES p108_broadcasts (id),
  -- The list member this row is for…
  email          text NOT NULL,
  -- …and where the message actually goes. Differs only when staff sent it to a
  -- corrected address from the dashboard.
  to_email       text NOT NULL,
  kind           text NOT NULL CHECK (kind IN ('bulk', 'manual', 'test')),
  status         text NOT NULL DEFAULT 'waiting'
                 CHECK (status IN ('waiting', 'sending', 'sent', 'failed', 'skipped')),
  attempts       integer NOT NULL DEFAULT 0,
  last_error     text,
  -- A 5xx from the relay (no such mailbox) will not fix itself; retrying it only
  -- costs reputation. Retry picks up failed rows where this is false.
  permanent      boolean NOT NULL DEFAULT false,
  requested_by   text,
  claimed_at     timestamptz,
  sent_at        timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- One bulk row per person per broadcast: enqueueing is "insert whoever is missing".
CREATE UNIQUE INDEX IF NOT EXISTS uq_p108_broadcast_sends_bulk
  ON p108_broadcast_sends (broadcast_id, lower(email))
  WHERE kind = 'bulk';

-- The worker's queue scan.
CREATE INDEX IF NOT EXISTS idx_p108_broadcast_sends_queue
  ON p108_broadcast_sends (broadcast_id, status, kind, id);

-- The dashboard's per-person lookup.
CREATE INDEX IF NOT EXISTS idx_p108_broadcast_sends_email
  ON p108_broadcast_sends (broadcast_id, lower(email));

COMMIT;
