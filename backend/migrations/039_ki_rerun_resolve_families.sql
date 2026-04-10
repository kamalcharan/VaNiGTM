-- ============================================================================
-- Migration 039: Re-run resolve_customer_families for all tenants
--
-- Problem after migration 038:
--   The broken resolve_customer_families (migration 036) DID correctly INSERT
--   ki_families rows (v_head_rec.name / v_head_rec.id were valid at INSERT time).
--   However, the subsequent UPDATE matched nothing (NULL WHERE clause bug).
--   Result: ki_families has orphaned rows; ki_clients.family_id is still NULL.
--
--   After migration 038 fixed the function, calling it again would:
--     - Loop over clients still with family_id IS NULL  (correct — they're unlinked)
--     - INSERT new ki_families rows (duplicates of the orphaned ones)
--     - UPDATE clients to the new rows (correct now)
--
-- This migration:
--   1. DELETE the orphaned ki_families rows (those no ki_clients.family_id points to)
--   2. CALL the fixed resolve_customer_families for every (tenant_id, is_live) pair
--      that still has unresolved family members.
-- ============================================================================


-- ============================================================================
-- 1. CLEAN UP orphaned ki_families rows
--    These were created by the broken function but never linked to any client.
-- ============================================================================

DELETE FROM ki_families kf
WHERE NOT EXISTS (
    SELECT 1 FROM ki_clients kc
    WHERE kc.family_id = kf.id
);


-- ============================================================================
-- 2. RE-RUN resolve_customer_families for every tenant × environment
--    that still has clients with family_head_ext_ref_id set but family_id NULL.
-- ============================================================================

DO $$
DECLARE
    v_row           RECORD;
    v_families      INTEGER;
    v_members       INTEGER;
    v_heads_missed  INTEGER;
BEGIN
    FOR v_row IN
        SELECT DISTINCT tenant_id, is_live
        FROM ki_clients
        WHERE family_head_ext_ref_id IS NOT NULL
          AND family_id              IS NULL
          AND is_active              = true
        ORDER BY tenant_id, is_live
    LOOP
        SELECT families_created, members_linked, heads_not_found
        INTO   v_families, v_members, v_heads_missed
        FROM   resolve_customer_families(v_row.tenant_id, v_row.is_live);

        RAISE NOTICE 'resolve_customer_families(%, %): families=%, members=%, heads_not_found=%',
            v_row.tenant_id, v_row.is_live, v_families, v_members, v_heads_missed;
    END LOOP;
END;
$$;
