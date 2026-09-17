-- 253 — gt_events learns when it was claimed, and how often.
--
-- THE BUG. The worker claims work with
--   UPDATE gt_events SET status='processing' WHERE status='pending' ... SKIP LOCKED
-- and that UPDATE commits immediately. From then until resolveEvent() runs,
-- the only thing that knows the work is in flight is the worker's memory.
-- Enrichment runs 20+ minutes, so that window is wide. A worker that dies
-- inside it — a deploy, a crash, a laptop closing — leaves the row
-- 'processing' forever: pollPendingEvents only ever looks at 'pending'.
--
-- It is silent, which is what makes it expensive. 'processing' is a legitimate
-- state and nothing recorded WHEN it was claimed, so a row stuck for three
-- weeks was indistinguishable from one claimed three seconds ago. Nine rows
-- were stranded this way on 2026-08-17; run 92 showed 8,348 seconds and had to
-- be cleared by hand.
--
-- Sharper now that the worker runs on the VPS and deploys restart it: every
-- deploy orphans whatever was mid-flight. And the console POLLS on it, so a
-- tenant waiting on "Vara is studying your industry" waits forever.
--
-- WHY TWO COLUMNS AND NOT A WORKAROUND
--   * started_at — when the row was claimed. Also bumped as a HEARTBEAT while
--     a long agent runs, which is what lets the reclaim threshold be ~2
--     minutes instead of longer than the longest legitimate job.
--   * attempts — a retry cap. Without one, an event that kills the worker is
--     reclaimed, kills it again, and loops forever.
--
-- Reusing processed_at as the claim stamp would make that column's name a lie
-- on every unprocessed row. Timing out on created_at conflates "claimed long
-- ago" with "queued long ago", so a healthy backlog would be reclaimed and run
-- TWICE. attempts inside payload is a schema change wearing a disguise.
--
-- Approved by Charan, 2026-09-17.

ALTER TABLE gt_events ADD COLUMN IF NOT EXISTS started_at timestamptz;
ALTER TABLE gt_events ADD COLUMN IF NOT EXISTS attempts   int NOT NULL DEFAULT 0;

COMMENT ON COLUMN gt_events.started_at IS
  'When the worker claimed this row, and bumped as a heartbeat while it runs. '
  'NULL while pending. A processing row whose started_at has gone stale is '
  'orphaned — its worker died — and is returned to pending.';
COMMENT ON COLUMN gt_events.attempts IS
  'Claims so far. Caps the reclaim loop so a poison event fails loudly '
  'instead of killing a worker forever.';

-- Partial index on exactly the reclaim scan's shape. The worker runs this
-- every poll (every 3s), so it must never become a sequential scan over a
-- table that only grows.
CREATE INDEX IF NOT EXISTS gt_events_stale_claim_idx
  ON gt_events (started_at)
  WHERE status = 'processing';

-- Adopt the rows already stranded. They were claimed before this column
-- existed, so started_at is NULL and the reclaim would never see them —
-- they would stay invisible forever, which is the bug this migration is for.
-- Stamped with created_at rather than now() so they are immediately stale and
-- get picked up on the first poll, instead of looking freshly claimed.
UPDATE gt_events
   SET started_at = created_at
 WHERE status = 'processing' AND started_at IS NULL;
