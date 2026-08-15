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

/* ── Visual hints (no LLM — best-effort HTML parse) ───────────────────── */

function resolveUrl(raw: string, baseUrl: string): string | undefined {
  try {
    return new URL(raw, baseUrl).href;
  } catch {
    return undefined;
  }
}

/** Best-effort logo/colors/typography from raw HTML. Never guesses — an
 *  absent signal stays absent rather than being filled with a plausible one. */
export function extractVisualHints(html: string, baseUrl: string): BrandVisual {
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

  const themeColorMatch = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["'](#[0-9a-fA-F]{3,6})["']/i);
  const colors = new Set<string>();
  if (themeColorMatch) colors.add(themeColorMatch[1].toLowerCase());

  const styleBlocks = html.match(/<style[^>]*>([\s\S]*?)<\/style>/gi) ?? [];
  for (const block of styleBlocks) {
    const hexes = block.match(/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b/g) ?? [];
    for (const hex of hexes) {
      colors.add(hex.toLowerCase());
      if (colors.size >= 5) break;
    }
    if (colors.size >= 5) break;
  }
  if (colors.size > 0) visual.colors = Array.from(colors).slice(0, 5);

  const fontMatch = html.match(/font-family:\s*['"]?([A-Za-z0-9 ,\-]+?)['";,]/i);
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
      visual = extractVisualHints(fetched.html, siteUrl);
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
  fields: Partial<Pick<TenantBrand, EditableListField>>,
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
