-- attention-skill: the candidate CTEs behind /today.
--
-- ── THIS FILE IS NOT A COMPLETE QUERY ─────────────────────────────────
--
-- It ends on the `scored` CTE and is prepended to a tail — get-attention.sql
-- (a page of items) or get-attention-context.sql (the counts the empty
-- states need). The leading underscore in the filename says so. Running it
-- alone is a syntax error, and that is the intended shape.
--
-- The alternative was to write the candidate logic twice, once per tail. Two
-- copies of "which accounts are eligible" become two answers the moment
-- somebody edits one — and the counts exist precisely to explain why the
-- page is empty, so a count that disagrees with the page is worse than no
-- count at all.
--
-- ──────────────────────────────────────────────────────────────────────
--
-- The gap query behind /today. Which accounts have gone quiet, why, and in
-- what order.
--
-- Source of truth for "last touch" is gt_touch_log. That decision, and why
-- gt_activity_feed and gt_journey_events are NOT read here, is argued in
-- docs/gtm/attention-query.md. Do not re-derive it from the table names.
--
-- Every tuning number arrives as a bound parameter from
-- backend/src/config/attention.config.ts. Nothing here is a magic constant,
-- so a decision recorded with its `shown` payload can be replayed against
-- the weights that produced it.

WITH

-- The most recent touch per account, with its outcome. DISTINCT ON rather
-- than max(): the outcome of the LATEST touch is what says whether they
-- answered, and an aggregate would give the latest date with somebody
-- else's outcome attached.
last_touch AS (
    SELECT DISTINCT ON (tl.prospect_id)
           tl.prospect_id,
           tl.touched_at   AS last_touch_at,
           tl.outcome      AS last_outcome,
           tl.channel      AS last_channel
      FROM gt_touch_log tl
     WHERE tl.tenant_id = $tenant_id
       AND tl.is_live   = $is_live
     ORDER BY tl.prospect_id, tl.touched_at DESC, tl.id DESC
),

-- Already handled: a held reservation whose moment has not arrived. This
-- account is not quiet, it is queued, and asking a human to act on it is
-- how you get the double-touch the cadence governor exists to prevent.
--
-- Reservations key on contact_id by design (migration 223), so the company
-- axis comes from the reservation's own prospect_id where it has one and
-- from the contact's otherwise.
handled AS (
    SELECT DISTINCT COALESCE(r.prospect_id, c.prospect_id) AS prospect_id
      FROM gt_touch_reservations r
      LEFT JOIN gt_contacts c
             ON c.id = r.contact_id
            AND c.tenant_id = $tenant_id
            AND c.is_live   = $is_live
     WHERE r.tenant_id = $tenant_id
       AND r.is_live   = $is_live
       AND r.status    = 'held'
       AND r.scheduled_at >= now()
       AND COALESCE(r.prospect_id, c.prospect_id) IS NOT NULL
),

-- The standing decision: the tail of the append-only log, per account.
-- Migration 238 has no status column on purpose — this CTE is where
-- "current state" comes from, and it is the only place that knows.
standing AS (
    SELECT DISTINCT ON (d.prospect_id)
           d.prospect_id,
           d.decision,
           d.snooze_until,
           d.created_at AS decided_at
      FROM gt_attention_decision d
     WHERE d.tenant_id = $tenant_id
       AND d.is_live   = $is_live
     ORDER BY d.prospect_id, d.created_at DESC, d.id DESC
),

candidate AS (
    SELECT
        j.id                AS journey_id,
        j.prospect_id,
        j.state             AS journey_state,
        j.entered_state_at,
        j.wake_at,
        j.offer,
        j.contact_id,
        p.name              AS company,
        p.ref,
        p.city,
        lt.last_touch_at,
        lt.last_outcome,
        lt.last_channel,
        s.decision          AS standing_decision,
        s.snooze_until,
        s.decided_at,
        -- COALESCE is load-bearing, not decoration. `standing` is a LEFT
        -- JOIN, so an account nobody has ever decided about has a NULL
        -- decision — and `s.decision = 'dismissed'` is then NULL rather than
        -- false. `WHERE NOT is_dismissed` on a NULL is NULL, which is not
        -- true, which drops the row.
        --
        -- The failure is silent and inverted: the accounts that survive are
        -- exactly the ones somebody already dealt with, and a brand-new
        -- tenant's screen is empty precisely because nothing has been
        -- decided yet. Caught by fixtures; it would never have been caught
        -- by reading.
        (h.prospect_id IS NOT NULL)                                          AS is_handled,
        COALESCE(s.decision = 'dismissed', false)                            AS is_dismissed,
        COALESCE(s.decision = 'snoozed' AND s.snooze_until > now(), false)   AS is_snoozed
      FROM gt_journeys   j
      JOIN gt_prospects  p  ON p.id = j.prospect_id
                           AND p.tenant_id = $tenant_id
                           AND p.is_live   = $is_live
                           AND p.is_active
      LEFT JOIN last_touch lt ON lt.prospect_id = j.prospect_id
      LEFT JOIN handled    h  ON h.prospect_id  = j.prospect_id
      LEFT JOIN standing   s  ON s.prospect_id  = j.prospect_id
     WHERE j.tenant_id = $tenant_id
       AND j.is_live   = $is_live
       AND (
             j.state = ANY($in_play_states::text[])
             -- A parked journey re-enters only when its wake date has passed.
             -- Migration 222 said only the parked list would be scanned for
             -- wake_at, and until now nothing scanned it. This is that scan.
             OR (j.state = 'parked' AND j.wake_at IS NOT NULL AND j.wake_at <= now())
           )
),

classified AS (
    SELECT
        c.*,
        -- Silence measured from the last touch, or from the moment the
        -- relationship entered its current state if it has never been
        -- touched. Not from the prospect's created_at: a company imported
        -- last year and qualified yesterday has been owed a touch for one
        -- day, not for a year.
        GREATEST(0, (EXTRACT(EPOCH FROM (now() - COALESCE(c.last_touch_at, c.entered_state_at))) / 86400))::int
            AS days_quiet,
        CASE
            WHEN c.journey_state = 'parked'                        THEN 'wake_due'
            WHEN c.journey_state = 'answered'
              OR c.last_outcome IN ('replied', 'meeting')          THEN 'owed_reply'
            WHEN c.journey_state = 'ready'                         THEN 'story_unsent'
            WHEN c.last_touch_at IS NULL                           THEN 'never_touched'
            ELSE                                                        'gone_quiet'
        END AS reason
      FROM candidate c
),

scored AS (
    SELECT
        cl.*,
        (COALESCE(($reason_weights::jsonb ->> cl.reason)::numeric, 0)
         + $per_day_weight::numeric * LEAST(cl.days_quiet, $max_days_counted::int)
        )::numeric AS score
      FROM classified cl
     WHERE
        -- Event-based reasons bypass the quiet threshold: a reminder that
        -- has come due is due now, and a reply we have not answered is
        -- urgent on day one. Waiting out a fortnight before mentioning
        -- either would be the screen actively hiding the thing it exists
        -- to surface.
        --
        -- Gap-based reasons need the threshold, or /today shows every
        -- account every day and stops meaning anything.
        cl.reason IN ('wake_due', 'owed_reply')
        OR cl.days_quiet >= $quiet_after_days::int
)
