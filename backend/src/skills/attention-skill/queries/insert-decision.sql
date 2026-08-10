-- attention-skill: decide_attention
--
-- One row on the append-only log. Never an UPDATE — migration 238 has a
-- trigger that refuses one, and reversing a decision is a new row saying
-- 'reopened'.
--
-- ── WHY THIS IS INSERT … SELECT AND NOT INSERT … VALUES ───────────────
--
-- The SELECT over gt_prospects is the ownership check. A VALUES insert with
-- a prospect_id from the request body would happily record a decision about
-- another tenant's account: RLS on gt_attention_decision only constrains the
-- tenant_id being written, which the server supplies and which would be
-- correct — the *prospect* is the smuggled part. The FK would pass too,
-- because the row genuinely exists.
--
-- Matching nothing inserts nothing and returns no rows, which the caller
-- turns into a plain "no such account" rather than a write nobody asked for.
-- This is the same class of bug Phase 0 found in getRun(runId) and the
-- gt_source_loads read: a valid id, fetched by id alone.

INSERT INTO gt_attention_decision
    (tenant_id, is_live, prospect_id, decision, reason, snooze_until, shown, decided_by)
SELECT
    $tenant_id,
    $is_live,
    p.id,
    $decision,
    $reason,
    $snooze_until::timestamptz,
    COALESCE($shown::jsonb, '{}'::jsonb),
    $decided_by::uuid
  FROM gt_prospects p
 WHERE p.id        = $prospect_id::bigint
   AND p.tenant_id = $tenant_id
   AND p.is_live   = $is_live
RETURNING
    id::text          AS id,
    prospect_id::text AS prospect_id,
    decision,
    reason,
    snooze_until,
    created_at
