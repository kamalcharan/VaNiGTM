/**
 * KI-Prime — ETL Routes
 *
 * POST   /api/v1/etl/upload              — Upload file (multipart/form-data)
 * GET    /api/v1/etl/headers/:fileId      — Detect headers + sample rows
 * POST   /api/v1/etl/sessions             — Create import session with field mapping
 * POST   /api/v1/etl/sessions/:id/process — Stage + process into target table
 * GET    /api/v1/etl/sessions/:id/status  — Poll progress
 * GET    /api/v1/etl/sessions             — List all import sessions
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import multer from 'multer';
import path from 'path';
import crypto from 'crypto';
import { parseExcelHeaders, parseExcelRows } from './excel-parser';
import { processSchemeRow, SCHEME_FIELD_MAP } from './scheme-processor';
import { verifyAccessToken, type JwtPayload } from '../auth/token.service';

const UPLOAD_DIR = path.resolve(__dirname, '../../uploads');
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

/* ── Multer config ─────────────────────────────────── */

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
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

  /* ── POST /upload — Upload file ─────────────────── */

  router.post('/upload', upload.single('file'), async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const file = req.file;
      if (!file) { res.status(400).json({ error: { code: 'NO_FILE', message: 'No file uploaded' } }); return; }

      const importType = req.body.import_type || 'scheme';
      const fileHash = crypto.createHash('sha256').update(require('fs').readFileSync(file.path)).digest('hex');

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

      // Insert file record — tenant_id is NULL for scheme imports (global)
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

  /* ── GET /headers/:fileId — Detect headers ──────── */

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

  /* ── GET /sessions — List sessions ──────────────── */

  router.get('/sessions', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const importType = req.query.type || 'all';
      const where = importType === 'all'
        ? ''
        : `WHERE s.import_type = '${importType}'`;

      const result = await pool.query(
        `SELECT s.id, s.import_type, s.status, s.total_records, s.processed_records,
                s.successful_records, s.failed_records, s.duplicate_records,
                f.original_filename, s.created_at, s.processing_completed_at
         FROM ki_import_sessions s
         LEFT JOIN ki_file_uploads f ON f.id = s.file_upload_id
         ${where}
         ORDER BY s.created_at DESC
         LIMIT 50`,
      );

      res.json({ sessions: result.rows });
    } catch (err: any) {
      console.error('[ETL:sessions]', err);
      res.status(500).json({ error: { code: 'FETCH_FAILED', message: 'Failed to fetch sessions' } });
    }
  });

  /* ── POST /sessions — Create session + start processing ─ */

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

      // Stage: parse all rows, apply mapping, insert into ki_import_staging
      const rows = parseExcelRows(file.file_path);
      const BATCH_SIZE = 500;

      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE);
        const values: any[] = [];
        const placeholders: string[] = [];

        batch.forEach((raw, batchIdx) => {
          const rowNum = i + batchIdx + 1;
          // Apply field mapping
          const mapped: Record<string, any> = {};
          for (const [excelCol, dbField] of Object.entries(mappings)) {
            if (raw[excelCol] !== undefined && raw[excelCol] !== null) {
              mapped[dbField as string] = raw[excelCol];
            }
          }

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
         SET status = 'staged', total_records = $1, staging_completed_at = now(), updated_at = now()
         WHERE id = $2`,
        [rows.length, sessionId],
      );

      res.status(201).json({
        session_id: sessionId,
        status: 'staged',
        total_records: rows.length,
      });
    } catch (err: any) {
      console.error('[ETL:create-session]', err);
      res.status(500).json({ error: { code: 'SESSION_FAILED', message: err.message || 'Failed to create session' } });
    }
  });

  /* ── POST /sessions/:id/process — Process staged rows ── */

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
        res.status(400).json({ error: { code: 'INVALID_STATUS', message: `Session is ${session.status}, expected staged` } });
        return;
      }

      // Mark processing
      await pool.query(
        `UPDATE ki_import_sessions SET status = 'processing', processing_started_at = now(), updated_at = now() WHERE id = $1`,
        [sessionId],
      );

      // Process in batches
      const BATCH_SIZE = 100;
      let processed = 0, successful = 0, failed = 0, duplicated = 0;

      while (true) {
        const batch = await pool.query(
          `SELECT id, row_number, mapped_data FROM ki_import_staging
           WHERE session_id = $1 AND processing_status = 'pending'
           ORDER BY row_number LIMIT $2`,
          [sessionId, BATCH_SIZE],
        );

        if (batch.rows.length === 0) break;

        for (const row of batch.rows) {
          const r = row as any;
          try {
            const result = await processSchemeRow(pool, r.mapped_data);

            await pool.query(
              `UPDATE ki_import_staging
               SET processing_status = $1, created_record_id = $2, processed_at = now(), updated_at = now()
               WHERE id = $3`,
              [result.status, result.scheme_code, r.id],
            );

            processed++;
            if (result.status === 'success') successful++;
            else if (result.status === 'duplicate') { duplicated++; successful++; } // duplicate = upserted = still success
          } catch (err: any) {
            await pool.query(
              `UPDATE ki_import_staging
               SET processing_status = 'failed', error_messages = ARRAY[$1], processed_at = now(), updated_at = now()
               WHERE id = $2`,
              [err.message || 'Unknown error', r.id],
            );
            processed++;
            failed++;
          }
        }

        // Update session progress
        await pool.query(
          `UPDATE ki_import_sessions
           SET processed_records = $1, successful_records = $2, failed_records = $3, duplicate_records = $4,
               last_processed_row = $5, updated_at = now()
           WHERE id = $6`,
          [processed, successful, failed, duplicated, processed, sessionId],
        );
      }

      // Final status
      const finalStatus = failed > 0 ? 'completed_with_errors' : 'completed';
      await pool.query(
        `UPDATE ki_import_sessions
         SET status = $1, processing_completed_at = now(), updated_at = now()
         WHERE id = $2`,
        [finalStatus, sessionId],
      );

      // Mark file as completed
      await pool.query(
        `UPDATE ki_file_uploads SET processing_status = 'completed', updated_at = now()
         WHERE id = $1`,
        [session.file_upload_id],
      );

      res.json({
        session_id: sessionId,
        status: finalStatus,
        total: session.total_records,
        processed, successful, failed, duplicate: duplicated,
      });
    } catch (err: any) {
      console.error('[ETL:process]', err);
      // Mark session failed
      await pool.query(
        `UPDATE ki_import_sessions SET status = 'failed', error_summary = $1, updated_at = now() WHERE id = $2`,
        [err.message, req.params.id],
      ).catch(() => {});
      res.status(500).json({ error: { code: 'PROCESS_FAILED', message: err.message || 'Processing failed' } });
    }
  });

  /* ── GET /sessions/:id/status — Poll progress ───── */

  router.get('/sessions/:id/status', async (req, res) => {
    try {
      const jwt = extractJwt(req);
      if (!jwt) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const result = await pool.query(
        `SELECT s.id, s.import_type, s.status, s.total_records, s.processed_records,
                s.successful_records, s.failed_records, s.duplicate_records,
                s.error_summary, s.created_at, s.processing_completed_at,
                f.original_filename
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

      // If failed, include sample errors
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
