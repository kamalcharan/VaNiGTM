-- ============================================================
-- verify-import.sql — Step 0 of documents/POA-manufacturing-pilot.md
--
-- Answers ONE question with numbers instead of a screenshot:
--
--     did the import actually land, and if not, why not?
--
-- Read-only. Safe to run against production.
--
--   psql "$DB_PRIMARY" -f scripts/verify-import.sql
--
-- Optional — narrow to one tenant and widen the window:
--
--   psql "$DB_PRIMARY" -v tenant="'0783fd3b-...'" -v days=30 \
--        -f scripts/verify-import.sql
--
-- WHY THIS EXISTS. The FTCCI contacts import failed with
-- "current transaction is aborted, commands ignored until end of transaction
-- block" — which is not the error, it is what a per-row catch reports AFTER
-- the real error (a state_code VARCHAR(8) overflow on 'Andhra Pradesh')
-- aborted the transaction. The fix is pushed; this script is how we confirm
-- it, and how we get a true cause the next time rather than that message.
-- ============================================================

\set ON_ERROR_STOP on
\if :{?tenant} \else \set tenant NULL \endif
\if :{?days}   \else \set days   7    \endif

\pset footer off
\echo
\echo '=============================================================='
\echo ' 1. SESSIONS — what was uploaded'
\echo '=============================================================='

SELECT s.id,
       s.tenant_id,
       s.import_type,
       s.relationship,
       s.status,
       s.total_records                       AS staged,
       s.successful_records                  AS ok,
       s.failed_records                      AS failed,
       s.duplicate_records                   AS dupes,
       f.original_filename,
       s.created_at
FROM   ki_import_sessions s
LEFT   JOIN ki_file_uploads f ON f.id = s.file_upload_id
WHERE  s.created_at > now() - (:days || ' days')::interval
  AND  (:tenant IS NULL OR s.tenant_id = :tenant::uuid)
ORDER  BY s.id DESC;

\echo
\echo '=============================================================='
\echo ' 2. RECONCILIATION — staged vs landed vs held'
\echo
\echo '    THE check. staged must equal the sum of the rest.'
\echo '    Anything in `pending` after processing means the run stopped'
\echo '    early — that is a failure even when the session says completed.'
\echo '=============================================================='

SELECT st.session_id,
       count(*)                                                        AS staged,
       count(*) FILTER (WHERE st.processing_status = 'success')         AS landed,
       count(*) FILTER (WHERE st.processing_status = 'duplicate')       AS held_duplicate,
       count(*) FILTER (WHERE st.processing_status = 'conflict')        AS held_conflict,
       count(*) FILTER (WHERE st.processing_status = 'orphan')          AS held_orphan,
       count(*) FILTER (WHERE st.processing_status = 'skipped')         AS skipped,
       count(*) FILTER (WHERE st.processing_status = 'failed')          AS failed,
       count(*) FILTER (WHERE st.processing_status IN ('pending','processing')) AS never_processed,
       CASE WHEN count(*) FILTER (WHERE st.processing_status IN ('pending','processing')) > 0
            THEN 'STOPPED EARLY'
            WHEN count(*) FILTER (WHERE st.processing_status = 'failed') > 0
            THEN 'landed with failures'
            ELSE 'clean'
       END                                                             AS verdict
FROM   ki_import_staging st
JOIN   ki_import_sessions s ON s.id = st.session_id
WHERE  s.created_at > now() - (:days || ' days')::interval
  AND  (:tenant IS NULL OR s.tenant_id = :tenant::uuid)
GROUP  BY st.session_id
ORDER  BY st.session_id DESC;

\echo
\echo '=============================================================='
\echo ' 3. WHY ROWS FAILED — distinct causes, most common first'
\echo
\echo '    "current transaction is aborted" appearing here means the REAL'
\echo '    error was swallowed upstream. Treat it as a bug in the error'
\echo '    handling, not as the cause.'
\echo '=============================================================='

SELECT s.id                                   AS session_id,
       left(msg, 160)                         AS cause,
       count(*)                               AS rows,
       min(st.row_number)                     AS first_row
FROM   ki_import_staging st
JOIN   ki_import_sessions s ON s.id = st.session_id
CROSS  JOIN LATERAL unnest(coalesce(st.error_messages, ARRAY[]::text[])) AS msg
WHERE  s.created_at > now() - (:days || ' days')::interval
  AND  (:tenant IS NULL OR s.tenant_id = :tenant::uuid)
GROUP  BY s.id, left(msg, 160)
ORDER  BY rows DESC, session_id DESC
LIMIT  40;

\echo
\echo '=============================================================='
\echo ' 4. DID IT REACH THE REAL TABLES — per load'
\echo
\echo '    A session that says completed while prospects = 0 is the exact'
\echo '    failure reported on 2026-07-28. Staging is not landing.'
\echo '=============================================================='

SELECT l.id                                            AS load_id,
       l.tenant_id,
       l.label,
       l.status,
       l.source_as_of,
       (SELECT count(*) FROM gt_prospects p WHERE p.load_id = l.id) AS prospects,
       (SELECT count(*) FROM gt_contacts  c WHERE c.load_id = l.id) AS contacts,
       l.created_at
FROM   gt_source_loads l
WHERE  l.created_at > now() - (:days || ' days')::interval
  AND  (:tenant IS NULL OR l.tenant_id = :tenant::uuid OR l.tenant_id IS NULL)
ORDER  BY l.id DESC;

\echo
\echo '=============================================================='
\echo ' 5. THE COLUMN THAT BROKE IT — state_code'
\echo
\echo '    state_code is VARCHAR(8). Any value longer than 8 characters'
\echo '    could not have been inserted, so a long value here means the'
\echo '    normaliser was bypassed. An empty result is the pass condition.'
\echo '=============================================================='

SELECT state_code,
       length(state_code) AS len,
       count(*)           AS rows
FROM   gt_prospects
WHERE  state_code IS NOT NULL
  AND  (:tenant IS NULL OR tenant_id = :tenant::uuid)
GROUP  BY state_code
ORDER  BY len DESC, rows DESC
LIMIT  20;

\echo
\echo '=============================================================='
\echo ' 6. COHORT READINESS — what Step 1 has to work with'
\echo
\echo '    Only rows with a domain can be researched. This is the number'
\echo '    the pilot is actually sized on.'
\echo '=============================================================='

SELECT count(*)                                                          AS prospects,
       count(*) FILTER (WHERE domain_normalized IS NOT NULL)             AS with_domain,
       count(*) FILTER (WHERE domain_normalized IS NULL)                 AS without_domain,
       count(*) FILTER (WHERE industry_raw IS NOT NULL)                  AS with_industry,
       count(DISTINCT industry_raw)                                      AS distinct_industries,
       count(*) FILTER (WHERE industry_raw ~* '(manufactur|mfg|mfr)')    AS looks_manufacturing,
       count(*) FILTER (WHERE industry_raw ~* '(manufactur|mfg|mfr)'
                          AND domain_normalized IS NOT NULL)             AS manufacturing_with_domain
FROM   gt_prospects
WHERE  is_active
  AND  (:tenant IS NULL OR tenant_id = :tenant::uuid);

\echo
\echo '=============================================================='
\echo ' 7. THE MANUFACTURING VARIANTS Step 1 collapses'
\echo '=============================================================='

SELECT industry_raw,
       count(*)                                              AS rows,
       count(*) FILTER (WHERE domain_normalized IS NOT NULL) AS with_domain
FROM   gt_prospects
WHERE  is_active
  AND  industry_raw ~* '(manufactur|mfg|mfr)'
  AND  (:tenant IS NULL OR tenant_id = :tenant::uuid)
GROUP  BY industry_raw
ORDER  BY rows DESC;

\echo
\echo 'PASS when: section 2 verdict is "clean", section 4 shows a non-zero'
\echo 'prospects count for the load, and section 5 returns no value longer'
\echo 'than 8 characters.'
\echo
