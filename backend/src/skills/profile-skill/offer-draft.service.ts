/**
 * offer-draft.service — drafts what a tenant sells (gt_offers) from what
 * VaNi already knows, same agent-proposes/human-confirms shape as
 * brand.service.ts and cluster.service.ts (Intelligent Add Offers,
 * 2026-08-15).
 *
 * Unlike brand, this does NOT re-fetch the tenant's site: gt_kb_sources.
 * raw_text is already the extracted, cached text from ingestion (whatever
 * mix of URL/file/GDrive the tenant fed in) — drafting offers from it needs
 * no new crawl. price_band and proof are deliberately never drafted here —
 * they are facts a human must supply, same rule save_offer.ts already
 * enforces for hand-typed offers.
 *
 * gt_offers itself (schema, commitment, readiness) belongs to research-skill
 * (offer-catalogue.ts) — this file only inserts DRAFT rows into it, the same
 * cross-skill relationship brand.service.ts has with ingestion-skill.
 */

import type { Pool } from 'pg';
import { z } from 'zod';
import { createTenantDb } from '../../db';
import { callLLMValidated } from '../../agent-core/llm.client';
import { loadPrompt } from '../../agent-core/prompt.store';
import { getProfile, recomputeProfileScore } from './profile.service';

const OfferDraftsSchema = z.object({
  offers: z.array(z.object({
    name: z.string().min(2),
    one_line: z.string().default(''),
    who_for: z.string().default(''),
    problem: z.string().default(''),
    what_we_do: z.array(z.string()).default([]),
    signals: z.array(z.string()).default([]),
    disqualifiers: z.array(z.string()).default([]),
  })).min(1).max(3),
});

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export interface DraftedOffer {
  offer_key: string;
  name: string;
}

/**
 * Draft 1-3 offers from the tenant's profile + cached site/document text.
 * Never overwrites an existing offer_key — a repeat call proposes fresh
 * offer_keys (name-derived) rather than touching anything already there,
 * confirmed or not. Returns what was inserted.
 */
export async function generateOfferDrafts(
  pool: Pool,
  tenantId: string,
  runId: string | number,
): Promise<DraftedOffer[]> {
  const db = createTenantDb(pool, tenantId);

  const profile = await getProfile(pool, tenantId);
  if (!profile?.product_name && !profile?.product_description) {
    throw new Error('PROFILE_NOT_FOUND: cannot draft offers without a drafted profile');
  }

  const sourceResult = await db.query<{ raw_text: string | null }>(
    `SELECT raw_text FROM gt_kb_sources
      WHERE tenant_id = $tenant_id AND raw_text IS NOT NULL
      ORDER BY created_at DESC
      LIMIT 1`,
    { tenant_id: tenantId },
  );
  const siteText = sourceResult.rows[0]?.raw_text ?? '';

  const system = await loadPrompt(pool, 'profile-skill.offers', tenantId);

  const context = JSON.stringify({
    product_name: profile.product_name,
    product_description: profile.product_description,
    core_problem: profile.core_problem,
    key_differentiators: (profile.key_differentiators ?? []).slice(0, 5),
    site_text: siteText.slice(0, 12_000),
  }, null, 2);

  const drafted = await callLLMValidated(
    {
      pool, tenantId, runId,
      system,
      messages: [{ role: 'user', content: `Company context:\n${context}` }],
      maxTokens: 1500,
    },
    OfferDraftsSchema,
    'offers',
  );

  const existingKeysResult = await db.query<{ offer_key: string }>(
    `SELECT offer_key FROM gt_offers WHERE tenant_id = $tenant_id`,
    { tenant_id: tenantId },
  );
  const existingKeys = new Set(existingKeysResult.rows.map((r) => r.offer_key));

  const inserted: DraftedOffer[] = [];

  await db.transaction(async (tx) => {
    for (const o of drafted.offers) {
      const name = o.name.trim();
      if (!name) continue;

      let key = slugify(name);
      if (!key) continue;
      // A repeat draft round must not collide with (and silently skip) an
      // offer_key already in use, confirmed or not — suffix until unique.
      let suffix = 2;
      while (existingKeys.has(key)) {
        key = `${slugify(name)}-${suffix}`;
        suffix++;
      }
      existingKeys.add(key);

      await tx.query(
        `INSERT INTO gt_offers
             (tenant_id, offer_key, name, one_line, who_for, problem,
              what_we_do, signals, disqualifiers, commitment, source)
           VALUES
             ($tenant_id, $offer_key, $name, $one_line, $who_for, $problem,
              $what_we_do::text[], $signals::text[], $disqualifiers::text[],
              'project', 'agent')`,
        {
          tenant_id: tenantId,
          offer_key: key,
          name,
          one_line: o.one_line.trim(),
          who_for: o.who_for.trim(),
          problem: o.problem.trim(),
          what_we_do: o.what_we_do.map((x) => x.trim()).filter(Boolean),
          signals: o.signals.map((x) => x.trim()).filter(Boolean),
          disqualifiers: o.disqualifiers.map((x) => x.trim()).filter(Boolean),
        },
      );
      inserted.push({ offer_key: key, name });
    }
  });

  return inserted;
}

/**
 * Confirm one offer (agent draft or human-authored) — stamps confirmed_at
 * and recomputes the score, same shape as approveBrand/approveClusters.
 * Editing an offer's fields does NOT confirm it; only this does.
 */
export async function confirmOffer(
  pool: Pool,
  tenantId: string,
  offerKey: string,
): Promise<void> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query(
    `UPDATE gt_offers
        SET confirmed_at = now(), updated_at = now()
      WHERE tenant_id = $tenant_id AND offer_key = $offer_key
      RETURNING id`,
    { tenant_id: tenantId, offer_key: offerKey },
  );
  if (result.rows.length === 0) {
    throw new Error(`OFFER_NOT_FOUND: no offer "${offerKey}" for this tenant`);
  }

  await recomputeProfileScore(pool, tenantId);
}
