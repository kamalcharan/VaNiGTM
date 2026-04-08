/**
 * KI-Prime — Market Routes
 *
 * NSE market indices management + OHLCV download from Yahoo Finance.
 * All data is global (no tenant_id). Auth required on every endpoint.
 *
 * GET    /api/v1/market/indices                       — List all indices (filter: category, status, search)
 * GET    /api/v1/market/indices/:id                   — Single index detail
 * GET    /api/v1/market/data/:indexId                 — OHLCV history (paginated)
 * GET    /api/v1/market/data/:indexId/latest          — Latest data point
 * POST   /api/v1/market/download/historical           — Download historical OHLCV for one index
 * POST   /api/v1/market/download/eod                  — EOD download for one index
 * POST   /api/v1/market/download/eod-all              — EOD download for all active indices
 * GET    /api/v1/market/statistics                    — Aggregate stats
 * GET    /api/v1/market/detailed-status               — Per-index download + metrics status
 * GET    /api/v1/market/jobs/:jobId                   — Poll job status
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import { verifyAccessToken, type JwtPayload } from '../auth/token.service';
import { downloadYahooHistorical, downloadYahooLatest } from './yahoo-finance.service';

/* ── Auth helper ───────────────────────────────────── */

function extractJwt(req: { headers: { authorization?: string } }): JwtPayload | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyAccessToken(auth.slice(7)); } catch { return null; }
}

/* ── In-memory job store (per-process, survives only current boot) ─── */

interface MarketJob {
  id: number;
  index_id: number | null;
  job_type: string;
  status: 'pending' | 'running' | 'success' | 'failed';
  total: number;
  done: number;
  failed: number;
  skipped: number;
  current_index: string | null;
  error: string | null;
  started_at: Date;
  ended_at: Date | null;
}

const activeJobs = new Map<number, MarketJob>();

/* ── Upsert OHLCV rows into ki_market_data in batches ─ */

async function upsertOhlcv(
  pool: Pool,
  indexId: number,
  rows: Array<{
    date: Date; open: number; high: number; low: number;
    close: number; adj_close: number; volume: number;
  }>,
): Promise<{ inserted: number; skipped: number }> {
  if (rows.length === 0) return { inserted: 0, skipped: 0 };

  const BATCH = 500;
  let inserted = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const values: any[] = [];
    const placeholders: string[] = [];
    let p = 1;

    for (const r of batch) {
      placeholders.push(`($${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++},$${p++})`);
      values.push(
        indexId,
        r.date.toISOString().split('T')[0],
        r.open, r.high, r.low, r.close, r.adj_close, r.volume,
      );
    }

    const sql = `
      INSERT INTO ki_market_data (index_id, trade_date, open, high, low, close, adj_close, volume)
      VALUES ${placeholders.join(',')}
      ON CONFLICT (index_id, trade_date) DO UPDATE SET
        open      = EXCLUDED.open,
        high      = EXCLUDED.high,
        low       = EXCLUDED.low,
        close     = EXCLUDED.close,
        adj_close = EXCLUDED.adj_close,
        volume    = EXCLUDED.volume,
        updated_at = now()
    `;
    const result = await pool.query(sql, values);
    inserted += result.rowCount ?? 0;
  }

  return { inserted, skipped: rows.length - inserted };
}

/* ── Update index summary stats ──────────────────── */

async function syncIndexStats(pool: Pool, indexId: number): Promise<void> {
  await pool.query(
    `UPDATE ki_market_indices SET
       total_records             = (SELECT COUNT(*) FROM ki_market_data WHERE index_id = $1),
       earliest_date             = (SELECT MIN(trade_date) FROM ki_market_data WHERE index_id = $1),
       latest_date               = (SELECT MAX(trade_date) FROM ki_market_data WHERE index_id = $1),
       historical_data_available = (SELECT COUNT(*) > 0 FROM ki_market_data WHERE index_id = $1),
       updated_at                = now()
     WHERE id = $1`,
    [indexId],
  );
}

/* ── Router factory ────────────────────────────────── */

export function createMarketRouter(pool: Pool): Router {
  const router = Router();

  /* ── GET /indices ─────────────────────────────────── */

  router.get('/indices', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { category, status, search, page = '1', page_size = '50' } = req.query as Record<string, string>;
      const offset = (parseInt(page) - 1) * parseInt(page_size);

      const conditions: string[] = ['1=1'];
      const params: any[] = [];
      let p = 1;

      if (category && category !== 'all') {
        conditions.push(`category = $${p++}`); params.push(category);
      }
      if (status === 'has_data') {
        conditions.push('historical_data_available = true');
      } else if (status === 'no_data') {
        conditions.push('historical_data_available = false');
      } else if (status === 'needs_metrics') {
        conditions.push(`historical_data_available = true AND NOT EXISTS (
          SELECT 1 FROM ki_market_data kmd WHERE kmd.index_id = ki_market_indices.id
            AND kmd.metrics_calculated_at IS NOT NULL LIMIT 1
        )`);
      }
      if (search) {
        conditions.push(`(index_name ILIKE $${p} OR index_code ILIKE $${p} OR description ILIKE $${p})`);
        params.push(`%${search}%`); p++;
      }

      const where = conditions.join(' AND ');

      const [rows, count] = await Promise.all([
        pool.query(
          `SELECT id, index_code, index_name, yahoo_symbol, category, description, priority,
                  is_active, provider_enabled, total_records, earliest_date, latest_date,
                  historical_data_available, last_download_status, last_download_at, last_download_error
           FROM ki_market_indices
           WHERE ${where}
           ORDER BY priority ASC, index_name ASC
           LIMIT $${p} OFFSET $${p + 1}`,
          [...params, parseInt(page_size), offset],
        ),
        pool.query(`SELECT COUNT(*) FROM ki_market_indices WHERE ${where}`, params),
      ]);

      res.json({
        indices: rows.rows,
        total: parseInt(count.rows[0].count),
        page: parseInt(page),
        page_size: parseInt(page_size),
      });
    } catch (err) {
      console.error('[Market] GET /indices', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch indices' } });
    }
  });

  /* ── GET /indices/:id ────────────────────────────── */

  router.get('/indices/:id', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const id = parseInt(req.params.id);
      const result = await pool.query(
        `SELECT id, index_code, index_name, yahoo_symbol, category, description, priority,
                is_active, provider_enabled, total_records, earliest_date, latest_date,
                historical_data_available, last_download_status, last_download_at, last_download_error
         FROM ki_market_indices WHERE id = $1`,
        [id],
      );

      if (result.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Index not found' } }); return; }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('[Market] GET /indices/:id', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch index' } });
    }
  });

  /* ── GET /data/:indexId ──────────────────────────── */

  router.get('/data/:indexId', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const indexId = parseInt(req.params.indexId);
      const { start_date, end_date, page = '1', page_size = '100' } = req.query as Record<string, string>;
      const offset = (parseInt(page) - 1) * parseInt(page_size);

      const conditions = ['index_id = $1'];
      const params: any[] = [indexId];
      let p = 2;

      if (start_date) { conditions.push(`trade_date >= $${p++}`); params.push(start_date); }
      if (end_date)   { conditions.push(`trade_date <= $${p++}`); params.push(end_date); }

      const where = conditions.join(' AND ');

      const [rows, count] = await Promise.all([
        pool.query(
          `SELECT trade_date, open, high, low, close, adj_close, volume,
                  daily_return, return_1w, return_1m, return_3m, return_6m, return_1y, return_ytd, return_all,
                  sd_7d, sd_14d, sd_21d, sd_42d, sd_3m, sd_6m,
                  sharpe_ratio, max_drawdown, cagr, total_risk, metrics_calculated_at
           FROM ki_market_data WHERE ${where}
           ORDER BY trade_date DESC
           LIMIT $${p} OFFSET $${p + 1}`,
          [...params, parseInt(page_size), offset],
        ),
        pool.query(`SELECT COUNT(*) FROM ki_market_data WHERE ${where}`, params),
      ]);

      res.json({
        data: rows.rows,
        total: parseInt(count.rows[0].count),
        page: parseInt(page),
        page_size: parseInt(page_size),
      });
    } catch (err) {
      console.error('[Market] GET /data/:indexId', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch market data' } });
    }
  });

  /* ── GET /data/:indexId/latest ───────────────────── */

  router.get('/data/:indexId/latest', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const indexId = parseInt(req.params.indexId);
      const result = await pool.query(
        `SELECT trade_date, open, high, low, close, adj_close, volume,
                daily_return, return_1w, return_1m, return_3m, return_6m, return_1y, return_ytd, return_all,
                sd_7d, sd_14d, sd_21d, sd_42d, sd_3m, sd_6m,
                sharpe_ratio, max_drawdown, cagr, total_risk, metrics_calculated_at
         FROM ki_market_data WHERE index_id = $1 ORDER BY trade_date DESC LIMIT 1`,
        [indexId],
      );

      if (result.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No data for this index' } }); return; }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('[Market] GET /data/:indexId/latest', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch latest data' } });
    }
  });

  /* ── POST /download/historical ───────────────────── */

  router.post('/download/historical', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { index_id, start_date, end_date, skip_existing = true } = req.body;
      if (!index_id || !start_date || !end_date) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'index_id, start_date, end_date required' } }); return;
      }

      const idxResult = await pool.query('SELECT id, index_name, yahoo_symbol, provider_enabled FROM ki_market_indices WHERE id = $1', [index_id]);
      if (idxResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Index not found' } }); return; }

      const idx = idxResult.rows[0] as any;
      if (!idx.provider_enabled) {
        res.status(400).json({ error: { code: 'PROVIDER_DISABLED', message: `Provider disabled for ${idx.index_name}` } }); return;
      }

      // Create job record
      const jobResult = await pool.query(
        `INSERT INTO ki_market_jobs (index_id, job_type, status, start_date, end_date) VALUES ($1, 'historical', 'running', $2, $3) RETURNING id`,
        [index_id, start_date, end_date],
      );
      const jobId: number = jobResult.rows[0].id;

      // Mark index as downloading
      await pool.query(`UPDATE ki_market_indices SET last_download_status = 'running', updated_at = now() WHERE id = $1`, [index_id]);

      // Track in memory
      const job: MarketJob = {
        id: jobId, index_id, job_type: 'historical', status: 'running',
        total: 0, done: 0, failed: 0, skipped: 0, current_index: idx.index_name,
        error: null, started_at: new Date(), ended_at: null,
      };
      activeJobs.set(jobId, job);

      res.status(202).json({ job_id: jobId, message: 'Download started' });

      // Run async
      setImmediate(async () => {
        const startTime = Date.now();
        try {
          const resp = await downloadYahooHistorical(
            idx.yahoo_symbol,
            new Date(start_date),
            new Date(end_date),
          );

          if (!resp.success) throw new Error(resp.error ?? 'Download failed');

          const { inserted } = await upsertOhlcv(pool, index_id, resp.data);
          await syncIndexStats(pool, index_id);

          await pool.query(
            `UPDATE ki_market_jobs SET status = 'success', records_inserted = $2, execution_time_ms = $3, completed_at = now() WHERE id = $1`,
            [jobId, inserted, Date.now() - startTime],
          );
          await pool.query(
            `UPDATE ki_market_indices SET last_download_status = 'success', last_download_at = now(), last_download_error = NULL, updated_at = now() WHERE id = $1`,
            [index_id],
          );

          job.status = 'success'; job.done = inserted; job.ended_at = new Date();
          console.log(`[Market] Downloaded ${inserted} records for ${idx.index_name} (job ${jobId})`);
        } catch (err: any) {
          await pool.query(
            `UPDATE ki_market_jobs SET status = 'failed', error_details = $2, execution_time_ms = $3, completed_at = now() WHERE id = $1`,
            [jobId, err.message, Date.now() - startTime],
          );
          await pool.query(
            `UPDATE ki_market_indices SET last_download_status = 'failed', last_download_error = $2, updated_at = now() WHERE id = $1`,
            [index_id, err.message],
          );
          job.status = 'failed'; job.error = err.message; job.ended_at = new Date();
          console.error(`[Market] Download failed for ${idx.index_name} (job ${jobId}): ${err.message}`);
        }
      });
    } catch (err) {
      console.error('[Market] POST /download/historical', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to start download' } });
    }
  });

  /* ── POST /download/eod ──────────────────────────── */

  router.post('/download/eod', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { index_id } = req.body;
      if (!index_id) { res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'index_id required' } }); return; }

      const idxResult = await pool.query('SELECT id, index_name, yahoo_symbol, provider_enabled FROM ki_market_indices WHERE id = $1', [index_id]);
      if (idxResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Index not found' } }); return; }

      const idx = idxResult.rows[0] as any;
      if (!idx.provider_enabled) {
        res.status(400).json({ error: { code: 'PROVIDER_DISABLED', message: `Provider disabled for ${idx.index_name}` } }); return;
      }

      const jobResult = await pool.query(
        `INSERT INTO ki_market_jobs (index_id, job_type, status) VALUES ($1, 'eod', 'running') RETURNING id`,
        [index_id],
      );
      const jobId: number = jobResult.rows[0].id;

      await pool.query(`UPDATE ki_market_indices SET last_download_status = 'running', updated_at = now() WHERE id = $1`, [index_id]);

      const job: MarketJob = {
        id: jobId, index_id, job_type: 'eod', status: 'running',
        total: 1, done: 0, failed: 0, skipped: 0, current_index: idx.index_name,
        error: null, started_at: new Date(), ended_at: null,
      };
      activeJobs.set(jobId, job);

      res.status(202).json({ job_id: jobId, message: 'EOD download started' });

      setImmediate(async () => {
        const startTime = Date.now();
        try {
          const resp = await downloadYahooLatest(idx.yahoo_symbol);
          if (!resp.success) throw new Error(resp.error ?? 'EOD download failed');

          const { inserted } = await upsertOhlcv(pool, index_id, resp.data);
          await syncIndexStats(pool, index_id);

          await pool.query(
            `UPDATE ki_market_jobs SET status = 'success', records_inserted = $2, execution_time_ms = $3, completed_at = now() WHERE id = $1`,
            [jobId, inserted, Date.now() - startTime],
          );
          await pool.query(
            `UPDATE ki_market_indices SET last_download_status = 'success', last_download_at = now(), last_download_error = NULL, updated_at = now() WHERE id = $1`,
            [index_id],
          );
          job.status = 'success'; job.done = inserted; job.ended_at = new Date();
        } catch (err: any) {
          await pool.query(
            `UPDATE ki_market_jobs SET status = 'failed', error_details = $2, execution_time_ms = $3, completed_at = now() WHERE id = $1`,
            [jobId, err.message, Date.now() - startTime],
          );
          await pool.query(
            `UPDATE ki_market_indices SET last_download_status = 'failed', last_download_error = $2, updated_at = now() WHERE id = $1`,
            [index_id, err.message],
          );
          job.status = 'failed'; job.error = err.message; job.ended_at = new Date();
        }
      });
    } catch (err) {
      console.error('[Market] POST /download/eod', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to start EOD download' } });
    }
  });

  /* ── POST /download/eod-all ──────────────────────── */

  router.post('/download/eod-all', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const indicesResult = await pool.query(
        `SELECT id, index_name, yahoo_symbol FROM ki_market_indices WHERE is_active = true AND provider_enabled = true ORDER BY priority ASC`,
      );
      const indices = indicesResult.rows as any[];

      if (indices.length === 0) { res.json({ message: 'No active indices to download', total: 0 }); return; }

      const jobResult = await pool.query(
        `INSERT INTO ki_market_jobs (index_id, job_type, status) VALUES (NULL, 'eod_all', 'running') RETURNING id`,
      );
      const jobId: number = jobResult.rows[0].id;

      const job: MarketJob = {
        id: jobId, index_id: null, job_type: 'eod_all', status: 'running',
        total: indices.length, done: 0, failed: 0, skipped: 0, current_index: null,
        error: null, started_at: new Date(), ended_at: null,
      };
      activeJobs.set(jobId, job);

      res.status(202).json({ job_id: jobId, total: indices.length, message: 'EOD-all download started' });

      setImmediate(async () => {
        const startTime = Date.now();
        for (const idx of indices) {
          job.current_index = idx.index_name;
          try {
            const resp = await downloadYahooLatest(idx.yahoo_symbol);
            if (!resp.success) throw new Error(resp.error ?? 'failed');
            await upsertOhlcv(pool, idx.id, resp.data);
            await syncIndexStats(pool, idx.id);
            await pool.query(
              `UPDATE ki_market_indices SET last_download_status = 'success', last_download_at = now(), last_download_error = NULL WHERE id = $1`,
              [idx.id],
            );
            job.done++;
          } catch (err: any) {
            job.failed++;
            await pool.query(
              `UPDATE ki_market_indices SET last_download_status = 'failed', last_download_error = $2 WHERE id = $1`,
              [idx.id, err.message],
            );
          }
        }

        job.status = job.failed > 0 ? 'failed' : 'success';
        job.ended_at = new Date();

        await pool.query(
          `UPDATE ki_market_jobs SET status = $2, records_inserted = $3, execution_time_ms = $4, completed_at = now() WHERE id = $1`,
          [jobId, job.status, job.done, Date.now() - startTime],
        );
        console.log(`[Market] EOD-all complete: ${job.done} OK, ${job.failed} failed`);
      });
    } catch (err) {
      console.error('[Market] POST /download/eod-all', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to start EOD-all download' } });
    }
  });

  /* ── GET /statistics ─────────────────────────────── */

  router.get('/statistics', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const result = await pool.query(`
        SELECT
          COUNT(*)                                          AS total_indices,
          COUNT(*) FILTER (WHERE is_active = true)         AS active_indices,
          COUNT(*) FILTER (WHERE historical_data_available) AS with_data,
          COUNT(*) FILTER (WHERE NOT historical_data_available) AS no_data,
          COUNT(*) FILTER (WHERE last_download_status = 'failed') AS failed_last,
          SUM(total_records)                               AS total_records,
          MIN(earliest_date)                               AS earliest_date,
          MAX(latest_date)                                 AS latest_date
        FROM ki_market_indices
      `);

      const metricsResult = await pool.query(`
        SELECT COUNT(DISTINCT index_id) AS indices_with_metrics
        FROM ki_market_data
        WHERE metrics_calculated_at IS NOT NULL
      `);

      res.json({
        ...result.rows[0],
        indices_with_metrics: parseInt(metricsResult.rows[0].indices_with_metrics),
      });
    } catch (err) {
      console.error('[Market] GET /statistics', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch statistics' } });
    }
  });

  /* ── GET /detailed-status ─────────────────────────── */

  router.get('/detailed-status', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const result = await pool.query(`
        SELECT
          mi.id,
          mi.index_code,
          mi.index_name,
          mi.category,
          mi.priority,
          mi.total_records,
          mi.earliest_date,
          mi.latest_date,
          mi.historical_data_available,
          mi.last_download_status,
          mi.last_download_at,
          mi.last_download_error,
          mi.provider_enabled,
          -- Metrics status
          (SELECT MAX(metrics_calculated_at) FROM ki_market_data kmd WHERE kmd.index_id = mi.id) AS metrics_calculated_at,
          (SELECT COUNT(*) > 0 FROM ki_market_data kmd WHERE kmd.index_id = mi.id AND kmd.metrics_calculated_at IS NOT NULL) AS has_metrics,
          -- Latest close
          (SELECT close FROM ki_market_data kmd WHERE kmd.index_id = mi.id ORDER BY trade_date DESC LIMIT 1) AS latest_close,
          -- Latest returns for heatmap
          (SELECT return_1y FROM ki_market_data kmd WHERE kmd.index_id = mi.id AND return_1y IS NOT NULL ORDER BY trade_date DESC LIMIT 1) AS return_1y
        FROM ki_market_indices mi
        ORDER BY mi.priority ASC, mi.index_name ASC
      `);

      res.json({ indices: result.rows });
    } catch (err) {
      console.error('[Market] GET /detailed-status', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch detailed status' } });
    }
  });

  /* ── GET /jobs/:jobId ─────────────────────────────── */

  router.get('/jobs/:jobId', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const jobId = parseInt(req.params.jobId);

      // Check in-memory first (running jobs)
      const mem = activeJobs.get(jobId);
      if (mem) { res.json(mem); return; }

      // Fall back to DB
      const result = await pool.query(
        `SELECT id, index_id, job_type, status, records_inserted, records_updated, error_details, execution_time_ms, created_at, completed_at
         FROM ki_market_jobs WHERE id = $1`,
        [jobId],
      );

      if (result.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Job not found' } }); return; }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('[Market] GET /jobs/:jobId', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch job' } });
    }
  });

  return router;
}
