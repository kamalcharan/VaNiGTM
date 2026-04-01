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
import { mapSchemeRow, SCHEME_FIELD_MAP } from './scheme-processor';
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

/* ── JWT helper ────────────────────────────────────── */

function extractJwt(req: { headers: { authorization?: string } }): JwtPayload | null {
  const auth = req.headers.authorization;
  if (!auth?.startsWith('Bearer ')) return null;
  try { return verifyAccessToken(auth.slice(7)); } catch { return null; }
}

/* ── Router ────────────────────────────────────────── */

export function createEtlRouter(pool: Pool): Router {
  const router = Router();

  /* ── POST /upload ───────────────────────────────── */

  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

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

      // Insert file record — tenant_id NULL for global (scheme) imports
      const tenantId = importType === 'scheme' ? null : jwt.tenant_id;
      const result = await pool.query(
        `INSERT INTO ki_file_uploads (tenant_id, file_type, original_filename, stored_filename, file_path, file_size, mime_type, file_hash, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING id`,
        [tenantId, importType, file.originalname, file.filename, file.path, file.size, file.mimetype, fileHash, jwt.user_id],
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
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const fileResult = await pool.query('SELECT * FROM ki_file_uploads WHERE id = $1', [req.params.fileId]);
      if (fileResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } }); return; }

      const file = fileResult.rows[0] as any;
      const { headers, sampleRows, totalRows } = parseExcelHeaders(file.file_path);

      // Auto-suggest mapping based on import type
      const suggestedMapping = file.file_type === 'scheme' ? SCHEME_FIELD_MAP : {};

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
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const result = await pool.query(
        `SELECT s.id, s.import_type, s.status, s.total_records, s.processed_records,
                s.successful_records, s.failed_records, s.duplicate_records,
                f.original_filename, s.created_at, s.processing_completed_at
         FROM ki_import_sessions s
         LEFT JOIN ki_file_uploads f ON f.id = s.file_upload_id
         ORDER BY s.created_at DESC
         LIMIT 50`,
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
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const { file_id, import_type, field_mappings } = req.body;

      if (!file_id || !import_type) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'file_id and import_type required' } });
        return;
      }

      // Verify file exists
      const fileResult = await pool.query('SELECT * FROM ki_file_uploads WHERE id = $1', [file_id]);
      if (fileResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } }); return; }

      const file = fileResult.rows[0] as any;
      const tenantId = import_type === 'scheme' ? null : jwt.tenant_id;
      const mappings = field_mappings || (import_type === 'scheme' ? SCHEME_FIELD_MAP : {});

      // Create session
      const sessionResult = await pool.query(
        `INSERT INTO ki_import_sessions (tenant_id, file_upload_id, import_type, field_mappings, created_by)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [tenantId, file_id, import_type, JSON.stringify(mappings), jwt.user_id],
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

          // Apply field mapping + pre-processing (ISIN splitting, date formatting)
          const mapped = import_type === 'scheme'
            ? mapSchemeRow(raw, mappings)
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
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

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
      } else {
        // Future: process_customer_import_with_timing, process_transaction_import_with_timing
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
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

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
