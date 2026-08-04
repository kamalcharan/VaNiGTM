-- ============================================================================
-- Migration 232: make VaNi's per-tenant seed data reachable for ANY tenant
--
-- Migrations 228 and 231 seeded the sequence counters and the
-- 'VaNi assessment' tag for the 'vikuna-consulting' tenant specifically,
-- because that was the only tenant VaNi could run under. VANI_TENANT_SLUG
-- now makes that configurable — an operator whose account already lives in
-- another tenant points VaNi at it rather than keeping a second login.
--
-- That leaves the seed data behind. Rather than seeding every tenant (most
-- have nothing to do with VaNi), the two things that must exist per tenant
-- are created on demand:
--
--   - gt_seq_counters: gt_next_seq() already self-seeds on first use. The
--     only reason 228 pre-seeded them was to control the PREFIX (LEAD/VN
--     instead of the auto-derived VANI/VANI, which would have collided).
--     vani_ensure_seq_prefixes() does that for whichever tenant asks.
--   - the 'VaNi assessment' tag: vani_ensure_tag() creates it per tenant.
--
-- Both are idempotent and safe to call on every capture.
--
-- Idempotent; safe to re-run. Apply manually: cd backend && npm run db:migrate
-- ============================================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['gt_seq_counters', 'gt_tags']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %', missing;
    END IF;
END $$;

BEGIN;

-- Pre-seed the two sequence prefixes for a tenant. Without this,
-- gt_next_seq() derives a prefix from the type name (UPPER(LEFT(type,4))),
-- giving 'VANI' for BOTH 'vani_lead' and 'vani_report' — two different
-- sequences producing indistinguishable ids.
CREATE OR REPLACE FUNCTION vani_ensure_seq_prefixes(p_tenant_id UUID)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    INSERT INTO gt_seq_counters (tenant_id, sequence_type, prefix)
    VALUES (p_tenant_id, 'vani_lead', 'LEAD')
    ON CONFLICT (tenant_id, sequence_type) DO NOTHING;

    INSERT INTO gt_seq_counters (tenant_id, sequence_type, prefix)
    VALUES (p_tenant_id, 'vani_report', 'VN')
    ON CONFLICT (tenant_id, sequence_type) DO NOTHING;
END;
$$;

COMMENT ON FUNCTION vani_ensure_seq_prefixes IS
    'Ensures LEAD-/VN- sequence prefixes exist for a tenant. Without it gt_next_seq derives VANI for both vani_lead and vani_report, making lead and report ids indistinguishable.';

-- The tag every bridged contact carries. slug is GENERATED from label
-- (non-alphanumerics become spaces), so it resolves to 'vani assessment'.
CREATE OR REPLACE FUNCTION vani_ensure_tag(p_tenant_id UUID)
RETURNS BIGINT
LANGUAGE plpgsql
AS $$
DECLARE v_id BIGINT;
BEGIN
    SELECT id INTO v_id FROM gt_tags
     WHERE tenant_id = p_tenant_id AND slug = 'vani assessment';

    IF v_id IS NULL THEN
        INSERT INTO gt_tags (tenant_id, label) VALUES (p_tenant_id, 'VaNi assessment')
        RETURNING id INTO v_id;
    END IF;

    RETURN v_id;
END;
$$;

COMMENT ON FUNCTION vani_ensure_tag IS
    'Returns (creating if needed) the VaNi assessment tag for a tenant, so bridged contacts are filterable in /contacts regardless of which tenant VaNi runs under.';

COMMIT;

-- ── Post-apply verification ─────────────────────────────────────────────────
-- SELECT vani_ensure_seq_prefixes((SELECT id FROM vn_tenants LIMIT 1));
-- SELECT vani_ensure_tag((SELECT id FROM vn_tenants LIMIT 1));
