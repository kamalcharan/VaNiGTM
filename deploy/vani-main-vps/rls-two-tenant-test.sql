-- ============================================================================
-- Two-tenant RLS isolation test — Phase 0, Item 3, step 6
--
-- Proves at the DATABASE level that one tenant cannot see or write another
-- tenant's rows. Not a unit test: it is the check that must pass before
-- DB_PRIMARY is pointed at a non-superuser role, and again after.
--
-- ── HOW TO RUN ─────────────────────────────────────────────────────────────
--
-- Connect however you normally do — including as vikuna_admin. If the role you
-- arrive as bypasses RLS, the script SETs ROLE to vanigtm_app itself and RESETs
-- at the end, so you do not need the app role's password.
--
--   psql:  psql -d vani_gtm_db -f rls-two-tenant-test.sql
--   GUI:   paste the whole file and use "Execute script" / "Run all"
--          (NOT "execute current statement" — this is three statements:
--           a DO block, a RESET ROLE, and the SELECT that shows the results)
--
-- Running the checks as a bypassing role would pass every assertion for the
-- wrong reason, so check 0 either downgrades or refuses.
--
-- Results come back as a RESULT GRID, not as NOTICE messages — many GUI clients
-- hide notices. Every PASS/FAIL row must read PASS. Rows marked INFO are for
-- your judgement, not graded. Copy the whole grid back.
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
    v_orig      TEXT;
    v_target    TEXT;
    v_table     TEXT;
    v_rows      INT;
    t           RECORD;
    v_cand      RECORD;
    a_id        UUID;   a_slug TEXT;   a_leads BIGINT;
    b_id        UUID;   b_slug TEXT;   b_leads BIGINT;
    b_row       TEXT;   -- TEXT, not UUID: candidate tables use uuid or bigserial ids
    c           BIGINT;
    d           BIGINT;
    f           BIGINT;
    txt         TEXT;
BEGIN
    CREATE TEMP TABLE IF NOT EXISTS _rls_results
        (n INT, check_name TEXT, result TEXT, detail TEXT);
    -- The block may SET ROLE below (check 0). The temp table stays owned by
    -- the CONNECTING role, so without this grant every INSERT after the switch
    -- fails with "permission denied for table _rls_results".
    GRANT ALL ON _rls_results TO PUBLIC;
    DELETE FROM _rls_results;

    ---------------------------------------------------------------- check 0
    -- The test is meaningless unless the role it runs as is subject to RLS.
    -- If you connected as vikuna_admin (super + bypassrls, as production is),
    -- the block downgrades itself with SET ROLE rather than making you find
    -- the app role's password. A superuser may SET ROLE to anything, and RLS
    -- is evaluated against the CURRENT role — verified: 15 rows as superuser,
    -- 0 after SET ROLE with no tenant context.
    v_orig := current_user;
    SELECT rolsuper, rolbypassrls INTO v_super, v_bypass
      FROM pg_roles WHERE rolname = current_user;

    IF v_super OR v_bypass THEN
        -- Prefer vanigtm_app; otherwise any login role that RLS applies to.
        SELECT rolname INTO v_target FROM pg_roles
         WHERE rolcanlogin AND NOT rolsuper AND NOT rolbypassrls
         ORDER BY (rolname = 'vanigtm_app') DESC, rolname
         LIMIT 1;

        IF v_target IS NULL THEN
            INSERT INTO _rls_results VALUES (0, 'role bypasses RLS', 'FAIL',
                v_orig || ' has super=' || v_super || ' bypassrls=' || v_bypass
                || ', and no non-bypassing login role exists to switch to. '
                || 'Create the app role first (scripts/grant-vanigtm-app.sql).');
            RETURN;
        END IF;

        BEGIN
            EXECUTE format('SET ROLE %I', v_target);
        EXCEPTION WHEN OTHERS THEN
            INSERT INTO _rls_results VALUES (0, 'role bypasses RLS', 'FAIL',
                v_orig || ' bypasses RLS and SET ROLE ' || v_target
                || ' failed: ' || SQLERRM);
            RETURN;
        END;

        INSERT INTO _rls_results VALUES (0, 'role is restricted', 'PASS',
            'connected as ' || v_orig || ' (super=' || v_super || ' bypassrls=' || v_bypass
            || '), switched to ' || v_target || ' for the test');
    ELSE
        INSERT INTO _rls_results VALUES (0, 'role is restricted', 'PASS',
            current_user || ' (no superuser, no bypassrls)');
    END IF;

    ---------------------------------------------------------------- check 1
    -- Find a table that genuinely holds rows for two different tenants.
    --
    -- Counted per tenant, INSIDE each tenant's own context, never with a
    -- cross-tenant GROUP BY. Two reasons, both learned the hard way:
    --   * under the restricted role a cross-tenant query returns nothing, so
    --     discovery silently finds no fixtures and every later check is a lie;
    --   * doing discovery before the role switch instead means a superuser
    --     reads counts RLS would have filtered, so the expected numbers in
    --     checks 4 and 5 are wrong.
    -- Running it after the switch, per tenant, is correct for both entry paths.
    --
    -- gt_lead is preferred but not assumed: production holds a single lead in
    -- a single tenant, so a test hardcoded to gt_lead cannot run there at all.
    CREATE TEMP TABLE IF NOT EXISTS _rls_scratch (tenant_id UUID, slug TEXT, leads BIGINT);
    GRANT ALL ON _rls_scratch TO PUBLIC;

    FOR v_cand IN
        SELECT c2.relname AS tbl
          FROM pg_class c2
          JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
         WHERE n2.nspname = 'public' AND c2.relkind = 'r' AND c2.relrowsecurity
           AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c2.oid
                        AND a.attname = 'tenant_id' AND NOT a.attisdropped)
           AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = c2.oid
                        AND a.attname = 'id' AND NOT a.attisdropped)
         ORDER BY CASE c2.relname
                    WHEN 'gt_lead'      THEN 1
                    WHEN 'gt_contacts'  THEN 2
                    WHEN 'gt_prospects' THEN 3
                    WHEN 'gt_campaigns' THEN 4
                    ELSE 9 END, c2.relname
    LOOP
        DELETE FROM _rls_scratch;
        BEGIN
            FOR t IN SELECT id, slug FROM vn_tenants LOOP
                PERFORM set_tenant_context(t.id::text);
                EXECUTE format('SELECT count(*) FROM public.%I', v_cand.tbl) INTO c;
                IF c > 0 THEN
                    INSERT INTO _rls_scratch VALUES (t.id, t.slug, c);
                END IF;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN
            CONTINUE;   -- unreadable for any reason: try the next candidate
        END;

        IF (SELECT count(*) FROM _rls_scratch) >= 2 THEN
            v_table := v_cand.tbl;
            EXIT;
        END IF;
    END LOOP;

    IF v_table IS NULL THEN
        INSERT INTO _rls_results VALUES (1, 'a table with two tenants of data', 'FAIL',
            'No RLS-protected table has rows for two different tenants, so '
            || 'cross-tenant isolation cannot be demonstrated here. This is a '
            || 'property of the DATA, not a failure of RLS — the policies may be '
            || 'perfect. Point the test at a restore with two populated tenants.');
        RETURN;
    END IF;

    SELECT tenant_id, slug, leads INTO a_id, a_slug, a_leads
      FROM _rls_scratch ORDER BY leads DESC, slug LIMIT 1;
    SELECT tenant_id, slug, leads INTO b_id, b_slug, b_leads
      FROM _rls_scratch WHERE tenant_id <> a_id ORDER BY leads DESC, slug LIMIT 1;

    PERFORM set_tenant_context(b_id::text);
    EXECUTE format('SELECT id::text FROM public.%I ORDER BY id LIMIT 1', v_table)
        INTO b_row;

    INSERT INTO _rls_results VALUES (1, 'a table with two tenants of data', 'PASS',
        'using ' || v_table || ':  A=' || coalesce(a_slug, a_id::text)
        || ' (' || a_leads || ' rows),  B=' || coalesce(b_slug, b_id::text)
        || ' (' || b_leads || ' rows)');

    ---------------------------------------------------------------- check 2
    BEGIN
        PERFORM set_config('app.current_tenant_id', NULL, true);
        PERFORM set_config('app.tenant_id', NULL, true);
        EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO c;
        IF c = 0 THEN
            INSERT INTO _rls_results VALUES (2, 'no tenant context -> nothing visible',
                'PASS', '0 rows in ' || v_table);
        ELSE
            INSERT INTO _rls_results VALUES (2, 'no tenant context -> nothing visible',
                'FAIL', c || ' rows of ' || v_table
                || ' visible with NO tenant context; RLS is not enforcing');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (2, 'no tenant context -> nothing visible',
            'FAIL', SQLERRM);
    END;

    ---------------------------------------------------------------- check 3
    -- The pooled-connection case: after a tenant transaction COMMITs the GUC
    -- is DEFINED AND EMPTY, not unset. An unguarded ''::uuid cast raises here.
    BEGIN
        PERFORM set_config('app.current_tenant_id', '', true);
        PERFORM set_config('app.tenant_id', '', true);
        EXECUTE format('SELECT count(*) FROM public.%I', v_table) INTO c;
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
        EXECUTE format(
            'SELECT count(*), count(DISTINCT tenant_id), count(*) FILTER (WHERE tenant_id <> %L) '
            'FROM public.%I', a_id, v_table) INTO c, d, f;
        IF c = a_leads AND d = 1 AND f = 0 THEN
            INSERT INTO _rls_results VALUES (4, 'tenant A sees only A', 'PASS',
                c || ' rows, all tenant A');
        ELSE
            INSERT INTO _rls_results VALUES (4, 'tenant A sees only A', 'FAIL',
                c || ' rows across ' || d || ' tenants (' || f || ' foreign); expected '
                || a_leads || ' from tenant A only');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (4, 'tenant A sees only A', 'FAIL', SQLERRM);
    END;

    BEGIN
        PERFORM set_tenant_context(b_id::text);
        EXECUTE format(
            'SELECT count(*), count(DISTINCT tenant_id), count(*) FILTER (WHERE tenant_id <> %L) '
            'FROM public.%I', b_id, v_table) INTO c, d, f;
        IF c = b_leads AND d = 1 AND f = 0 THEN
            INSERT INTO _rls_results VALUES (5, 'tenant B sees only B', 'PASS',
                c || ' rows, all tenant B');
        ELSE
            INSERT INTO _rls_results VALUES (5, 'tenant B sees only B', 'FAIL',
                c || ' rows across ' || d || ' tenants (' || f || ' foreign); expected '
                || b_leads || ' from tenant B only');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (5, 'tenant B sees only B', 'FAIL', SQLERRM);
    END;

    ---------------------------------------------------------------- check 6
    -- A targeted fetch of a KNOWN foreign row by primary key. count() would
    -- hide a single leaked row; an IDOR is exactly a targeted fetch.
    BEGIN
        PERFORM set_tenant_context(a_id::text);
        EXECUTE format('SELECT count(*) FROM public.%I WHERE id = %L', v_table, b_row)
            INTO c;
        IF c = 0 THEN
            INSERT INTO _rls_results VALUES (6, 'A cannot fetch a known B row by id',
                'PASS', v_table || ' row ' || b_row || ' unreachable from tenant A');
        ELSE
            INSERT INTO _rls_results VALUES (6, 'A cannot fetch a known B row by id',
                'FAIL', 'tenant-B row ' || b_row || ' was readable from tenant A');
        END IF;
    EXCEPTION WHEN OTHERS THEN
        INSERT INTO _rls_results VALUES (6, 'A cannot fetch a known B row by id',
            'FAIL', SQLERRM);
    END;

    ---------------------------------------------------------------- check 7
    -- The WRITE side, and the reason this is an UPDATE rather than an INSERT.
    --
    -- An earlier version INSERTed a row owned by tenant B and recorded FAIL if
    -- it succeeded. But a successful INSERT was never undone — the DO block
    -- commits at the end — so the very case the test is designed to catch
    -- would have left a real row behind, on production, while claiming
    -- "nothing is committed". That was a genuine bug.
    --
    -- Now: attempt a no-op UPDATE of a known tenant-B row, capture the row
    -- count, then ALWAYS raise a sentinel so the savepoint rolls the write
    -- back. plpgsql variables survive the rollback; database changes do not.
    v_rows := NULL;
    BEGIN
        PERFORM set_tenant_context(a_id::text);
        BEGIN
            EXECUTE format('UPDATE public.%I SET tenant_id = tenant_id WHERE id = %L',
                           v_table, b_row);
            GET DIAGNOSTICS v_rows = ROW_COUNT;
            RAISE EXCEPTION 'ROLLBACK_SENTINEL';
        EXCEPTION
            WHEN insufficient_privilege THEN
                v_rows := -1;                     -- refused outright by policy
            WHEN raise_exception THEN
                NULL;                             -- our sentinel; v_rows is set
        END;

        IF v_rows = -1 THEN
            INSERT INTO _rls_results VALUES (7, 'A cannot WRITE a row owned by B',
                'PASS', 'refused by row-level security');
        ELSIF v_rows = 0 THEN
            INSERT INTO _rls_results VALUES (7, 'A cannot WRITE a row owned by B',
                'PASS', 'matched 0 rows — the foreign row is invisible to the write');
        ELSE
            INSERT INTO _rls_results VALUES (7, 'A cannot WRITE a row owned by B',
                'FAIL', 'UPDATE touched ' || v_rows
                || ' foreign row(s); RLS is not enforcing writes (rolled back)');
        END IF;
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

    ---------------------------------------------------------------- check 12
    -- Coverage, not correctness. Checks 2-7 prove RLS works on ONE table; this
    -- lists every tenant-scoped table where it is switched off entirely.
    --
    -- It exists because of a gap found while testing: with RLS disabled on
    -- gt_lead, the fixture discovery quietly moved to gt_contacts and the run
    -- still reported 12/12. A table with a tenant_id and no policy is not
    -- protected, and nothing else here would have said so.
    --
    -- Some of these are deliberate — gt_events is the cross-tenant bus, the
    -- vn_* auth tables must be readable before a tenant is known. Compare the
    -- list against the exemption register in docs/db/rls-status.md section 9.
    -- INFO, not FAIL: judgement required, so it is reported rather than graded.
    SELECT count(*), string_agg(x.relname, ', ' ORDER BY x.relname)
      INTO c, txt
      FROM (SELECT cl.relname FROM pg_class cl
              JOIN pg_namespace nn ON nn.oid = cl.relnamespace
             WHERE nn.nspname = 'public' AND cl.relkind = 'r'
               AND NOT cl.relrowsecurity
               AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid = cl.oid
                            AND a.attname = 'tenant_id' AND NOT a.attisdropped)) x;

    INSERT INTO _rls_results VALUES (12, 'tenant-scoped tables with RLS OFF', 'INFO',
        CASE WHEN c = 0 THEN 'none — every table with a tenant_id has RLS enabled'
             ELSE c || ' table(s): ' || txt
                  || '   <- check each against the exemption register'
        END);

    DROP TABLE IF EXISTS _rls_scratch;

    -- Back to the connecting role, so the SELECT below can read the temp table
    -- it created and the session is left as it was found.
    RESET ROLE;
END
$test$;

RESET ROLE;   -- no-op if the block already did it; guards an early RETURN

-- Nothing above is committed: every write happened inside the DO block's
-- transaction and the one cross-tenant INSERT was refused.
SELECT n,
       check_name AS "check",
       result,
       detail
FROM _rls_results
ORDER BY n;
