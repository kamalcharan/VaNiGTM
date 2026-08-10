-- =============================================================================
-- WS2.6 — DB-layer isolation test (verification, not migration)
-- =============================================================================
-- Ruling 3: "build the isolation test against the DB layer, not the UI." This
-- script proves (or disproves) ruling 1's security claim empirically against
-- the actual state of vani_gtm_db, rather than asserting it from Postgres
-- defaults. Run this AFTER ws2.2-2.5 are applied, as a role that can SET ROLE
-- freely (e.g. vikuna_admin) in a scratch session — never against production
-- traffic. Nothing here is DDL; it's entirely SELECT/RAISE, safe to re-run.
--
-- Read the comments under each block — a "PASS" or "FAIL" is annotated for
-- what the expected result should be. Anything that doesn't match needs to be
-- understood before G4 (the gate this test is meant to make provable) is
-- treated as cleared.
-- =============================================================================

\echo '--- 0. Baseline: does public grant USAGE to PUBLIC on this database? ---'
-- This is the caveat flagged in ws2.2: Postgres privilege resolution can't be
-- selectively revoked from one role if the privilege was granted to PUBLIC —
-- only a global `REVOKE ... FROM PUBLIC` would remove it, which this
-- migration deliberately does NOT do (out of scope per ruling 3, "not our
-- risk" on the shared database). So the true guarantee below depends on
-- whether these are already 'f' before any vani_* role was ever involved.
SELECT has_schema_privilege('vani_anon', 'public', 'USAGE') AS anon_has_public_schema_usage;
SELECT has_table_privilege('vani_anon', 'public.gt_contacts', 'SELECT') AS anon_has_gt_contacts_select;
SELECT has_table_privilege('vani_anon', 'public.vn_users', 'SELECT') AS anon_has_vn_users_select;
-- Expected: all three 'f'. If any is 't', it's a pre-existing PUBLIC grant on
-- this shared database, not something ws2.2 introduced — escalate to Charan
-- rather than silently REVOKE FROM PUBLIC here (global, affects every role
-- including the live GTM app's).

\echo '--- 1. vani_anon cannot read the GTM tables at all ---'
SET ROLE vani_anon;
DO $$
BEGIN
  BEGIN
    PERFORM 1 FROM public.gt_contacts LIMIT 1;
    RAISE EXCEPTION 'FAIL: vani_anon could read public.gt_contacts';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: vani_anon blocked from public.gt_contacts (%errcode 42501)', '';
  END;
  BEGIN
    PERFORM 1 FROM public.vn_users LIMIT 1;
    RAISE EXCEPTION 'FAIL: vani_anon could read public.vn_users';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: vani_anon blocked from public.vn_users';
  END;
END $$;
RESET ROLE;

\echo '--- 2. vani_anon can only see published assessment_def rows ---'
-- Seed a throwaway unpublished row as the table owner, confirm vani_anon
-- never sees it, then clean it up.
INSERT INTO vani.assessment_def (tenant_id, service_slug, version, definition, public, is_active)
SELECT t.id, 'isolation-test-hidden', '0.0.0', '{}'::jsonb, false, true
FROM public.vn_tenants t WHERE t.slug = 'vikuna-consulting';

SET ROLE vani_anon;
DO $$
DECLARE v_count int;
BEGIN
  SELECT count(*) INTO v_count FROM vani.assessment_def WHERE service_slug = 'isolation-test-hidden';
  IF v_count = 0 THEN
    RAISE NOTICE 'PASS: vani_anon cannot see the unpublished assessment_def row';
  ELSE
    RAISE EXCEPTION 'FAIL: vani_anon saw an unpublished assessment_def row';
  END IF;
END $$;
RESET ROLE;

DELETE FROM vani.assessment_def WHERE service_slug = 'isolation-test-hidden';

\echo '--- 3. vani_anon has no direct table access to write a lead ---'
SET ROLE vani_anon;
DO $$
BEGIN
  BEGIN
    INSERT INTO vani.lead (tenant_id, name, email, company, role_title)
    VALUES ('00000000-0000-0000-0000-000000000000', 'x', 'x@x.com', 'x', 'x');
    RAISE EXCEPTION 'FAIL: vani_anon could INSERT into vani.lead directly';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'PASS: vani_anon blocked from inserting into vani.lead directly (must use capture_lead RPC)';
  END;
END $$;
RESET ROLE;

\echo '--- 4. partner-scoping: a partner only sees their own leads ---'
-- Requires two partner rows and two leads to exist to be meaningful — this
-- block is a template to run once ws2.5's seed (or equivalent test fixtures)
-- has at least two vani.partner rows and vani.lead rows split across them.
-- Sets the request.jwt.claims GUC by hand (bypassing an actual PostgREST
-- request) since this is a DB-layer test per ruling 3.
--
-- Example (fill in real ids from your test fixtures before running):
--
-- SET request.jwt.claims = '{"partner_id": "<partner-A-id>", "tenant_id": "<tenant-id>"}';
-- SET ROLE vani_partner;
-- SELECT count(*) AS should_be_only_partner_a_leads FROM vani.lead;
-- RESET ROLE;
-- RESET request.jwt.claims;
--
-- Expected: the count matches exactly partner A's leads, never partner B's.

\echo '--- 5. vani.sign()/vani.verify() round-trip (sanity, not a security boundary) ---'
DO $$
DECLARE
  v_token text;
  v_result record;
BEGIN
  v_token := vani.sign('{"sub":"isolation-test","exp":' || extract(epoch FROM now() + interval '5 minutes')::int || '}'::json, 'test-secret-do-not-reuse', 'HS256');
  SELECT * INTO v_result FROM vani.verify(v_token, 'test-secret-do-not-reuse', 'HS256');
  IF v_result.valid THEN
    RAISE NOTICE 'PASS: vendored pgjwt sign/verify round-trips correctly';
  ELSE
    RAISE EXCEPTION 'FAIL: vendored pgjwt sign/verify did not validate its own token';
  END IF;
  SELECT * INTO v_result FROM vani.verify(v_token, 'wrong-secret', 'HS256');
  IF NOT v_result.valid THEN
    RAISE NOTICE 'PASS: verify correctly rejects a token signed with a different secret';
  ELSE
    RAISE EXCEPTION 'FAIL: verify accepted a token signed with a different secret';
  END IF;
END $$;

\echo '--- Done. Any FAIL above needs resolving before G4 is treated as cleared. ---'
