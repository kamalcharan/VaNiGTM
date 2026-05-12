/**
 * Ingestion Agent
 *
 *   run()         processes a single gt_kb_sources row end-to-end:
 *                 parse → chunk → extract entities → upsert into knowledge
 *                 graph → emit KNOWLEDGE_UPDATED.
 *                 Triggered by FILE_UPLOADED / URL_SUBMITTED events
 *                 (registry wiring lands in Stage 7).
 *
 *   syncFolder()  pulls the tenant's connected Google Drive folder, diffs
 *                 against gt_kb_sources by gdrive_modified_at, queues
 *                 new/changed files via FILE_UPLOADED events.
 *
 * Drive files stay in memory throughout — no temp files on disk.
 */

import type { Pool } from 'pg';
import { createTenantDb } from '../../db';
import { appendStep, setStatus } from '../../agent-core/agent.runner';
import { emitEvent } from '../../agent-core/event.store';
import { upsertNode } from '../../agent-core/kg.store';

import type { Parser } from './parsers/parser.interface';
import { PdfParser }  from './parsers/pdf.parser';
import { DocxParser } from './parsers/docx.parser';
import { PptxParser } from './parsers/pptx.parser';
import { TextParser } from './parsers/text.parser';
import { chunkText } from './pipeline/chunker';
import { extractFromChunks } from './pipeline/extractor';

/* ── Parser registry (text.parser is the fallback, registered LAST) ─────── */

const PARSERS: Parser[] = [
  new PdfParser(),
  new DocxParser(),
  new PptxParser(),
  new TextParser(),
];

/* ── Source-type → mimeType lookup (best-effort) ────────────────────────── */

function mimeTypeFromSourceType(sourceType: string): string {
  switch (sourceType) {
    case 'pdf':  return 'application/pdf';
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
    case 'pptx': return 'application/vnd.openxmlformats-officedocument.presentationml.presentation';
    case 'url':  return 'text/html';
    default:     return 'text/plain';
  }
}

function selectParser(mimeType: string, extension: string): Parser {
  return PARSERS.find(p => p.canHandle(mimeType, extension)) ?? new TextParser();
}

/* ── Drive integration row ──────────────────────────────────────────────── */

interface GDriveIntegration {
  folder_id: string | null;
  access_token: string;
  refresh_token: string | null;
  expires_at: Date | null;
}

interface GDriveFile {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime: string;
  size?: string;
}

const SUPPORTED_MIME_TYPES = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]);

/* ── Source row shape (subset we read in the agent) ─────────────────────── */

interface KbSource {
  id: string;
  tenant_id: string;
  source_type: string;
  display_name: string;
  gdrive_file_id: string | null;
  url: string | null;
}

export class IngestionAgent {

  // ── METHOD 1: run() ────────────────────────────────────────────────────
  static async run(
    pool: Pool,
    tenantId: string,
    payload: Record<string, unknown>,
    runId: string,
  ): Promise<void> {
    const sourceId = payload.source_id as string | undefined;
    if (!sourceId) {
      throw new Error('SOURCE_ID_MISSING: payload.source_id is required');
    }

    const db = createTenantDb(pool, tenantId);
    let written = 0;

    try {
      // 1. LOAD SOURCE
      const sourceResult = await db.query<KbSource>(
        `SELECT id, tenant_id, source_type, display_name,
                gdrive_file_id, url
           FROM gt_kb_sources
          WHERE id = $source_id AND tenant_id = $tenant_id`,
        { source_id: sourceId, tenant_id: tenantId },
      );

      const source = sourceResult.rows[0];
      if (!source) {
        throw new Error(`SOURCE_NOT_FOUND: ${sourceId}`);
      }

      // 2. MARK PROCESSING (and link the run for source-level audit)
      await db.query(
        `UPDATE gt_kb_sources
            SET status        = 'processing',
                source_run_id = $source_run_id,
                updated_at    = now()
          WHERE id = $source_id`,
        { source_id: sourceId, source_run_id: runId },
      );

      // 3. STEP: parse
      await appendStep(pool, runId, {
        step_name: 'parse',
        action:    `Parsing ${source.source_type}: ${source.display_name}`,
        status:    'ok',
      });

      if (!source.gdrive_file_id) {
        throw new Error(
          `UNSUPPORTED_SOURCE: only Drive-backed sources are supported in this stage (no gdrive_file_id on source ${sourceId})`,
        );
      }

      const buffer = await IngestionAgent.downloadFromGDrive(
        pool,
        tenantId,
        source.gdrive_file_id,
      );

      const mimeType  = mimeTypeFromSourceType(source.source_type);
      const extension = extensionOf(source.display_name);
      const parser    = selectParser(mimeType, extension);

      const rawText = await parser.extract(buffer, source.display_name);

      await db.query(
        `UPDATE gt_kb_sources SET raw_text = $raw_text, updated_at = now() WHERE id = $source_id`,
        { source_id: sourceId, raw_text: rawText },
      );

      await appendStep(pool, runId, {
        step_name:      'parse_complete',
        action:         'Text extracted',
        output_summary: `${rawText.length} chars extracted`,
        status:         'ok',
      });

      // 4. STEP: chunk
      const chunks = chunkText(rawText);

      await db.query(
        `UPDATE gt_kb_sources SET chunk_count = $count, updated_at = now() WHERE id = $source_id`,
        { source_id: sourceId, count: chunks.length },
      );

      await appendStep(pool, runId, {
        step_name:      'chunk',
        action:         'Split into chunks',
        output_summary: `${chunks.length} chunks`,
        status:         'ok',
      });

      // 5. STEP: extract
      await appendStep(pool, runId, {
        step_name: 'extract',
        action:    `Extracting entities from ${chunks.length} chunks via VPS LLM`,
        status:    'ok',
      });

      const nodes = await extractFromChunks(pool, tenantId, runId, chunks);

      await appendStep(pool, runId, {
        step_name:      'extract_complete',
        action:         'LLM extraction finished',
        output_summary: `${nodes.length} unique nodes extracted`,
        status:         'ok',
      });

      // 6. WRITE TO GRAPH
      for (const node of nodes) {
        try {
          await upsertNode(pool, tenantId, node, runId);
          written++;
        } catch (err) {
          console.warn(
            `[Ingestion] Node upsert failed (${node.label}/${node.name}):`,
            err,
          );
        }
      }

      await db.query(
        `UPDATE gt_kb_sources
            SET status     = 'complete',
                node_count = $written,
                updated_at = now()
          WHERE id = $source_id`,
        { source_id: sourceId, written },
      );

      // 7. UPDATE RUN
      await setStatus(pool, runId, 'completed', {
        output: { source_id: sourceId, nodes_written: written },
      });

      await appendStep(pool, runId, {
        step_name:      'complete',
        action:         'Wrote nodes to knowledge graph',
        output_summary: `${written} nodes`,
        status:         'ok',
      });

      // 8. EMIT KNOWLEDGE_UPDATED — wakes the profile-completion checker.
      await emitEvent(
        pool,
        tenantId,
        'KNOWLEDGE_UPDATED',
        'agent',
        { run_id: runId, source_id: sourceId, nodes_written: written },
        runId,
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);

      // Record the source-level failure so the UI can show it.
      try {
        await db.query(
          `UPDATE gt_kb_sources
              SET status     = 'error',
                  error_msg  = $error_msg,
                  updated_at = now()
            WHERE id = $source_id`,
          { source_id: sourceId, error_msg: message },
        );
      } catch (updateErr) {
        console.error('[Ingestion] Failed to mark source as error:', updateErr);
      }

      await setStatus(pool, runId, 'failed', {
        error_trace: err instanceof Error ? err.stack ?? message : message,
      });

      // Ingestion-specific AGENT_FAILED — carries source_id so alert-skill
      // can show a source-level error to the tenant. The worker's catch will
      // also emit a worker-level AGENT_FAILED with failed_event_type; both
      // events are deliberately distinct rows.
      try {
        await emitEvent(
          pool,
          tenantId,
          'AGENT_FAILED',
          'agent',
          { run_id: runId, source_id: sourceId, agent: 'ingestion-skill', error: message },
          runId,
        );
      } catch (emitErr) {
        console.error('[Ingestion] Failed to emit AGENT_FAILED:', emitErr);
      }

      // Re-throw so the worker can complete its own logging + event resolution.
      throw err;
    }
  }

  // ── METHOD 2: syncFolder() ─────────────────────────────────────────────
  static async syncFolder(
    pool: Pool,
    tenantId: string,
  ): Promise<{ queued: number; skipped: number }> {
    const db = createTenantDb(pool, tenantId);

    const integration = await IngestionAgent.loadIntegration(pool, tenantId);
    if (!integration.folder_id) {
      throw new Error('GDRIVE_FOLDER_NOT_CONFIGURED: no folder_id set for this tenant');
    }

    const accessToken = await IngestionAgent.refreshTokenIfNeeded(pool, tenantId, integration);

    const files = await IngestionAgent.listFolder(integration.folder_id, accessToken);

    let queued  = 0;
    let skipped = 0;

    for (const file of files) {
      if (!SUPPORTED_MIME_TYPES.has(file.mimeType)) {
        skipped++;
        continue;
      }

      // Existing source row, if any.
      const existing = await db.query<{ id: string; gdrive_modified_at: Date | null }>(
        `SELECT id, gdrive_modified_at
           FROM gt_kb_sources
          WHERE tenant_id = $tenant_id AND gdrive_file_id = $gdrive_file_id`,
        { tenant_id: tenantId, gdrive_file_id: file.id },
      );

      const modifiedAt = new Date(file.modifiedTime);
      const prev       = existing.rows[0];

      if (prev && prev.gdrive_modified_at && prev.gdrive_modified_at >= modifiedAt) {
        skipped++;
        continue;
      }

      // Upsert: new row OR re-queue an existing one whose Drive copy has changed.
      const upsert = await db.query<{ id: string }>(
        `INSERT INTO gt_kb_sources (
            tenant_id, source_type, display_name,
            gdrive_file_id, gdrive_modified_at, url, status
         )
         VALUES (
            $tenant_id, $source_type, $display_name,
            $gdrive_file_id, $gdrive_modified_at, NULL, 'pending'
         )
         ON CONFLICT (tenant_id, gdrive_file_id) WHERE gdrive_file_id IS NOT NULL
         DO UPDATE SET
            display_name       = EXCLUDED.display_name,
            gdrive_modified_at = EXCLUDED.gdrive_modified_at,
            status             = 'pending',
            updated_at         = now()
         RETURNING id`,
        {
          tenant_id:          tenantId,
          source_type:        sourceTypeFromMime(file.mimeType),
          display_name:       file.name,
          gdrive_file_id:     file.id,
          gdrive_modified_at: modifiedAt,
        },
      );

      const newSourceId = upsert.rows[0]?.id;
      if (newSourceId) {
        await emitEvent(
          pool,
          tenantId,
          'FILE_UPLOADED',
          'agent',
          { source_id: newSourceId, gdrive_file_id: file.id },
        );
        queued++;
      }
    }

    return { queued, skipped };
  }

  // ── Private: load + refresh Google Drive credentials ───────────────────

  private static async loadIntegration(
    pool: Pool,
    tenantId: string,
  ): Promise<GDriveIntegration> {
    const db = createTenantDb(pool, tenantId);
    const result = await db.query<GDriveIntegration>(
      `SELECT folder_id, access_token, refresh_token, expires_at
         FROM gt_tenant_integrations
        WHERE tenant_id = $tenant_id AND provider = 'gdrive'`,
      { tenant_id: tenantId },
    );

    const integration = result.rows[0];
    if (!integration) {
      throw new Error('GDRIVE_NOT_CONNECTED');
    }
    return integration;
  }

  /**
   * Returns a non-expired access token. Refreshes via the Google OAuth
   * endpoint when expires_at is null or within 60s of expiry, persisting
   * the new token back into gt_tenant_integrations.
   */
  private static async refreshTokenIfNeeded(
    pool: Pool,
    tenantId: string,
    integration: GDriveIntegration,
  ): Promise<string> {
    const buffer = 60_000; // refresh 60s before expiry
    const nowPlusBuffer = Date.now() + buffer;
    const expiresAt     = integration.expires_at ? integration.expires_at.getTime() : 0;

    if (expiresAt > nowPlusBuffer) {
      return integration.access_token;
    }

    if (!integration.refresh_token) {
      throw new Error('GDRIVE_REFRESH_TOKEN_MISSING: cannot refresh expired access token');
    }

    const clientId     = process.env.GDRIVE_CLIENT_ID;
    const clientSecret = process.env.GDRIVE_CLIENT_SECRET;
    if (!clientId || !clientSecret) {
      throw new Error('GDRIVE_OAUTH_NOT_CONFIGURED: GDRIVE_CLIENT_ID and GDRIVE_CLIENT_SECRET must be set');
    }

    const body = new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: integration.refresh_token,
      client_id:     clientId,
      client_secret: clientSecret,
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal:  AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `GDRIVE_TOKEN_REFRESH_FAILED: ${response.status} ${response.statusText} — ${detail.slice(0, 300)}`,
      );
    }

    const data = await response.json() as {
      access_token: string;
      expires_in?: number;
      token_type?: string;
    };

    const newAccessToken = data.access_token;
    const newExpiresAt   = new Date(Date.now() + (data.expires_in ?? 3600) * 1000);

    const db = createTenantDb(pool, tenantId);
    await db.query(
      `UPDATE gt_tenant_integrations
          SET access_token = $access_token,
              expires_at   = $expires_at,
              updated_at   = now()
        WHERE tenant_id = $tenant_id AND provider = 'gdrive'`,
      {
        tenant_id:    tenantId,
        access_token: newAccessToken,
        expires_at:   newExpiresAt,
      },
    );

    return newAccessToken;
  }

  // ── Private: Google Drive REST calls ───────────────────────────────────

  private static async downloadFromGDrive(
    pool: Pool,
    tenantId: string,
    fileId: string,
  ): Promise<Buffer> {
    const integration = await IngestionAgent.loadIntegration(pool, tenantId);
    const accessToken = await IngestionAgent.refreshTokenIfNeeded(pool, tenantId, integration);

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal:  AbortSignal.timeout(60_000),
      },
    );

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `GDRIVE_DOWNLOAD_FAILED: ${response.status} ${response.statusText} — ${detail.slice(0, 300)}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  private static async listFolder(
    folderId: string,
    accessToken: string,
  ): Promise<GDriveFile[]> {
    // Single-page listing (pageSize: 100). Adequate for MVP — paginate if
    // tenants ever connect a folder with > 100 supported files.
    const url = new URL('https://www.googleapis.com/drive/v3/files');
    url.searchParams.set('q', `'${folderId}' in parents and trashed = false`);
    url.searchParams.set('fields', 'files(id,name,mimeType,modifiedTime,size)');
    url.searchParams.set('pageSize', '100');

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal:  AbortSignal.timeout(30_000),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(
        `GDRIVE_LIST_FAILED: ${response.status} ${response.statusText} — ${detail.slice(0, 300)}`,
      );
    }

    const data = await response.json() as { files?: GDriveFile[] };
    return data.files ?? [];
  }
}

/* ── Tiny helpers ───────────────────────────────────────────────────────── */

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

function sourceTypeFromMime(mimeType: string): string {
  if (mimeType === 'application/pdf')                                                                  return 'pdf';
  if (mimeType.includes('wordprocessingml'))                                                           return 'docx';
  if (mimeType.includes('presentationml'))                                                             return 'pptx';
  if (mimeType === 'text/plain')                                                                       return 'txt';
  if (mimeType === 'text/markdown')                                                                    return 'md';
  return 'txt';
}
