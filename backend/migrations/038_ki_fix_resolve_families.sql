-- ============================================================================
-- Migration 038: Fix resolve_customer_families — PL/pgSQL scoping bug
--
-- Problem (migration 036):
--   The FOR loop used v_head_rec (RECORD) as its cursor variable, which held
--   { family_head_ext_ref_id }. Inside the loop, the function then did:
--
--       SELECT id, name INTO v_head_rec FROM ki_clients WHERE ...
--
--   This overwrote v_head_rec with { id, name } — the family_head_ext_ref_id
--   field was gone. The subsequent UPDATE and is_family_head expression both
--   referenced v_head_rec.ext_ref_id (which no longer existed → NULL), so
--   the WHERE clause matched nothing and families_linked was always 0.
--
-- Fix:
--   Capture the loop value into a dedicated TEXT variable
--   (v_family_head_ext_ref) immediately at the top of each loop iteration,
--   BEFORE the inner SELECT can overwrite anything. The inner SELECT writes
--   into two separate typed variables (v_head_client_id, v_head_client_name).
--   The UPDATE WHERE clause now uses v_family_head_ext_ref, which is stable.
-- ============================================================================

DROP FUNCTION IF EXISTS resolve_customer_families(UUID, BOOLEAN) CASCADE;

CREATE OR REPLACE FUNCTION resolve_customer_families(
    p_tenant_id  UUID,
    p_is_live    BOOLEAN
)
RETURNS TABLE(
    families_created   INTEGER,
    members_linked     INTEGER,
    heads_not_found    INTEGER
)
LANGUAGE plpgsql
AS $$
DECLARE
    v_families_created     INTEGER := 0;
    v_members_linked       INTEGER := 0;
    v_heads_not_found      INTEGER := 0;

    -- loop cursor — selects family_head_ext_ref_id values
    v_head_rec             RECORD;

    -- *** FIX: dedicated variable captured before any inner SELECT runs ***
    v_family_head_ext_ref  TEXT;

    -- separate variables for the head client lookup
    v_head_client_id       INTEGER;
    v_head_client_name     TEXT;

    v_family_id            UUID;
    v_linked_count         INTEGER;
BEGIN
    -- Iterate each distinct family_head_ext_ref_id that hasn't been resolved yet
    FOR v_head_rec IN
        SELECT DISTINCT c.family_head_ext_ref_id
        FROM ki_clients c
        WHERE c.tenant_id              = p_tenant_id
          AND c.is_live                = p_is_live
          AND c.is_active              = true
          AND c.family_head_ext_ref_id IS NOT NULL
          AND c.family_id              IS NULL     -- not yet linked
        ORDER BY c.family_head_ext_ref_id
    LOOP
        -- *** CAPTURE before any inner SELECT overwrites v_head_rec ***
        v_family_head_ext_ref := v_head_rec.family_head_ext_ref_id;

        -- Look up the head client using the captured value
        SELECT id, name
        INTO   v_head_client_id, v_head_client_name
        FROM   ki_clients
        WHERE  ext_ref_id = v_family_head_ext_ref
          AND  tenant_id  = p_tenant_id
          AND  is_live    = p_is_live
          AND  is_active  = true
        LIMIT 1;

        IF NOT FOUND THEN
            -- Head wasn't imported (partial file, or head already linked) — skip
            v_heads_not_found := v_heads_not_found + 1;
            CONTINUE;
        END IF;

        -- Create one ki_families row for this family group
        INSERT INTO ki_families (
            tenant_id,
            is_live,
            family_name,
            head_client_id
        ) VALUES (
            p_tenant_id,
            p_is_live,
            v_head_client_name,
            v_head_client_id
        ) RETURNING id INTO v_family_id;

        v_families_created := v_families_created + 1;

        -- Link every member (including the head) whose family_head_ext_ref_id
        -- matches. Use v_family_head_ext_ref — NOT v_head_rec (already overwritten).
        UPDATE ki_clients
        SET    family_id      = v_family_id,
               is_family_head = (ext_ref_id = v_family_head_ext_ref)
        WHERE  tenant_id              = p_tenant_id
          AND  is_live                = p_is_live
          AND  is_active              = true
          AND  family_head_ext_ref_id = v_family_head_ext_ref
          AND  family_id              IS NULL;

        GET DIAGNOSTICS v_linked_count = ROW_COUNT;
        v_members_linked := v_members_linked + v_linked_count;
    END LOOP;

    RETURN QUERY SELECT v_families_created, v_members_linked, v_heads_not_found;
END;
$$;

COMMENT ON FUNCTION resolve_customer_families IS
    'Post-import pass: groups ki_clients rows into ki_families using family_head_ext_ref_id. '
    'Run once after process_customer_import_with_timing completes. Idempotent — skips already-linked rows. '
    'Returns: families_created, members_linked, heads_not_found. '
    'Migration 038 fix: v_family_head_ext_ref captured at loop top before inner SELECT can overwrite v_head_rec.';
