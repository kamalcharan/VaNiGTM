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
import { mapCompanyRow, COMPANY_FIELD_MAP } from './company-processor';
import { mapContactRow, personDedupKey } from './contact-processor';
import { detectEntities, estimateRows, personBlocks, type ExtractionPlan } from './entity-detector';
import { landSession } from './landing';
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

      const importType = req.body.import_type || 'company';
      if (!['customer', 'company'].includes(importType)) {
        res.status(400).json({ error: { code: 'UNSUPPORTED_TYPE', message: `Import type "${importType}" is not supported. Use "company" for prospects and the common pool.` } });
        return;
      }
      const fileHash = crypto.createHash('sha256').update(fs.readFileSync(file.path)).digest('hex');

      // THE SAME FILE CANNOT BE IMPORTED TWICE (user ruling, 2026-07-28).
      //
      // Matched on the sha256, not the filename. Identical bytes are not a
      // delivery — there is nothing new in them — and letting them through is
      // how a user who retried after a failed step ended up with two staging
      // sessions holding the same 2,913 rows and nothing saying so.
      //
      // A REFRESHED file has different content and a different checksum, so it
      // still loads; its row-level clashes are settled in the merge review.
      // gt_source_loads carries a matching unique index (migration 202), so
      // this cannot be raced past.
      const prior = await pool.query(
        `SELECT l.id, l.label, l.loaded_at
         FROM   gt_source_loads l
         WHERE  l.file_checksum = $1
           AND  l.status = 'active'
           AND  (l.tenant_id = $2 OR l.tenant_id IS NULL)
         ORDER BY l.loaded_at DESC
         LIMIT 1`,
        [fileHash, auth.tenant_id],
      );
      if (prior.rows.length > 0) {
        const p = prior.rows[0] as any;
        fs.unlink(file.path, () => {});   // do not keep a file we refused
        res.status(409).json({
          error: {
            code: 'ALREADY_IMPORTED',
            message: `This exact file has already been imported as "${p.label}". Nothing in it has changed, so there is nothing new to import. Upload an updated file, or retire the earlier load if you need to import it again.`,
          },
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

      // What is actually IN this file. The detector groups columns by entity —
      // one file commonly yields both companies and the people at them — and
      // returns anything it cannot place instead of guessing (rule 12). The
      // human confirms or edits the plan at the review step.
      const plan = detectEntities(headers, sampleRows);

      // Flattened header -> field view, for the mapping table the review step
      // already renders. Entity ownership lives in extraction_plan.
      const suggestedMapping: Record<string, string> = {};
      for (const entity of plan.entities) {
        for (const [header, field] of Object.entries(entity.columns)) {
          suggestedMapping[header] = field;
        }
      }

      res.json({
        file_id: file.id,
        filename: file.original_filename,
        headers,
        sample_rows: sampleRows,
        total_rows: totalRows,
        suggested_mapping: suggestedMapping,
        extraction_plan: plan,
        row_estimates: estimateRows(plan, totalRows),
      });
    } catch (err: any) {
      console.error('[ETL:headers]', err);
      res.status(500).json({ error: { code: 'PARSE_FAILED', message: err.message || 'Failed to parse file' } });
    }
  });

  /* ── POST /sessions/:id/conflicts/resolve ───────── */
  //
  // Where the tenant takes the call. The quality model already ranked every
  // field and said why; this applies what the HUMAN chose.
  //
  // `decisions` is [{ staging_id, fields: { <field>: 'keep' | 'take' } }].
  // `accept_recommended: true` applies the model's suggestion in bulk — but
  // NEVER to a campaign_locked row, which always needs an explicit choice.

  router.post('/sessions/:id/conflicts/resolve', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const sessionId = Number(req.params.id);
      const session = await loadOwnedSession(pool, sessionId, auth.tenant_id);
      if (!session) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Session not found' } }); return; }

      const { decisions, accept_recommended } = req.body ?? {};

      let targets: any[] = [];
      if (accept_recommended === true) {
        const r = await pool.query(
          `SELECT id, field_diff, conflict_target_table, conflict_target_id
           FROM   ki_import_staging
           WHERE  session_id = $1 AND processing_status = 'conflict'
             AND  campaign_locked = false`,
          [sessionId],
        );
        targets = (r.rows as any[]).map((row) => ({
          staging_id: row.id,
          fields: Object.fromEntries(
            Object.entries(row.field_diff ?? {}).map(([f, d]: [string, any]) => [f, d.recommended]),
          ),
        }));
      } else if (Array.isArray(decisions)) {
        targets = decisions;
      } else {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Provide decisions[] or accept_recommended:true' } });
        return;
      }

      let applied = 0;
      let skipped = 0;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        for (const d of targets) {
          const r = await client.query(
            `SELECT id, field_diff, conflict_target_table, conflict_target_id, campaign_locked
             FROM   ki_import_staging
             WHERE  id = $1 AND session_id = $2 AND processing_status = 'conflict'`,
            [d.staging_id, sessionId],
          );
          const row = r.rows[0] as any;
          if (!row) { skipped++; continue; }

          // Belt and braces: a campaign-locked row can only be resolved by an
          // explicit per-row decision, never swept up by a bulk accept.
          if (row.campaign_locked && accept_recommended === true) { skipped++; continue; }

          const takes = Object.entries(d.fields ?? {})
            .filter(([, choice]) => choice === 'take')
            .map(([field]) => field);

          if (takes.length > 0 && row.conflict_target_id && row.conflict_target_table) {
            const table = row.conflict_target_table === 'gt_contacts' ? 'gt_contacts' : 'gt_prospects';
            const sets = takes.map((f, i) => `${f} = $${i + 3}`).join(', ');
            const values = takes.map((f) => (row.field_diff?.[f]?.incoming ?? null));
            await client.query(
              `UPDATE ${table} SET ${sets}, updated_at = now()
               WHERE id = $1 AND tenant_id = $2`,
              [row.conflict_target_id, auth.tenant_id, ...values],
            );
          }

          await client.query(
            `UPDATE ki_import_staging
             SET processing_status = 'success', merge_decision = $2::jsonb,
                 decided_by = $3, decided_at = now()
             WHERE id = $1`,
            [row.id, JSON.stringify(d.fields ?? {}), auth.user_id],
          );
          applied++;
        }

        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }

      await reconcileSessionCounters(sessionId);

      const remaining = await pool.query(
        `SELECT COUNT(*)::int AS n FROM ki_import_staging
         WHERE session_id = $1 AND processing_status = 'conflict'`,
        [sessionId],
      );
      const left = (remaining.rows[0] as any).n;

      await pool.query(
        `UPDATE ki_import_sessions SET status = $2 WHERE id = $1`,
        [sessionId, left > 0 ? 'needs_review' : 'completed'],
      );

      res.json({ applied, skipped, conflicts_remaining: left });
    } catch (err: any) {
      console.error('[ETL:resolve-conflicts]', err);
      res.status(500).json({ error: { code: 'RESOLVE_FAILED', message: err.message || 'Failed to apply decisions' } });
    }
  });

  /* ── GET /tags ──────────────────────────────────── */
  // A tenant sees platform tags (which name the common-pool deliveries) plus
  // their own. Never another tenant's — that is the whole reason the
  // namespace is split.

  router.get('/tags', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const result = await pool.query(
        `SELECT id, tenant_id, label, slug, (tenant_id IS NULL) AS is_platform
         FROM   gt_tags
         WHERE  is_active = true
           AND  (tenant_id IS NULL OR tenant_id = $1)
         ORDER BY (tenant_id IS NULL) DESC, label ASC`,
        [auth.tenant_id],
      );

      res.json({ tags: result.rows });
    } catch (err: any) {
      console.error('[ETL:tags]', err);
      res.status(500).json({ error: { code: 'FETCH_FAILED', message: 'Failed to fetch tags' } });
    }
  });

  /* ── POST /tags ─────────────────────────────────── */

  router.post('/tags', async (req, res) => {
    try {
      const auth = extractAuth(req);
      if (!auth) { res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Valid token required' } }); return; }

      const label = typeof req.body?.label === 'string' ? req.body.label.trim() : '';
      if (!label) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'label is required' } });
        return;
      }

      // A platform tag is visible to every tenant, so creating one is an
      // admin act — read from the JWT, never from the body.
      const wantsPlatform = req.body?.is_platform === true;
      if (wantsPlatform && !auth.is_admin) {
        res.status(403).json({
          error: { code: 'ADMIN_REQUIRED', message: 'Only an admin tenant can create a tag visible to everyone.' },
        });
        return;
      }
      const owner = wantsPlatform ? null : auth.tenant_id;

      // Creating a tag that already exists returns the existing one — the
      // user asked for a tag with that name, and they now have it.
      const result = await pool.query(
        `INSERT INTO gt_tags (tenant_id, label, created_by)
         VALUES ($1, $2, $3)
         ON CONFLICT DO NOTHING
         RETURNING id, tenant_id, label, slug`,
        [owner, label, auth.user_id],
      );

      if (result.rows.length > 0) {
        res.status(201).json({ tag: result.rows[0] });
        return;
      }

      const existing = await pool.query(
        `SELECT id, tenant_id, label, slug FROM gt_tags
         WHERE slug = LOWER(BTRIM(REGEXP_REPLACE(REGEXP_REPLACE($1, '[^A-Za-z0-9]+', ' ', 'g'), '\\s+', ' ', 'g')))
           AND tenant_id IS NOT DISTINCT FROM $2`,
        [label, owner],
      );
      res.json({ tag: existing.rows[0] ?? null, existing: true });
    } catch (err: any) {
      console.error('[ETL:create-tag]', err);
      res.status(500).json({ error: { code: 'TAG_FAILED', message: err.message || 'Failed to create tag' } });
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

      const { file_id, import_type, field_mappings,
              destination, load_label, load_region, load_as_of,
              relationship, extraction_plan, tag_ids } = req.body;

      if (!file_id || !import_type) {
        res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'file_id and import_type required' } });
        return;
      }

      // What the TENANT says this data is to them. No file can state it, so
      // it is never inferred — and the detector's entity findings are a
      // separate axis entirely.
      if (relationship && !['contacts', 'customers', 'dataset'].includes(relationship)) {
        res.status(400).json({
          error: { code: 'VALIDATION_ERROR', message: `Unknown relationship "${relationship}". Expected contacts, customers or dataset.` },
        });
        return;
      }

      // Verify the file belongs to the caller
      const fileResult = await pool.query(
        'SELECT * FROM ki_file_uploads WHERE id = $1 AND tenant_id = $2',
        [file_id, auth.tenant_id],
      );
      if (fileResult.rows.length === 0) { res.status(404).json({ error: { code: 'NOT_FOUND', message: 'File not found' } }); return; }

      if (!['customer', 'company'].includes(import_type)) {
        res.status(400).json({ error: { code: 'UNSUPPORTED_TYPE', message: `Import type "${import_type}" is not supported.` } });
        return;
      }

      // Where COMPANY rows land. People always land in gt_contacts: Phase A
      // ships no shared contact pool, so no personal data reaches the common
      // pool and the DPDP question stays deferred by design.
      //
      // The common pool is shared across every tenant, so writing to it is
      // gated on vn_tenants.is_admin carried in the JWT — never on anything
      // the client sends. A 'dataset' relationship implies the pool.
      const wantsPool = destination === 'universe_companies' || relationship === 'dataset';
      const dest = wantsPool ? 'universe_companies' : 'prospects';
      if (dest === 'universe_companies' && !auth.is_admin) {
        res.status(403).json({
          error: {
            code: 'ADMIN_REQUIRED',
            message: 'Uploading to the common pool requires an admin tenant.',
          },
        });
        return;
      }

      const file = fileResult.rows[0] as any;
      const tenantId = auth.tenant_id;
      const mappings = field_mappings
        || (import_type === 'company' ? COMPANY_FIELD_MAP : CUSTOMER_FIELD_MAP);
      // customer_lookup_method is deliberately absent. It is MFD
      // transaction-matching machinery, no migration in this repo ever created
      // the column, and neither supported import type reads it — writing to it
      // is why this route had never once succeeded here (migration 201).

      // EVERY import is a load, contacts included — same rollback, freshness
      // and provenance handling a directory delivery gets. Freshness is a
      // scored quality component, so an undated upload is a real gap, not a
      // cosmetic one. Common-pool loads carry no tenant; a tenant's own
      // upload is scoped to them.
      const srcCode = dest === 'universe_companies' ? (req.body.source_code || 'upload') : 'upload';
      const src = await pool.query('SELECT id FROM gt_data_sources WHERE code = $1', [srcCode]);
      if (src.rows.length === 0) {
        res.status(400).json({ error: { code: 'UNKNOWN_SOURCE', message: `No data source registered with code "${srcCode}".` } });
        return;
      }
      const load = await pool.query(
        `INSERT INTO gt_source_loads (source_id, label, region, as_of, tenant_id, file_checksum, loaded_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
        [
          (src.rows[0] as any).id,
          load_label || file.original_filename,
          load_region || null,
          load_as_of || null,
          dest === 'universe_companies' ? null : tenantId,
          file.file_hash,
          auth.user_id,
        ],
      );
      const loadId: number = (load.rows[0] as any).id;

      // Tags describe the delivery, so they attach to the load and every row
      // inherits them through load_id. A tenant may only apply their own tags
      // or platform ones — the filter is the authorisation.
      if (Array.isArray(tag_ids) && tag_ids.length > 0) {
        await pool.query(
          `INSERT INTO gt_load_tags (load_id, tag_id, created_by)
           SELECT $1, t.id, $2
           FROM   gt_tags t
           WHERE  t.id = ANY($3::bigint[])
             AND  t.is_active = true
             AND  (t.tenant_id IS NULL OR t.tenant_id = $4)
           ON CONFLICT DO NOTHING`,
          [loadId, auth.user_id, tag_ids, tenantId],
        );
      }

      // The plan the human confirmed at the review step wins; fall back to
      // re-detecting from the file's own headers so a caller that skips the
      // review step still stages something coherent.
      let plan: ExtractionPlan | null = extraction_plan ?? null;
      if (!plan && import_type === 'company') {
        const { headers, sampleRows } = parseExcelHeaders(file.file_path);
        plan = detectEntities(headers, sampleRows);
      }
      const wantsCompany = plan ? plan.entities.some((e) => e.kind === 'company') : import_type === 'company';
      const personEntity = plan?.entities.find((e) => e.kind === 'person');
      const wantsPerson = Boolean(personEntity);
      // How many people one source row carries. 1 unless the file repeats a
      // person block inline.
      const personPerRow = personEntity?.per_row ?? 1;

      // Create session
      const sessionResult = await pool.query(
        `INSERT INTO ki_import_sessions
           (tenant_id, file_upload_id, import_type, field_mappings,
            created_by, destination, load_id, relationship, extraction_plan)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb) RETURNING id`,
        [
          tenantId, file_id, import_type, JSON.stringify(mappings),
          auth.user_id, dest, loadId, relationship ?? null,
          plan ? JSON.stringify(plan) : null,
        ],
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

          // One source row can produce a company AND the people at it, so
          // mapped_data carries both. Quality is scored HERE, before anything
          // lands, which is the whole point of staging.
          let mappedData: Record<string, unknown>;
          let completeness: number | null = null;
          let validity: number | null = null;
          let rejects: unknown[] = [];
          let dedupKey: string | null = null;

          if (import_type === 'company') {
            const company = wantsCompany ? mapCompanyRow(raw, mappings) : null;

            // A company-first file repeats the person block inline. Extracting
            // only the first would silently drop two of every three FTCCI
            // representatives — the row count is not the people count.
            const people = wantsPerson
              ? personBlocks(raw, personPerRow)
                  .map((block) => mapContactRow(block, mappings))
                  .filter((p) => p.mapped.name)
              : [];

            // A representative works at the company on their row. The person
            // map does not claim the company's own website column (`WEB` is a
            // company discriminator and must stay one), so the employer is
            // filled in from the company here — which tightens the person
            // blocking key from name+company-name to name+domain.
            if (company?.mapped) {
              for (const p of people) {
                if (!p.mapped.company_domain && company.mapped.domain_normalized) {
                  p.mapped.company_domain = company.mapped.domain_normalized;
                }
                if (!p.mapped.company_name && company.mapped.name) {
                  p.mapped.company_name = company.mapped.name;
                }
                p.dedup_key = personDedupKey(p.mapped);
              }
            }

            mappedData = {
              company: company?.mapped ?? null,
              people: people.map((p) => p.mapped),
            };

            // Row-level quality is the primary entity's — the company when
            // there is one, otherwise the first person.
            const primary = company ?? people[0] ?? null;
            completeness = primary?.quality.completeness ?? null;
            validity = primary?.quality.validity ?? null;
            rejects = [
              ...(company?.quality.reject_reasons ?? []),
              ...people.flatMap((p) => p.quality.reject_reasons),
            ];
            dedupKey = primary?.dedup_key ?? null;
          } else {
            // MFD customer import — untouched legacy path.
            mappedData = mapCustomerRow(raw, mappings);
          }

          const offset = batchIdx * 8;
          placeholders.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}::jsonb, $${offset + 4}::jsonb,` +
            ` $${offset + 5}, $${offset + 6}, $${offset + 7}::jsonb, $${offset + 8})`,
          );
          values.push(
            sessionId, rowNum, JSON.stringify(raw), JSON.stringify(mappedData),
            completeness, validity, JSON.stringify(rejects), dedupKey,
          );
        });

        await pool.query(
          `INSERT INTO ki_import_staging
             (session_id, row_number, raw_data, mapped_data,
              completeness, validity, reject_reasons, dedup_key)
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
      const runnable = ['staged', 'completed_with_errors', 'needs_review'];
      if (!runnable.includes(session.status)) {
        res.status(400).json({ error: { code: 'INVALID_STATUS', message: `Session is "${session.status}", expected one of ${runnable.join(', ')}` } });
        return;
      }

      await pool.query(
        `UPDATE ki_import_sessions SET status = 'processing', processing_started_at = now() WHERE id = $1`,
        [sessionId],
      );

      const result = await landSession(pool, session, auth);
      res.json(result);
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
                error_messages, warnings, created_record_id, processed_at,
                -- A held row is only reviewable if the reviewer can see the
                -- decision material and whether it is campaign-sensitive.
                field_diff, campaign_locked, conflict_kind, conflict_target_id
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

