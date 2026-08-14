-- ============================================================
-- restore-vikuna-admin.sql
--
-- PART 1 is a diagnosis and is READ-ONLY. Run it first and read the verdict
-- column. It will very likely tell you there is nothing to restore.
--
-- PART 2 recreates the role and is COMMENTED OUT. Uncomment it only if
-- Part 1 says the role is genuinely absent.
--
-- ── READ THIS BEFORE ASSUMING THE ROLE WAS DROPPED ────────────────────
--
-- `vikuna_admin` OWNS the tables in this database. PostgreSQL REFUSES to drop
-- a role that owns anything:
--
--   ERROR:  role "vikuna_admin" cannot be dropped because some objects
--           depend on it
--
-- The only ways past that are DROP OWNED BY or REASSIGN OWNED BY, both of
-- which have to be typed deliberately and neither of which appears anywhere
-- in this repository (checked: no migration, no deploy script, and
-- scripts/grant-vanigtm-app.sql issues GRANTs only).
--
-- So if `SELECT pg_get_userbyid(relowner)` on the public schema still answers
-- "vikuna_admin", the role EXISTS. A dropped role leaves a dangling OID and
-- that function returns `unknown (OID=…)` instead of a name. Part 1 checks
-- exactly this, and it is the cheapest possible proof.
--
-- The far likelier explanation for "Beekeeper connects as vanigtm_app but not
-- vikuna_admin" is a stale saved password in the vikuna_admin profile, after a
-- morning of editing connection strings. That is a client-side problem and
-- nothing in the database needs restoring.
--
-- ── ROLES ARE CLUSTER-WIDE, NOT PER-DATABASE ──────────────────────────
--
-- "restore it for all databases and all schemas" does not describe how
-- PostgreSQL works. A role lives in the cluster (pg_authid is shared), so
-- recreating it ONCE restores it everywhere at the same instant. There is no
-- per-database copy of the role to fix.
--
-- What IS per-database is object OWNERSHIP and GRANTS. Those only need
-- attention if objects were actually reassigned — see Part 3, and read its
-- warning before running anything there.
--
-- ── HOW TO RUN ────────────────────────────────────────────────────────
--
-- Part 1 works from any connection, including the vanigtm_app one you can
-- already open — pg_roles and pg_class are readable by everyone.
--
-- Part 2 needs a superuser. pg_hba line 117 is `local all all trust`, so ON
-- THE VPS ITSELF you have unconditional access with no password:
--     sudo -u postgres psql -d vani_gtm_db
-- ============================================================


-- ════════════════════════════════════════════════════════════════════════
-- PART 1 · DIAGNOSIS — read-only, safe, run this first
-- ════════════════════════════════════════════════════════════════════════

-- ── 1a. Does the role exist, and can it log in? ─────────────────────────
SELECT
    'role exists?'                                    AS check,
    coalesce(string_agg(rolname, ', '), '(none)')     AS found,
    CASE
        WHEN count(*) FILTER (WHERE rolname = 'vikuna_admin') = 0
            THEN 'ABSENT — go to Part 2'
        WHEN bool_or(rolname = 'vikuna_admin' AND NOT rolcanlogin)
            THEN 'EXISTS but LOGIN is revoked — see 1d'
        WHEN bool_or(rolname = 'vikuna_admin'
                     AND rolvaliduntil IS NOT NULL AND rolvaliduntil < now())
            THEN 'EXISTS but the password EXPIRED — see 1d'
        ELSE 'EXISTS and can log in — the password being sent is wrong. '
             'Nothing here needs restoring.'
    END                                               AS verdict
  FROM pg_roles
 WHERE rolname IN ('vikuna_admin', 'vanigtm_app');

-- ── 1b. Full attributes, for the record ─────────────────────────────────
SELECT rolname, rolcanlogin, rolsuper, rolbypassrls, rolcreatedb, rolcreaterole,
       rolconnlimit, rolvaliduntil
  FROM pg_roles
 WHERE rolname IN ('vikuna_admin', 'vanigtm_app')
 ORDER BY rolname;

-- ── 1c. THE PROOF: who owns the tables? ─────────────────────────────────
--
-- A dropped role cannot leave owned objects behind, so if this still names
-- vikuna_admin, the role is present. `unknown (OID=…)` would mean a dangling
-- owner, which is the only shape a genuine catastrophe could take here.
SELECT
    pg_get_userbyid(c.relowner)                       AS owner,
    count(*)                                          AS objects,
    count(*) FILTER (WHERE c.relkind = 'r')           AS tables,
    CASE
        WHEN pg_get_userbyid(c.relowner) LIKE 'unknown%'
            THEN 'DANGLING OWNER — the role really is gone. Part 2, then Part 3.'
        WHEN pg_get_userbyid(c.relowner) = 'vikuna_admin'
            THEN 'vikuna_admin owns these, so the role EXISTS.'
        ELSE 'expected: Phase 0 left 18 tables owned by vanigtm_app on purpose'
    END                                               AS verdict
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
 WHERE n.nspname = 'public'
   AND c.relkind IN ('r', 'S', 'v', 'm', 'p')
 GROUP BY 1
 ORDER BY 2 DESC;

-- ── 1d. Is anything actually missing? ───────────────────────────────────
--
-- If DROP OWNED BY had run, tables would be GONE, not merely unowned. This is
-- the data-loss check, and it is the one that decides whether you reach for
-- the backup.
SELECT
    (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r')       AS tables_now,
    81                                                      AS tables_expected,
    (SELECT count(*) FROM vn_tenants)                       AS tenants,
    CASE
        WHEN (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
               WHERE n.nspname = 'public' AND c.relkind = 'r') < 70
            THEN 'DATA LOSS — restore from backup before anything else'
        ELSE 'schema intact'
    END                                                     AS verdict;
-- tables_expected = 81 is Phase 0's production census (docs/db/ki-disposition.md):
-- 9 ki_ + 58 gt_ + 14 vn_. Add 1 for gt_attention_decision once 238 is applied.


-- ════════════════════════════════════════════════════════════════════════
-- PART 2 · RECREATE THE ROLE
--
-- ⚠️  ONLY if Part 1a said ABSENT or Part 1c said DANGLING OWNER.
--     If the role exists, skip to Part 4 — you need a password reset, not a
--     restore, and recreating a role that exists will simply error.
--
-- Requires superuser. Uncomment, set the password, run.
--
-- Attributes are the ones production actually had, confirmed during Phase 0
-- (docs/db/PHASE-0-REPORT.md — `super=true bypassrls=true`; an earlier draft
-- claimed otherwise and was wrong).
-- ════════════════════════════════════════════════════════════════════════

-- SET password_encryption = 'scram-sha-256';   -- must match pg_hba line 128
--
-- CREATE ROLE vikuna_admin
--     WITH LOGIN
--          SUPERUSER
--          CREATEDB
--          CREATEROLE
--          BYPASSRLS
--          PASSWORD 'REPLACE-ME'
--          VALID UNTIL 'infinity';


-- ════════════════════════════════════════════════════════════════════════
-- PART 3 · OWNERSHIP — ⚠️  DO NOT RUN THIS BY DEFAULT
--
-- Only relevant if Part 1c reported a DANGLING OWNER, i.e. objects whose
-- owner OID no longer resolves. In every other case this section is a way to
-- cause an outage while trying to fix one.
--
-- WHY IT IS DANGEROUS HERE. Phase 0 deliberately left EIGHTEEN tables owned
-- by vanigtm_app and used FORCE ROW LEVEL SECURITY instead of changing their
-- owner. Migration 236 states the reason: "FORCE is chosen because it does
-- not disturb the existing grants (a change of owner drops them and needs
-- scripts/grant-vanigtm-app.sql re-run)". A blanket
-- `REASSIGN OWNED BY vanigtm_app TO vikuna_admin` would therefore:
--   · undo a deliberate design decision,
--   · drop the grants those tables carry, and
--   · leave the app with permission-denied errors until the grant script is
--     re-run.
-- gt_agent_runs is owned by vanigtm_app on purpose as well.
--
-- So: reassign ONLY objects with a dangling owner, never "everything".
-- ════════════════════════════════════════════════════════════════════════

-- List the genuinely orphaned objects first (read-only):
--
-- SELECT c.relname, c.relkind, pg_get_userbyid(c.relowner) AS owner
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--  WHERE n.nspname = 'public'
--    AND c.relkind IN ('r','S','v','m','p')
--    AND pg_get_userbyid(c.relowner) LIKE 'unknown%'
--  ORDER BY c.relname;
--
-- Then, only for those, one ALTER each:
--
-- ALTER TABLE public.<name> OWNER TO vikuna_admin;
--
-- After ANY ownership change, re-run the grants or the app loses access:
--   psql "$DB_PRIMARY_ADMIN" -f scripts/grant-vanigtm-app.sql


-- ════════════════════════════════════════════════════════════════════════
-- PART 4 · THE LIKELY ACTUAL FIX — reset the password
--
-- Requires superuser. On the VPS: sudo -u postgres psql -d vani_gtm_db
--
-- The encryption line is not optional. pg_hba line 128 demands
-- scram-sha-256; if the server's password_encryption is md5, the hash stored
-- here is one the server will refuse, and the failure is 28P01 — identical to
-- typing the password wrong. That trap cost a morning on vanigtm_app already.
-- ════════════════════════════════════════════════════════════════════════

-- SHOW password_encryption;
--
-- SET password_encryption = 'scram-sha-256';
-- ALTER ROLE vikuna_admin WITH LOGIN PASSWORD 'REPLACE-ME' VALID UNTIL 'infinity';

-- Then verify from your laptop BEFORE editing any saved client profile.
-- Percent-encode @ : / ? # [ ] % if they appear in the password:
--
--   psql "postgresql://vikuna_admin:<encoded-pw>@<host>:5432/vani_gtm_db?sslmode=require" \
--        -c "SELECT current_user, current_database()"


-- ════════════════════════════════════════════════════════════════════════
-- PART 5 · WHAT THE SERVER LOG SAYS — the definitive answer
--
-- PostgreSQL words the two cases differently, so this settles it outright:
--
--   sudo journalctl -u postgresql --since "3 hours ago" | grep -i vikuna_admin
--   sudo tail -300 /var/log/postgresql/postgresql-*-main.log | grep -i vikuna_admin
--
--   'password authentication failed for user "vikuna_admin"'
--        → the role EXISTS. Part 4.
--   'role "vikuna_admin" does not exist'
--        → it is gone. Part 2, then Part 1d to check for data loss.
-- ════════════════════════════════════════════════════════════════════════
