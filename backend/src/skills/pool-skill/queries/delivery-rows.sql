-- pool-skill.delivery_rows — the companies one delivery fed, filtered by state,
-- each with how far it is through the Complete test. 'unmatched' lists the
-- delivery's source rows that no company has claimed yet.
WITH rows AS (
  SELECT DISTINCT ON (c.id)
         c.id::text AS company_id, c.name, c.city, c.state_code, c.domain_normalized,
         c.lifecycle_state, c.junk_reason, c.needs_review, c.duplicate_of_id::text AS duplicate_of_id,
         c.is_individual, c.complete_checks, s.id::text AS source_row_id, s.industry_raw, s.pin
    FROM gt_universe_company_sources s
    JOIN gt_universe_companies c ON c.id = s.company_id
   WHERE s.load_id = $load_id::bigint
     AND ( $state::text = 'all'
        OR ($state::text = 'waiting'   AND c.lifecycle_state IN ('candidate','enriching'))
        OR ($state::text = 'duplicate' AND c.needs_review AND c.duplicate_of_id IS NOT NULL)
        OR c.lifecycle_state = $state::text )
   ORDER BY c.id, s.id
)
SELECT *, count(*) OVER () AS filtered_total FROM rows
 ORDER BY name
 LIMIT $limit::int OFFSET $offset::int;
