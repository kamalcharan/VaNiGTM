SELECT lifecycle_state AS state, count(*)::int AS n FROM gt_universe_companies
 WHERE merged_into_id IS NULL GROUP BY 1;
