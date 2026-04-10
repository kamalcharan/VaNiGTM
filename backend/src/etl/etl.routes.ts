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
import { mapSchemeRow, SCHEME_FIELD_MAP, BOOKMARK_FIELD_MAP } from './scheme-processor';
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
}

function extractAuth(req: { headers: Record<string, any> }): AuthInfo | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  try {
    const jwt = verifyAccessToken(header.slice(7));
    return { user_id: jwt.user_id, tenant_id: jwt.tenant_id, is_live: jwt.is_live !== false };
  } catch {
    return null;
  }
}

/* ── Router ────────────────────────────────────────── */

export function createEtlRouter(pool: Pool): Router {
  const router = Router();

  /* ── POST /upload ───────────────────────────────── */

  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const file = req.file;
      if (!file) { res.status(400).json({ error: { code: 'NO_FILE', message: 'No file uploaded' } }); return; }

      const importType = req.body.import_type || 'scheme';
      const fileHash = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');

      // Check duplicate by hash
      const dup = await pool.query(
        `SELECT id, original_filename FROM ki_file_uploads WHERE file_hash = $1 AND processing_status = 'completed'`,
        [fileHash],
      );
      if (dup.rows.length > 0) {
        const prev = dup.rows[0] as any;
        res.status(409).json({
          error: { code: 'DUPLICATE_FILE', message: `This file was already imported as "${prev.original_filename}"` },
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

      const fileResult = await pool.query('SELECT * FROM ki_file_uploads WHERE id = $1', [req.params.fileId]);
      if (fileResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } }); return; }

      const file = fileResult.rows[0] as any;
      const { headers, sampleRows, totalRows } = parseExcelHeaders(file.file_path);

      // Auto-suggest mapping based on import type
      const suggestedMapping = file.file_type === 'scheme'   ? SCHEME_FIELD_MAP
        : file.file_type === 'bookmark'  ? BOOKMARK_FIELD_MAP
        : file.file_type === 'customer'  ? CUSTOMER_FIELD_MAP
        : {};

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
                f.original_filename, s.created_at, s.staging_completed_at,
                s.processing_started_at, s.processing_completed_at,
                -- Strictly per-tenant: all rows here belong to this tenant, so numbers are clean
                ROW_NUMBER() OVER (ORDER BY s.created_at) AS tenant_seq
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

      const { file_id, import_type, field_mappings } = req.body;

      if (!file_id || !import_type) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'file_id and import_type required' } });
        return;
      }

      // Verify file exists
      const fileResult = await pool.query('SELECT * FROM ki_file_uploads WHERE id = $1', [file_id]);
      if (fileResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } }); return; }

      const file = fileResult.rows[0] as any;
      // Always set tenant_id — scheme imports are triggered by a tenant user,
      // so the session belongs to that tenant for dashboard visibility and audit.
      const tenantId = auth.tenant_id;
      const mappings = field_mappings
        || (import_type === 'scheme'   ? SCHEME_FIELD_MAP
          : import_type === 'customer' ? CUSTOMER_FIELD_MAP
          : {});

      // Create session
      const sessionResult = await pool.query(
        `INSERT INTO ki_import_sessions (tenant_id, file_upload_id, import_type, field_mappings, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tenantId, file_id, import_type, JSON.stringify(mappings), auth.user_id],
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
          const mapped = import_type === 'scheme'
            ? mapSchemeRow(raw, mappings)
            : import_type === 'customer'
              ? mapCustomerRow(raw, mappings)
              : applyGenericMapping(raw, mappings);

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
      const sessResult = await pool.query('SELECT * FROM ki_import_sessions WHERE id = $1', [sessionId]);
      if (sessResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }); return; }

      const session = sessResult.rows[0] as any;
      if (session.status !== 'staged' && session.status !== 'completed_with_errors') {
        res.status(400).json({ error: { code: 'INVALID_STATUS', message: `Session is "${session.status}", expected "staged"` } });
        return;
      }

      // Invoke the PostgreSQL RPC function — all processing happens in DB
      const targetDurationMs = Number(req.body.target_duration_ms) || 30000;
      let rpcResult: any;

      if (session.import_type === 'scheme') {
        rpcResult = await pool.query(
          'SELECT * FROM process_scheme_import_with_timing($1, $2)',
          [sessionId, targetDurationMs],
        );
      } else if (session.import_type === 'customer') {
        rpcResult = await pool.query(
          'SELECT * FROM process_customer_import_with_timing($1, $2)',
          [sessionId, targetDurationMs],
        );

        // Auto-resolve family linkages immediately after customer import completes.
        // resolve_customer_families is idempotent — safe to call unconditionally.
        try {
          await pool.query(
            'SELECT * FROM resolve_customer_families($1, $2)',
            [auth.tenant_id, auth.is_live],
          );
        } catch (familyErr: any) {
          // Non-fatal — families can be re-resolved via /resolve-families endpoint
          console.warn('[ETL:process] auto resolve_customer_families failed:', familyErr.message);
        }
      } else {
        // transaction import not yet implemented
        res.status(400).json({ error: { code: 'UNSUPPORTED', message: `Import type "${session.import_type}" processing not yet implemented` } });
        return;
      }

      const result = rpcResult.rows[0] as any;

      // Mark file as completed
      await pool.query(
        `UPDATE ki_file_uploads SET processing_status = 'completed' WHERE id = $1`,
        [session.file_upload_id],
      );

      res.json({
        session_id: sessionId,
        status: result.failed_count > 0 ? 'completed_with_errors' : 'completed',
        processed: result.processed_count,
        successful: result.success_count,
        failed: result.failed_count,
        duplicate: result.duplicate_count,
        duration_ms: result.actual_duration_ms,
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
         WHERE s.id = $1`,
        [req.params.id],
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
      const sessResult = await pool.query('SELECT * FROM ki_import_sessions WHERE id = $1', [sessionId]);
      if (sessResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }); return; }

      // Reset failed rows to pending
      const resetResult = await pool.query(
        `UPDATE ki_import_staging
         SET processing_status = 'pending', error_messages = NULL, processed_at = NULL
         WHERE session_id = $1 AND processing_status = 'failed'
         RETURNING id`,
        [sessionId],
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

      // Re-invoke processing based on import type
      const session = sessResult.rows[0] as any;

      if (session.import_type === 'scheme') {
        const rpcResult = await pool.query(
          'SELECT * FROM process_scheme_import_with_timing($1, $2)',
          [sessionId, 30000],
        );
        const result = rpcResult.rows[0] as any;
        res.json({
          message: `Reprocessed ${resetCount} records`,
          reprocessed: resetCount,
          successful: result.success_count,
          failed: result.failed_count,
          duplicate: result.duplicate_count,
        });

      } else if (session.import_type === 'customer') {
        const rpcResult = await pool.query(
          'SELECT * FROM process_customer_import_with_timing($1, $2)',
          [sessionId, 30000],
        );
        const result = rpcResult.rows[0] as any;
        res.json({
          message: `Reprocessed ${resetCount} records`,
          reprocessed: resetCount,
          successful: result.success_count,
          failed: result.failed_count,
          duplicate: result.duplicate_count,
        });

      } else if (session.import_type === 'bookmark') {
        // Re-process failed bookmark staging rows — same upsert + alias seed logic
        const tenantId = session.tenant_id;
        const userId = session.created_by;

        const pendingRows = await pool.query(
          `SELECT id, mapped_data FROM ki_import_staging
           WHERE session_id = $1 AND processing_status = 'pending' ORDER BY row_number`,
          [sessionId],
        );

        let added = 0, already_tracked = 0, failed = 0;

        for (const stagedRow of pendingRows.rows as any[]) {
          const mapped = stagedRow.mapped_data as Record<string, string>;
          const rowId = stagedRow.id;

          try {
            // Resolution chain: scheme_code → ISIN → alias name (matches nav.routes.ts)
            let schemeCode = mapped.scheme_code;

            if (!schemeCode && mapped.isin) {
              const isinResult = await pool.query(
                `SELECT scheme_code FROM ki_schemes WHERE isin_growth = $1 OR isin_dividend = $1 LIMIT 1`,
                [mapped.isin],
              );
              if (isinResult.rows.length > 0) schemeCode = (isinResult.rows[0] as any).scheme_code;
            }

            if (!schemeCode && mapped.scheme_name) {
              const aliasResult = await pool.query(
                `SELECT scheme_code FROM lookup_scheme_by_alias($1)`,
                [mapped.scheme_name],
              );
              if (aliasResult.rows.length > 0) schemeCode = (aliasResult.rows[0] as any).scheme_code;
            }

            if (!schemeCode) {
              failed++;
              await pool.query(
                `UPDATE ki_import_staging SET processing_status = 'failed',
                 error_messages = $1::jsonb, processed_at = now() WHERE id = $2`,
                [JSON.stringify([`Scheme not resolved — no match by scheme_code, ISIN (${mapped.isin || 'none'}), or alias (${mapped.scheme_name || 'none'})`]), rowId],
              );
              continue;
            }

            const schemeResult = await pool.query(
              'SELECT scheme_code, scheme_name, amc, active, closure_date FROM ki_schemes WHERE scheme_code = $1',
              [schemeCode],
            );
            if (schemeResult.rows.length === 0) {
              failed++;
              await pool.query(
                `UPDATE ki_import_staging SET processing_status = 'failed',
                 error_messages = $1::jsonb, processed_at = now() WHERE id = $2`,
                [JSON.stringify([`Scheme ${schemeCode} not found`]), rowId],
              );
              continue;
            }

            const scheme = schemeResult.rows[0] as any;
            const isEnded = scheme.closure_date && new Date(scheme.closure_date) < new Date();
            const csvAlias = mapped.scheme_name || scheme.scheme_name;

            const upsertResult = await pool.query(
              `INSERT INTO ki_scheme_bookmarks
                 (tenant_id, user_id, scheme_code, scheme_name, amc, alias_name, daily_download_enabled)
               VALUES ($1, $2, $3, $4, $5, $6, $7)
               ON CONFLICT (tenant_id, scheme_code) DO UPDATE SET
                 daily_download_enabled = EXCLUDED.daily_download_enabled, updated_at = now()
               RETURNING (xmax = 0) AS is_new`,
              [tenantId, userId, scheme.scheme_code, scheme.scheme_name, scheme.amc, csvAlias, scheme.active && !isEnded],
            );

            const isNew = (upsertResult.rows[0] as any).is_new;
            if (isNew) added++; else already_tracked++;

            await pool.query(
              `UPDATE ki_import_staging SET processing_status = $1, created_record_id = $2, processed_at = now() WHERE id = $3`,
              [isNew ? 'success' : 'duplicate', scheme.scheme_code, rowId],
            );

            // Seed two aliases + track status back to staged row
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
            failed++;
            await pool.query(
              `UPDATE ki_import_staging SET processing_status = 'failed',
               error_messages = $1::jsonb, processed_at = now() WHERE id = $2`,
              [JSON.stringify([err.message]), rowId],
            );
          }
        }

        // Update session counts
        await pool.query(
          `UPDATE ki_import_sessions SET
             failed_records = failed_records - $1 + $2,
             successful_records = successful_records + $3,
             duplicate_records = duplicate_records + $4,
             status = CASE WHEN (failed_records - $1 + $2) > 0 THEN 'completed_with_errors' ELSE 'completed' END
           WHERE id = $5`,
          [resetCount, failed, added, already_tracked, sessionId],
        );

        res.json({
          message: `Reprocessed ${resetCount} records`,
          reprocessed: resetCount,
          successful: added,
          failed,
          duplicate: already_tracked,
        });

      } else {
        res.status(400).json({ error: { code: 'UNSUPPORTED', message: `Reprocess not yet supported for ${session.import_type}` } });
      }
    } catch (err: any) {
      console.error('[ETL:reprocess]', err);
      res.status(500).json({ error: { code: 'REPROCESS_FAILED', message: err.message || 'Reprocess failed' } });
    }
  });

  /* ── POST /sessions/:id/resolve-families — Post-import family linking ── */

  router.post('/sessions/:id/resolve-families', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const sessionId = Number(req.params.id);

      // Verify session exists and belongs to this tenant
      const sessResult = await pool.query(
        'SELECT * FROM ki_import_sessions WHERE id = $1 AND tenant_id = $2',
        [sessionId, auth.tenant_id],
      );
      if (sessResult.rows.length === 0) {
        res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } });
        return;
      }

      const session = sessResult.rows[0] as any;
      if (session.import_type !== 'customer') {
        res.status(400).json({ error: { code: 'INVALID_TYPE', message: 'resolve-families is only valid for customer import sessions' } });
        return;
      }

      // Call the PostgreSQL function to resolve family linkages
      const result = await pool.query(
        'SELECT * FROM resolve_customer_families($1, $2)',
        [auth.tenant_id, auth.is_live],
      );

      const row = result.rows[0] as any;
      res.json({
        families_created: row.families_created,
        members_linked: row.members_linked,
        heads_not_found: row.heads_not_found,
      });
    } catch (err: any) {
      console.error('[ETL:resolve-families]', err);
      res.status(500).json({ error: { code: 'RESOLVE_FAILED', message: err.message || 'Family resolution failed' } });
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

function applyGenericMapping(raw: Record<string, any>, mappings: Record<string, string>): Record<string, any> {
  const mapped: Record<string, any> = {};
  for (const [excelCol, dbField] of Object.entries(mappings)) {
    if (raw[excelCol] !== undefined && raw[excelCol] !== null) {
      mapped[dbField] = raw[excelCol];
    }
  }
  return mapped;
}
