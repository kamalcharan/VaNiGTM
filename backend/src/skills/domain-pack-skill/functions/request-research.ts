/**
 * Queue enrichment for the caller's own industry.
 *
 * The retry path. Enrichment fires automatically once, when business_profile
 * completes — so a tenant who onboarded earlier, changed industry, or hit a
 * failed run has no other way to get recommendations. Rule 12 allows exactly
 * this shape: an explicit user-chosen path offered after a visible failure,
 * with `research_status` supplying the real diagnosis first.
 *
 * SAFE TO PRESS REPEATEDLY. The event is cheap; the agent's claim decides.
 * A second press while a run is in flight, or after packs exist, completes as
 * a no-op without calling a model. Deciding here instead would race — two
 * tenants in one industry would both see "no packs" and both research it.
 *
 * NO `force`. Skipping the pack-exists guard is operator-only
 * (`npm run packs -- --research <tenantId> --force`). A pack is shared by
 * every tenant in the industry: letting one of them re-roll it on demand
 * spends platform tokens and churns an artefact their competitors read.
 */

import { SkillContext } from '../../../shared/types';
import { slugifyIndustry } from '../../../vani/industry-slug';

export async function request_research(_params: Record<string, unknown>, ctx: SkillContext) {
  // The industry is read from the tenant's own profile using the JWT's
  // tenant_id. It is never taken from params — that would let any caller
  // research (and so shape) any industry they named.
  const profile = await ctx.db.query<{ industry: string | null }>(
    `SELECT industry FROM vn_tenant_profiles WHERE tenant_id = $tenant_id`,
    { tenant_id: ctx.tenant_id },
  );

  const industry = (profile.rows[0]?.industry ?? '').trim();
  if (!industry) {
    // Refuse rather than guess. Inventing an industry would produce packs for
    // a business nobody described, inherited by everyone who later slugs to
    // the same key (rule 9d).
    return {
      queued: false,
      reason: 'NO_INDUSTRY',
      detail: 'Set your industry in Smart Profile first — Vara researches role families from it.',
    };
  }

  const domain = slugifyIndustry(industry);
  if (!domain) {
    return {
      queued: false,
      reason: 'UNUSABLE_INDUSTRY',
      detail: `"${industry}" has no letters or digits to build an industry key from.`,
    };
  }

  // gt_events is the cross-tenant bus and carries no RLS by design
  // (migration 185), so this is a plain insert rather than a tenant client.
  // tenant_id still comes from the JWT context, never from the caller.
  const ins = await ctx.db.transaction(async (tx) =>
    tx.query<{ id: string }>(
      `INSERT INTO gt_events (tenant_id, event_type, source_type, payload)
       VALUES ($tenant_id, 'DOMAIN_ENRICHMENT_REQUESTED', 'human', $payload::jsonb)
       RETURNING id`,
      {
        tenant_id: ctx.tenant_id,
        payload: JSON.stringify({ industry, domain, force: false }),
      },
    ),
  );

  return {
    queued: true,
    industry,
    domain,
    event_id: ins.rows[0].id,
    detail: `Vara is studying how ${industry} hires. Recommendations appear here when it is done.`,
  };
}
