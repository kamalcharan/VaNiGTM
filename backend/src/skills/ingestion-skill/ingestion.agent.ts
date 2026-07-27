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
import { draftProfileFromText } from '../profile-skill/profile.drafter';

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
  raw_text: string | null;
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
                gdrive_file_id, url, raw_text
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

      let rawText: string;

      if (source.source_type === 'url' && source.url) {
        // URL source — fetch the page server-side and strip to text.
        rawText = await IngestionAgent.fetchUrlText(source.url);
      } else if (source.raw_text && !source.gdrive_file_id) {
        // Pre-supplied text (pasted context via POST /ingest/text) — the
        // text IS the source; nothing to fetch or parse.
        rawText = source.raw_text;
      } else if (source.gdrive_file_id) {
        const buffer = await IngestionAgent.downloadFromGDrive(
          pool,
          tenantId,
          source.gdrive_file_id,
        );

        const mimeType  = mimeTypeFromSourceType(source.source_type);
        const extension = extensionOf(source.display_name);
        const parser    = selectParser(mimeType, extension);

        rawText = await parser.extract(buffer, source.display_name);
      } else {
        throw new Error(
          `UNSUPPORTED_SOURCE: source ${sourceId} has neither a url (source_type='url') nor a gdrive_file_id`,
        );
      }

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

      // 3b. URL + pasted-text sources: draft the GTM profile straight from
      // the text, BEFORE the (slower) per-chunk KG extraction — the wizard
      // polls the profile and gets a substantive company card fast.
      // Fill-only-empty inside the drafter; a draft failure never fails
      // the ingestion run.
      if (source.source_type === 'url' || source.source_type === 'txt') {
        try {
          const draft = await draftProfileFromText(pool, tenantId, rawText, runId);
          await appendStep(pool, runId, {
            step_name:      'draft_profile',
            action:         'Drafted GTM profile from website text',
            output_summary: draft.fieldsFilled.length > 0
              ? `filled: ${draft.fieldsFilled.join(', ')}`
              : 'no empty fields to fill',
            status:         'ok',
          });
        } catch (draftErr) {
          await appendStep(pool, runId, {
            step_name:      'draft_profile',
            action:         'Profile draft failed — continuing with KG extraction',
            output_summary: draftErr instanceof Error ? draftErr.message.slice(0, 300) : String(draftErr),
            status:         'error',
          });
        }
      }

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

  // ── Private: URL fetch → plain text ────────────────────────────────────
  // v1 scope: the submitted page only (typically the homepage). Combines
  // three extraction layers so JS-rendered SPAs still yield usable copy:
  //   1. visible body text (tags stripped)
  //   2. <title> + meta description/og/twitter tags
  //   3. prose mined from JSON-LD and framework data blobs
  //      (__NEXT_DATA__/__NUXT__) — client-rendered sites ship their copy
  //      there even when the body is empty.
  // Caps the result so a pathological page can't flood the chunker.

  /** Layer 2: title + meta tags that describe the site. */
  private static extractMetaText(html: string): string {
    const parts: string[] = [];

    const title = html.match(/<title[^>]*>([\s\S]{1,300}?)<\/title>/i);
    if (title && title[1].trim()) parts.push(title[1].trim());

    const WANTED = new Set([
      'description', 'og:description', 'og:title', 'og:site_name',
      'twitter:description', 'twitter:title', 'keywords',
    ]);
    const tagRe = /<meta\s[^>]*>/gi;
    let tag: RegExpExecArray | null;
    while ((tag = tagRe.exec(html))) {
      const name = tag[0].match(/(?:name|property)\s*=\s*["']([^"']+)["']/i)?.[1]?.toLowerCase();
      const content = tag[0].match(/content\s*=\s*["']([^"']*)["']/i)?.[1]?.trim();
      if (name && content && WANTED.has(name)) parts.push(content);
    }
    return [...new Set(parts)].join('\n');
  }

  /** Layer 3: prose strings mined from JSON-LD + framework data scripts. */
  private static mineJsonProse(html: string): string {
    const scriptRe = /<script[^>]*(?:id=["']__NEXT_DATA__["']|id=["']__NUXT_DATA__["']|type=["']application\/(?:ld\+)?json["'])[^>]*>([\s\S]*?)<\/script>/gi;
    const seen = new Set<string>();
    const out: string[] = [];
    let total = 0;
    let script: RegExpExecArray | null;

    while ((script = scriptRe.exec(html)) && total < 15_000) {
      const strRe = /"((?:[^"\\]|\\.){24,400})"/g;
      let m: RegExpExecArray | null;
      while ((m = strRe.exec(script[1])) && total < 15_000) {
        const v = m[1]
          .replace(/\\n/g, ' ')
          .replace(/\\"/g, '"')
          .replace(/\\u[0-9a-fA-F]{4}/g, ' ')
          .trim();
        // Keep only prose: needs spaces, no URLs/paths/markup/code characters.
        if (!/\s/.test(v)) continue;
        if (/https?:\/\/|[{}<>=;\\]/.test(v)) continue;
        if (seen.has(v)) continue;
        seen.add(v);
        out.push(v);
        total += v.length;
      }
    }
    return out.join('\n');
  }

  private static async fetchUrlText(url: string): Promise<string> {
    let response: Response;
    try {
      response = await fetch(url, {
        headers: {
          // Browser-like UA — plain bot UAs get 403'd by common CDN bot rules.
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 VaNiGTM-Ingestion/1.0',
          Accept: 'text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5',
          'Accept-Language': 'en',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(30_000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`URL_FETCH_FAILED: ${url} — ${msg}`);
    }

    if (!response.ok) {
      throw new Error(`URL_FETCH_FAILED: ${url} — HTTP ${response.status} ${response.statusText}`);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!/text\/html|text\/plain|application\/xhtml/.test(contentType)) {
      throw new Error(`URL_UNSUPPORTED_CONTENT: ${url} returned '${contentType}' — only HTML/text pages are ingestible`);
    }

    const html = await response.text();

    // Layers 2 + 3 BEFORE stripping — scripts/meta are removed below.
    const metaText = IngestionAgent.extractMetaText(html);
    const minedText = IngestionAgent.mineJsonProse(html);

    const bodyText = html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ')
      // Block-level closers become newlines so headings/paragraphs keep separation
      .replace(/<\/(p|div|section|article|li|h[1-6]|tr|br)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&amp;/gi, '&')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&#39;|&apos;/gi, "'")
      .replace(/&quot;/gi, '"')
      .replace(/[ \t]+/g, ' ')
      .replace(/\n\s*\n+/g, '\n\n')
      .trim();

    const text = [metaText, bodyText, minedText].filter(Boolean).join('\n\n').trim();

    if (text.length < 200) {
      throw new Error(
        `URL_EMPTY_CONTENT: ${url} yielded only ${text.length} chars of readable text — ` +
        `the page renders in the browser. Paste your website copy instead.`,
      );
    }

    const MAX_CHARS = 200_000;
    return text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text;
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
