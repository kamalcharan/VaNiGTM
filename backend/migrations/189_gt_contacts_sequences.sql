-- ============================================================================
-- Migration 189: Phase 0 Stage 0.3 (part 2) — contact_no + GTM sequence counters
--
-- Discovered during code re-point: ki_contacts gained contact_no (mig 132,
-- tenant-scoped sequential id per CLAUDE.md rule 14) fed by ki_next_seq()
-- over the ki_sequences counter table. GTM keeps this pattern.
--
--   1. gt_contacts.contact_no column + index
--   2. gt_seq_counters (replaces ki_sequences counter table — renamed to
--      avoid colliding with gt_sequences, the outreach-sequence table)
--   3. gt_next_seq(tenant, type) — same contract as ki_next_seq
--   4. Copy counter rows from ki_sequences; backfill contact_no from
--      ki_contacts for rows migrated in 187
--
-- Idempotent; safe whether it runs immediately after 187 or later.
-- Apply manually: cd backend && npm run db:migrate
-- ============================================================================

BEGIN;

-- 1. contact_no on gt_contacts
ALTER TABLE gt_contacts ADD COLUMN IF NOT EXISTS contact_no TEXT;

COMMENT ON COLUMN gt_contacts.contact_no IS
    'Tenant-scoped sequential ID (e.g. CONT-0001). Populated by gt_next_seq() on insert.';

CREATE INDEX IF NOT EXISTS idx_gt_contacts_contact_no
    ON gt_contacts(tenant_id, contact_no) WHERE contact_no IS NOT NULL;

-- 2. Counter table
CREATE TABLE IF NOT EXISTS gt_seq_counters (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
    sequence_type   TEXT        NOT NULL,   -- 'contact', 'prospect', ...
    prefix          TEXT        NOT NULL,   -- 'CONT', 'PROS', ...
    last_value      INTEGER     NOT NULL DEFAULT 0,
    pad_width       INTEGER     NOT NULL DEFAULT 4,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT gt_seq_counters_tenant_type UNIQUE (tenant_id, sequence_type)
);

COMMENT ON TABLE gt_seq_counters IS
    'Per-tenant sequence counters for user-facing sequential IDs. Replaces ki_sequences (counter table).';

-- 3. gt_next_seq — same contract as ki_next_seq
CREATE OR REPLACE FUNCTION gt_next_seq(
    p_tenant_id  UUID,
    p_type       TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_prefix TEXT;
    v_next   INTEGER;
    v_pad    INTEGER;
BEGIN
    -- Seed the counter row on first use per (tenant, type). Default prefix =
    -- first 4 chars of type uppercased (contact -> CONT).
    INSERT INTO gt_seq_counters (tenant_id, sequence_type, prefix)
    VALUES (p_tenant_id, p_type, UPPER(LEFT(p_type, 4)))
    ON CONFLICT (tenant_id, sequence_type) DO NOTHING;

    UPDATE gt_seq_counters
       SET last_value = last_value + 1,
           updated_at = now()
     WHERE tenant_id = p_tenant_id AND sequence_type = p_type
    RETURNING prefix, last_value, pad_width INTO v_prefix, v_next, v_pad;

    RETURN v_prefix || '-' || LPAD(v_next::TEXT, v_pad, '0');
END;
$$;

COMMENT ON FUNCTION gt_next_seq IS
    'Atomically increment tenant sequence and return formatted ID (e.g. CONT-0001).
     Call inside the same transaction as the INSERT so rollback reverts the counter.';

-- 4a. Copy counter state from ki_sequences (if it still exists)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'ki_sequences') THEN
        INSERT INTO gt_seq_counters (tenant_id, sequence_type, prefix, last_value, pad_width, created_at, updated_at)
        SELECT s.tenant_id, s.sequence_type, s.prefix, s.last_value, s.pad_width, s.created_at, s.updated_at
        FROM ki_sequences s
        WHERE EXISTS (SELECT 1 FROM vn_tenants t WHERE t.id = s.tenant_id)
        ON CONFLICT (tenant_id, sequence_type) DO UPDATE
            SET last_value = GREATEST(gt_seq_counters.last_value, EXCLUDED.last_value);
    END IF;
END $$;

-- 4b. Backfill contact_no for rows migrated by 187 (ids were preserved)
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables
               WHERE table_schema = 'public' AND table_name = 'ki_contacts') THEN
        UPDATE gt_contacts g
           SET contact_no = k.contact_no
          FROM ki_contacts k
         WHERE k.id = g.id
           AND g.contact_no IS NULL
           AND k.contact_no IS NOT NULL;
    END IF;
END $$;

COMMIT;

-- ── Post-apply verification ─────────────────────────────────────────────────
-- SELECT COUNT(*) FROM gt_contacts WHERE contact_no IS NOT NULL;   -- ≈ ki count
-- SELECT gt_next_seq('<any tenant uuid>', 'contact');              -- returns CONT-000N
