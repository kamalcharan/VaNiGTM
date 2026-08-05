-- ============================================================================
-- Two-tenant RLS isolation test — Phase 0, Item 3, step 6
--
-- Proves at the DATABASE level that one tenant cannot see or write another
-- tenant's rows. Not a unit test: it is the check that must pass before
-- DB_PRIMARY is pointed at a non-superuser role, and again after.
--
-- ── RUN IT AS THE APPLICATION ROLE, NOT AS postgres ────────────────────────
--
--   PGPASSWORD=<pw> psql -h <host> -U vani_app -d <db> \
--        -f rls-two-tenant-test.sql
--
-- Running it as a superuser is worse than not running it: every assertion
-- passes for the wrong reason. Check 0 refuses to continue in that case.
--
-- Safe against a database with real data: every write happens inside a
-- transaction that is ROLLBACKed, and the one INSERT that is attempted is
-- expected to be refused. Nothing is committed.
--
-- Output is NOTICE lines. Every one must read PASS.
--
-- ── HOW THIS TEST IS BUILT, AND TWO MISTAKES IT ALREADY MADE ───────────────
--
-- 1. The tenant list is read from vn_tenants, which carries no tenant_id and
--    no RLS. An earlier version built it from gt_lead — which correctly
--    returned nothing under RLS, because no context was set yet — and every
--    later check then compared against NULL and reported failures that were
--    artifacts of the harness. A test for RLS cannot gather its own fixtures
--    through RLS.
--
-- 2. The two tenants are chosen by counting each one's leads INSIDE its own
--    context, not by ordering on a cross-tenant query (impossible here, by
--    design). Picking the two oldest instead gave a tenant with no rows and a
--    "pass" that proved nothing.
--
-- The cross-tenant INSERT is checked by catching the exception rather than by
-- letting psql fall through, because with ON_ERROR_STOP off a failed statement
-- still lets the following SELECT run and print a contradictory verdict.
-- ============================================================================

\set ON_ERROR_STOP on
\pset pager off
\timing off

-- ── Check 0: the role itself ────────────────────────────────────────────────
DO $$
DECLARE r RECORD;
BEGIN
    SELECT rolsuper, rolbypassrls INTO r FROM pg_roles WHERE rolname = current_user;
    IF r.rolsuper THEN
        RAISE EXCEPTION 'FAIL (0) — % is SUPERUSER; it bypasses RLS unconditionally '
                        'and every check below would pass for the wrong reason', current_user;
    ELSIF r.rolbypassrls THEN
        RAISE EXCEPTION 'FAIL (0) — % has BYPASSRLS', current_user;
    END IF;
    RAISE NOTICE 'PASS (0) — running as % (no superuser, no bypassrls)', current_user;
END $$;

-- ── Pick two tenants that actually hold leads ───────────────────────────────
CREATE TEMP TABLE _t (n int, tenant_id uuid, slug text, leads bigint);

DO $$
DECLARE t RECORD; c BIGINT; i INT := 0;
BEGIN
    CREATE TEMP TABLE _scratch (tenant_id uuid, slug text, leads bigint) ON COMMIT DROP;

    FOR t IN SELECT id, slug FROM vn_tenants LOOP
        PERFORM set_tenant_context(t.id::text);
        SELECT count(*) INTO c FROM gt_lead;
        INSERT INTO _scratch VALUES (t.id, t.slug, c);
    END LOOP;

    INSERT INTO _t
    SELECT row_number() OVER (ORDER BY leads DESC, slug), tenant_id, slug, leads
      FROM _scratch WHERE leads > 0
     ORDER BY leads DESC, slug LIMIT 2;

    SELECT count(*) INTO i FROM _t;
    IF i < 2 THEN
        RAISE EXCEPTION 'FAIL (1) — need two tenants that each hold at least one '
                        'gt_lead row; found %. Seed a second tenant before testing.', i;
    END IF;

    RAISE NOTICE 'PASS (1) — testing with % and %',
        (SELECT slug || ' (' || leads || ' leads)' FROM _t WHERE n = 1),
        (SELECT slug || ' (' || leads || ' leads)' FROM _t WHERE n = 2);
END $$;

-- ── Checks 2 and 3: fail-closed with no context, and after context expires ──
DO $$
DECLARE c BIGINT;
BEGIN
    -- RESET, not just "never set": this is the state of a pooled connection
    -- that has already served one tenant-scoped transaction. set_config with
    -- is_local := true leaves the setting DEFINED and EMPTY after COMMIT, not
    -- undefined — which is what makes an unguarded ''::uuid cast raise.
    RESET app.current_tenant_id;
    RESET app.tenant_id;
    SELECT count(*) INTO c FROM gt_lead;
    IF c <> 0 THEN
        RAISE EXCEPTION 'FAIL (2) — % rows visible with NO tenant context', c;
    END IF;
    RAISE NOTICE 'PASS (2) — 0 rows visible with no tenant context';

    PERFORM set_config('app.current_tenant_id', '', true);
    PERFORM set_config('app.tenant_id', '', true);
    SELECT count(*) INTO c FROM gt_lead;   -- raises 22P02 if migration 234 is missing
    IF c <> 0 THEN
        RAISE EXCEPTION 'FAIL (3) — % rows leaked with an empty tenant context', c;
    END IF;
    RAISE NOTICE 'PASS (3) — 0 rows visible with an empty (expired) tenant context';
EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'FAIL (3) — empty GUC raised "%". Migration 234 has not been '
                    'applied to this database.', SQLERRM;
END $$;

-- ── Checks 4 and 5: each tenant sees only its own rows ──────────────────────
DO $$
DECLARE t RECORD; total BIGINT; distinct_tenants BIGINT; foreign_rows BIGINT;
BEGIN
    FOR t IN SELECT * FROM _t ORDER BY n LOOP
        PERFORM set_tenant_context(t.tenant_id::text);

        SELECT count(*), count(DISTINCT tenant_id),
               count(*) FILTER (WHERE tenant_id <> t.tenant_id)
          INTO total, distinct_tenants, foreign_rows
          FROM gt_lead;

        IF total <> t.leads OR distinct_tenants <> 1 OR foreign_rows <> 0 THEN
            RAISE EXCEPTION 'FAIL (%) — tenant % saw % rows across % tenants (% foreign)',
                            3 + t.n, t.slug, total, distinct_tenants, foreign_rows;
        END IF;
        RAISE NOTICE 'PASS (%) — tenant % sees exactly its own % rows',
                     3 + t.n, t.slug, total;
    END LOOP;
END $$;

-- ── Check 6: a targeted fetch of a known foreign row by primary key ─────────
-- count() would hide a single leaked row; an IDOR is exactly a targeted fetch.
DO $$
DECLARE b_id uuid; c BIGINT;
BEGIN
    -- Learn a tenant-B row id from inside tenant B's own context. There is no
    -- other way to obtain one without a superuser.
    PERFORM set_tenant_context((SELECT tenant_id::text FROM _t WHERE n = 2));
    SELECT id INTO b_id FROM gt_lead ORDER BY created_at LIMIT 1;

    PERFORM set_tenant_context((SELECT tenant_id::text FROM _t WHERE n = 1));
    SELECT count(*) INTO c FROM gt_lead WHERE id = b_id;

    IF c <> 0 THEN
        RAISE EXCEPTION 'FAIL (6) — tenant-B row % fetched by id from tenant A', b_id;
    END IF;
    RAISE NOTICE 'PASS (6) — known tenant-B row unreachable by id from tenant A';
END $$;

-- ── Check 7: a cross-tenant write must be refused ──────────────────────────
DO $$
DECLARE b_tenant uuid;
BEGIN
    SELECT tenant_id INTO b_tenant FROM _t WHERE n = 2;
    PERFORM set_tenant_context((SELECT tenant_id::text FROM _t WHERE n = 1));

    BEGIN
        INSERT INTO gt_lead (tenant_id, lead_no, name, email, company, role_title)
        VALUES (b_tenant, 'RLS-TEST-001', 'rls test', 'rls-test@example.invalid',
                'RLS Test Co', 'Tester');
        RAISE EXCEPTION 'FAIL (7) — cross-tenant INSERT succeeded; RLS is not '
                        'enforcing writes';
    EXCEPTION WHEN insufficient_privilege THEN
        RAISE NOTICE 'PASS (7) — cross-tenant INSERT refused by row-level security';
    END;
END $$;

-- ── Checks 8 and 9: the two functions on the live lead-capture path ─────────
-- gt_next_seq is the highest-risk one: not SECURITY DEFINER, and it INSERTs
-- and UPDATEs gt_seq_counters. See docs/db/triggers-and-functions.md.
DO $$
DECLARE a uuid; seq TEXT; tag BIGINT;
BEGIN
    SELECT tenant_id INTO a FROM _t WHERE n = 1;
    PERFORM set_tenant_context(a::text);

    seq := gt_next_seq(a, 'vani_lead');
    IF seq !~ '^[A-Z]+-[0-9]+$' THEN
        RAISE EXCEPTION 'FAIL (8) — gt_next_seq returned %', seq;
    END IF;
    RAISE NOTICE 'PASS (8) — gt_next_seq returned % under the restricted role', seq;

    tag := vani_ensure_tag(a);
    IF tag IS NULL THEN
        RAISE EXCEPTION 'FAIL (9) — vani_ensure_tag returned NULL';
    END IF;
    RAISE NOTICE 'PASS (9) — vani_ensure_tag resolved tag id % under the restricted role', tag;
END $$;

-- ── Check 10: no policy still carries the unguarded cast ───────────────────
DO $$
DECLARE c INT;
BEGIN
    SELECT count(*) INTO c FROM pg_policies
     WHERE schemaname = 'public' AND qual LIKE '%current_setting%'
       AND qual LIKE '%::uuid%' AND qual NOT LIKE '%NULLIF%';
    IF c <> 0 THEN
        RAISE EXCEPTION 'FAIL (10) — % policies cast without NULLIF; apply migration 234', c;
    END IF;
    RAISE NOTICE 'PASS (10) — no policy carries an unguarded ::uuid cast';
END $$;

DROP TABLE _t;

\echo ''
\echo 'All checks passed. (ON_ERROR_STOP is on, so any FAIL aborts the script'
\echo 'at that point — reaching this line means every check above passed.)'
\echo ''
