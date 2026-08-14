-- attention-skill: the numbers behind the empty states.
--
-- TAIL. Prepended with _candidates.sql — see that file's header.
--
-- An empty screen has to say WHICH kind of empty it is, and the four kinds
-- mean completely different things:
--
--   no companies at all          → nothing has been imported yet
--   companies but nothing in play → the research queue is the work, not this
--   in play but nothing quiet     → genuinely up to date
--   quiet, but all disposed of    → you already did today
--
-- "Nothing to show" is the same pixels for all four and the wrong answer to
-- three of them. These counts are what lets the screen tell them apart, and
-- they come from the same CTEs as the page so they cannot disagree with it.
--
-- One row, always. Aggregates over an empty set return zeros rather than no
-- rows, which is what makes the first case reachable at all.

SELECT
    -- Population, independent of the gap logic. Answers "is this tenant
    -- empty" without a second round trip.
    (SELECT count(*) FROM gt_prospects
      WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active)::int
        AS prospects_total,

    (SELECT count(*) FROM gt_journeys j
      WHERE j.tenant_id = $tenant_id AND j.is_live = $is_live
        AND j.state = ANY($in_play_states::text[]))::int
        AS journeys_in_play,

    -- Everything below is measured over the same candidate set the page
    -- reads, so the arithmetic on screen adds up:
    --   surfaced + handled + snoozed + dismissed = matched
    (SELECT count(*) FROM scored)::int
        AS matched,
    (SELECT count(*) FROM scored WHERE is_handled)::int
        AS suppressed_handled,
    (SELECT count(*) FROM scored WHERE NOT is_handled AND is_snoozed)::int
        AS suppressed_snoozed,
    (SELECT count(*) FROM scored WHERE NOT is_handled AND NOT is_snoozed AND is_dismissed)::int
        AS suppressed_dismissed,
    (SELECT count(*) FROM scored
      WHERE NOT is_handled AND NOT is_snoozed AND NOT is_dismissed)::int
        AS surfaced,

    -- The next snooze to come back, so "you are done for today" can say when
    -- today stops being done rather than leaving it a mystery.
    (SELECT min(snooze_until) FROM scored
      WHERE NOT is_handled AND is_snoozed)
        AS next_snooze_due,

    -- How many in-play accounts have never been touched at all. This is the
    -- honest version of "we know nothing here": if it is most of the
    -- population, /today is a prospecting list wearing a follow-up list's
    -- clothes, and the screen should say so rather than imply the pipeline
    -- is warmer than it is.
    (SELECT count(*) FROM classified
      WHERE last_touch_at IS NULL
        AND journey_state = ANY($in_play_states::text[]))::int
        AS in_play_never_touched
