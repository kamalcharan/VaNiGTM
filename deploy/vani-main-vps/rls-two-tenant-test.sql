-- ============================================================================
-- Two-tenant RLS isolation test — Phase 0, Item 3, step 6
--
-- Proves at the DATABASE level that one tenant cannot see or write another
-- tenant's rows. Not a unit test: it is the check that must pass before
-- DB_PRIMARY is pointed at a non-superuser role, and again after.
--
-- ── HOW TO RUN ─────────────────────────────────────────────────────────────
--
-- AS THE APPLICATION ROLE, NOT AS postgres:
--
--   psql:  PGPASSWORD=<pw> psql -h <host> -U vanigtm_app -d <db> \
--              -f rls-two-tenant-test.sql
--   GUI:   paste the whole file and use "Execute script" / "Run all"
--          (NOT "execute current statement" — this is two statements:
--           a DO block that runs the checks, then a SELECT that shows them)
--
-- Running it as a superuser is worse than not running it: every assertion
-- passes for the wrong reason. Check 0 catches that and marks everything FAIL.
--
-- Results come back as a RESULT GRID, not as NOTICE messages — many GUI clients
-- hide notices. Every row must read PASS. Copy the grid back.
--
-- SAFE against a database with real data. Every write is inside a transaction
-- that is rolled back, and the single INSERT attempted is expected to be
-- REFUSED. Nothing is committed. No DDL except a TEMP table, which disappears
-- when your session ends.
--
-- ── HOW THIS TEST IS BUILT, AND THE MISTAKES IT ALREADY MADE ───────────────
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
-- 3. It originally used psql meta-commands (\set, \pset) and reported through
--    RAISE NOTICE. Both fail outside psql: the backslash lines raise
--    "syntax error at or near \", and notices are invisible in several GUI
--    clients. Hence the temp table and the closing SELECT.
--
-- Each check catches its own exception and records a row, so one failure does
-- not hide the checks after it. That is also why the cross-tenant INSERT is
-- verified by catching insufficient_privilege rather than by letting the
-- script fall over.
-- ============================================================================

DO $test$
DECLARE
    v_super     BOOLEAN;
    v_bypass    BOOLEAN;
    t           RECORD;
    a_id        UUID;   a_slug TEXT;   a_leads BIGINT;
    b_id        UUID;   b_slug TEXT;   b_leads BIGINT;
    b_row       UUID;
    c           BIGINT;
    d           BIGINT;
    f           BIGINT;
    txt         TEXT;
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS _rls_results
        (n INT, check_name TEXT, result TEXT, detail TEXT);
    DELETE FROM _rls_results;

    ---------------------------------------------------------------- check 0
    SELECT rolsuper, rolbypassrls INTO v_super, v_bypass
      FROM pg_roles WHERE rolname = current_user;

    IF v_super OR v_bypass THEN
        INSERT INTO _rls_results VALUES (0, 'role bypasses RLS', 'FAIL',
            current_user || ' has super=' || v_super || ' bypassrls=' || v_bypass
            || ' — it bypasses RLS, so every check below would pass for the wrong '
            || 'reason. Re-run as the application role (e.g. vanigtm_app).');
        RETURN;   -- refuse to report a meaningless green
    END IF;
    INSERT INTO _rls_results VALUES (0, 'role is restricted', 'PASS',
        current_user || ' (no superuser, no bypassrls)');

    ---------------------------------------------------------------- check 1
    -- Two tenants that actually hold leads. Counted inside each tenant's own
    -- context, because a cross-tenant count is exactly what RLS forbids.
    CREATE TEMP TABLE IF NOT EXISTS _rls_scratch (tenant_id UUID, slug TEXT, leads BIGINT);
    DELETE FROM _rls_scratch;

    FOR t IN SELECT id, slug FROM vn_tenants LOOP
        PERFORM set_tenant_context(t.id::text);
        SELECT count(*) INTO c FROM gt_lead;
        INSERT INTO _rls_scratch VALUES (t.id, t.slug, c);
    END LOOP;

    SELECT tenant_id, slug, leads INTO a_id, a_slug, a_leads
      FROM _rls_scratch WHERE leads > 0 ORDER BY leads DESC, slug LIMIT 1;
    SELECT tenant_id, slug, leads INTO b_id, b_slug, b_leads
      FROM _rls_scratch WHERE leads > 0 AND tenant_id <> a_id
      ORDER BY leads DESC, slug LIMIT 1;

    IF a_id IS NULL OR b_id IS NULL THEN
        INSERT INTO _rls_results VALUES (1, 'two tenants with data', 'FAIL',
            'Need two tenants that each hold at least one gt_lead row. Found: '
            || coalesce((SELECT string_agg(slug || '=' || leads, ', ' ORDER BY slug)
                           FROM _rls_scratch), 'none')
            || '. Seed a second tenant, or point this at a restore that has one.');
        RETURN;
    END IF;
    INSERT INTO _rls_results VALUES (1, 'two tenants with data', 'PASS',
        'A=' || a_slug || ' (' || a_leads || ' leads),  B=' || b_slug || ' (' || b_leads || ' leads)');

    ---------------------------------------------------------------- check 2
    BEGIN
        PERFORM set_config('app.current_tenant_id', NULL, true);
        PERFORM set_config('app.tenant_id', NULL, true);
        SELECT count(*) INTO c FROM gt_lead;
        IF c = 0 THEN
            INSERT INTO _rls_results VALUES (2, 'no tenant context -> nothing visible',
                'PASS', '0 rows');
        ELSE
            INSERT INTO _rls_results VALUES (2, 'no tenant context -> nothing visible',
                'FAIL', c || ' rows visible with NO tenant context; RLS is not enforcing');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (2, 'no tenant context -> nothing visible',
            'FAIL', SQLERRM);
    END;

    ---------------------------------------------------------------- check 3
    -- The pooled-connection case: after a tenant transaction COMMITs, the GUC
    -- is DEFINED AND EMPTY, not unset. An unguarded ''::uuid cast raises here.
    BEGIN
        PERFORM set_config('app.current_tenant_id', '', true);
        PERFORM set_config('app.tenant_id', '', true);
        SELECT count(*) INTO c FROM gt_lead;
        IF c = 0 THEN
            INSERT INTO _rls_results VALUES (3, 'empty (expired) context -> nothing visible',
                'PASS', '0 rows');
        ELSE
            INSERT INTO _rls_results VALUES (3, 'empty (expired) context -> nothing visible',
                'FAIL', c || ' rows leaked with an empty tenant context');
        END IF;
    EXCEPTION WHEN invalid_text_representation THEN
        INSERT INTO _rls_results VALUES (3, 'empty (expired) context -> nothing visible',
            'FAIL', 'empty GUC raised "' || SQLERRM
            || '" — migration 234 has not been applied to this database');
    WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (3, 'empty (expired) context -> nothing visible',
            'FAIL', SQLERRM);
    END;

    ---------------------------------------------------------------- checks 4,5
    BEGIN
        PERFORM set_tenant_context(a_id::text);
        SELECT count(*), count(DISTINCT tenant_id), count(*) FILTER (WHERE tenant_id <> a_id)
          INTO c, d, f FROM gt_lead;
        IF c = a_leads AND d = 1 AND f = 0 THEN
            INSERT INTO _rls_results VALUES (4, 'tenant A sees only A', 'PASS',
                c || ' rows, all tenant A');
        ELSE
            INSERT INTO _rls_results VALUES (4, 'tenant A sees only A', 'FAIL',
                c || ' rows across ' || d || ' tenants (' || f || ' foreign)');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (4, 'tenant A sees only A', 'FAIL', SQLERRM);
    END;

    BEGIN
        PERFORM set_tenant_context(b_id::text);
        SELECT count(*), count(DISTINCT tenant_id), count(*) FILTER (WHERE tenant_id <> b_id)
          INTO c, d, f FROM gt_lead;
        SELECT id INTO b_row FROM gt_lead ORDER BY created_at LIMIT 1;
        IF c = b_leads AND d = 1 AND f = 0 THEN
            INSERT INTO _rls_results VALUES (5, 'tenant B sees only B', 'PASS',
                c || ' rows, all tenant B');
        ELSE
            INSERT INTO _rls_results VALUES (5, 'tenant B sees only B', 'FAIL',
                c || ' rows across ' || d || ' tenants (' || f || ' foreign)');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (5, 'tenant B sees only B', 'FAIL', SQLERRM);
    END;

    ---------------------------------------------------------------- check 6
    -- A targeted fetch of a KNOWN foreign row by primary key. count() would
    -- hide a single leaked row; an IDOR is exactly a targeted fetch.
    BEGIN
        PERFORM set_tenant_context(a_id::text);
        SELECT count(*) INTO c FROM gt_lead WHERE id = b_row;
        IF c = 0 THEN
            INSERT INTO _rls_results VALUES (6, 'A cannot fetch a known B row by id',
                'PASS', 'row ' || b_row || ' unreachable from tenant A');
        ELSE
            INSERT INTO _rls_results VALUES (6, 'A cannot fetch a known B row by id',
                'FAIL', 'tenant-B row ' || b_row || ' was readable from tenant A');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (6, 'A cannot fetch a known B row by id',
            'FAIL', SQLERRM);
    END;

    ---------------------------------------------------------------- check 7
    -- The write side. Today, as vikuna_admin, this INSERT SUCCEEDS.
    BEGIN
        PERFORM set_tenant_context(a_id::text);
        BEGIN
            INSERT INTO gt_lead (tenant_id, lead_no, name, email, company, role_title)
            VALUES (b_id, 'RLS-TEST-001', 'rls test', 'rls-test@example.invalid',
                    'RLS Test Co', 'Tester');
            INSERT INTO _rls_results VALUES (7, 'A cannot WRITE a row owned by B',
                'FAIL', 'cross-tenant INSERT succeeded; RLS is not enforcing writes');
        EXCEPTION WHEN insufficient_privilege THEN
            INSERT INTO _rls_results VALUES (7, 'A cannot WRITE a row owned by B',
                'PASS', 'refused by row-level security');
        END;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (7, 'A cannot WRITE a row owned by B',
            'FAIL', SQLERRM);
    END;

    ---------------------------------------------------------------- checks 8,9
    -- The two functions on the live lead-capture path. gt_next_seq is the
    -- risky one: NOT security definer, and it writes gt_seq_counters. If the
    -- app role lacks INSERT/UPDATE there, VaNi stops capturing leads.
    BEGIN
        PERFORM set_tenant_context(a_id::text);
        txt := gt_next_seq(a_id, 'vani_lead');
        IF txt ~ '^[A-Z]+-[0-9]+$' THEN
            INSERT INTO _rls_results VALUES (8, 'gt_next_seq works as the app role',
                'PASS', 'returned ' || txt);
        ELSE
            INSERT INTO _rls_results VALUES (8, 'gt_next_seq works as the app role',
                'FAIL', 'returned ' || coalesce(txt, 'NULL'));
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (8, 'gt_next_seq works as the app role',
            'FAIL', SQLERRM || '  <- likely a missing grant on gt_seq_counters');
    END;

    BEGIN
        PERFORM set_tenant_context(a_id::text);
        SELECT vani_ensure_tag(a_id) INTO c;
        IF c IS NOT NULL THEN
            INSERT INTO _rls_results VALUES (9, 'vani_ensure_tag works as the app role',
                'PASS', 'tag id ' || c);
        ELSE
            INSERT INTO _rls_results VALUES (9, 'vani_ensure_tag works as the app role',
                'FAIL', 'returned NULL');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (9, 'vani_ensure_tag works as the app role',
            'FAIL', SQLERRM);
    END;

    ---------------------------------------------------------------- check 10
    SELECT count(*) INTO c FROM pg_policies
     WHERE schemaname = 'public' AND qual LIKE '%current_setting%'
       AND qual LIKE '%::uuid%' AND qual NOT LIKE '%NULLIF%';
    IF c = 0 THEN
        INSERT INTO _rls_results VALUES (10, 'no policy has an unguarded ::uuid cast',
            'PASS', 'all guarded');
    ELSE
        INSERT INTO _rls_results VALUES (10, 'no policy has an unguarded ::uuid cast',
            'FAIL', c || ' policies cast without NULLIF — apply migration 234');
    END IF;

    ---------------------------------------------------------------- check 11
    -- Platform rows (tenant_id IS NULL) must still be readable. Without
    -- migration 235 these vanish silently rather than erroring.
    BEGIN
        PERFORM set_tenant_context(a_id::text);
        SELECT count(*) INTO c FROM gt_content_kinds;
        SELECT count(*) INTO d FROM gt_tags WHERE tenant_id IS NULL;
        IF c > 0 THEN
            INSERT INTO _rls_results VALUES (11, 'platform rows still visible', 'PASS',
                'gt_content_kinds=' || c || ' visible, gt_tags platform=' || d);
        ELSE
            INSERT INTO _rls_results VALUES (11, 'platform rows still visible', 'FAIL',
                'gt_content_kinds returned 0 rows — migration 235 has not been applied');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (11, 'platform rows still visible', 'FAIL', SQLERRM);
    END;

    DROP TABLE IF EXISTS _rls_scratch;
END
$test$;

-- Nothing above is committed: every write happened inside the DO block's
-- transaction and the one cross-tenant INSERT was refused.
SELECT n,
       check_name AS "check",
       result,
       detail
FROM _rls_results
ORDER BY n;
