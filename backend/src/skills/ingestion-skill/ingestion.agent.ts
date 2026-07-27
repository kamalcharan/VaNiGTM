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
import { upsertNode, upsertEdge } from '../../agent-core/kg.store';

import type { Parser } from './parsers/parser.interface';
import { PdfParser }  from './parsers/pdf.parser';
import { DocxParser } from './parsers/docx.parser';
import { PptxParser } from './parsers/pptx.parser';
import { TextParser } from './parsers/text.parser';
import { chunkText } from './pipeline/chunker';
import { extractFromChunks, type SourcedChunk } from './pipeline/extractor';
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
      // Final HTML of the primary page (rendered version when escalated) —
      // used after the fast draft to discover more site pages to crawl.
      let primaryHtml: string | null = null;
      // Per-page sections — chunked separately so every KG node carries the
      // source_url of the page it was extracted from (provenance for every
      // future agent that cites the graph).
      const sections: { url: string | null; text: string }[] = [];

      if (source.source_type === 'url' && source.url) {
        // URL source — fetch the page server-side and strip to text.
        const fetched = await IngestionAgent.fetchUrlText(source.url);
        rawText = fetched.text;
        primaryHtml = fetched.html;

        // Record the site-health check as a real step — the wizard surfaces
        // it as onboarding's first mini digital-audit. Always measured on the
        // STATIC page: that is what Google and AI answer engines see, even
        // when we escalate to a headless render below.
        await appendStep(pool, runId, {
          step_name:      'site_health',
          action:         'Checked how crawlable the site is',
          output_summary: fetched.health.summary,
          status:         fetched.health.missing.length === 0 ? 'ok' : 'error',
        });

        if (rawText.length < 200) {
          // Escalation, not a fallback: visible as run steps, and any
          // renderer failure fails the run loudly (rule 12).
          await appendStep(pool, runId, {
            step_name: 'render_page',
            action:    'Static read too thin — rendering the page in a headless browser (n8n)',
            status:    'ok',
          });

          const renderedHtml = await IngestionAgent.renderPageViaN8n(source.url);
          const rendered = IngestionAgent.extractFromHtml(renderedHtml);
          rawText = rendered.text;
          primaryHtml = renderedHtml; // rendered nav carries the real links on JS sites

          await appendStep(pool, runId, {
            step_name:      'render_complete',
            action:         'Rendered page read',
            output_summary: `${rawText.length} chars of readable text after rendering`,
            status:         'ok',
          });

          if (rawText.length < 200) {
            throw new Error(
              `URL_EMPTY_CONTENT: ${source.url} yielded only ${rawText.length} chars even after ` +
              `headless rendering (static page missing: ${fetched.health.missing.join(', ') || 'nothing'}). ` +
              `Paste your website copy instead.`,
            );
          }
        }
        sections.push({ url: source.url, text: rawText });
      } else if (source.raw_text && !source.gdrive_file_id) {
        // Pre-supplied text (pasted context via POST /ingest/text) — the
        // text IS the source; nothing to fetch or parse.
        rawText = source.raw_text;
        sections.push({ url: null, text: rawText });
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
        sections.push({ url: null, text: rawText });
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
      // Fill-only-empty inside the drafter. A draft failure FAILS the run
      // (CLAUDE.md rule 12: no silent fallbacks — the draft is the point of
      // researching a URL; completing without it would fake success).
      let firstDraftProfile: Awaited<ReturnType<typeof draftProfileFromText>>['profile'] | null = null;
      if (source.source_type === 'url' || source.source_type === 'txt') {
        const draft = await draftProfileFromText(pool, tenantId, rawText, runId);
        firstDraftProfile = draft.profile;
        await appendStep(pool, runId, {
          step_name:      'draft_profile',
          action:         'Drafted GTM profile from website text',
          output_summary: draft.fieldsFilled.length > 0
            ? `filled: ${draft.fieldsFilled.join(', ')}`
            : 'no empty fields to fill',
          status:         'ok',
        });
      }

      // 3c. Site crawl — AFTER the fast homepage draft (the wizard's card is
      // already usable), read up to 6 more same-domain pages discovered from
      // the primary page's nav, so the knowledge graph and a second
      // gap-filling draft pass see the whole site, not just the landing page.
      // Per-page failures are reported in the step output, never swallowed.
      if (source.source_type === 'url' && source.url && primaryHtml) {
        const extraPages = IngestionAgent.discoverSitePages(primaryHtml, source.url);
        if (extraPages.length > 0) {
          await appendStep(pool, runId, {
            step_name:      'crawl_pages',
            action:         `Exploring ${extraPages.length} more pages of the site`,
            output_summary: extraPages.map((u) => new URL(u).pathname || '/').join(', '),
            status:         'ok',
          });

          const pageTexts: { url: string; text: string }[] = [];
          const failures: string[] = [];
          let rendersUsed = 0;
          const MAX_SUBPAGE_RENDERS = 4;

          for (const pageUrl of extraPages) {
            try {
              let pageText = (await IngestionAgent.fetchUrlText(pageUrl)).text;
              if (pageText.length < 200 && rendersUsed < MAX_SUBPAGE_RENDERS && IngestionAgent.renderConfigured()) {
                rendersUsed++;
                const renderedSub = await IngestionAgent.renderPageViaN8n(pageUrl);
                pageText = IngestionAgent.extractFromHtml(renderedSub).text;
              }
              if (pageText.length >= 200) {
                pageTexts.push({ url: pageUrl, text: pageText });
                sections.push({ url: pageUrl, text: pageText });
              } else {
                failures.push(`${new URL(pageUrl).pathname} (too thin)`);
              }
            } catch (pageErr) {
              const msg = pageErr instanceof Error ? pageErr.message : String(pageErr);
              failures.push(`${new URL(pageUrl).pathname} (${msg.slice(0, 80)})`);
            }
          }

          await appendStep(pool, runId, {
            step_name:      'crawl_complete',
            action:         'Site crawl finished',
            output_summary: `${pageTexts.length}/${extraPages.length} pages read`
              + (failures.length ? ` — skipped: ${failures.join('; ')}` : ''),
            status:         failures.length > 0 ? 'error' : 'ok',
          });

          if (pageTexts.length > 0) {
            const MAX_CHARS = 200_000;
            rawText = [
              rawText,
              ...pageTexts.map((p) => `\n\n===== PAGE: ${p.url} =====\n${p.text}`),
            ].join('').slice(0, MAX_CHARS);

            await db.query(
              `UPDATE gt_kb_sources SET raw_text = $raw_text, updated_at = now() WHERE id = $source_id`,
              { source_id: sourceId, raw_text: rawText },
            );

            // Second draft pass, deeper pages FIRST so the drafter sees new
            // material inside its input cap. With the first draft as
            // improveBaseline it may IMPROVE any agent-drafted value the
            // richer pages support improving — but a field the human has
            // edited since draft 1 no longer matches the baseline and is
            // untouchable. Human edits always win.
            const enrichedInput = [
              ...pageTexts.map((p) => `===== PAGE: ${p.url} =====\n${p.text}`),
              `===== HOMEPAGE =====\n${rawText.slice(0, 6_000)}`,
            ].join('\n\n');
            const draft2 = await draftProfileFromText(pool, tenantId, enrichedInput, runId, {
              improveBaseline: firstDraftProfile,
              changeNote: 'enriched from site crawl',
            });
            const parts: string[] = [];
            if (draft2.fieldsFilled.length) parts.push(`filled: ${draft2.fieldsFilled.join(', ')}`);
            if (draft2.fieldsImproved.length) parts.push(`improved: ${draft2.fieldsImproved.join(', ')}`);
            await appendStep(pool, runId, {
              step_name:      'draft_profile_enriched',
              action:         'Enriched the profile from deeper pages',
              output_summary: parts.length ? parts.join(' · ') : 'homepage draft already covered everything',
              status:         'ok',
            });
          }
        }
      }

      // 4. STEP: chunk — per section, so each chunk knows its page of origin.
      const chunks: SourcedChunk[] = sections.flatMap((sec) =>
        chunkText(sec.text).map((c) => ({ ...c, source_url: sec.url })),
      );

      await db.query(
        `UPDATE gt_kb_sources SET chunk_count = $count, updated_at = now() WHERE id = $source_id`,
        { source_id: sourceId, count: chunks.length },
      );

      await appendStep(pool, runId, {
        step_name:      'chunk',
        action:         'Split into chunks',
        output_summary: `${chunks.length} chunks across ${sections.length} page(s)`,
        status:         'ok',
      });

      // 5. STEP: extract
      await appendStep(pool, runId, {
        step_name: 'extract',
        action:    `Extracting entities from ${chunks.length} chunks via VPS LLM`,
        status:    'ok',
      });

      const { nodes, relations } = await extractFromChunks(pool, tenantId, runId, chunks);

      await appendStep(pool, runId, {
        step_name:      'extract_complete',
        action:         'LLM extraction finished',
        output_summary: `${nodes.length} nodes, ${relations.length} relationships extracted`,
        status:         'ok',
      });

      // 6. WRITE TO GRAPH — nodes first (building a name→id map), then the
      // edges between them. Edges are what make this a graph the deck Q&A,
      // Lead Finder and Auditor can reason over, not a tag list.
      const nodeIds = new Map<string, string>();
      for (const node of nodes) {
        try {
          const nodeId = await upsertNode(pool, tenantId, node, runId);
          nodeIds.set(`${node.label}:${node.name}`.toLowerCase(), nodeId);
          written++;
        } catch (err) {
          console.warn(
            `[Ingestion] Node upsert failed (${node.label}/${node.name}):`,
            err,
          );
        }
      }

      let edgesWritten = 0;
      let edgesSkipped = 0;
      for (const rel of relations) {
        const fromId = nodeIds.get(rel.from.toLowerCase());
        const toId   = nodeIds.get(rel.to.toLowerCase());
        if (!fromId || !toId || fromId === toId) {
          edgesSkipped++;
          continue; // endpoint didn't survive validation/upsert — skip, counted
        }
        try {
          await upsertEdge(pool, tenantId, fromId, rel.type, toId, {}, runId);
          edgesWritten++;
        } catch (err) {
          edgesSkipped++;
          console.warn(`[Ingestion] Edge upsert failed (${rel.from} -${rel.type}-> ${rel.to}):`, err);
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
        output: { source_id: sourceId, nodes_written: written, edges_written: edgesWritten },
      });

      await appendStep(pool, runId, {
        step_name:      'complete',
        action:         'Wrote to knowledge graph',
        output_summary: `${written} nodes, ${edgesWritten} relationships`
          + (edgesSkipped ? ` (${edgesSkipped} relations skipped — unresolved endpoints)` : ''),
        status:         'ok',
      });

      // 8. EMIT KNOWLEDGE_UPDATED — wakes the profile-completion checker.
      await emitEvent(
        pool,
        tenantId,
        'KNOWLEDGE_UPDATED',
        'agent',
        { run_id: runId, source_id: sourceId, nodes_written: written, edges_written: edgesWritten },
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

  /**
   * Site-health signals — which crawlability/AEO basics the page ships.
   * Doubles as the first Digital Audit finding, surfaced at onboarding:
   * a site invisible to VaNi's crawler is invisible to AI answer engines.
   */
  private static analyzeSiteHealth(html: string, bodyChars: number): {
    present: string[]; missing: string[]; summary: string;
  } {
    const checks: [key: string, ok: boolean][] = [
      ['title', /<title[^>]*>\s*\S[\s\S]*?<\/title>/i.test(html)],
      ['meta_description', /<meta\s[^>]*(?:name|property)\s*=\s*["']description["'][^>]*content\s*=\s*["'][^"']+["']/i.test(html)
        || /<meta\s[^>]*content\s*=\s*["'][^"']+["'][^>]*(?:name|property)\s*=\s*["']description["']/i.test(html)],
      ['og_tags', /<meta\s[^>]*property\s*=\s*["']og:/i.test(html)],
      ['json_ld', /<script[^>]*type\s*=\s*["']application\/ld\+json["']/i.test(html)],
      ['body_text', bodyChars >= 200],
    ];
    const present = checks.filter(([, ok]) => ok).map(([k]) => k);
    const missing = checks.filter(([, ok]) => !ok).map(([k]) => k);
    return {
      present,
      missing,
      summary: `present: ${present.join(', ') || 'none'}; missing: ${missing.join(', ') || 'none'}; body: ${bodyChars} chars`,
    };
  }

  /** Run the three extraction layers + health check over an HTML document. */
  private static extractFromHtml(html: string): {
    text: string;
    health: { present: string[]; missing: string[]; summary: string };
  } {
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
    const health = IngestionAgent.analyzeSiteHealth(html, bodyText.length);

    const MAX_CHARS = 200_000;
    return {
      text: text.length > MAX_CHARS ? text.slice(0, MAX_CHARS) : text,
      health,
    };
  }

  /**
   * Headless-render escalation via the user's n8n infra (CLAUDE.md: n8n
   * approved for agent-adjacent jobs; authenticated + environment-routed).
   * Called ONLY when the static read is too thin, and always visible as a
   * run step — never a silent fallback (rule 12). Throws loudly when the
   * renderer is unconfigured, unreachable, or returns nothing.
   */
  private static async renderPageViaN8n(url: string): Promise<string> {
    const base = process.env.N8N_RENDER_URL;
    const secret = process.env.N8N_RENDER_SECRET;
    if (!base || !secret) {
      throw new Error(
        'RENDER_NOT_CONFIGURED: this site needs headless rendering — set N8N_RENDER_URL and ' +
        'N8N_RENDER_SECRET (see documents/n8n/README.md) or paste the website copy instead.',
      );
    }
    const prefix = process.env.N8N_ENV === 'live' ? '/webhook' : '/webhook-test';

    let res: Response;
    try {
      res = await fetch(`${base.replace(/\/$/, '')}${prefix}/vani-render-page`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-vani-secret': secret },
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`RENDER_FAILED: could not reach the n8n renderer — ${msg}`);
    }

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`RENDER_FAILED: n8n responded ${res.status} — ${detail.slice(0, 300)}`);
    }

    let data: { success?: boolean; html?: string; message?: string };
    try {
      data = await res.json() as typeof data;
    } catch {
      throw new Error('RENDER_FAILED: n8n returned a non-JSON response');
    }
    if (!data.success || !data.html) {
      throw new Error(`RENDER_FAILED: ${data.message || 'renderer returned no HTML'}`);
    }
    return String(data.html);
  }

  /**
   * Discover same-domain pages worth crawling from a page's HTML —
   * scored by how likely the path is to carry positioning content
   * (about/services/pricing/case studies…). Bounded to `limit`.
   */
  private static discoverSitePages(html: string, baseUrl: string, limit = 6): string[] {
    const base = new URL(baseUrl);
    const seen = new Set<string>();
    const scored: { url: string; score: number }[] = [];

    const CONTENT_HINTS = /about|service|product|pricing|price|plan|case|customer|stor(y|ies)|solution|team|feature|industr|how|faq|why|platform|assessment/i;
    const SKIP_EXT = /\.(png|jpe?g|svg|gif|webp|ico|css|js|json|xml|pdf|zip|mp4|webm|woff2?)($|\?)/i;

    const hrefRe = /href\s*=\s*["']([^"'#]+)["']/gi;
    let m: RegExpExecArray | null;
    while ((m = hrefRe.exec(html)) && scored.length < 60) {
      const raw = m[1].trim();
      if (!raw || raw.startsWith('mailto:') || raw.startsWith('tel:') || raw.startsWith('javascript:')) continue;
      let resolved: URL;
      try {
        resolved = new URL(raw, base);
      } catch { continue; }
      if (resolved.hostname !== base.hostname) continue;
      if (SKIP_EXT.test(resolved.pathname)) continue;

      resolved.hash = '';
      resolved.search = '';
      const normalized = resolved.href.replace(/\/$/, '');
      const baseNorm = base.href.replace(/\/$/, '');
      if (normalized === baseNorm || seen.has(normalized)) continue;
      seen.add(normalized);

      const depth = resolved.pathname.split('/').filter(Boolean).length;
      let score = CONTENT_HINTS.test(resolved.pathname) ? 10 : 0;
      score -= depth; // prefer shallow pages
      scored.push({ url: normalized, score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
      .map((s) => s.url);
  }

  private static renderConfigured(): boolean {
    return Boolean(process.env.N8N_RENDER_URL && process.env.N8N_RENDER_SECRET);
  }

  private static async fetchUrlText(url: string): Promise<{
    text: string;
    html: string;
    health: { present: string[]; missing: string[]; summary: string };
  }> {
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
    return { ...IngestionAgent.extractFromHtml(html), html };
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
