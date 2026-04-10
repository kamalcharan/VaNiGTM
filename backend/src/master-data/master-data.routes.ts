/**
 * KI-Prime — Master Data Routes
 *
 * Admin-only CRUD endpoints for system master tables.
 * All endpoints require a valid JWT with isAdmin = true.
 *
 * GET    /api/v1/master-data/transaction-types        — List all txn types
 * PATCH  /api/v1/master-data/transaction-types/:id   — Update txn type
 *
 * GET    /api/v1/master-data/asset-types              — List all asset types
 * PATCH  /api/v1/master-data/asset-types/:id         — Update asset type
 *
 * GET    /api/v1/master-data/bookmark-reasons         — List tenant bookmark reasons
 * POST   /api/v1/master-data/bookmark-reasons         — Create bookmark reason
 * PATCH  /api/v1/master-data/bookmark-reasons/:id    — Update bookmark reason
 *
 * GET    /api/v1/master-data/job-types                — List job types + tenant scheduler configs
 * PATCH  /api/v1/master-data/job-configs/:id         — Update tenant scheduler config
 *
 * GET    /api/v1/master-data/ext-ref-types            — List all external reference types (any auth)
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import { verifyAccessToken, type JwtPayload } from '../auth/token.service';

/* ── Auth guard helper (any authenticated user) ────────────────────────── */

function requireAuth(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (o: unknown) => void } },
): JwtPayload | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
    return null;
  }
  try {
    return verifyAccessToken(auth.slice(7));
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
    return null;
  }
}

/* ── Auth + Admin guard helper ─────────────────────────────────────────── */

function requireAdmin(
  req: { headers: { authorization?: string } },
  res: { status: (n: number) => { json: (o: unknown) => void } },
): JwtPayload | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } });
    return null;
  }
  let jwt: JwtPayload;
  try {
    jwt = verifyAccessToken(auth.slice(7));
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
    return null;
  }
  if (!jwt.is_admin) {
    res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Admin access required' } });
    return null;
  }
  return jwt;
}

/* ── Router factory ──────────────────────────────────────────────────────── */

export function createMasterDataRouter(pool: Pool): Router {
  const router = Router();

  /* ══════════════════════════════════════════════════════════════════════
     TRANSACTION TYPES (global — no tenant filter)
  ══════════════════════════════════════════════════════════════════════ */

  router.get('/transaction-types', async (req, res) => {
    const jwt = requireAdmin(req, res as any);
    if (!jwt) return;

    try {
      const result = await pool.query<{
        id: number; txn_code: string; txn_name: string;
        txn_type: string; is_active: boolean; description: string | null;
        created_at: string; updated_at: string;
      }>(
        `SELECT id, txn_code, txn_name, txn_type, is_active, description, created_at, updated_at
         FROM ki_transaction_types
         ORDER BY txn_type DESC, txn_name`,
      );
      res.json({ transaction_types: result.rows });
    } catch (err) {
      console.error('[MasterData:transactionTypes]', err);
      res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to load transaction types' } });
    }
  });

  router.patch('/transaction-types/:id', async (req, res) => {
    const jwt = requireAdmin(req, res as any);
    if (!jwt) return;

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid id' } });
      return;
    }

    const { txn_name, description, is_active } = req.body as {
      txn_name?: string; description?: string; is_active?: boolean;
    };

    const updates: string[] = [];
    const params: unknown[] = [];

    if (txn_name !== undefined) {
      params.push(txn_name.trim());
      updates.push(`txn_name = $${params.length}`);
    }
    if (description !== undefined) {
      params.push(description || null);
      updates.push(`description = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(Boolean(is_active));
      updates.push(`is_active = $${params.length}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
      return;
    }

    updates.push(`updated_at = now()`);
    params.push(id);

    try {
      const result = await pool.query(
        `UPDATE ki_transaction_types SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params,
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Transaction type not found' } });
        return;
      }
      res.json({ transaction_type: result.rows[0] });
    } catch (err) {
      console.error('[MasterData:updateTransactionType]', err);
      res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to update transaction type' } });
    }
  });

  /* ══════════════════════════════════════════════════════════════════════
     ASSET TYPES (global — no tenant filter)
  ══════════════════════════════════════════════════════════════════════ */

  router.get('/asset-types', async (req, res) => {
    const jwt = requireAdmin(req, res as any);
    if (!jwt) return;

    try {
      const result = await pool.query(
        `SELECT id, asset_type_code, asset_type_name, category,
                default_assumption_rate, is_liquid_default, display_order,
                is_active, description, created_at, updated_at
         FROM ki_asset_types
         ORDER BY display_order, asset_type_name`,
      );
      res.json({ asset_types: result.rows });
    } catch (err) {
      console.error('[MasterData:assetTypes]', err);
      res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to load asset types' } });
    }
  });

  router.patch('/asset-types/:id', async (req, res) => {
    const jwt = requireAdmin(req, res as any);
    if (!jwt) return;

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid id' } });
      return;
    }

    const { asset_type_name, description, default_assumption_rate, is_liquid_default, is_active } = req.body as {
      asset_type_name?: string; description?: string;
      default_assumption_rate?: number; is_liquid_default?: boolean; is_active?: boolean;
    };

    const updates: string[] = [];
    const params: unknown[] = [];

    if (asset_type_name !== undefined) {
      params.push(asset_type_name.trim());
      updates.push(`asset_type_name = $${params.length}`);
    }
    if (description !== undefined) {
      params.push(description || null);
      updates.push(`description = $${params.length}`);
    }
    if (default_assumption_rate !== undefined) {
      const rate = Number(default_assumption_rate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Rate must be 0–100' } });
        return;
      }
      params.push(rate);
      updates.push(`default_assumption_rate = $${params.length}`);
    }
    if (is_liquid_default !== undefined) {
      params.push(Boolean(is_liquid_default));
      updates.push(`is_liquid_default = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(Boolean(is_active));
      updates.push(`is_active = $${params.length}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
      return;
    }

    updates.push(`updated_at = now()`);
    params.push(id);

    try {
      const result = await pool.query(
        `UPDATE ki_asset_types SET ${updates.join(', ')} WHERE id = $${params.length} RETURNING *`,
        params,
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Asset type not found' } });
        return;
      }
      res.json({ asset_type: result.rows[0] });
    } catch (err) {
      console.error('[MasterData:updateAssetType]', err);
      res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to update asset type' } });
    }
  });

  /* ══════════════════════════════════════════════════════════════════════
     BOOKMARK REASONS (tenant-scoped)
  ══════════════════════════════════════════════════════════════════════ */

  router.get('/bookmark-reasons', async (req, res) => {
    const jwt = requireAdmin(req, res as any);
    if (!jwt) return;

    const isLive = req.query.is_live !== 'false'; // default: live

    try {
      const result = await pool.query(
        `SELECT id, reason_code, reason_label, display_order, is_active, created_at, updated_at
         FROM ki_bookmark_reasons
         WHERE tenant_id = $1 AND is_live = $2
         ORDER BY display_order, reason_label`,
        [jwt.tenant_id, isLive],
      );
      res.json({ bookmark_reasons: result.rows });
    } catch (err) {
      console.error('[MasterData:bookmarkReasons]', err);
      res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to load bookmark reasons' } });
    }
  });

  router.post('/bookmark-reasons', async (req, res) => {
    const jwt = requireAdmin(req, res as any);
    if (!jwt) return;

    const { reason_code, reason_label, display_order, is_live } = req.body as {
      reason_code?: string; reason_label?: string; display_order?: number; is_live?: boolean;
    };

    if (!reason_code?.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'reason_code is required' } });
      return;
    }
    if (!reason_label?.trim()) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'reason_label is required' } });
      return;
    }

    const code = reason_code.trim().toUpperCase().replace(/\s+/g, '_').slice(0, 60);
    const live = is_live !== false; // default: live

    try {
      const result = await pool.query(
        `INSERT INTO ki_bookmark_reasons
           (tenant_id, is_live, reason_code, reason_label, display_order)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [jwt.tenant_id, live, code, reason_label.trim(), display_order ?? 50],
      );
      res.status(201).json({ bookmark_reason: result.rows[0] });
    } catch (err: any) {
      if (err.code === '23505') {
        res.status(409).json({ error: { code: 'CONFLICT', message: 'Reason code already exists' } });
        return;
      }
      console.error('[MasterData:createBookmarkReason]', err);
      res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to create bookmark reason' } });
    }
  });

  router.patch('/bookmark-reasons/:id', async (req, res) => {
    const jwt = requireAdmin(req, res as any);
    if (!jwt) return;

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid id' } });
      return;
    }

    const { reason_label, display_order, is_active } = req.body as {
      reason_label?: string; display_order?: number; is_active?: boolean;
    };

    const updates: string[] = [];
    const params: unknown[] = [jwt.tenant_id, id];

    if (reason_label !== undefined) {
      params.push(reason_label.trim());
      updates.push(`reason_label = $${params.length}`);
    }
    if (display_order !== undefined) {
      params.push(Number(display_order));
      updates.push(`display_order = $${params.length}`);
    }
    if (is_active !== undefined) {
      params.push(Boolean(is_active));
      updates.push(`is_active = $${params.length}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
      return;
    }

    updates.push(`updated_at = now()`);

    try {
      const result = await pool.query(
        `UPDATE ki_bookmark_reasons
         SET ${updates.join(', ')}
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        params,
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Bookmark reason not found' } });
        return;
      }
      res.json({ bookmark_reason: result.rows[0] });
    } catch (err) {
      console.error('[MasterData:updateBookmarkReason]', err);
      res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to update bookmark reason' } });
    }
  });

  /* ══════════════════════════════════════════════════════════════════════
     JOB TYPES + SCHEDULER CONFIGS (admin view)
  ══════════════════════════════════════════════════════════════════════ */

  router.get('/job-types', async (req, res) => {
    const jwt = requireAdmin(req, res as any);
    if (!jwt) return;

    const isLive = req.query.is_live !== 'false'; // default: live

    try {
      // Global job types joined with this tenant's scheduler config (if exists)
      const result = await pool.query(
        `SELECT jt.code, jt.name, jt.description, jt.default_cron_expression,
                jt.default_max_retries, jt.default_schedule_type,
                jt.failover_enabled, jt.failover_cron_expression,
                jt.is_global, jt.is_active,
                sc.id          AS config_id,
                sc.cron_expression AS tenant_cron,
                sc.schedule_type   AS tenant_schedule_type,
                sc.is_enabled      AS tenant_enabled,
                sc.max_retries     AS tenant_max_retries,
                sc.failover_enabled      AS tenant_failover_enabled,
                sc.failover_cron_expression AS tenant_failover_cron,
                sc.last_executed_at,
                sc.last_success_at,
                sc.execution_count,
                sc.failure_count
         FROM ki_job_types jt
         LEFT JOIN ki_job_scheduler_configs sc
           ON sc.job_type_code = jt.code
           AND sc.tenant_id = $1
           AND sc.is_live = $2
         ORDER BY jt.is_global DESC, jt.name`,
        [jwt.tenant_id, isLive],
      );
      res.json({ job_types: result.rows });
    } catch (err) {
      console.error('[MasterData:jobTypes]', err);
      res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to load job types' } });
    }
  });

  router.patch('/job-configs/:id', async (req, res) => {
    const jwt = requireAdmin(req, res as any);
    if (!jwt) return;

    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid id' } });
      return;
    }

    const {
      cron_expression, schedule_type, is_enabled,
      max_retries, failover_enabled, failover_cron_expression,
    } = req.body as {
      cron_expression?: string; schedule_type?: string; is_enabled?: boolean;
      max_retries?: number; failover_enabled?: boolean; failover_cron_expression?: string;
    };

    const updates: string[] = [];
    const params: unknown[] = [jwt.tenant_id, id];

    if (cron_expression !== undefined) {
      params.push(cron_expression.trim());
      updates.push(`cron_expression = $${params.length}`);
    }
    if (schedule_type !== undefined) {
      params.push(schedule_type);
      updates.push(`schedule_type = $${params.length}`);
    }
    if (is_enabled !== undefined) {
      params.push(Boolean(is_enabled));
      updates.push(`is_enabled = $${params.length}`);
    }
    if (max_retries !== undefined) {
      params.push(Number(max_retries));
      updates.push(`max_retries = $${params.length}`);
    }
    if (failover_enabled !== undefined) {
      params.push(Boolean(failover_enabled));
      updates.push(`failover_enabled = $${params.length}`);
    }
    if (failover_cron_expression !== undefined) {
      params.push(failover_cron_expression || null);
      updates.push(`failover_cron_expression = $${params.length}`);
    }

    if (updates.length === 0) {
      res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'No fields to update' } });
      return;
    }

    updates.push(`updated_at = now()`);

    try {
      const result = await pool.query(
        `UPDATE ki_job_scheduler_configs
         SET ${updates.join(', ')}
         WHERE tenant_id = $1 AND id = $2
         RETURNING *`,
        params,
      );
      if (result.rows.length === 0) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Scheduler config not found' } });
        return;
      }
      res.json({ job_config: result.rows[0] });
    } catch (err) {
      console.error('[MasterData:updateJobConfig]', err);
      res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to update job config' } });
    }
  });

  /* ══════════════════════════════════════════════════════════════════════
     EXT REF TYPES (global — any authenticated user, not admin-only)
     Used during onboarding + convert-to-client to show platform list.
  ══════════════════════════════════════════════════════════════════════ */

  router.get('/ext-ref-types', async (req, res) => {
    const jwt = requireAuth(req, res as any);
    if (!jwt) return;

    try {
      const result = await pool.query(
        `SELECT code, label, description, sort_order
         FROM ki_ext_ref_types
         WHERE is_active = true
         ORDER BY sort_order ASC`,
      );
      res.json({ ext_ref_types: result.rows });
    } catch (err) {
      console.error('[MasterData:extRefTypes]', err);
      res.status(500).json({ error: { code: 'DB_ERROR', message: 'Failed to load platform types' } });
    }
  });

  return router;
}
