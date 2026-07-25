-- ============================================================================
-- Migration 190: Phase 0 Stage 0.4 — retarget pulses to the GTM contact layer
--
-- Pulses (follow-up tasks + meeting workflow) are KEPT for the GTM funnel
-- (prospect nudges, discovery/demo calls). Their legacy client coupling is
-- relaxed so contact-based rows work:
--   - client_id columns become nullable (ki_clients never existed on the
--     fresh GTM DB; the FKs are already gone)
--   - contact_id gains a real FK to gt_contacts (NOT VALID first, validated
--     immediately after — tables are small)
--
-- Tables stay ki_-named until the Phase 2 data-modelling rename.
-- Apply manually: cd backend && npm run db:migrate
-- ============================================================================

BEGIN;

DO $mig$
DECLARE
    t TEXT;
BEGIN
    FOREACH t IN ARRAY ARRAY['ki_pulse_config', 'ki_pulse_sessions', 'ki_pulses'] LOOP
        IF EXISTS (SELECT 1 FROM information_schema.tables
                   WHERE table_schema = 'public' AND table_name = t) THEN

            -- 1. client_id → nullable (skip if column absent)
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = t
                         AND column_name = 'client_id') THEN
                EXECUTE format('ALTER TABLE %I ALTER COLUMN client_id DROP NOT NULL', t);
            END IF;

            -- 2. contact_id → FK to gt_contacts (if column exists and FK absent)
            IF EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_schema = 'public' AND table_name = t
                         AND column_name = 'contact_id')
               AND NOT EXISTS (SELECT 1 FROM pg_constraint
                               WHERE conname = t || '_contact_id_gt_fkey') THEN
                EXECUTE format(
                    'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (contact_id)
                     REFERENCES gt_contacts(id) ON DELETE CASCADE NOT VALID',
                    t, t || '_contact_id_gt_fkey');
                EXECUTE format('ALTER TABLE %I VALIDATE CONSTRAINT %I',
                    t, t || '_contact_id_gt_fkey');
            END IF;

            RAISE NOTICE '[190] % retargeted (client_id nullable, contact_id -> gt_contacts).', t;
        ELSE
            RAISE NOTICE '[190] % does not exist — skipped.', t;
        END IF;
    END LOOP;
END $mig$;

COMMIT;
