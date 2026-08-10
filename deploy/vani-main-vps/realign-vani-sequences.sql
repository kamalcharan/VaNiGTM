-- ============================================================================
-- Re-align the VaNi sequence counters with the ids that already exist
--
-- WHY THIS EXISTS
-- An early version of the isolation test called gt_next_seq() without rolling
-- back, which self-seeded a gt_seq_counters row for the wrong tenant with the
-- auto-derived prefix VANI instead of LEAD. The repair suggested for that
-- ("SET prefix='LEAD', last_value=0") then created a second problem: the
-- tenant already held LEAD-0001, and gt_lead has NO unique constraint on
-- lead_no, so the next capture would have produced a duplicate LEAD-0001
-- silently rather than raising.
--
-- This sets every VaNi counter to at least the highest id already issued, so
-- the next value cannot collide with one in use.
--
-- SAFE: GREATEST never lowers a counter, so running it twice is a no-op and
-- running it on a healthy database changes nothing. Read-only in effect
-- wherever the counters are already correct.
--
--   psql -d vani_gtm_db -f realign-vani-sequences.sql
--
-- Then confirm:
--   SELECT t.slug, s.sequence_type, s.prefix, s.last_value
--     FROM gt_seq_counters s JOIN vn_tenants t ON t.id = s.tenant_id
--    WHERE s.sequence_type LIKE 'vani%' ORDER BY 1, 2;
-- ============================================================================

-- Re-align the VaNi sequence counters with the ids that already exist.
-- Idempotent and safe to run repeatedly: GREATEST never lowers a counter.
UPDATE gt_seq_counters s
   SET last_value = GREATEST(s.last_value, COALESCE((
         SELECT max(substring(l.lead_no from '([0-9]+)$')::int)
           FROM gt_lead l
          WHERE l.tenant_id = s.tenant_id
            AND l.lead_no ~ ('^' || s.prefix || '-[0-9]+$')), 0))
 WHERE s.sequence_type = 'vani_lead';

UPDATE gt_seq_counters s
   SET last_value = GREATEST(s.last_value, COALESCE((
         SELECT max(substring(r.ref from '([0-9]+)$')::int)
           FROM gt_report r
          WHERE r.tenant_id = s.tenant_id
            AND r.ref ~ ('^' || s.prefix || '-[0-9]+$')), 0))
 WHERE s.sequence_type = 'vani_report';
