-- ============================================================
-- Reset imports — wipe imported data and start fresh.
--
-- DESTRUCTIVE AND NOT REVERSIBLE. Take a backup first:
--   pg_dump -Fc vani_gtm_db > before-reset.dump
--
-- Set your tenant before running:
--   \set tenant '00000000-0000-0000-0000-000000000000'
--
-- What it does NOT touch:
--   * contacts you created by hand (source <> 'upload' and no load)
--   * your tags themselves (only their attachment to deleted records)
--   * campaigns, sequences, profile, knowledge graph
--
-- What it DOES remove, beyond the obvious:
--   * gt_contact_assignments for deleted contacts — an imported contact
--     sitting in a campaign is removed from it. That is a cascade, not a
--     choice, so check the count below before committing.
-- ============================================================

\set ON_ERROR_STOP on
BEGIN;

-- ── 1. What is about to go ────────────────────────────────────────────
SELECT 'prospects (companies)'        AS what, COUNT(*) FROM gt_prospects        WHERE tenant_id = :'tenant'
UNION ALL SELECT 'imported contacts',        COUNT(*) FROM gt_contacts           WHERE tenant_id = :'tenant' AND (load_id IS NOT NULL OR source = 'upload')
UNION ALL SELECT '  ...of those, in a campaign', COUNT(*) FROM gt_contact_assignments a
                                                  JOIN gt_contacts c ON c.id = a.contact_id
                                                  WHERE c.tenant_id = :'tenant' AND (c.load_id IS NOT NULL OR c.source = 'upload')
UNION ALL SELECT 'manual contacts (KEPT)',   COUNT(*) FROM gt_contacts           WHERE tenant_id = :'tenant' AND load_id IS NULL AND source <> 'upload'
UNION ALL SELECT 'import sessions',          COUNT(*) FROM ki_import_sessions    WHERE tenant_id = :'tenant'
UNION ALL SELECT 'staged rows',              COUNT(*) FROM ki_import_staging st
                                                  JOIN ki_import_sessions s ON s.id = st.session_id
                                                  WHERE s.tenant_id = :'tenant'
UNION ALL SELECT 'file uploads',             COUNT(*) FROM ki_file_uploads       WHERE tenant_id = :'tenant'
UNION ALL SELECT 'loads (this tenant)',      COUNT(*) FROM gt_source_loads       WHERE tenant_id = :'tenant'
UNION ALL SELECT 'loads (common pool)',      COUNT(*) FROM gt_source_loads       WHERE tenant_id IS NULL
UNION ALL SELECT 'common pool source rows',  COUNT(*) FROM gt_universe_company_sources
UNION ALL SELECT 'common pool companies',    COUNT(*) FROM gt_universe_companies;

-- ── 2. Delete, in FK order ────────────────────────────────────────────

-- Companies. Cascades gt_prospect_tags; gt_contacts.prospect_id goes NULL.
DELETE FROM gt_prospects WHERE tenant_id = :'tenant';

-- Imported people only. Cascades their channels, tags and campaign
-- assignments. Hand-created contacts are matched by neither condition and
-- survive untouched.
DELETE FROM gt_contacts
WHERE tenant_id = :'tenant'
  AND (load_id IS NOT NULL OR source = 'upload');

-- Sessions. Cascades ki_import_staging.
DELETE FROM ki_import_sessions WHERE tenant_id = :'tenant';

-- Uploads. After sessions, which reference them.
DELETE FROM ki_file_uploads WHERE tenant_id = :'tenant';

-- The common pool. Deleting the platform loads cascades their source rows.
-- REMOVE THESE TWO LINES if you only want to reset your own tenant.
DELETE FROM gt_universe_companies;
DELETE FROM gt_source_loads WHERE tenant_id IS NULL;

-- This tenant's loads. Cascades gt_load_tags. Must come last: prospects,
-- contacts and sessions all point at it.
DELETE FROM gt_source_loads WHERE tenant_id = :'tenant';

-- Ref counters, so the next import starts at PROS-0001 again rather than
-- continuing from wherever the deleted rows left off.
DELETE FROM gt_seq_counters
WHERE tenant_id = :'tenant' AND sequence_type IN ('prospect', 'contact');

-- ── 3. Confirm it is empty ────────────────────────────────────────────
SELECT 'prospects left'          AS what, COUNT(*) FROM gt_prospects     WHERE tenant_id = :'tenant'
UNION ALL SELECT 'imported contacts left', COUNT(*) FROM gt_contacts     WHERE tenant_id = :'tenant' AND (load_id IS NOT NULL OR source = 'upload')
UNION ALL SELECT 'manual contacts kept',   COUNT(*) FROM gt_contacts     WHERE tenant_id = :'tenant' AND load_id IS NULL AND source <> 'upload'
UNION ALL SELECT 'sessions left',          COUNT(*) FROM ki_import_sessions WHERE tenant_id = :'tenant'
UNION ALL SELECT 'loads left',             COUNT(*) FROM gt_source_loads WHERE tenant_id = :'tenant' OR tenant_id IS NULL
UNION ALL SELECT 'pool rows left',         COUNT(*) FROM gt_universe_company_sources;

-- Read the numbers above, THEN finish:
--   COMMIT;    -- keep the deletion
--   ROLLBACK;  -- undo it, nothing lost
COMMIT;
