-- journey-skill: the board.
--
-- One page of journeys, newest movement first. The company comes along for
-- the ride because a journey with no company name is unreadable, and the
-- alternative is the caller issuing a second query per row.
--
-- $state / $arc / $owner_id are each nullable filters — NULL means "any" so
-- one statement serves the whole board rather than four near-identical ones.
--
-- `is_due` marks a parked journey whose moment has come round. It is
-- computed, not stored, because "due" is a fact about now and storing it
-- would need a job to keep it true.

SELECT j.id,
       j.prospect_id,
       j.arc,
       j.state,
       j.state_reason,
       j.entered_state_at,
       j.wake_at,
       j.owner_id,
       j.offer,
       j.contact_id,
       j.story_count,
       (j.wake_at IS NOT NULL AND j.wake_at <= now()) AS is_due,
       p.ref,
       p.name,
       p.website,
       p.city,
       p.industry_raw,
       c.full_name  AS contact_name,
       b.id         AS brief_id,
       b.status     AS brief_status,
       b.hook       AS brief_hook
  FROM gt_journeys j
  JOIN gt_prospects p ON p.id = j.prospect_id
  LEFT JOIN gt_contacts c ON c.id = j.contact_id
  LEFT JOIN LATERAL (
      SELECT ab.id, ab.status, ab.hook
        FROM gt_account_briefs ab
       WHERE ab.prospect_id = j.prospect_id
         AND ab.tenant_id   = j.tenant_id
         AND ab.is_live     = j.is_live
       ORDER BY ab.updated_at DESC
       LIMIT 1
  ) b ON true
 WHERE j.tenant_id = $tenant_id
   AND j.is_live   = $is_live
   AND ($state::text    IS NULL OR j.state    = $state::text)
   AND ($arc::text      IS NULL OR j.arc      = $arc::text)
   AND ($owner_id::uuid IS NULL OR j.owner_id = $owner_id::uuid)
   AND ($due::boolean   IS NOT TRUE
        OR (j.wake_at IS NOT NULL AND j.wake_at <= now()))
   AND ($search::text   IS NULL OR p.name ILIKE '%' || $search::text || '%')
 ORDER BY j.entered_state_at DESC, j.id DESC
 LIMIT $limit OFFSET $offset
