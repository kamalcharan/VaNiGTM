-- journey-skill: how many journeys sit in each state.
--
-- Runs unfiltered by state on purpose — the counts ARE the navigation, so
-- they must show what is behind every tab including the one you are not on.
-- A count that shrinks to match the current filter tells you nothing you did
-- not already know.
--
-- `due` counts parked journeys whose wake date has passed. Those are the
-- only journeys that need attention without anybody having touched them,
-- which is exactly why they are easy to forget.

SELECT j.state,
       count(*)::text                                                AS n,
       count(*) FILTER (WHERE j.wake_at IS NOT NULL
                          AND j.wake_at <= now())::text              AS due
  FROM gt_journeys j
 WHERE j.tenant_id = $tenant_id
   AND j.is_live   = $is_live
   AND ($arc::text IS NULL OR j.arc = $arc::text)
 GROUP BY j.state
