-- 035_ki_backfill_sequences_and_platform.sql
-- 1. Backfill contact_no for existing contacts that were created before sequences
-- 2. Backfill client_no  for existing clients  that were created before sequences
-- 3. Upsert ki_sequences for ALL tenants (including pre-existing ones)
-- 4. Default ext_ref_type_code = 'IWELL' for tenants that haven't set one

-- ── 1. Backfill contact_no ────────────────────────────────────────────────
-- Assign CONT-XXXX ordered by created_at per tenant, only for NULL rows.
-- New contacts created after migration 032 already have contact_no set.
WITH numbered AS (
    SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at ASC, id ASC) AS rn
    FROM ki_contacts
    WHERE contact_no IS NULL
)
UPDATE ki_contacts
SET contact_no = 'CONT-' || LPAD(numbered.rn::text, 4, '0')
FROM numbered
WHERE ki_contacts.id = numbered.id;

-- ── 2. Backfill client_no ─────────────────────────────────────────────────
WITH numbered AS (
    SELECT
        id,
        ROW_NUMBER() OVER (PARTITION BY tenant_id ORDER BY created_at ASC, id ASC) AS rn
    FROM ki_clients
    WHERE client_no IS NULL
)
UPDATE ki_clients
SET client_no = 'CLT-' || LPAD(numbered.rn::text, 4, '0')
FROM numbered
WHERE ki_clients.id = numbered.id;

-- ── 3. Upsert ki_sequences for all tenants ───────────────────────────────
-- For contact: last_value = count of all contacts for that tenant
-- (covers both old and new records — GREATEST ensures we never go backwards)
INSERT INTO ki_sequences (tenant_id, sequence_type, prefix, last_value, pad_width)
SELECT
    t.id,
    'contact',
    'CONT',
    COALESCE((SELECT COUNT(*) FROM ki_contacts c WHERE c.tenant_id = t.id), 0),
    4
FROM vn_tenants t
ON CONFLICT (tenant_id, sequence_type) DO UPDATE
    SET last_value = GREATEST(ki_sequences.last_value, EXCLUDED.last_value);

INSERT INTO ki_sequences (tenant_id, sequence_type, prefix, last_value, pad_width)
SELECT
    t.id,
    'client',
    'CLT',
    COALESCE((SELECT COUNT(*) FROM ki_clients c WHERE c.tenant_id = t.id), 0),
    4
FROM vn_tenants t
ON CONFLICT (tenant_id, sequence_type) DO UPDATE
    SET last_value = GREATEST(ki_sequences.last_value, EXCLUDED.last_value);

-- ── 4. Default platform to IWELL for tenants without a selection ──────────
UPDATE vn_tenants
SET ext_ref_type_code = 'IWELL'
WHERE ext_ref_type_code IS NULL;
