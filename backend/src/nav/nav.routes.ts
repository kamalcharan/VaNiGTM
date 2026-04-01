/**
 * KI-Prime — NAV Routes
 *
 * Bookmark management, NAV download triggers, status, metrics.
 * All downloads use withIdempotency() for global data safety.
 *
 * POST   /api/v1/nav/bookmarks              — Bookmark a scheme
 * GET    /api/v1/nav/bookmarks              — List tenant's bookmarks with NAV status
 * DELETE /api/v1/nav/bookmarks/:schemeCode  — Remove bookmark
 * POST   /api/v1/nav/download/daily         — Download today's NAV for all bookmarked schemes
 * POST   /api/v1/nav/download/scheme/:code  — Download historical NAV for one scheme
 * GET    /api/v1/nav/status                 — Cruise control status (all bookmarks + gaps + metrics)
 * POST   /api/v1/nav/metrics/:code          — Calculate metrics for one scheme
 * POST   /api/v1/nav/metrics/bulk           — Calculate metrics for all bookmarked schemes
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import { verifyAccessToken, type JwtPayload } from '../auth/token.service';
import { withIdempotency } from '../lib/idempotent';
import { fetchAmfiDaily } from '../fetchers/amfi-fetcher';
import { fetchMfapiHistory } from '../fetchers/mfapi-fetcher';

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

  /* ── GET /bookmarks — List bookmarks with NAV status ── */

  router.get('/bookmarks', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const result = await pool.query(
        `SELECT b.id, b.scheme_code, b.scheme_name, b.amc, b.alias_name,
                b.daily_download_enabled, b.historical_download_done,
                s.active, s.closure_date,
                COUNT(n.id) as nav_records,
                MAX(n.nav_date) as latest_nav_date,
                MAX(n.nav) FILTER (WHERE n.nav_date = (SELECT MAX(nav_date) FROM ki_nav_history WHERE scheme_code = b.scheme_code)) as latest_nav,
                MIN(n.nav_date) as earliest_nav_date,
                MAX(n.metrics_calculated_at) as metrics_calculated_at
         FROM ki_scheme_bookmarks b
         JOIN ki_schemes s ON s.scheme_code = b.scheme_code
         LEFT JOIN ki_nav_history n ON n.scheme_code = b.scheme_code
         WHERE b.tenant_id = $1
         GROUP BY b.id, b.scheme_code, b.scheme_name, b.amc, b.alias_name,
                  b.daily_download_enabled, b.historical_download_done,
                  s.active, s.closure_date
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

  return router;
}
