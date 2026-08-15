/**
 * brand-skill — the tenant's Brand Brain object (gt_tenant_brand).
 *
 * Same agent-proposes/human-confirms shape as profile.service.ts, but for
 * voice/tone, always/never-say claims, visual identity, and proof — the
 * mission wizard's step 5. Readable by every downstream agent, owned by none
 * of them (design-notes for "Complete the Mission Wizard", 2026-08-14).
 *
 * Visual pre-fill reuses IngestionAgent.fetchUrlText (already cross-skill
 * public — research-skill uses it the same way) against the tenant's most
 * recently ingested site URL, rather than touching the ingestion pipeline
 * itself. Best-effort only: a field with no real evidence stays blank.
 */

import type { Pool } from 'pg';
import { z } from 'zod';
import { createTenantDb } from '../../db';
import { callLLMValidated } from '../../agent-core/llm.client';
import { loadPrompt } from '../../agent-core/prompt.store';
import { IngestionAgent } from '../ingestion-skill/ingestion.agent';
import { getProfile, recomputeProfileScore } from './profile.service';

/* ── Types ──────────────────────────────────────────────────────────────── */

export interface BrandVisual {
  logo_url?: string;
  colors?: string[];
  typography?: string;
}

export interface TenantBrand {
  id: string;
  tenant_id: string;
  voice_tone: string[] | null;
  always_say: string[] | null;
  never_say: string[] | null;
  visual: BrandVisual;
  proof: string[] | null;
  source: string;
  approved_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

const BrandSchema = z.object({
  voice_tone: z.array(z.string()).default([]),
  always_say: z.array(z.string()).default([]),
  never_say: z.array(z.string()).default([]),
  proof: z.array(z.string()).default([]),
});

/* ── Read ───────────────────────────────────────────────────────────────── */

export async function getBrand(pool: Pool, tenantId: string): Promise<TenantBrand | null> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<TenantBrand>(
    `SELECT id, tenant_id, voice_tone, always_say, never_say, visual, proof,
            source, approved_at, version, created_at, updated_at
       FROM gt_tenant_brand
      WHERE tenant_id = $tenant_id`,
    { tenant_id: tenantId },
  );
  return result.rows[0] ?? null;
}

/* ── Visual hints (no LLM — best-effort HTML/CSS parse) ────────────────
 * Logo is a straight <link rel=icon> read — no upload/storage involved,
 * it's just a URL reference back to the tenant's own site, same as
 * every other agent-derived field here: shown for confirmation, never
 * downloaded or re-hosted.
 *
 * Colors need more than the HTML alone — inline <style> blocks rarely
 * carry a modern site's palette; the real colors live in linked
 * stylesheets (Tailwind/Next.js/Vite all compile to those). So this
 * fetches up to 2 same-origin-ish stylesheets too, best-effort, and
 * scans BOTH sources — preferring CSS custom properties that look
 * brand-related (--primary, --accent, --brand, --theme-*) over a raw
 * frequency count, since a compiled stylesheet has hundreds of
 * incidental colors and only a few are actually "the brand". Near-white/
 * near-black/grayscale hits are filtered out either way — never useful
 * as "the brand color".
 */

function resolveUrl(raw: string, baseUrl: string): string | undefined {
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return undefined;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  let h = hex.replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (h.length < 6) return null;
  const n = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

/** Grayscale, near-white, or near-black — never "the brand color". */
function isNearNeutral(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return true;
  const { r, g, b } = rgb;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max - min < 12) return true;
  if (min > 235) return true;
  if (max < 20) return true;
  return false;
}

/** CSS custom properties first (high-confidence — the site's own design
 *  system naming its brand colors), frequency-ranked hex as a fallback. */
function extractColorsFromCss(css: string): string[] {
  const branded = new Set<string>();
  const varRe = /--[\w-]*(?:brand|primary|accent|theme)[\w-]*\s*:\s*(#[0-9a-fA-F]{3,8})\b/gi;
  let m: RegExpExecArray | null;
  while ((m = varRe.exec(css))) {
    const hex = m[1].toLowerCase().slice(0, 7);
    if (!isNearNeutral(hex)) branded.add(hex);
    if (branded.size >= 5) break;
  }
  if (branded.size > 0) return Array.from(branded);

  const counts = new Map<string, number>();
  const hexRe = /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g;
  let hm: RegExpExecArray | null;
  while ((hm = hexRe.exec(css))) {
    const hex = hm[0].toLowerCase();
    if (isNearNeutral(hex)) continue;
    counts.set(hex, (counts.get(hex) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hex]) => hex);
}

const FONT_CDN_HOSTS = /fonts\.googleapis\.com|fonts\.gstatic\.com|use\.typekit\.net/i;

function extractStylesheetLinks(html: string, baseUrl: string, limit = 2): string[] {
  const linkRe = /<link[^>]+rel=["']stylesheet["'][^>]*>/gi;
  const urls: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(html)) && urls.length < limit) {
    const hrefMatch = m[0].match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const resolved = resolveUrl(hrefMatch[1], baseUrl);
    if (!resolved || FONT_CDN_HOSTS.test(resolved)) continue;
    urls.push(resolved);
  }
  return urls;
}

/** Best-effort — a stylesheet that's slow, blocked, or 404s just means one
 *  fewer color source, never a hard failure for the whole brand draft. */
async function fetchCssText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) VaNiGTM-Brand/1.0' },
      redirect: 'follow',
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return '';
    return (await res.text()).slice(0, 300_000);
  } catch {
    return '';
  }
}

/** Best-effort logo/colors/typography from raw HTML + up to 2 linked
 *  stylesheets. Never guesses — an absent signal stays absent rather than
 *  being filled with a plausible one. */
export async function extractVisualHints(html: string, baseUrl: string): Promise<BrandVisual> {
  const visual: BrandVisual = {};

  const iconRe = /<link[^>]+rel=["'](?:apple-touch-icon|icon|shortcut icon)["'][^>]*>/gi;
  let bestIcon: string | undefined;
  let m: RegExpExecArray | null;
  while ((m = iconRe.exec(html))) {
    const hrefMatch = m[0].match(/href=["']([^"']+)["']/i);
    if (!hrefMatch) continue;
    const resolved = resolveUrl(hrefMatch[1], baseUrl);
    if (!resolved) continue;
    // Prefer apple-touch-icon (usually higher-res) over a plain favicon.
    if (/apple-touch-icon/i.test(m[0]) || !bestIcon) bestIcon = resolved;
  }
  if (bestIcon) visual.logo_url = bestIcon;

  const inlineStyle = (html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? []).join('\n');
  const stylesheetUrls = extractStylesheetLinks(html, baseUrl);
  const fetchedSheets = await Promise.all(stylesheetUrls.map(fetchCssText));
  const fetchedCss = fetchedSheets.join('\n');
  const cssCorpus = `${inlineStyle}\n${fetchedCss}`;

  const colors = new Set<string>();
  const themeColorMatch = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{3,6})["']/i);
  if (themeColorMatch) colors.add(themeColorMatch[1].toLowerCase());
  for (const hex of extractColorsFromCss(cssCorpus)) {
    colors.add(hex);
    if (colors.size >= 5) break;
  }
  if (colors.size > 0) visual.colors = Array.from(colors).slice(0, 5);

  // Diagnostic trail — color extraction has 4 independent failure points
  // (no stylesheet links found, fetch blocked/timed out, fetched but empty,
  // fetched fine but nothing color-like matched) and "no colors" looks
  // identical from the outside in all 4 cases. Log which one it actually was.
  console.log(
    `[Brand:extractVisualHints] logo=${bestIcon ? 'found' : 'none'} `
    + `stylesheets=${stylesheetUrls.length} (${stylesheetUrls.join(', ') || 'none found'}) `
    + `fetchedBytes=${fetchedSheets.map((s) => s.length).join(',') || 'n/a'} `
    + `themeColorMeta=${themeColorMatch ? themeColorMatch[1] : 'none'} `
    + `colorsFound=${colors.size}`,
  );

  const fontMatch = `${html}\n${cssCorpus}`.match(/font-family:\s*['"]?([A-Za-z0-9 ,\-]+?)['";,]/i);
  if (fontMatch) {
    const primary = fontMatch[1].split(',')[0].trim();
    if (primary && !/^(inherit|sans-serif|serif|monospace|arial|helvetica)$/i.test(primary)) {
      visual.typography = primary;
    }
  }

  return visual;
}

/* ── Generate (1 LLM call + best-effort HTML parse, agent-suggested) ──── */

export async function generateBrand(
  pool: Pool,
  tenantId: string,
  runId: string | number,
): Promise<TenantBrand> {
  const db = createTenantDb(pool, tenantId);

  const profile = await getProfile(pool, tenantId);
  if (!profile?.product_name && !profile?.product_description) {
    throw new Error('PROFILE_NOT_FOUND: cannot draft brand without a drafted profile');
  }

  const sourceResult = await db.query<{ url: string | null }>(
    `SELECT url FROM gt_kb_sources
      WHERE tenant_id = $tenant_id AND source_type = 'url' AND url IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    { tenant_id: tenantId },
  );
  const siteUrl = sourceResult.rows[0]?.url ?? null;

  let siteText = '';
  let visual: BrandVisual = {};
  if (siteUrl) {
    try {
      const fetched = await IngestionAgent.fetchUrlText(siteUrl);
      siteText = fetched.text;
      visual = await extractVisualHints(fetched.html, siteUrl);
    } catch (err) {
      // Best-effort — a stale/unreachable site must not block brand drafting
      // from the profile alone (no fabricated visual data either way), but
      // the failure must still be traceable — a silently empty draft with no
      // server-side trail is what made an earlier version of this look
      // broken with no way to tell why.
      console.error('[Brand:generateBrand] site fetch failed, drafting from profile alone', err);
    }
  }

  const system = await loadPrompt(pool, 'profile-skill.brand', tenantId);

  const context = JSON.stringify({
    product_name: profile.product_name,
    product_description: profile.product_description,
    core_problem: profile.core_problem,
    site_text: siteText.slice(0, 12_000),
  }, null, 2);

  const drafted = await callLLMValidated(
    {
      pool, tenantId, runId,
      system,
      messages: [{ role: 'user', content: `Company context:\n${context}` }],
      maxTokens: 1200,
    },
    BrandSchema,
    'brand',
  );

  await db.query(
    `INSERT INTO gt_tenant_brand
         (tenant_id, voice_tone, always_say, never_say, visual, proof, source)
       VALUES
         ($tenant_id, $voice_tone::text[], $always_say::text[], $never_say::text[],
          $visual::jsonb, $proof::text[], 'agent')
     ON CONFLICT (tenant_id) DO UPDATE
         SET voice_tone = CASE
               WHEN gt_tenant_brand.approved_at IS NULL AND gt_tenant_brand.source = 'agent'
               THEN EXCLUDED.voice_tone ELSE gt_tenant_brand.voice_tone END,
             always_say = CASE
               WHEN gt_tenant_brand.approved_at IS NULL AND gt_tenant_brand.source = 'agent'
               THEN EXCLUDED.always_say ELSE gt_tenant_brand.always_say END,
             never_say = CASE
               WHEN gt_tenant_brand.approved_at IS NULL AND gt_tenant_brand.source = 'agent'
               THEN EXCLUDED.never_say ELSE gt_tenant_brand.never_say END,
             visual = CASE
               WHEN gt_tenant_brand.approved_at IS NULL AND gt_tenant_brand.source = 'agent'
               THEN EXCLUDED.visual ELSE gt_tenant_brand.visual END,
             proof = CASE
               WHEN gt_tenant_brand.approved_at IS NULL AND gt_tenant_brand.source = 'agent'
               THEN EXCLUDED.proof ELSE gt_tenant_brand.proof END,
             updated_at = now()`,
    {
      tenant_id:  tenantId,
      voice_tone: drafted.voice_tone,
      always_say: drafted.always_say,
      never_say:  drafted.never_say,
      visual:     JSON.stringify(visual),
      proof:      drafted.proof,
    },
  );

  return (await getBrand(pool, tenantId)) as TenantBrand;
}

/* ── Human edits ────────────────────────────────────────────────────────── */

const EDITABLE_LIST_FIELDS = ['voice_tone', 'always_say', 'never_say', 'proof'] as const;
type EditableListField = (typeof EDITABLE_LIST_FIELDS)[number];

export async function upsertBrandFields(
  pool: Pool,
  tenantId: string,
  fields: Partial<Pick<TenantBrand, EditableListField>> & { colors?: string[] },
): Promise<TenantBrand> {
  const db = createTenantDb(pool, tenantId);

  const setClauses: string[] = ["source = 'human'", 'updated_at = now()'];
  const params: Record<string, unknown> = { tenant_id: tenantId };

  for (const key of EDITABLE_LIST_FIELDS) {
    if (key in fields) {
      setClauses.push(`${key} = $${key}::text[]`);
      params[key] = fields[key] ?? null;
    }
  }

  // Colors live under the visual JSONB blob alongside logo_url/typography —
  // a plain column assignment would clobber those, so merge just this key.
  // Not gated behind auto-detection at all: a site that needs JS execution
  // to reveal its real palette (no headless renderer configured) still
  // needs a way to capture brand colors, same as every other field here.
  if (fields.colors !== undefined) {
    setClauses.push(`visual = jsonb_set(coalesce(visual, '{}'::jsonb), '{colors}', $colors::jsonb, true)`);
    params.colors = JSON.stringify(fields.colors ?? []);
  }

  if (setClauses.length === 2) {
    const existing = await getBrand(pool, tenantId);
    if (existing) return existing;
    throw new Error('BRAND_NOT_FOUND: generate a brand draft before editing it');
  }

  await db.query(
    `UPDATE gt_tenant_brand SET ${setClauses.join(', ')} WHERE tenant_id = $tenant_id`,
    params,
  );

  const updated = await getBrand(pool, tenantId);
  if (!updated) throw new Error('BRAND_NOT_FOUND: generate a brand draft before editing it');
  return updated;
}

/* ── Human gate ─────────────────────────────────────────────────────────── */

export async function approveBrand(pool: Pool, tenantId: string): Promise<TenantBrand> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<TenantBrand>(
    `UPDATE gt_tenant_brand
        SET approved_at = now(), updated_at = now()
      WHERE tenant_id = $tenant_id
      RETURNING id, tenant_id, voice_tone, always_say, never_say, visual, proof,
                source, approved_at, version, created_at, updated_at`,
    { tenant_id: tenantId },
  );
  const brand = result.rows[0];
  if (!brand) throw new Error('BRAND_NOT_FOUND: generate a brand draft before approving it');

  await recomputeProfileScore(pool, tenantId);

  return brand;
}

/**
 * Reopen a confirmed brand for the same wizard session ("Edit again"). Clears
 * approved_at so generateBrand's upsert guard (`WHEN approved_at IS NULL AND
 * source='agent'`) allows a fresh draft to actually overwrite it again —
 * without this, "Regenerate from site" after a confirm would silently no-op
 * against an already-approved row. profile_score's brand section is gated on
 * approval too, so it drops back to 0 until re-confirmed — correct, since an
 * unconfirmed draft has already earned nothing everywhere else in the score.
 */
export async function reopenBrand(pool: Pool, tenantId: string): Promise<TenantBrand> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<TenantBrand>(
    `UPDATE gt_tenant_brand
        SET approved_at = NULL, updated_at = now()
      WHERE tenant_id = $tenant_id
      RETURNING id, tenant_id, voice_tone, always_say, never_say, visual, proof,
                source, approved_at, version, created_at, updated_at`,
    { tenant_id: tenantId },
  );
  const brand = result.rows[0];
  if (!brand) throw new Error('BRAND_NOT_FOUND: nothing to reopen');

  await recomputeProfileScore(pool, tenantId);

  return brand;
}
