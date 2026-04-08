/**
 * KI-Prime — Market Analysis Routes
 *
 * Metrics calculation + time-series data + dashboard statistics.
 * Calls calculate_market_metrics() PL/pgSQL function from migration 015.
 *
 * POST   /api/v1/market-analysis/calculate/:indexId        — Calculate metrics for one index
 * POST   /api/v1/market-analysis/bulk-calculate            — Calculate for multiple indices
 * GET    /api/v1/market-analysis/metrics/:indexId          — Latest metrics for one index
 * GET    /api/v1/market-analysis/index-returns/:indexId    — Time-series returns (for chart)
 * GET    /api/v1/market-analysis/dashboard-statistics      — Heatmap + KPI cards data
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import { verifyAccessToken, type JwtPayload } from '../auth/token.service';

function extractJwt(req: { headers: { authorization?: string } }): JwtPayload | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyAccessToken(auth.slice(7)); } catch { return null; }
}

export function createMarketAnalysisRouter(pool: Pool): Router {
  const router = Router();

  /* ── POST /calculate/:indexId ─────────────────────── */

  router.post('/calculate/:indexId', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const indexId = parseInt(req.params.indexId);

      // Verify index exists and has data
      const idxResult = await pool.query(
        'SELECT id, index_name, historical_data_available FROM ki_market_indices WHERE id = $1',
        [indexId],
      );
      if (idxResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Index not found' } }); return; }

      const idx = idxResult.rows[0] as any;
      if (!idx.historical_data_available) {
        res.status(400).json({ error: { code: 'NO_DATA', message: `No OHLCV data for ${idx.index_name}. Download data first.` } }); return;
      }

      // Freshness check: skip if calculated within last hour (unless force=true)
      const { force = false } = req.body;
      if (!force) {
        const freshResult = await pool.query(
          `SELECT MAX(metrics_calculated_at) AS last_calc FROM ki_market_data WHERE index_id = $1`,
          [indexId],
        );
        const lastCalc: Date | null = freshResult.rows[0].last_calc;
        if (lastCalc && (Date.now() - lastCalc.getTime()) < 3600_000) {
          res.json({
            index_id: indexId,
            index_name: idx.index_name,
            skipped: true,
            reason: 'Calculated within last hour. Pass force:true to recalculate.',
            last_calculated_at: lastCalc,
          });
          return;
        }
      }

      const result = await pool.query('SELECT * FROM calculate_market_metrics($1)', [indexId]);
      const { records_updated, execution_ms } = result.rows[0];

      res.json({
        index_id: indexId,
        index_name: idx.index_name,
        records_updated,
        execution_ms,
        calculated_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[MarketAnalysis] POST /calculate/:indexId', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Metrics calculation failed' } });
    }
  });

  /* ── POST /bulk-calculate ─────────────────────────── */

  router.post('/bulk-calculate', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { index_ids } = req.body as { index_ids?: number[] };

      // If no ids provided, calculate for all indices with data
      let ids: number[];
      if (index_ids && index_ids.length > 0) {
        ids = index_ids.slice(0, 50); // cap at 50 per call
      } else {
        const result = await pool.query(
          `SELECT id FROM ki_market_indices WHERE historical_data_available = true ORDER BY priority ASC`,
        );
        ids = result.rows.map((r: any) => r.id);
      }

      const results: Array<{ index_id: number; success: boolean; records_updated?: number; execution_ms?: number; error?: string }> = [];
      let total_records = 0;

      for (const id of ids) {
        try {
          const r = await pool.query('SELECT * FROM calculate_market_metrics($1)', [id]);
          const { records_updated, execution_ms } = r.rows[0];
          results.push({ index_id: id, success: true, records_updated, execution_ms });
          total_records += records_updated;
        } catch (err: any) {
          results.push({ index_id: id, success: false, error: err.message });
        }
      }

      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;

      res.json({
        summary: {
          total: ids.length,
          successful,
          failed,
          total_records_updated: total_records,
        },
        results,
      });
    } catch (err) {
      console.error('[MarketAnalysis] POST /bulk-calculate', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Bulk calculation failed' } });
    }
  });

  /* ── GET /metrics/:indexId ────────────────────────── */

  router.get('/metrics/:indexId', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const indexId = parseInt(req.params.indexId);

      const result = await pool.query(
        `SELECT kmd.trade_date, kmd.close AS last_price, kmd.open, kmd.high, kmd.low, kmd.volume,
                kmd.daily_return, kmd.return_1w, kmd.return_1m, kmd.return_3m, kmd.return_6m,
                kmd.return_1y, kmd.return_ytd, kmd.return_all,
                kmd.sd_7d, kmd.sd_14d, kmd.sd_21d, kmd.sd_42d, kmd.sd_3m, kmd.sd_6m,
                kmd.sharpe_ratio, kmd.max_drawdown, kmd.cagr, kmd.total_risk,
                kmd.metrics_calculated_at,
                mi.index_name, mi.index_code
         FROM ki_market_data kmd
         JOIN ki_market_indices mi ON mi.id = kmd.index_id
         WHERE kmd.index_id = $1 AND kmd.metrics_calculated_at IS NOT NULL
         ORDER BY kmd.trade_date DESC
         LIMIT 1`,
        [indexId],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'No calculated metrics found. Run calculate first.' } }); return;
      }
      res.json(result.rows[0]);
    } catch (err) {
      console.error('[MarketAnalysis] GET /metrics/:indexId', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch metrics' } });
    }
  });

  /* ── GET /index-returns/:indexId ──────────────────── */

  router.get('/index-returns/:indexId', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const indexId = parseInt(req.params.indexId);
      const { start_date, end_date, granularity = 'daily' } = req.query as Record<string, string>;

      const conditions = ['kmd.index_id = $1'];
      const params: any[] = [indexId];
      let p = 2;

      if (start_date) { conditions.push(`kmd.trade_date >= $${p++}`); params.push(start_date); }
      if (end_date)   { conditions.push(`kmd.trade_date <= $${p++}`); params.push(end_date); }

      const where = conditions.join(' AND ');

      let sql: string;
      if (granularity === 'monthly') {
        // Last trading day of each month
        sql = `
          SELECT DISTINCT ON (date_trunc('month', kmd.trade_date))
            kmd.trade_date AS date,
            kmd.open, kmd.high, kmd.low, kmd.close,
            kmd.adj_close, kmd.volume,
            kmd.return_1m, kmd.return_3m, kmd.return_6m, kmd.return_1y, kmd.return_ytd, kmd.return_all,
            kmd.daily_return, kmd.return_1w
          FROM ki_market_data kmd
          WHERE ${where}
          ORDER BY date_trunc('month', kmd.trade_date) DESC, kmd.trade_date DESC
        `;
      } else if (granularity === 'weekly') {
        sql = `
          SELECT DISTINCT ON (date_trunc('week', kmd.trade_date))
            kmd.trade_date AS date,
            kmd.open, kmd.high, kmd.low, kmd.close,
            kmd.adj_close, kmd.volume,
            kmd.return_1m, kmd.return_3m, kmd.return_6m, kmd.return_1y, kmd.return_ytd, kmd.return_all,
            kmd.daily_return, kmd.return_1w
          FROM ki_market_data kmd
          WHERE ${where}
          ORDER BY date_trunc('week', kmd.trade_date) DESC, kmd.trade_date DESC
        `;
      } else {
        sql = `
          SELECT
            kmd.trade_date AS date,
            kmd.open, kmd.high, kmd.low, kmd.close,
            kmd.adj_close, kmd.volume,
            kmd.return_1m, kmd.return_3m, kmd.return_6m, kmd.return_1y, kmd.return_ytd, kmd.return_all,
            kmd.daily_return, kmd.return_1w
          FROM ki_market_data kmd
          WHERE ${where}
          ORDER BY kmd.trade_date ASC
        `;
      }

      // Downsample: max 500 points for chart performance
      const rawResult = await pool.query(sql, params);
      const rows = rawResult.rows;
      const MAX_POINTS = 500;
      let data = rows;

      if (rows.length > MAX_POINTS) {
        const step = Math.floor(rows.length / MAX_POINTS);
        data = rows.filter((_: any, i: number) => i % step === 0 || i === rows.length - 1);
      }

      res.json({
        index_id: indexId,
        granularity,
        total_records: rows.length,
        data,
      });
    } catch (err) {
      console.error('[MarketAnalysis] GET /index-returns/:indexId', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch returns data' } });
    }
  });

  /* ── GET /dashboard-statistics ───────────────────── */

  router.get('/dashboard-statistics', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { time_period = '1y' } = req.query as { time_period?: string };

      // Map period to return column
      const periodColumn: Record<string, string> = {
        '1m': 'return_1m', '3m': 'return_3m', '6m': 'return_6m', '1y': 'return_1y',
      };
      const col = periodColumn[time_period] ?? 'return_1y';

      // Latest metrics per index
      const heatmapResult = await pool.query(`
        SELECT DISTINCT ON (kmd.index_id)
          kmd.index_id,
          mi.index_name,
          mi.index_code,
          mi.category,
          kmd.${col} AS return_value,
          kmd.sd_6m    AS volatility_value,
          kmd.trade_date
        FROM ki_market_data kmd
        JOIN ki_market_indices mi ON mi.id = kmd.index_id
        WHERE kmd.metrics_calculated_at IS NOT NULL
        ORDER BY kmd.index_id, kmd.trade_date DESC
      `);

      const heatmap = heatmapResult.rows as any[];

      // Derived KPIs
      const withReturns = heatmap.filter(h => h.return_value != null);
      const bestPerformer = withReturns.reduce((best: any, h: any) =>
        !best || Number(h.return_value) > Number(best.return_value) ? h : best, null);
      const worstPerformer = withReturns.reduce((worst: any, h: any) =>
        !worst || Number(h.return_value) < Number(worst.return_value) ? h : worst, null);
      const withVol = heatmap.filter(h => h.volatility_value != null);
      const mostVolatile = withVol.reduce((mv: any, h: any) =>
        !mv || Number(h.volatility_value) > Number(mv.volatility_value) ? h : mv, null);

      const indicesUp   = withReturns.filter(h => Number(h.return_value) > 0).length;
      const indicesDown = withReturns.filter(h => Number(h.return_value) < 0).length;

      res.json({
        time_period,
        best_performer:  bestPerformer  ? { index_id: bestPerformer.index_id,  index_name: bestPerformer.index_name,  index_code: bestPerformer.index_code,  return_value: Number(bestPerformer.return_value) }  : null,
        worst_performer: worstPerformer ? { index_id: worstPerformer.index_id, index_name: worstPerformer.index_name, index_code: worstPerformer.index_code, return_value: Number(worstPerformer.return_value) } : null,
        most_volatile:   mostVolatile   ? { index_id: mostVolatile.index_id,   index_name: mostVolatile.index_name,   index_code: mostVolatile.index_code,   volatility_value: Number(mostVolatile.volatility_value) } : null,
        market_breadth: withReturns.length > 0
          ? Math.round((indicesUp / withReturns.length) * 100)
          : 0,
        total_indices_analyzed: withReturns.length,
        indices_up:   indicesUp,
        indices_down: indicesDown,
        heatmap: heatmap.map(h => ({
          index_id:        h.index_id,
          index_name:      h.index_name,
          index_code:      h.index_code,
          category:        h.category,
          return_value:    h.return_value   != null ? Number(h.return_value)   : null,
          volatility_value: h.volatility_value != null ? Number(h.volatility_value) : null,
        })),
      });
    } catch (err) {
      console.error('[MarketAnalysis] GET /dashboard-statistics', err);
      res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Failed to fetch dashboard statistics' } });
    }
  });

  return router;
}
