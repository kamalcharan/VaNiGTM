-- ============================================================================
-- Migration 233: rename orphaned ki_* tables to _deprecated_ki_*
--
-- Phase 0, Item 2. Renames only. NOTHING IS DROPPED HERE, and nothing should
-- be dropped for two weeks after this deploys — see docs/db/ki-disposition.md
-- §7. The rename exists so that a table nobody could prove was dead fails
-- loudly and reversibly instead of being destroyed on a guess.
--
-- ── BEFORE RUNNING ─────────────────────────────────────────────────────────
--
-- 1. Take a full backup AND verify it restores into a scratch database.
--    docs/db/ki-disposition.md §6.1. A backup nobody has restored is a guess.
-- 2. Fill in the table list below from PRODUCTION, not from the analysis doc.
--    docs/db/ki-disposition.md §6.2(a) has the query. The doc's §4 table
--    describes a locally rebuilt schema which production does not match —
--    production appears to have roughly a dozen ki_* tables, not 42.
-- 3. Confirm row counts are zero (or that the data has been exported to the
--    KI-Prime database first). §6.2(b).
--
-- The list below is INTENTIONALLY EMPTY. With an empty list this migration is
-- a no-op that logs "nothing to do" — safe to apply as-is, which keeps the
-- migration history linear if it ships before the production numbers arrive.
--
-- ── SAFETY ─────────────────────────────────────────────────────────────────
--
-- Each candidate is checked at run time and SKIPPED (with a notice, not an
-- error) if any of these hold:
--   a. the table does not exist in this database
--   b. it holds any rows
--   c. any surviving table still has a foreign key pointing at it
--   d. a _deprecated_ copy of the name already exists
--
-- (c) is what stops this from breaking the live pulse cluster, which FKs onto
-- ki_clients / ki_contacts / ki_contact_snapshots, and stops it from breaking
-- vn_tenants, which FKs onto ki_ext_ref_types.
--
-- Indexes, constraints and sequences follow the table on rename. Nothing is
-- renamed underneath them, so the inverse rename in the rollback block at the
-- bottom restores the original state exactly.
-- ============================================================================

BEGIN;

DO $migration$
DECLARE
    -- ── FILL THIS IN. One quoted table name per line. ────────────────────
    -- Source: docs/db/ki-disposition.md §6.2(a) ∩ the orphan decision in §6.3.
    -- Do NOT paste §4's candidate list here — it is analysis, not production.
    v_candidates TEXT[] := ARRAY[]::TEXT[];

    v_tbl        TEXT;
    v_rows       BIGINT;
    v_blocker    TEXT;
    v_renamed    INT := 0;
    v_skipped    INT := 0;
BEGIN
    IF array_length(v_candidates, 1) IS NULL THEN
        RAISE NOTICE '[233] Candidate list is empty — nothing to do. This is '
                     'expected until production row counts are in. See '
                     'docs/db/ki-disposition.md section 6.';
        RETURN;
    END IF;

    FOREACH v_tbl IN ARRAY v_candidates LOOP

        -- (a) exists?
        IF NOT EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_type   = 'BASE TABLE'
              AND table_name   = v_tbl
        ) THEN
            RAISE NOTICE '[233] SKIP %  — not present in this database', v_tbl;
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- (d) already deprecated?
        IF EXISTS (
            SELECT 1 FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name   = '_deprecated_' || v_tbl
        ) THEN
            RAISE NOTICE '[233] SKIP %  — _deprecated_% already exists', v_tbl, v_tbl;
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- (b) empty? A table with rows is either live or un-exported
        --     KI-Prime data. Either way it is not this migration's business.
        EXECUTE format('SELECT count(*) FROM public.%I', v_tbl) INTO v_rows;
        IF v_rows > 0 THEN
            RAISE NOTICE '[233] SKIP %  — holds % row(s); export to KI-Prime '
                         'before deprecating', v_tbl, v_rows;
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        -- (c) still referenced? Renaming a FK target does not break the
        --     constraint (PG follows the OID), but it does leave a live table
        --     depending on something named _deprecated_, which is exactly the
        --     confusion this phase is meant to remove. Treat it as a blocker
        --     and surface who is holding the reference.
        SELECT string_agg(DISTINCT src.relname, ', ')
          INTO v_blocker
          FROM pg_constraint k
          JOIN pg_class src ON src.oid = k.conrelid
          JOIN pg_class tgt ON tgt.oid = k.confrelid
         WHERE k.contype  = 'f'
           AND tgt.relname = v_tbl
           AND src.relname <> v_tbl                      -- ignore self-FKs
           -- Ignore co-deprecated tables. The regexp_replace matters: a
           -- candidate renamed EARLIER in this same loop is now called
           -- _deprecated_<name>, so a plain membership test against
           -- v_candidates would miss it and report it as a live blocker —
           -- making the outcome depend on the order of the array.
           AND regexp_replace(src.relname, '^_deprecated_', '') <> ALL (v_candidates);

        IF v_blocker IS NOT NULL THEN
            RAISE NOTICE '[233] SKIP %  — still referenced by: %', v_tbl, v_blocker;
            v_skipped := v_skipped + 1;
            CONTINUE;
        END IF;

        EXECUTE format('ALTER TABLE public.%I RENAME TO %I',
                       v_tbl, '_deprecated_' || v_tbl);
        RAISE NOTICE '[233] RENAMED % -> _deprecated_%', v_tbl, v_tbl;
        v_renamed := v_renamed + 1;

    END LOOP;

    RAISE NOTICE '[233] Done. % renamed, % skipped.', v_renamed, v_skipped;
END
$migration$;

COMMIT;

-- ============================================================================
-- ROLLBACK
--
-- Renames are reversible with no data movement. Run the inverse for whichever
-- tables the NOTICE output above reported as RENAMED — the log line names each
-- one, so the rollback list is exactly the "[233] RENAMED" lines.
--
--   BEGIN;
--   ALTER TABLE public._deprecated_ki_example RENAME TO ki_example;
--   COMMIT;
--
-- Or, to reverse every rename this migration could have made in one go:
--
--   DO $rollback$
--   DECLARE r RECORD;
--   BEGIN
--       FOR r IN
--           SELECT table_name FROM information_schema.tables
--            WHERE table_schema = 'public'
--              AND table_name LIKE '\_deprecated\_ki\_%'
--       LOOP
--           EXECUTE format('ALTER TABLE public.%I RENAME TO %I',
--                          r.table_name, substr(r.table_name, 13));
--           RAISE NOTICE 'restored %', substr(r.table_name, 13);
--       END LOOP;
--   END
--   $rollback$;
--
-- (13 = length of '_deprecated_' + 1.)
-- ============================================================================
