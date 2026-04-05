/**
 * KI-Prime — NAV Routes
 *
 * Bookmark management, NAV download triggers, status, metrics.
 * All downloads use withIdempotency() for global data safety.
 *
 * POST   /api/v1/nav/bookmarks              — Bookmark a scheme
 * POST   /api/v1/nav/bookmarks/import       — Bulk import bookmarks from uploaded file
 * GET    /api/v1/nav/bookmarks              — List tenant's bookmarks with NAV status
 * DELETE /api/v1/nav/bookmarks/:schemeCode  — Remove bookmark
 * PATCH  /api/v1/nav/bookmarks/:schemeCode/alias — Update bookmark alias_name
 * POST   /api/v1/nav/download/daily         — Download today's NAV for all bookmarked schemes
 * POST   /api/v1/nav/download/scheme/:code  — Download historical NAV for one scheme
 * GET    /api/v1/nav/status                 — Cruise control status (all bookmarks + gaps + metrics)
 * POST   /api/v1/nav/metrics/:code          — Calculate metrics for one scheme
 * POST   /api/v1/nav/metrics/bulk           — Calculate metrics for all bookmarked schemes
 *
 * Aliases (global — no tenant scope):
 * GET    /api/v1/nav/aliases                — List aliases (filter by ?scheme_code=)
 * POST   /api/v1/nav/aliases                — Create single alias
 * POST   /api/v1/nav/aliases/bulk           — Bulk-create aliases for one scheme
 * DELETE /api/v1/nav/aliases/:id            — Soft-delete alias
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import { verifyAccessToken, type JwtPayload } from '../auth/token.service';
import { withIdempotency } from '../lib/idempotent';
import { fetchAmfiDaily } from '../fetchers/amfi-fetcher';
import { fetchMfapiHistory } from '../fetchers/mfapi-fetcher';
import { parseExcelRows } from '../etl/excel-parser';
import { BOOKMARK_FIELD_MAP } from '../etl/scheme-processor';

/* ── Auth ──────────────────────────────────────────── */

function extractJwt(req: { headers: { authorization?: string } }): JwtPayload | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyAccessToken(auth.slice(7)); } catch { return null; }
}

/* ── Router ────────────────────────────────────────── */

export function createNavRouter(pool: Pool): Router {
  const router = Router();

  /* ── POST /bookmarks — Add bookmark ─────────────── */

  router.post('/bookmarks', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { scheme_code, alias_name } = req.body;
      if (!scheme_code) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'scheme_code required' } }); return; }

      // Verify scheme exists and is active
      const schemeResult = await pool.query(
        'SELECT scheme_code, scheme_name, amc, active, closure_date FROM ki_schemes WHERE scheme_code = $1',
        [String(scheme_code).trim()],
      );
      if (schemeResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Scheme not found' } }); return; }

      const scheme = schemeResult.rows[0] as any;

      // Don't enable daily download for ended schemes
      const isEnded = scheme.closure_date && new Date(scheme.closure_date) < new Date();
      const dailyEnabled = scheme.active && !isEnded;

      await pool.query(
        `INSERT INTO ki_scheme_bookmarks (tenant_id, user_id, scheme_code, scheme_name, amc, alias_name, daily_download_enabled)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         ON CONFLICT (tenant_id, scheme_code) DO UPDATE SET
           alias_name = COALESCE(EXCLUDED.alias_name, ki_scheme_bookmarks.alias_name),
           daily_download_enabled = EXCLUDED.daily_download_enabled,
           updated_at = now()`,
        [jwt.tenant_id, jwt.user_id, scheme.scheme_code, scheme.scheme_name, scheme.amc, alias_name || null, dailyEnabled],
      );

      // Auto-seed global alias from scheme_name so import pipeline can match it.
      // ON CONFLICT DO NOTHING — safe to call repeatedly, won't overwrite manual aliases.
      try {
        await pool.query(
          `INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
           VALUES ($1, $2, 'auto')
           ON CONFLICT (alias_name_normalized) DO NOTHING`,
          [scheme.scheme_code, scheme.scheme_name],
        );
      } catch {
        // Non-fatal: alias table may not exist yet (migration pending)
      }

      res.status(201).json({
        scheme_code: scheme.scheme_code,
        scheme_name: scheme.scheme_name,
        daily_download_enabled: dailyEnabled,
        is_ended: isEnded,
      });
    } catch (err: any) {
      console.error('[NAV:bookmark]', err);
      res.status(500).json({ error: { code: 'BOOKMARK_FAILED', message: err.message } });
    }
  });

  /* ── POST /bookmarks/import — Bulk import from uploaded file ── */

  router.post('/bookmarks/import', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { file_id, field_mappings } = req.body;
      if (!file_id) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'file_id required' } });
        return;
      }

      // Get uploaded file record
      const fileResult = await pool.query('SELECT * FROM ki_file_uploads WHERE id = $1', [file_id]);
      if (fileResult.rows.length === 0) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } });
        return;
      }
      const file = fileResult.rows[0] as any;
      const mappings: Record<string, string> = field_mappings || BOOKMARK_FIELD_MAP;

      // ── Phase 1: Parse + Stage ───────────────────────────

      const rows = parseExcelRows(file.file_path);

      // Create import session (tenant-scoped, unlike scheme which is global)
      const sessionResult = await pool.query(
        `INSERT INTO ki_import_sessions (tenant_id, file_upload_id, import_type, field_mappings, created_by)
         VALUES ($1, $2, 'bookmark', $3, $4) RETURNING id`,
        [jwt.tenant_id, file_id, JSON.stringify(mappings), jwt.user_id],
      );
      const sessionId = (sessionResult.rows[0] as any).id;

      // Stage all rows in batches of 500
      const BATCH_SIZE = 500;
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const values: any[] = [];
        const placeholders: string[] = [];
        batch.forEach((raw, batchIdx) => {
          const rowNum = i + batchIdx + 1;
          const mapped: Record<string, any> = {};
          for (const [col, field] of Object.entries(mappings)) {
            const val = raw[col];
            if (val !== undefined && val !== null && String(val).trim() !== '') {
              mapped[field] = String(val).trim();
            }
          }
          // Normalise scheme_code (Excel reads numeric cells as floats like 131578.0)
          if (mapped.scheme_code) mapped.scheme_code = String(mapped.scheme_code).replace(/\.0+$/, '').trim();

          const offset = batchIdx * 4;
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}::jsonb, $${offset + 4}::jsonb)`);
          values.push(sessionId, rowNum, JSON.stringify(raw), JSON.stringify(mapped));
        });
        await pool.query(
          `INSERT INTO ki_import_staging (session_id, row_number, raw_data, mapped_data) VALUES ${placeholders.join(', ')}`,
          values,
        );
      }

      await pool.query(
        `UPDATE ki_import_sessions SET status = 'staged', total_records = $1, staging_completed_at = now() WHERE id = $2`,
        [rows.length, sessionId],
      );

      // ── Phase 2: Process staged rows ─────────────────────

      await pool.query(
        `UPDATE ki_import_sessions SET status = 'processing', processing_started_at = now() WHERE id = $1`,
        [sessionId],
      );

      const staged = await pool.query(
        'SELECT id, row_number, mapped_data FROM ki_import_staging WHERE session_id = $1 ORDER BY row_number',
        [sessionId],
      );

      let added = 0, already_tracked = 0, total_failed = 0;
      const startMs = Date.now();

      for (const stagedRow of staged.rows as any[]) {
        const mapped = stagedRow.mapped_data as Record<string, string>;
        const rowId = stagedRow.id;

        if (!mapped.scheme_code && !mapped.isin && !mapped.scheme_name) {
          total_failed++;
          await pool.query(
            `UPDATE ki_import_staging SET processing_status = 'failed',
             error_messages = $1::jsonb, processed_at = now() WHERE id = $2`,
            [JSON.stringify(['No scheme_code, ISIN, or scheme_name found in row']), rowId],
          );
          continue;
        }

        try {
          // Resolution chain: scheme_code → ISIN → alias name
          let schemeCode = mapped.scheme_code;

          // Step 2: resolve via ISIN
          if (!schemeCode && mapped.isin) {
            const isinResult = await pool.query(
              `SELECT scheme_code FROM ki_schemes WHERE isin_growth = $1 OR isin_dividend = $1 LIMIT 1`,
              [mapped.isin],
            );
            if (isinResult.rows.length > 0) schemeCode = (isinResult.rows[0] as any).scheme_code;
          }

          // Step 3: resolve via alias lookup (uses ki_scheme_aliases RPC)
          if (!schemeCode && mapped.scheme_name) {
            const aliasResult = await pool.query(
              `SELECT scheme_code FROM lookup_scheme_by_alias($1)`,
              [mapped.scheme_name],
            );
            if (aliasResult.rows.length > 0) schemeCode = (aliasResult.rows[0] as any).scheme_code;
          }

          if (!schemeCode) {
            total_failed++;
            await pool.query(
              `UPDATE ki_import_staging SET processing_status = 'failed',
               error_messages = $1::jsonb, processed_at = now() WHERE id = $2`,
              [JSON.stringify([`Scheme not resolved — no match by scheme_code, ISIN (${mapped.isin || 'none'}), or alias (${mapped.scheme_name || 'none'})`]), rowId],
            );
            continue;
          }

          // Verify scheme exists (same as single add)
          const schemeResult = await pool.query(
            'SELECT scheme_code, scheme_name, amc, active, closure_date FROM ki_schemes WHERE scheme_code = $1',
            [schemeCode],
          );
          if (schemeResult.rows.length === 0) {
            total_failed++;
            await pool.query(
              `UPDATE ki_import_staging SET processing_status = 'failed',
               error_messages = $1::jsonb, processed_at = now() WHERE id = $2`,
              [JSON.stringify([`Scheme ${schemeCode} not found in ki_schemes`]), rowId],
            );
            continue;
          }

          const scheme = schemeResult.rows[0] as any;
          const isEnded = scheme.closure_date && new Date(scheme.closure_date) < new Date();
          const dailyEnabled = scheme.active && !isEnded;

          // alias_name = the raw name from the tenant's CSV file.
          // This is the key field for transaction import matching — when a CAS/portfolio
          // CSV row has a scheme name, it is matched against bookmark.alias_name.
          // Fall back to scheme.scheme_name if the CSV had no scheme_name column.
          const csvAlias = mapped.scheme_name || scheme.scheme_name;

          // Insert bookmark — DO NOTHING for duplicates (already tracked = rejected, not overwritten)
          const upsertResult = await pool.query(
            `INSERT INTO ki_scheme_bookmarks
               (tenant_id, user_id, scheme_code, scheme_name, amc, alias_name, daily_download_enabled)
             VALUES ($1, $2, $3, $4, $5, $6, $7)
             ON CONFLICT (tenant_id, scheme_code) DO NOTHING
             RETURNING scheme_code`,
            [jwt.tenant_id, jwt.user_id, scheme.scheme_code, scheme.scheme_name, scheme.amc, csvAlias, dailyEnabled],
          );

          const isNew = upsertResult.rows.length > 0;
          if (isNew) added++; else already_tracked++;

          // Update staging row — duplicate = rejected (already tracked, no action taken)
          await pool.query(
            `UPDATE ki_import_staging SET processing_status = $1, created_record_id = $2, processed_at = now() WHERE id = $3`,
            [isNew ? 'success' : 'duplicate', scheme.scheme_code, rowId],
          );

          // Seed two aliases per new bookmark (kewalinvest parity):
          //   Alias 1: raw CSV name (source='csv_upload') — what the tenant calls this scheme
          //   Alias 2: master scheme_name (source='auto')  — canonical name from ki_schemes
          // Track alias result and write back to mapped_data so the import dashboard can display it.
          if (isNew) {
            let aliasStatus: 'created' | 'exists' | 'failed' = 'exists';
            const aliasLabel = mapped.scheme_name || scheme.scheme_name;
            try {
              if (mapped.scheme_name) {
                const ar = await pool.query(
                  `INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
                   VALUES ($1, $2, 'csv_upload')
                   ON CONFLICT (scheme_code, alias_name_normalized) DO NOTHING
                   RETURNING id`,
                  [scheme.scheme_code, mapped.scheme_name],
                );
                aliasStatus = ar.rows.length > 0 ? 'created' : 'exists';
              }
              await pool.query(
                `INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
                 VALUES ($1, $2, 'auto')
                 ON CONFLICT (scheme_code, alias_name_normalized) DO NOTHING`,
                [scheme.scheme_code, scheme.scheme_name],
              );
            } catch {
              aliasStatus = 'failed';
            }
            // Write alias result back to staging row so the dashboard can display it
            try {
              await pool.query(
                `UPDATE ki_import_staging
                 SET mapped_data = mapped_data || $1::jsonb
                 WHERE id = $2`,
                [JSON.stringify({ _alias_name: aliasLabel, _alias_status: aliasStatus }), rowId],
              );
            } catch { /* non-fatal */ }
          }

        } catch (err: any) {
          total_failed++;
          await pool.query(
            `UPDATE ki_import_staging SET processing_status = 'failed',
             error_messages = $1::jsonb, processed_at = now() WHERE id = $2`,
            [JSON.stringify([err.message]), rowId],
          );
        }
      }

      // ── Finalise session ──────────────────────────────────

      const finalStatus = total_failed > 0 ? 'completed_with_errors' : 'completed';
      await pool.query(
        `UPDATE ki_import_sessions SET
           status = $1, processed_records = $2, successful_records = $3,
           failed_records = $4, duplicate_records = $5, processing_completed_at = now()
         WHERE id = $6`,
        [finalStatus, rows.length, added, total_failed, already_tracked, sessionId],
      );

      await pool.query(`UPDATE ki_file_uploads SET processing_status = 'completed' WHERE id = $1`, [file_id]);

      res.json({
        session_id: sessionId,
        status: finalStatus,
        processed: rows.length,
        successful: added,
        failed: total_failed,
        duplicate: already_tracked,
        duration_ms: Date.now() - startMs,
      });
    } catch (err: any) {
      console.error('[NAV:bookmarks/import]', err);
      res.status(500).json({ error: { code: 'IMPORT_FAILED', message: err.message || 'Bulk import failed' } });
    }
  });

  /* ── GET /bookmarks — List bookmarks with NAV status ── */

  router.get('/bookmarks', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const result = await pool.query(
        `SELECT b.id, b.scheme_code, b.scheme_name, b.amc, b.alias_name,
                b.daily_download_enabled, b.historical_download_done,
                s.active, s.category, s.scheme_type, s.closure_date,
                COALESCE(ns.nav_records, 0)::integer          AS nav_records,
                ns.latest_nav_date,
                ns.latest_nav,
                ns.earliest_nav_date,
                ns.metrics_calculated_at,
                -- NAV ageing in days (null if no data)
                CASE WHEN ns.latest_nav_date IS NOT NULL
                     THEN (CURRENT_DATE - ns.latest_nav_date::date)
                     ELSE NULL
                END AS nav_age_days
         FROM ki_scheme_bookmarks b
         JOIN ki_schemes s ON s.scheme_code = b.scheme_code
         LEFT JOIN LATERAL (
           SELECT
             COUNT(*)::integer                                         AS nav_records,
             MAX(nav_date)::text                                       AS latest_nav_date,
             MIN(nav_date)::text                                       AS earliest_nav_date,
             MAX(nav) FILTER (WHERE nav_date = (SELECT MAX(nav_date) FROM ki_nav_history WHERE scheme_code = b.scheme_code)) AS latest_nav,
             MAX(metrics_calculated_at)                                AS metrics_calculated_at
           FROM ki_nav_history n
           WHERE n.scheme_code = b.scheme_code
         ) ns ON true
         WHERE b.tenant_id = $1
         ORDER BY b.scheme_name`,
        [jwt.tenant_id],
      );

      res.json({ bookmarks: result.rows });
    } catch (err: any) {
      console.error('[NAV:bookmarks]', err);
      res.status(500).json({ error: { code: 'FETCH_FAILED', message: err.message } });
    }
  });

  /* ── DELETE /bookmarks/:schemeCode ──────────────── */

  router.delete('/bookmarks/:schemeCode', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      await pool.query(
        'DELETE FROM ki_scheme_bookmarks WHERE tenant_id = $1 AND scheme_code = $2',
        [jwt.tenant_id, req.params.schemeCode],
      );
      res.json({ message: 'Bookmark removed' });
    } catch (err: any) {
      console.error('[NAV:delete-bookmark]', err);
      res.status(500).json({ error: { code: 'DELETE_FAILED', message: err.message } });
    }
  });

  /* ── POST /download/daily — Download today's NAV (all bookmarked) ── */

  router.post('/download/daily', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      // Get ALL unique bookmarked scheme codes across ALL tenants (global download)
      const bookmarked = await pool.query(
        `SELECT DISTINCT b.scheme_code
         FROM ki_scheme_bookmarks b
         JOIN ki_schemes s ON s.scheme_code = b.scheme_code
         WHERE b.daily_download_enabled = true AND s.active = true`,
      );
      const schemeCodes = new Set(bookmarked.rows.map((r: any) => r.scheme_code));

      if (schemeCodes.size === 0) {
        res.json({ message: 'No bookmarked schemes for daily download', downloaded: 0, skipped: 0 });
        return;
      }

      // Record execution start
      const execResult = await pool.query(
        `INSERT INTO ki_scheduler_executions (tenant_id, job_code, trigger_source, status)
         VALUES ($1, 'nav_download', 'manual', 'running') RETURNING id`,
        [jwt.tenant_id],
      );
      const execId = (execResult.rows[0] as any).id;
      const startTime = Date.now();

      // Fetch all NAV data from AMFI (one HTTP call for all schemes)
      const amfiData = await fetchAmfiDaily();

      let downloaded = 0;
      let skipped = 0;
      let failed = 0;

      // Upsert NAV for each bookmarked scheme
      for (const schemeCode of schemeCodes) {
        const navRecord = amfiData.get(schemeCode);
        if (!navRecord) { skipped++; continue; }

        const result = await withIdempotency(
          pool,
          `nav_download_${schemeCode}`,
          async () => {
            const exists = await pool.query(
              'SELECT 1 FROM ki_nav_history WHERE scheme_code = $1 AND nav_date = $2',
              [schemeCode, navRecord.nav_date],
            );
            return exists.rows.length > 0;
          },
          async () => {
            await pool.query(
              `INSERT INTO ki_nav_history (scheme_code, nav_date, nav)
               VALUES ($1, $2, $3)
               ON CONFLICT (scheme_code, nav_date) DO UPDATE SET nav = EXCLUDED.nav`,
              [schemeCode, navRecord.nav_date, navRecord.nav],
            );
            return true;
          },
        );

        if (result.status === 'executed') downloaded++;
        else skipped++;
      }

      // Record execution end
      const durationMs = Date.now() - startTime;
      await pool.query(
        `UPDATE ki_scheduler_executions
         SET status = 'success', completed_at = now(), execution_duration_ms = $1,
             result_summary = $2::jsonb
         WHERE id = $3`,
        [durationMs, JSON.stringify({ total: schemeCodes.size, downloaded, skipped, failed }), execId],
      );

      res.json({ total: schemeCodes.size, downloaded, skipped, failed, duration_ms: durationMs });
    } catch (err: any) {
      console.error('[NAV:daily-download]', err);
      res.status(500).json({ error: { code: 'DOWNLOAD_FAILED', message: err.message } });
    }
  });

  /* ── POST /download/scheme/:code — Historical download for one scheme ── */

  router.post('/download/scheme/:code', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const schemeCode = req.params.code;
      const dateFrom = req.body.date_from as string | undefined;
      const dateTo = req.body.date_to as string | undefined;

      // Verify scheme exists
      const schemeCheck = await pool.query('SELECT 1 FROM ki_schemes WHERE scheme_code = $1', [schemeCode]);
      if (schemeCheck.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Scheme not found' } }); return; }

      const result = await withIdempotency(
        pool,
        `nav_historical_${schemeCode}_${dateFrom || 'all'}_${dateTo || 'all'}`,
        async () => false, // Always run historical (no freshness check for ranged downloads)
        async () => {
          const records = await fetchMfapiHistory(schemeCode, dateFrom, dateTo);
          if (records.length === 0) return { records: 0 };

          // Batch upsert
          const BATCH = 500;
          for (let i = 0; i < records.length; i += BATCH) {
            const batch = records.slice(i, i + BATCH);
            const values: any[] = [];
            const placeholders: string[] = [];

            batch.forEach((rec, idx) => {
              const off = idx * 3;
              placeholders.push(`($${off + 1}, $${off + 2}, $${off + 3})`);
              values.push(rec.scheme_code, rec.nav_date, rec.nav);
            });

            await pool.query(
              `INSERT INTO ki_nav_history (scheme_code, nav_date, nav)
               VALUES ${placeholders.join(', ')}
               ON CONFLICT (scheme_code, nav_date) DO UPDATE SET nav = EXCLUDED.nav`,
              values,
            );
          }

          // Mark historical download done on bookmark
          await pool.query(
            `UPDATE ki_scheme_bookmarks SET historical_download_done = true, updated_at = now()
             WHERE scheme_code = $1`,
            [schemeCode],
          );

          return { records: records.length };
        },
      );

      res.json({
        scheme_code: schemeCode,
        status: result.status,
        records: result.result?.records || 0,
      });
    } catch (err: any) {
      console.error('[NAV:historical-download]', err);
      res.status(500).json({ error: { code: 'DOWNLOAD_FAILED', message: err.message } });
    }
  });

  /* ── GET /status — Cruise control status for all bookmarks ── */

  router.get('/status', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      // Bookmarks with NAV stats
      const bookmarks = await pool.query(
        `SELECT b.scheme_code, b.scheme_name, b.amc, b.daily_download_enabled,
                b.historical_download_done, s.active, s.closure_date, s.category,
                COUNT(n.id)::integer as nav_records,
                MAX(n.nav_date) as latest_nav_date,
                MIN(n.nav_date) as earliest_nav_date,
                (SELECT nav FROM ki_nav_history WHERE scheme_code = b.scheme_code ORDER BY nav_date DESC LIMIT 1) as latest_nav,
                COUNT(n.metrics_calculated_at)::integer as metrics_calculated_count,
                (COUNT(n.id) - COUNT(n.metrics_calculated_at))::integer as metrics_pending_count
         FROM ki_scheme_bookmarks b
         JOIN ki_schemes s ON s.scheme_code = b.scheme_code
         LEFT JOIN ki_nav_history n ON n.scheme_code = b.scheme_code
         WHERE b.tenant_id = $1
         GROUP BY b.scheme_code, b.scheme_name, b.amc, b.daily_download_enabled,
                  b.historical_download_done, s.active, s.closure_date, s.category
         ORDER BY b.scheme_name`,
        [jwt.tenant_id],
      );

      // Summary stats
      const total = bookmarks.rows.length;
      const withData = bookmarks.rows.filter((r: any) => r.nav_records > 0).length;
      const withoutData = total - withData;
      const metricsCalculated = bookmarks.rows.filter((r: any) => r.metrics_pending_count === 0 && r.nav_records > 0).length;
      const endedSchemes = bookmarks.rows.filter((r: any) => !r.active).length;

      // Last execution
      const lastExec = await pool.query(
        `SELECT status, started_at, execution_duration_ms, result_summary
         FROM ki_scheduler_executions
         WHERE job_code = 'nav_download' AND (tenant_id = $1 OR tenant_id IS NULL)
         ORDER BY started_at DESC LIMIT 1`,
        [jwt.tenant_id],
      );

      res.json({
        schemes: bookmarks.rows,
        stats: { total, with_data: withData, without_data: withoutData, metrics_calculated: metricsCalculated, ended_schemes: endedSchemes },
        last_execution: lastExec.rows[0] || null,
      });
    } catch (err: any) {
      console.error('[NAV:status]', err);
      res.status(500).json({ error: { code: 'FETCH_FAILED', message: err.message } });
    }
  });

  /* ── GET /scheme/:code — Full scheme detail with metrics + gaps ── */

  router.get('/scheme/:code', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const code = req.params.code;

      // Single CTE query: scheme + NAV summary + latest metrics + gaps
      // Replaces 4 sequential queries with 1 parallel query
      const [mainResult, bookmarkResult] = await Promise.all([
        pool.query(
          `WITH scheme AS (
              SELECT scheme_code, scheme_name, amc, category, scheme_type, active,
                     launch_date::text, closure_date::text, isin_growth, isin_dividend,
                     isin_reinvestment, nav_name, min_amount, risk_grade
              FROM ki_schemes WHERE scheme_code = $1
           ),
           nav_summary AS (
              SELECT COUNT(*)::integer AS total_records,
                     MIN(nav_date)::text AS earliest_date,
                     MAX(nav_date)::text AS latest_date
              FROM ki_nav_history WHERE scheme_code = $1
           ),
           latest_nav AS (
              SELECT nav AS latest_nav, nav_date::text AS latest_nav_date
              FROM ki_nav_history WHERE scheme_code = $1
              ORDER BY nav_date DESC LIMIT 1
           ),
           latest_metrics AS (
              SELECT daily_return, return_1w, return_1m, return_3m, return_6m, return_1y,
                     return_ytd, return_all, sd_7d, sd_14d, sd_21d, sd_42d, sd_3m, sd_6m,
                     sharpe_ratio, max_drawdown, cagr, metrics_calculated_at::text,
                     nav_date::text AS metrics_date
              FROM ki_nav_history
              WHERE scheme_code = $1 AND metrics_calculated_at IS NOT NULL
              ORDER BY nav_date DESC LIMIT 1
           ),
           gaps AS (
              SELECT nav_date::text AS gap_after, next_date::text AS gap_before, gap_days::integer
              FROM (
                SELECT nav_date, LEAD(nav_date) OVER (ORDER BY nav_date) AS next_date,
                       (LEAD(nav_date) OVER (ORDER BY nav_date) - nav_date) AS gap_days
                FROM ki_nav_history WHERE scheme_code = $1
              ) pairs
              WHERE gap_days > 3
              ORDER BY nav_date DESC LIMIT 20
           )
           SELECT
              row_to_json(s.*) AS scheme,
              json_build_object(
                'total_records', ns.total_records,
                'earliest_date', ns.earliest_date,
                'latest_date', ns.latest_date,
                'latest_nav', ln.latest_nav,
                'latest_nav_date', ln.latest_nav_date
              ) AS nav,
              CASE WHEN lm.metrics_date IS NOT NULL THEN row_to_json(lm.*) ELSE NULL END AS metrics,
              COALESCE((SELECT json_agg(g) FROM gaps g), '[]'::json) AS gaps
           FROM scheme s
           LEFT JOIN nav_summary ns ON true
           LEFT JOIN latest_nav ln ON true
           LEFT JOIN latest_metrics lm ON true`,
          [code],
        ),
        pool.query(
          `SELECT id, daily_download_enabled, alias_name, historical_download_done
           FROM ki_scheme_bookmarks
           WHERE tenant_id = $1 AND scheme_code = $2`,
          [jwt.tenant_id, code],
        ),
      ]);

      if (mainResult.rows.length === 0) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Scheme not found' } });
        return;
      }

      const row = mainResult.rows[0] as any;

      res.json({
        scheme: row.scheme,
        nav: row.nav || {},
        metrics: row.metrics || null,
        gaps: row.gaps || [],
        bookmark: bookmarkResult.rows[0] || null,
      });
    } catch (err: any) {
      console.error('[NAV:scheme-detail]', err);
      res.status(500).json({ error: { code: 'FETCH_FAILED', message: err.message } });
    }
  });

  /* ── POST /download/gap/:code — Download only missing gaps ── */

  router.post('/download/gap/:code', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const code = req.params.code;

      // Find gaps > 3 days
      const gapsResult = await pool.query(
        `WITH nav_pairs AS (
            SELECT nav_date,
                   LEAD(nav_date) OVER (ORDER BY nav_date) AS next_date,
                   (LEAD(nav_date) OVER (ORDER BY nav_date) - nav_date) AS gap_days
            FROM ki_nav_history WHERE scheme_code = $1
         )
         SELECT nav_date::text AS from_date, next_date::text AS to_date, gap_days::integer
         FROM nav_pairs WHERE gap_days > 3 ORDER BY nav_date`,
        [code],
      );

      if (gapsResult.rows.length === 0) {
        res.json({ scheme_code: code, status: 'no_gaps', filled: 0 });
        return;
      }

      let totalFilled = 0;

      for (const gap of gapsResult.rows as any[]) {
        const result = await withIdempotency(
          pool,
          `nav_gap_${code}_${gap.from_date}_${gap.to_date}`,
          async () => false, // Always attempt gap fills
          async () => {
            const records = await fetchMfapiHistory(code, gap.from_date, gap.to_date);
            if (records.length === 0) return 0;

            const BATCH = 500;
            for (let i = 0; i < records.length; i += BATCH) {
              const batch = records.slice(i, i + BATCH);
              const values: any[] = [];
              const placeholders: string[] = [];
              batch.forEach((rec, idx) => {
                const off = idx * 3;
                placeholders.push(`($${off + 1}, $${off + 2}, $${off + 3})`);
                values.push(rec.scheme_code, rec.nav_date, rec.nav);
              });
              await pool.query(
                `INSERT INTO ki_nav_history (scheme_code, nav_date, nav)
                 VALUES ${placeholders.join(', ')}
                 ON CONFLICT (scheme_code, nav_date) DO UPDATE SET nav = EXCLUDED.nav`,
                values,
              );
            }
            return records.length;
          },
        );
        if (result.status === 'executed') totalFilled += (result.result || 0);
      }

      res.json({ scheme_code: code, status: 'filled', gaps_found: gapsResult.rows.length, records_filled: totalFilled });
    } catch (err: any) {
      console.error('[NAV:gap-fill]', err);
      res.status(500).json({ error: { code: 'GAP_FILL_FAILED', message: err.message } });
    }
  });

  /* ── POST /download/all — Download ALL bookmarked schemes (full history) ── */

  router.post('/download/all', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      // Get all unique bookmarked scheme codes across all tenants
      const bookmarked = await pool.query(
        `SELECT DISTINCT b.scheme_code
         FROM ki_scheme_bookmarks b
         JOIN ki_schemes s ON s.scheme_code = b.scheme_code
         WHERE b.daily_download_enabled = true AND s.active = true`,
      );

      const codes = bookmarked.rows.map((r: any) => r.scheme_code);
      let downloaded = 0, skipped = 0, failed = 0;

      for (const code of codes) {
        try {
          const result = await withIdempotency(
            pool,
            `nav_full_${code}`,
            async () => {
              // Skip if already has >100 records (assume full download done)
              const r = await pool.query(
                'SELECT COUNT(*) as c FROM ki_nav_history WHERE scheme_code = $1',
                [code],
              );
              return Number((r.rows[0] as any).c) > 100;
            },
            async () => {
              const records = await fetchMfapiHistory(code);
              if (records.length === 0) return 0;

              const BATCH = 500;
              for (let i = 0; i < records.length; i += BATCH) {
                const batch = records.slice(i, i + BATCH);
                const values: any[] = [];
                const placeholders: string[] = [];
                batch.forEach((rec, idx) => {
                  const off = idx * 3;
                  placeholders.push(`($${off + 1}, $${off + 2}, $${off + 3})`);
                  values.push(rec.scheme_code, rec.nav_date, rec.nav);
                });
                await pool.query(
                  `INSERT INTO ki_nav_history (scheme_code, nav_date, nav)
                   VALUES ${placeholders.join(', ')}
                   ON CONFLICT (scheme_code, nav_date) DO UPDATE SET nav = EXCLUDED.nav`,
                  values,
                );
              }
              return records.length;
            },
          );
          if (result.status === 'executed') downloaded++;
          else skipped++;
        } catch { failed++; }
      }

      res.json({ total: codes.length, downloaded, skipped, failed });
    } catch (err: any) {
      console.error('[NAV:download-all]', err);
      res.status(500).json({ error: { code: 'DOWNLOAD_FAILED', message: err.message } });
    }
  });

  /* ── POST /metrics/:code — Calculate metrics for one scheme ── */

  router.post('/metrics/:code', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const schemeCode = req.params.code;

      const result = await withIdempotency(
        pool,
        `metrics_calc_${schemeCode}`,
        async () => {
          const r = await pool.query(
            `SELECT 1 FROM ki_nav_history
             WHERE scheme_code = $1 AND metrics_calculated_at > now() - interval '1 hour' LIMIT 1`,
            [schemeCode],
          );
          return r.rows.length > 0;
        },
        async () => {
          const r = await pool.query('SELECT * FROM calculate_scheme_metrics($1)', [schemeCode]);
          return r.rows[0];
        },
      );

      if (result.status === 'skipped') {
        res.json({ scheme_code: schemeCode, status: 'already_fresh', reason: result.reason });
      } else {
        const data = result.result as any;
        res.json({
          scheme_code: schemeCode,
          status: 'calculated',
          records_updated: data?.records_updated || 0,
          execution_ms: data?.execution_ms || 0,
        });
      }
    } catch (err: any) {
      console.error('[NAV:metrics]', err);
      res.status(500).json({ error: { code: 'METRICS_FAILED', message: err.message } });
    }
  });

  /* ── POST /download/gap/all — Fill gaps for ALL bookmarked schemes ── */

  router.post('/download/gap/all', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      // Get all bookmarked schemes that have NAV data (gaps only exist if data exists)
      const bookmarked = await pool.query(
        `SELECT DISTINCT b.scheme_code
         FROM ki_scheme_bookmarks b
         JOIN ki_nav_history n ON n.scheme_code = b.scheme_code
         WHERE b.daily_download_enabled = true
         GROUP BY b.scheme_code
         HAVING COUNT(n.id) > 1`,
      );

      const codes = bookmarked.rows.map((r: any) => r.scheme_code);
      let schemesWithGaps = 0, totalFilled = 0;

      for (const code of codes) {
        // Find gaps for this scheme
        const gapsResult = await pool.query(
          `WITH pairs AS (
              SELECT nav_date, LEAD(nav_date) OVER (ORDER BY nav_date) AS next_date,
                     (LEAD(nav_date) OVER (ORDER BY nav_date) - nav_date) AS gap_days
              FROM ki_nav_history WHERE scheme_code = $1
           )
           SELECT nav_date::text AS from_date, next_date::text AS to_date
           FROM pairs WHERE gap_days > 3`,
          [code],
        );

        if (gapsResult.rows.length === 0) continue;
        schemesWithGaps++;

        for (const gap of gapsResult.rows as any[]) {
          try {
            const records = await fetchMfapiHistory(code, gap.from_date, gap.to_date);
            if (records.length === 0) continue;

            const BATCH = 500;
            for (let i = 0; i < records.length; i += BATCH) {
              const batch = records.slice(i, i + BATCH);
              const values: any[] = [];
              const placeholders: string[] = [];
              batch.forEach((rec, idx) => {
                const off = idx * 3;
                placeholders.push(`($${off + 1}, $${off + 2}, $${off + 3})`);
                values.push(rec.scheme_code, rec.nav_date, rec.nav);
              });
              await pool.query(
                `INSERT INTO ki_nav_history (scheme_code, nav_date, nav)
                 VALUES ${placeholders.join(', ')}
                 ON CONFLICT (scheme_code, nav_date) DO UPDATE SET nav = EXCLUDED.nav`,
                values,
              );
            }
            totalFilled += records.length;
          } catch { /* skip scheme on error, continue others */ }
        }
      }

      res.json({ total_schemes: codes.length, schemes_with_gaps: schemesWithGaps, records_filled: totalFilled });
    } catch (err: any) {
      console.error('[NAV:gap-fill-all]', err);
      res.status(500).json({ error: { code: 'GAP_FILL_FAILED', message: err.message } });
    }
  });

  /* ── POST /metrics/bulk — Calculate metrics for all schemes ── */

  router.post('/metrics/bulk', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const result = await pool.query('SELECT * FROM calculate_all_scheme_metrics()');
      const data = result.rows[0] as any;

      res.json({
        status: 'completed',
        total_schemes: data?.total_schemes || 0,
        total_records_updated: data?.total_records_updated || 0,
        execution_ms: data?.execution_ms || 0,
      });
    } catch (err: any) {
      console.error('[NAV:bulk-metrics]', err);
      res.status(500).json({ error: { code: 'METRICS_FAILED', message: err.message } });
    }
  });

  /* ── PATCH /bookmarks/:schemeCode/alias — Update bookmark display alias ── */

  router.patch('/bookmarks/:schemeCode/alias', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { alias_name } = req.body;
      // alias_name may be null/empty to clear the alias
      const aliasValue = alias_name ? String(alias_name).trim() || null : null;

      const result = await pool.query(
        `UPDATE ki_scheme_bookmarks
         SET alias_name = $1, updated_at = now()
         WHERE tenant_id = $2 AND scheme_code = $3
         RETURNING scheme_code, alias_name`,
        [aliasValue, jwt.tenant_id, req.params.schemeCode],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bookmark not found' } });
        return;
      }

      res.json({ scheme_code: result.rows[0].scheme_code, alias_name: result.rows[0].alias_name });
    } catch (err: any) {
      console.error('[NAV:alias-update]', err);
      res.status(500).json({ error: { code: 'ALIAS_UPDATE_FAILED', message: err.message } });
    }
  });

  /* ════════════════════════════════════════════════════
     ALIASES — Global scheme name mapping
     No tenant scope — shared across all tenants
  ════════════════════════════════════════════════════ */

  /* ── GET /aliases — List aliases (optionally filter by scheme_code) ── */

  router.get('/aliases', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { scheme_code, q, limit = '50', offset = '0' } = req.query as Record<string, string>;

      const conditions: string[] = ['a.is_active = true'];
      const params: any[] = [];

      if (scheme_code) {
        params.push(scheme_code);
        conditions.push(`a.scheme_code = $${params.length}`);
      }
      if (q) {
        params.push(`%${q.toUpperCase()}%`);
        conditions.push(`a.alias_name_normalized LIKE $${params.length}`);
      }

      const where = conditions.join(' AND ');
      params.push(parseInt(limit, 10) || 50, parseInt(offset, 10) || 0);

      const result = await pool.query(
        `SELECT a.id, a.scheme_code, a.alias_name, a.alias_name_normalized,
                a.source, a.is_active, a.created_at,
                s.scheme_name
         FROM ki_scheme_aliases a
         JOIN ki_schemes s ON s.scheme_code = a.scheme_code
         WHERE ${where}
         ORDER BY a.scheme_code, a.source, a.alias_name
         LIMIT $${params.length - 1} OFFSET $${params.length}`,
        params,
      );

      const countResult = await pool.query(
        `SELECT COUNT(*)::integer AS total
         FROM ki_scheme_aliases a
         WHERE ${where}`,
        params.slice(0, -2),
      );

      res.json({
        aliases: result.rows,
        total: (countResult.rows[0] as any).total,
      });
    } catch (err: any) {
      console.error('[NAV:aliases-list]', err);
      res.status(500).json({ error: { code: 'FETCH_FAILED', message: err.message } });
    }
  });

  /* ── POST /aliases — Create a single alias ── */

  router.post('/aliases', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { scheme_code, alias_name, source = 'manual' } = req.body;
      if (!scheme_code || !alias_name) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'scheme_code and alias_name required' } });
        return;
      }

      // Verify scheme exists
      const check = await pool.query('SELECT 1 FROM ki_schemes WHERE scheme_code = $1', [String(scheme_code).trim()]);
      if (check.rows.length === 0) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Scheme not found' } });
        return;
      }

      const result = await pool.query(
        `INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
         VALUES ($1, $2, $3)
         ON CONFLICT (alias_name_normalized) DO UPDATE
           SET scheme_code = EXCLUDED.scheme_code,
               source      = EXCLUDED.source,
               is_active   = true,
               updated_at  = now()
         RETURNING id, scheme_code, alias_name, alias_name_normalized, source`,
        [String(scheme_code).trim(), String(alias_name).trim(), source],
      );

      res.status(201).json({ alias: result.rows[0] });
    } catch (err: any) {
      console.error('[NAV:alias-create]', err);
      res.status(500).json({ error: { code: 'ALIAS_CREATE_FAILED', message: err.message } });
    }
  });

  /* ── POST /aliases/bulk — Bulk-create aliases for one scheme ── */

  router.post('/aliases/bulk', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { scheme_code, aliases, source = 'manual' } = req.body as {
        scheme_code: string;
        aliases: string[];
        source?: string;
      };

      if (!scheme_code || !Array.isArray(aliases) || aliases.length === 0) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'scheme_code and aliases[] required' } });
        return;
      }

      // Verify scheme exists
      const check = await pool.query('SELECT 1 FROM ki_schemes WHERE scheme_code = $1', [String(scheme_code).trim()]);
      if (check.rows.length === 0) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Scheme not found' } });
        return;
      }

      const code = String(scheme_code).trim();
      const src = ['auto', 'manual', 'import'].includes(source) ? source : 'manual';

      let created = 0;
      let skipped = 0;
      const errors: string[] = [];

      for (const raw of aliases) {
        const name = String(raw).trim();
        if (!name) { skipped++; continue; }
        try {
          const r = await pool.query(
            `INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
             VALUES ($1, $2, $3)
             ON CONFLICT (alias_name_normalized) DO UPDATE
               SET scheme_code = EXCLUDED.scheme_code,
                   source      = EXCLUDED.source,
                   is_active   = true,
                   updated_at  = now()
             RETURNING id`,
            [code, name, src],
          );
          if (r.rows.length > 0) created++;
        } catch (e: any) {
          errors.push(`${name}: ${e.message}`);
          skipped++;
        }
      }

      res.status(201).json({ scheme_code: code, created, skipped, errors });
    } catch (err: any) {
      console.error('[NAV:aliases-bulk]', err);
      res.status(500).json({ error: { code: 'ALIAS_BULK_FAILED', message: err.message } });
    }
  });

  /* ── DELETE /aliases/:id — Soft-delete an alias ── */

  router.delete('/aliases/:id', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid alias id' } }); return; }

      await pool.query(
        'UPDATE ki_scheme_aliases SET is_active = false, updated_at = now() WHERE id = $1',
        [id],
      );
      res.json({ message: 'Alias deactivated' });
    } catch (err: any) {
      console.error('[NAV:alias-delete]', err);
      res.status(500).json({ error: { code: 'ALIAS_DELETE_FAILED', message: err.message } });
    }
  });

  /* ── Backfill: in-memory state per user ── */

  interface BackfillState {
    status: 'running' | 'completed' | 'cancelled' | 'error';
    total: number;
    current: number;
    created: number;
    skipped: number;
    error?: string;
    started_at: string;
    completed_at?: string;
  }
  const backfillMap = new Map<string, BackfillState>();
  const cancelSet  = new Set<string>();

  /* ── POST /aliases/backfill — Start async alias backfill ── */

  router.post('/aliases/backfill', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const key = jwt.user_id;
      if (backfillMap.get(key)?.status === 'running') {
        res.status(409).json({ error: { code: 'ALREADY_RUNNING', message: 'Backfill already in progress' } });
        return;
      }

      const state: BackfillState = { status: 'running', total: 0, current: 0, created: 0, skipped: 0, started_at: new Date().toISOString() };
      backfillMap.set(key, state);
      cancelSet.delete(key);

      // Return immediately — process in background
      res.status(202).json({ message: 'Backfill started', started_at: state.started_at });

      // Background processing
      (async () => {
        try {
          const BATCH = 100;

          // Count total active schemes with a name
          const countResult = await pool.query(
            `SELECT COUNT(*)::integer AS n FROM ki_schemes WHERE scheme_name IS NOT NULL AND TRIM(scheme_name) != ''`,
          );
          state.total = (countResult.rows[0] as any).n;

          let offset = 0;
          while (true) {
            if (cancelSet.has(key)) { state.status = 'cancelled'; state.completed_at = new Date().toISOString(); return; }

            const batch = await pool.query(
              `SELECT scheme_code, scheme_name, nav_name
               FROM ki_schemes
               WHERE scheme_name IS NOT NULL AND TRIM(scheme_name) != ''
               ORDER BY scheme_code
               LIMIT $1 OFFSET $2`,
              [BATCH, offset],
            );
            if (batch.rows.length === 0) break;

            for (const row of batch.rows as any[]) {
              if (cancelSet.has(key)) { state.status = 'cancelled'; state.completed_at = new Date().toISOString(); return; }

              try {
                // Seed scheme_name
                const r1 = await pool.query(
                  `INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
                   VALUES ($1, $2, 'auto')
                   ON CONFLICT (scheme_code, alias_name_normalized) DO NOTHING
                   RETURNING id`,
                  [row.scheme_code, row.scheme_name],
                );
                if (r1.rows.length > 0) state.created++; else state.skipped++;

                // Seed nav_name if different
                if (row.nav_name && row.nav_name.trim()) {
                  await pool.query(
                    `INSERT INTO ki_scheme_aliases (scheme_code, alias_name, source)
                     SELECT $1, $2, 'auto'
                     WHERE normalize_scheme_name($2) IS DISTINCT FROM normalize_scheme_name($3)
                     ON CONFLICT (scheme_code, alias_name_normalized) DO NOTHING`,
                    [row.scheme_code, row.nav_name, row.scheme_name],
                  );
                }
              } catch { state.skipped++; }

              state.current++;
            }

            offset += BATCH;
          }

          state.status = 'completed';
          state.completed_at = new Date().toISOString();
        } catch (err: any) {
          state.status = 'error';
          state.error = err.message;
          state.completed_at = new Date().toISOString();
          console.error('[NAV:backfill]', err);
        }
      })();

    } catch (err: any) {
      console.error('[NAV:backfill-start]', err);
      res.status(500).json({ error: { code: 'BACKFILL_FAILED', message: err.message } });
    }
  });

  /* ── GET /aliases/backfill/progress — Poll backfill status ── */

  router.get('/aliases/backfill/progress', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const state = backfillMap.get(jwt.user_id);
      if (!state) { res.json({ status: 'idle' }); return; }

      const pct = state.total > 0 ? Math.round((state.current / state.total) * 100) : 0;
      res.json({ ...state, percent: pct });
    } catch (err: any) {
      res.status(500).json({ error: { code: 'FETCH_FAILED', message: err.message } });
    }
  });

  /* ── POST /aliases/backfill/cancel — Cancel running backfill ── */

  router.post('/aliases/backfill/cancel', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const state = backfillMap.get(jwt.user_id);
      if (!state || state.status !== 'running') {
        res.json({ message: 'No running backfill to cancel' }); return;
      }
      cancelSet.add(jwt.user_id);
      res.json({ message: 'Cancel requested' });
    } catch (err: any) {
      res.status(500).json({ error: { code: 'CANCEL_FAILED', message: err.message } });
    }
  });

  return router;
}
