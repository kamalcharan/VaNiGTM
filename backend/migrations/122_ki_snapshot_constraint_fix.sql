-- ============================================================================
-- Migration 022: Fix ki_contact_snapshots unique constraint
--
-- Migration 021 added:
--   UNIQUE (tenant_id, contact_id, is_live, status)
--
-- This is wrong — it prevents a contact from ever having more than one
-- 'archived' row, breaking the version history.
--
-- Fix: drop the table-level constraint, add two partial unique indexes:
--   1. Only one 'active' snapshot per contact+tenant+env
--   2. Only one 'draft' snapshot per contact+tenant+env
--   'archived' rows are unconstrained — many allowed (full history).
-- ============================================================================

ALTER TABLE ki_contact_snapshots
    DROP CONSTRAINT IF EXISTS uq_ki_contact_snapshots_active;

CREATE UNIQUE INDEX IF NOT EXISTS uq_ki_snapshots_one_active
    ON ki_contact_snapshots(tenant_id, contact_id, is_live)
    WHERE status = 'active';

CREATE UNIQUE INDEX IF NOT EXISTS uq_ki_snapshots_one_draft
    ON ki_contact_snapshots(tenant_id, contact_id, is_live)
    WHERE status = 'draft';
