SELECT
    journey_id::text,
    prospect_id::text,
    company,
    ref,
    city,
    journey_state,
    offer,
    contact_id::text,
    reason,
    days_quiet,
    last_touch_id::text,
    last_touch_at,
    last_outcome,
    last_channel,
    wake_at,
    score::float8                       AS score,
    standing_decision,
    snooze_until,
    decided_at,
    is_handled,
    is_snoozed,
    is_dismissed
  FROM scored
 WHERE NOT is_handled
   AND NOT is_snoozed
   -- Dismissed accounts are hidden but not deleted. $include_dismissed is
   -- how the screen offers "show what I dismissed" without a second query
   -- that could drift from this one.
   AND (NOT is_dismissed OR $include_dismissed::boolean)
 ORDER BY score DESC, days_quiet DESC, company ASC
 LIMIT  $limit::int
OFFSET $offset::int
