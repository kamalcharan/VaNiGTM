/**
 * KI-Prime — ETL Routes
 *
 * Two-phase import matching kewalinvest production architecture:
 *   Phase 1 (Node.js): Upload → Parse → Map → Stage into ki_import_staging
 *   Phase 2 (PostgreSQL RPC): process_scheme_import_with_timing() handles
 *           all validation, upsert, error capture inside the database.
 *
 * POST   /api/v1/etl/upload              — Upload file (multipart/form-data)
 * GET    /api/v1/etl/headers/:fileId      — Detect headers + sample rows
 * GET    /api/v1/etl/sessions             — List all import sessions
 * POST   /api/v1/etl/sessions             — Create session, map fields, stage all rows
 * POST   /api/v1/etl/sessions/:id/process — Invoke DB RPC to process staged rows
 * GET    /api/v1/etl/sessions/:id/status  — Poll progress + errors
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { parseExcelHeaders, parseExcelRows } from './excel-parser';
import { mapCustomerRow, CUSTOMER_FIELD_MAP } from './customer-processor';
import { verifyAccessToken, type JwtPayload } from '../auth/token.service';

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/* ── Multer config ─────────────────────────────────── */

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
    cb(null, UPLOAD_DIR);
  },
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const safe = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    cb(null, `${ts}_${safe}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (['.xlsx', '.xls', '.csv'].includes(ext)) cb(null, true);
    else cb(new Error('Only .xlsx, .xls, .csv files are allowed'));
  },
});

/* ── Auth helper (JWT) ─────────────────────────────── */

interface AuthInfo {
  user_id: string;
  tenant_id: string;
  is_live: boolean;
  is_admin: boolean;
}

function extractAuth(req: { headers: Record<string, any> }): AuthInfo | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const jwt = verifyAccessToken(header.slice(7));
    return {
      user_id: jwt.user_id,
      tenant_id: jwt.tenant_id,
      is_live: jwt.is_live !== false,
      // vn_tenants.is_admin (migration 012), carried in the token. NEVER read
      // an admin claim from the request body.
      is_admin: jwt.is_admin === true,
    };
  } catch {
    return null;
  }
}

/**
 * Load a session the caller actually owns.
 *
 * Session ids are SERIAL, so they are trivially enumerable — several routes
 * here fetched `WHERE id = $1` with no tenant filter, which let any
 * authenticated tenant read or act on another tenant's import by guessing a
 * number. Every :id route goes through this instead (CLAUDE.md rules 1 & 10).
 */
async function loadOwnedSession(
  pool: Pool,
  sessionId: number,
  tenantId: string,
): Promise<any | null> {
  const r = await pool.query(
    'SELECT * FROM ki_import_sessions WHERE id = $1 AND tenant_id = $2',
    [sessionId, tenantId],
  );
  return r.rows[0] ?? null;
}

/* ── Router ────────────────────────────────────────── */

export function createEtlRouter(pool: Pool): Router {
  const router = Router();

  /* ── Helper: reconcile session counters from staging ── */
  // The RPCs update counters for only the rows they process in a given run.
  // After any reprocess operation we must recount from ki_import_staging so
  // previous runs' results are not overwritten.
  async function reconcileSessionCounters(sessionId: number): Promise<void> {
    await pool.query(
      `UPDATE ki_import_sessions
       SET
         successful_records = (SELECT COUNT(*) FROM ki_import_staging WHERE session_id = $1 AND processing_status = 'success'),
         failed_records     = (SELECT COUNT(*) FROM ki_import_staging WHERE session_id = $1 AND processing_status = 'failed'),
         duplicate_records  = (SELECT COUNT(*) FROM ki_import_staging WHERE session_id = $1 AND processing_status = 'duplicate'),
         orphan_records     = (SELECT COUNT(*) FROM ki_import_staging WHERE session_id = $1 AND processing_status = 'orphan'),
         processed_records  = (SELECT COUNT(*) FROM ki_import_staging WHERE session_id = $1 AND processing_status != 'pending'),
         status = CASE
           WHEN (SELECT COUNT(*) FROM ki_import_staging WHERE session_id = $1 AND processing_status IN ('failed','orphan')) > 0
           THEN 'completed_with_errors'
           ELSE 'completed'
         END
       WHERE id = $1`,
      [sessionId],
    );
  }

  /* ── POST /upload ───────────────────────────────── */

  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const file = req.file;
      if (!file) { res.status(400).json({ error: { code: 'NO_FILE', message: 'No file uploaded' } }); return; }

      const importType = req.body.import_type || 'customer';
      if (importType !== 'customer') {
        res.status(400).json({ error: { code: 'UNSUPPORTED_TYPE', message: `Import type "${importType}" was removed with the MFD cleanup. Only contact/prospect imports are supported.` } });
        return;
      }
      const fileHash = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');

      // Check duplicate by filename — scoped to this tenant
      const dup = await pool.query(
        `SELECT id FROM ki_file_uploads WHERE original_filename = $1 AND processing_status = 'completed' AND tenant_id = $2`,
        [file.originalname, auth.tenant_id],
      );
      if (dup.rows.length > 0) {
        res.status(409).json({
          error: { code: 'DUPLICATE_FILE', message: `A file named "${file.originalname}" has already been imported.` },
        });
        return;
      }

      // Always associate uploads with the tenant who triggered the import
      const tenantId = auth.tenant_id;
      const result = await pool.query(
        `INSERT INTO ki_file_uploads (tenant_id, file_type, original_filename, stored_filename, file_path, file_size, mime_type, file_hash, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [tenantId, importType, file.originalname, file.filename, file.path, file.size, file.mimetype, fileHash, auth.user_id],
      );

      res.status(201).json({
        file_id: (result.rows[0] as any).id,
        filename: file.originalname,
        size: file.size,
        import_type: importType,
      });
    } catch (err: any) {
      console.error('[ETL:upload]', err);
      res.status(500).json({ error: { code: 'UPLOAD_FAILED', message: err.message || 'Upload failed' } });
    }
  });

  /* ── GET /headers/:fileId ───────────────────────── */

  router.get('/headers/:fileId', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const fileResult = await pool.query(
        'SELECT * FROM ki_file_uploads WHERE id = $1 AND tenant_id = $2',
        [req.params.fileId, auth.tenant_id],
      );
      if (fileResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } }); return; }

      const file = fileResult.rows[0] as any;
      const { headers, sampleRows, totalRows } = parseExcelHeaders(file.file_path);

      // Contact/prospect import is the only supported type post-MFD-cleanup
      const suggestedMapping = CUSTOMER_FIELD_MAP;

      res.json({
        file_id: file.id,
        filename: file.original_filename,
        headers,
        sample_rows: sampleRows,
        total_rows: totalRows,
        suggested_mapping: suggestedMapping,
      });
    } catch (err: any) {
      console.error('[ETL:headers]', err);
      res.status(500).json({ error: { code: 'PARSE_FAILED', message: err.message || 'Failed to parse file' } });
    }
  });

  /* ── GET /sessions ──────────────────────────────── */

  router.get('/sessions', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const importType = req.query.type as string | undefined;

      // Only this tenant's own sessions. Global scheme master (tenant_id IS NULL) is
      // admin-only and never shown to tenants — it is not linked to any tenant.
      const params: any[] = [auth.tenant_id];
      const typeClause = (importType && importType !== 'all')
        ? `AND s.import_type = $${params.push(importType) && params.length}`
        : '';

      const result = await pool.query(
        `SELECT s.id, s.import_type, s.status, s.total_records, s.processed_records,
                s.successful_records, s.failed_records, s.duplicate_records,
                s.orphan_records,
                f.original_filename, s.created_at, s.staging_completed_at,
                s.processing_started_at, s.processing_completed_at,
                -- Strictly per-tenant: all rows here belong to this tenant, so numbers are clean
                ROW_NUMBER() OVER (ORDER BY s.created_at) AS tenant_seq,
                -- For transaction sessions: compute txn date range from staging data
                CASE WHEN s.import_type = 'transaction' THEN (
                  SELECT MIN(st.mapped_data->>'txn_date')
                  FROM ki_import_staging st
                  WHERE st.session_id = s.id
                    AND st.mapped_data->>'txn_date' IS NOT NULL
                ) ELSE NULL END AS txn_date_min,
                CASE WHEN s.import_type = 'transaction' THEN (
                  SELECT MAX(st.mapped_data->>'txn_date')
                  FROM ki_import_staging st
                  WHERE st.session_id = s.id
                    AND st.mapped_data->>'txn_date' IS NOT NULL
                ) ELSE NULL END AS txn_date_max
         FROM ki_import_sessions s
         LEFT JOIN ki_file_uploads f ON f.id = s.file_upload_id
         WHERE s.tenant_id = $1
         ${typeClause}
         ORDER BY s.created_at DESC
         LIMIT 50`,
        params,
      );

      res.json({ sessions: result.rows });
    } catch (err: any) {
      console.error('[ETL:sessions]', err);
      res.status(500).json({ error: { code: 'FETCH_FAILED', message: 'Failed to fetch sessions' } });
    }
  });

  /* ── POST /sessions — Phase 1: Stage ────────────── */

  router.post('/sessions', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { file_id, import_type, field_mappings, customer_lookup_method } = req.body;

      if (!file_id || !import_type) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'file_id and import_type required' } });
        return;
      }

      // Verify file exists
      const fileResult = await pool.query('SELECT * FROM ki_file_uploads WHERE id = $1', [file_id]);
      if (fileResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } }); return; }

      if (import_type !== 'customer') {
        res.status(400).json({ error: { code: 'UNSUPPORTED_TYPE', message: `Import type "${import_type}" was removed with the MFD cleanup. Only contact/prospect imports are supported.` } });
        return;
      }

      const file = fileResult.rows[0] as any;
      const tenantId = auth.tenant_id;
      const mappings = field_mappings || CUSTOMER_FIELD_MAP;
      const lookupMethod = customer_lookup_method || 'iwell_code';

      // Create session
      const sessionResult = await pool.query(
        `INSERT INTO ki_import_sessions (tenant_id, file_upload_id, import_type, field_mappings, customer_lookup_method, created_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [tenantId, file_id, import_type, JSON.stringify(mappings), lookupMethod, auth.user_id],
      );
      const sessionId = (sessionResult.rows[0] as any).id;

      // Parse Excel and stage all rows
      const rows = parseExcelRows(file.file_path);
      const BATCH_SIZE = 500;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const values: any[] = [];
        const placeholders: string[] = [];

        batch.forEach((raw, batchIdx) => {
          const rowNum = i + batchIdx + 1;

          // Apply field mapping + pre-processing
          const mapped = mapCustomerRow(raw, mappings);

          const offset = batchIdx * 4;
          placeholders.push(`($${offset + 1}, $${offset + 2}, $${offset + 3}::jsonb, $${offset + 4}::jsonb)`);
          values.push(sessionId, rowNum, JSON.stringify(raw), JSON.stringify(mapped));
        });

        await pool.query(
          `INSERT INTO ki_import_staging (session_id, row_number, raw_data, mapped_data)
           VALUES ${placeholders.join(', ')}`,
          values,
        );
      }

      // Update session: staged
      await pool.query(
        `UPDATE ki_import_sessions
         SET status = 'staged', total_records = $1, staging_completed_at = now()
         WHERE id = $2`,
        [rows.length, sessionId],
      );

      res.status(201).json({
        session_id: sessionId,
        status: 'staged',
        total_records: rows.length,
        import_type,
      });
    } catch (err: any) {
      console.error('[ETL:create-session]', err);
      res.status(500).json({ error: { code: 'SESSION_FAILED', message: err.message || 'Failed to create session' } });
    }
  });

  /* ── POST /sessions/:id/process — Phase 2: DB RPC ── */

  router.post('/sessions/:id/process', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const sessionId = Number(req.params.id);

      // Verify session exists and is staged
      const session = await loadOwnedSession(pool, sessionId, auth.tenant_id);
      if (!session) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }); return; }
      if (session.status !== 'staged' && session.status !== 'completed_with_errors') {
        res.status(400).json({ error: { code: 'INVALID_STATUS', message: `Session is "${session.status}", expected "staged"` } });
        return;
      }

      // Processing engine removed with the MFD cleanup. The prospect
      // processor (staged rows -> gt_contacts with dedup + scoring) lands
      // with prospect-skill (POA Phase 3.4).
      res.status(501).json({
        error: {
          code: 'PROSPECT_PROCESSING_PENDING',
          message: 'Import processing is being rebuilt for prospect imports (staged rows -> gt_contacts). Staging and mapping work; processing lands with prospect-skill.',
        },
      });
    } catch (err: any) {
      console.error('[ETL:process]', err);
      // Mark session failed
      await pool.query(
        `UPDATE ki_import_sessions SET status = 'failed', error_summary = $1 WHERE id = $2`,
        [err.message, req.params.id],
      ).catch(() => {});
      res.status(500).json({ error: { code: 'PROCESS_FAILED', message: err.message || 'Processing failed' } });
    }
  });

  /* ── GET /sessions/:id/status ───────────────────── */

  router.get('/sessions/:id/status', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const result = await pool.query(
        `SELECT s.id, s.import_type, s.status, s.total_records, s.processed_records,
                s.successful_records, s.failed_records, s.duplicate_records,
                s.error_summary, s.created_at, s.processing_started_at,
                s.processing_completed_at, f.original_filename
         FROM ki_import_sessions s
         LEFT JOIN ki_file_uploads f ON f.id = s.file_upload_id
         WHERE s.id = $1 AND s.tenant_id = $2`,
        [req.params.id, auth.tenant_id],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
        return;
      }

      const session = result.rows[0] as any;

      // Include failed row details if any
      let errors: any[] = [];
      if (session.failed_records > 0) {
        const errResult = await pool.query(
          `SELECT row_number, error_messages, mapped_data FROM ki_import_staging
           WHERE session_id = $1 AND processing_status = 'failed'
           ORDER BY row_number LIMIT 20`,
          [req.params.id],
        );
        errors = errResult.rows;
      }

      res.json({ session, errors });
    } catch (err: any) {
      console.error('[ETL:status]', err);
      res.status(500).json({ error: { code: 'FETCH_FAILED', message: 'Failed to get status' } });
    }
  });

  /* ── GET /sessions/:id/records — Paginated staging records ── */

  router.get('/sessions/:id/records', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const sessionId = Number(req.params.id);
      const status = req.query.status as string || 'all';
      const page = Math.max(1, Number(req.query.page) || 1);
      const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
      const offset = (page - 1) * limit;

      // Staging rows carry no tenant of their own — they are only reachable
      // through a session, so ownership is checked on the session first.
      const owned = await loadOwnedSession(pool, sessionId, auth.tenant_id);
      if (!owned) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }); return; }

      // Build WHERE clause
      const conditions = ['session_id = $1'];
      const params: any[] = [sessionId];

      if (status !== 'all') {
        params.push(status);
        conditions.push(`processing_status = $${params.length}`);
      }

      const where = conditions.join(' AND ');

      // Count total
      const countResult = await pool.query(
        `SELECT COUNT(*) as total FROM ki_import_staging WHERE ${where}`,
        params,
      );
      const total = Number((countResult.rows[0] as any).total);

      // Fetch page
      const result = await pool.query(
        `SELECT id, row_number, processing_status, mapped_data, raw_data,
                error_messages, warnings, created_record_id, processed_at
         FROM ki_import_staging
         WHERE ${where}
         ORDER BY row_number
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, limit, offset],
      );

      res.json({
        records: result.rows,
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      });
    } catch (err: any) {
      console.error('[ETL:records]', err);
      res.status(500).json({ error: { code: 'FETCH_FAILED', message: 'Failed to fetch records' } });
    }
  });

  /* ── POST /sessions/:id/reprocess — Reprocess failed rows ── */

  router.post('/sessions/:id/reprocess', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const sessionId = Number(req.params.id);

      // Verify session
      const session = await loadOwnedSession(pool, sessionId, auth.tenant_id);
      if (!session) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }); return; }

      // Reset failed (and orphan, for transaction imports) rows to pending
      const statusesToReset = session.import_type === 'transaction'
        ? ['failed', 'orphan']
        : ['failed'];
      const resetResult = await pool.query(
        `UPDATE ki_import_staging
         SET processing_status = 'pending', error_messages = NULL, processed_at = NULL
         WHERE session_id = $1 AND processing_status = ANY($2::text[])
         RETURNING id`,
        [sessionId, statusesToReset],
      );
      const resetCount = resetResult.rows.length;

      if (resetCount === 0) {
        res.json({ message: 'No failed records to reprocess', reprocessed: 0 });
        return;
      }

      // Update session status back to staged for reprocessing
      await pool.query(
        `UPDATE ki_import_sessions SET status = 'staged', failed_records = 0 WHERE id = $1`,
        [sessionId],
      );

      res.json({
        message: `Reset ${resetCount} failed record(s) to pending. Processing lands with prospect-skill.`,
        reprocessed: resetCount,
      });
    } catch (err: any) {
      console.error('[ETL:reprocess]', err);
      res.status(500).json({ error: { code: 'REPROCESS_FAILED', message: err.message || 'Reprocess failed' } });
    }
  });

  /* ── PATCH /sessions/:id/records/:recordId — Edit + reprocess one row ── */

  router.patch('/sessions/:id/records/:recordId', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const sessionId = Number(req.params.id);
      const recordId  = Number(req.params.recordId);
      const { mapped_data } = req.body;

      if (!mapped_data || typeof mapped_data !== 'object') {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'mapped_data object required' } });
        return;
      }

      // Verify session belongs to this tenant
      const sessResult = await pool.query(
        'SELECT * FROM ki_import_sessions WHERE id = $1 AND tenant_id = $2',
        [sessionId, auth.tenant_id],
      );
      if (sessResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }); return; }
      const session = sessResult.rows[0] as any;

      // Verify record belongs to session
      const recCheck = await pool.query(
        'SELECT id FROM ki_import_staging WHERE id = $1 AND session_id = $2',
        [recordId, sessionId],
      );
      if (recCheck.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Record not found' } }); return; }

      // Update mapped_data and reset this row to pending
      await pool.query(
        `UPDATE ki_import_staging
         SET mapped_data = $1, processing_status = 'pending', error_messages = NULL, processed_at = NULL
         WHERE id = $2`,
        [JSON.stringify(mapped_data), recordId],
      );

      // Allow RPC to run by marking session as staged (RPC only processes pending rows)
      await pool.query(
        `UPDATE ki_import_sessions SET status = 'staged' WHERE id = $1`,
        [sessionId],
      );

      // Row reset to pending — actual processing lands with prospect-skill.
      await reconcileSessionCounters(sessionId);

      // Return updated record
      const updated = await pool.query(
        'SELECT id, row_number, processing_status, mapped_data, raw_data, error_messages, warnings, created_record_id, processed_at FROM ki_import_staging WHERE id = $1',
        [recordId],
      );

      res.json({ record: updated.rows[0] });

    } catch (err: any) {
      console.error('[ETL:patchRecord]', err);
      res.status(500).json({ error: { code: 'PATCH_FAILED', message: err.message || 'Failed to patch record' } });
    }
  });

  /* ── POST /sessions/:id/sync-stats — Reconcile session counters from staging ── */

  router.post('/sessions/:id/sync-stats', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const sessionId = Number(req.params.id);

      const sessCheck = await pool.query(
        'SELECT id FROM ki_import_sessions WHERE id = $1 AND tenant_id = $2',
        [sessionId, auth.tenant_id],
      );
      if (sessCheck.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }); return; }

      await reconcileSessionCounters(sessionId);

      const updated = await pool.query(
        `SELECT id, status, total_records, processed_records,
                successful_records, failed_records, duplicate_records, orphan_records
         FROM ki_import_sessions WHERE id = $1`,
        [sessionId],
      );

      res.json({ session: updated.rows[0] });
    } catch (err: any) {
      console.error('[ETL:sync-stats]', err);
      res.status(500).json({ error: { code: 'SYNC_FAILED', message: err.message || 'Stats sync failed' } });
    }
  });


  /* ── DELETE /sessions/:id/staging — Delete staging data ── */

  router.delete('/sessions/:id/staging', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const sessionId = Number(req.params.id);

      // Verify session exists and is not processing
      const sessResult = await pool.query('SELECT status FROM ki_import_sessions WHERE id = $1', [sessionId]);
      if (sessResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }); return; }

      const status = (sessResult.rows[0] as any).status;
      if (status === 'processing' || status === 'pending') {
        res.status(400).json({ error: { code: 'INVALID_STATUS', message: 'Cannot delete staging for a session that is still processing' } });
        return;
      }

      // Delete staging rows (keep session record for history)
      const deleteResult = await pool.query(
        'DELETE FROM ki_import_staging WHERE session_id = $1',
        [sessionId],
      );

      res.json({
        message: 'Staging data deleted',
        deleted_records: deleteResult.rowCount,
      });
    } catch (err: any) {
      console.error('[ETL:delete-staging]', err);
      res.status(500).json({ error: { code: 'DELETE_FAILED', message: 'Failed to delete staging data' } });
    }
  });

  return router;
}

/* ── Generic field mapping (non-scheme types) ─────── */

