-- ============================================================================
-- Migration 032: KI Sequences
--
-- Tenant-scoped sequential number generator.
-- Produces human-friendly IDs like CONT-0001, CLT-0042, MTG-0005.
--
-- Design:
--   - One row per (tenant_id, sequence_type)
--   - ki_next_seq() atomically increments last_value and returns formatted string
--   - Called inside the same transaction as the INSERT — so if the INSERT rolls
--     back, the sequence increment is also rolled back (no gaps on failure)
--   - New sequence types are added by seeding a new row (no DDL change needed)
--   - pad_width controls zero-padding (default 4 → CONT-0001 .. CONT-9999)
--
-- Seeded types per tenant (done in seed-tenant.service.ts on signup):
--   contact → CONT-0001
--   client  → CLT-0001
--
-- Future types (seeded when features ship):
--   meeting → MTG-0001
--   goal    → GOAL-0001
--   note    → NOTE-0001
-- ============================================================================


-- ────────────────────────────────────────────────────────────────────────────
-- TABLE: ki_sequences
-- ────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ki_sequences (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID        NOT NULL,
    sequence_type   TEXT        NOT NULL,   -- 'contact', 'client', 'meeting', etc.
    prefix          TEXT        NOT NULL,   -- 'CONT', 'CLT', 'MTG', 'GOAL'
    last_value      INTEGER     NOT NULL DEFAULT 0,
    pad_width       INTEGER     NOT NULL DEFAULT 4,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    CONSTRAINT ki_sequences_tenant_type UNIQUE (tenant_id, sequence_type)
);

COMMENT ON TABLE  ki_sequences              IS 'Tenant-scoped sequential counters for human-facing IDs.';
COMMENT ON COLUMN ki_sequences.sequence_type IS 'contact | client | meeting | goal | note — extensible without DDL changes.';
COMMENT ON COLUMN ki_sequences.prefix        IS 'Label prefix prepended to the zero-padded counter (CONT, CLT, MTG …).';
COMMENT ON COLUMN ki_sequences.pad_width     IS 'Zero-pad width. 4 → CONT-0001. Increase to 5 if tenant exceeds 9999.';

CREATE INDEX IF NOT EXISTS idx_ki_sequences_tenant
    ON ki_sequences(tenant_id, sequence_type);


-- ────────────────────────────────────────────────────────────────────────────
-- RLS
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE ki_sequences ENABLE ROW LEVEL SECURITY;

-- Application reads/writes only its own tenant's rows (set_tenant_context sets this)
CREATE POLICY ki_sequences_tenant_isolation ON ki_sequences
    USING (tenant_id::text = current_setting('app.current_tenant_id', true));


-- ────────────────────────────────────────────────────────────────────────────
-- FUNCTION: ki_next_seq
--
-- Atomically increments last_value for (tenant_id, type) and returns the
-- formatted sequence string.  Must be called inside the INSERT transaction.
--
-- Example:
--   SELECT ki_next_seq('abc-uuid', 'contact');
--   → 'CONT-0001'
-- ────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ki_next_seq(
    p_tenant_id  UUID,
    p_type       TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
    v_prefix     TEXT;
    v_next       INTEGER;
    v_pad        INTEGER;
BEGIN
    UPDATE ki_sequences
    SET    last_value = last_value + 1,
           updated_at = now()
    WHERE  tenant_id     = p_tenant_id
      AND  sequence_type = p_type
    RETURNING prefix, last_value, pad_width
    INTO v_prefix, v_next, v_pad;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sequence not found: tenant=% type=%. Ensure seedTenantData ran on signup.', p_tenant_id, p_type;
    END IF;

    RETURN v_prefix || '-' || LPAD(v_next::TEXT, v_pad, '0');
END;
$$;

COMMENT ON FUNCTION ki_next_seq IS
    'Atomically increment tenant sequence and return formatted ID (e.g. CONT-0001).
     Call inside the same transaction as the INSERT so rollback reverts the counter.';


-- ────────────────────────────────────────────────────────────────────────────
-- ADD contact_no TO ki_contacts
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE ki_contacts
    ADD COLUMN IF NOT EXISTS contact_no TEXT;

COMMENT ON COLUMN ki_contacts.contact_no IS
    'Tenant-scoped sequential ID (e.g. CONT-0001). Populated by ki_next_seq() on insert.';

CREATE INDEX IF NOT EXISTS idx_ki_contacts_contact_no
    ON ki_contacts(tenant_id, contact_no) WHERE contact_no IS NOT NULL;


-- ────────────────────────────────────────────────────────────────────────────
-- ADD client_no TO ki_clients
-- ────────────────────────────────────────────────────────────────────────────

ALTER TABLE ki_clients
    ADD COLUMN IF NOT EXISTS client_no TEXT;

COMMENT ON COLUMN ki_clients.client_no IS
    'Tenant-scoped sequential ID (e.g. CLT-0001). Populated by ki_next_seq() on convert_to_client.';

CREATE INDEX IF NOT EXISTS idx_ki_clients_client_no
    ON ki_clients(tenant_id, client_no) WHERE client_no IS NOT NULL;
