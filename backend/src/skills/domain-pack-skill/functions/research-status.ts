/**
 * Where this tenant's industry stands.
 *
 * Exists so the console can tell the tenant the TRUTH rather than showing an
 * empty list. "No role families" has at least five different causes and they
 * need different actions from the tenant — set an industry, wait, retry, or
 * nothing at all. Collapsing them into one blank screen is the failure rule 9b
 * names, and hiding a real error behind it is the one rule 12 names.
 */

import { SkillContext } from '../../../shared/types';
import { slugifyIndustry } from '../../../vani/industry-slug';

export type ResearchState =
  | 'no_industry'    // nothing to research — the tenant must act
  | 'ready'          // researched packs published for this industry
  | 'seeded_only'    // only Vikuna's generic starter — nobody has studied this industry
  | 'running'        // a run is in flight; recommendations are coming
  | 'in_review'      // researched, waiting on Vikuna to publish
  | 'failed'         // the last attempt failed — reason included, retry offered
  | 'none';          // never attempted

export async function research_status(_params: Record<string, unknown>, ctx: SkillContext) {
  const profile = await ctx.db.query<{ industry: string | null }>(
    `SELECT industry FROM vn_tenant_profiles WHERE tenant_id = $tenant_id`,
    { tenant_id: ctx.tenant_id },
  );

  const industry = (profile.rows[0]?.industry ?? '').trim();
  const domain = industry ? slugifyIndustry(industry) : '';

  if (!domain) {
    return {
      state: 'no_industry' as ResearchState,
      industry: null,
      domain: null,
      families: 0,
      source: 'seeded' as const,
      researched_at: null,
      can_request: false,
      detail: 'Set your industry in Smart Profile — Vara researches role families from it.',
    };
  }

  // vani_domain_pack carries no RLS (migration 240: platform registries hold
  // no tenant policy), so this reads the shared artefact directly.
  // Provenance, not just a count. `payload.researched` is written by the
  // enrichment agent and absent from migration 244's handcrafted seeds, so it
  // separates "someone studied this industry" from "Vikuna wrote a generic
  // starter before any tenant existed". The doorway showed three engineering
  // families for Technology & SaaS and called it knowledge; a tenant has to be
  // able to tell the difference (rule 9d — never present the unverified as
  // derived).
  const packs = await ctx.db.query<{ total: number; researched: number; latest: Date | null }>(
    `SELECT count(DISTINCT code)::int AS total,
            count(DISTINCT code) FILTER (WHERE payload -> 'researched' IS NOT NULL)::int
              AS researched,
            max((payload -> 'researched' ->> 'at')::timestamptz) AS latest
       FROM vani_domain_pack
      WHERE domain = $domain AND payload -> 'vara' -> 'starter' IS NOT NULL`,
    { domain },
  );
  const families = packs.rows[0]?.total ?? 0;
  const researched = packs.rows[0]?.researched ?? 0;
  const researchedAt = packs.rows[0]?.latest ?? null;
  const source = researched === 0 ? 'seeded' : researched === families ? 'researched' : 'mixed';

  // This tenant's own attempts only. Another tenant's in-flight run for the
  // same industry is deliberately NOT surfaced — it would leak that someone
  // else in their industry is a customer.
  const last = await ctx.db.query<{
    status: string; error_trace: string | null; started_at: Date;
  }>(
    `SELECT status, error_trace, started_at
       FROM gt_agent_runs
      WHERE tenant_id = $tenant_id
        AND agent_name = 'DOMAIN_ENRICHMENT_REQUESTED'
      ORDER BY started_at DESC LIMIT 1`,
    { tenant_id: ctx.tenant_id },
  );
  const run = last.rows[0] ?? null;

  if (researched > 0) {
    return {
      state: 'ready' as ResearchState, industry, domain, families,
      source, researched_at: researchedAt, can_request: false,
      detail: `${families} role ${families === 1 ? 'family' : 'families'} for ${industry}`
        + (source === 'mixed'
            ? `, ${researched} researched and ${families - researched} from Vikuna's starter set.`
            : ', researched for this industry.'),
    };
  }

  // Packs exist, but every one is a generic starter. The list is NOT empty, so
  // an empty-state check would miss this entirely — which is exactly how it
  // went unnoticed. Offer the research.
  if (families > 0 && !(run && (run.status === 'queued' || run.status === 'running'
                                || run.status === 'awaiting'))) {
    return {
      state: 'seeded_only' as ResearchState, industry, domain, families,
      source, researched_at: null, can_request: true,
      detail: `The ${families} families shown are Vikuna's generic starter set, `
        + `not researched for ${industry}.`,
    };
  }

  if (run && (run.status === 'queued' || run.status === 'running')) {
    return {
      state: 'running' as ResearchState, industry, domain, families,
      source, researched_at: null,
      can_request: false,
      started_at: run.started_at,
      detail: `Vara is learning how ${industry} hires. This usually takes a minute.`,
    };
  }

  if (run && run.status === 'awaiting') {
    return {
      state: 'in_review' as ResearchState, industry, domain, families,
      source, researched_at: null,
      can_request: false,
      detail: 'Vara has drafted the role families — they are being reviewed before they go live.',
    };
  }

  if (run && run.status === 'failed') {
    return {
      state: 'failed' as ResearchState, industry, domain, families,
      source, researched_at: null,
      can_request: true,
      // The real cause, not a generic apology. A tenant who can see
      // "the model was unreachable" knows retrying is worth it; one who reads
      // "something went wrong" does not.
      detail: firstLine(run.error_trace) ?? 'The last attempt failed for an unrecorded reason.',
    };
  }

  return {
    state: 'none' as ResearchState, industry, domain, families,
      source, researched_at: null,
    can_request: true,
    detail: `Vara has not studied ${industry} yet.`,
  };
}

/** Error traces carry a stack; the tenant gets the message, never the frames. */
function firstLine(trace: string | null): string | null {
  if (!trace) return null;
  const line = trace.split('\n')[0].trim();
  return line.length > 300 ? `${line.slice(0, 300)}…` : line;
}
