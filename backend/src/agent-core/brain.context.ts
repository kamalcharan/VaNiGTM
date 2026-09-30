/**
 * brain.context(purpose) — the one way an agent reads the tenant's Brain.
 *
 * ARCH.md §7 / AGENTS.md §3 / POA D2. The Brain is the Smart Profile:
 * gt_tenant_profile, the knowledge graph (gt_kg_nodes), the approved market
 * vocabulary (gt_semantic_clusters), confirmed offers (gt_offers) and the
 * approved brand (gt_tenant_brand). Before this module each agent assembled
 * its own slice — the storyteller pasted every node, research read only the
 * clusters, Vara read only the industry — so "what does VaNi know about this
 * tenant" had as many answers as there were agents.
 *
 * Three rules, each enforced here rather than left to callers:
 *
 * 1. ONLY WHAT A HUMAN CONFIRMED is presented as the tenant's own: approved
 *    clusters, confirmed active offers, an approved brand. An unconfirmed
 *    draft is left out and the omission is reported in `missing` — an agent
 *    that pitches an offer nobody confirmed is speaking for the tenant
 *    without leave. (The profile itself is included either way, as every
 *    agent did before; `profileApproved` says which it was.)
 *
 * 2. THE BUDGET IS THE AUTHORITY. The caller passes what is already fixed
 *    (its system prompt) and what it reserves for the answer; the context is
 *    built to fit `charBudgetFor` of the rest. Sections are dropped whole in
 *    reverse priority, graph nodes from the lowest-priority label up. The
 *    profile is never trimmed: if it alone does not fit, the call is refused
 *    with the numbers (BRAIN_CONTEXT_TOO_LARGE) — a context with no profile
 *    is not a smaller version of the question, it is a different one.
 *
 * 3. NOTHING IS TRIMMED SILENTLY (rule 12). The result reports every section
 *    and node count it left out, and when graph nodes were dropped the text
 *    itself tells the model so, so it does not speak for what it never saw.
 *
 * Relevance is by LABEL PRIORITY per purpose for now; retrieval by embedding
 * with a vocabulary boost is D4 and slots in behind the same signature.
 *
 * A purpose is product content — which parts of the Brain a job needs, in
 * what order — and lives in code beside the agents, like a prompt contract.
 * It is not deployment configuration.
 *
 * Reads run in ONE tenant transaction (withTenantClient), so the sections
 * are a consistent snapshot and RLS applies once the runtime role is
 * vanigtm_app. Inline SQL is agent-core infra (CLAUDE.md rule 6).
 */
import type { Pool, PoolClient } from 'pg';
import { withTenantClient } from '../db/query';
import { charBudgetFor } from './llm.gate';

/* ── What the Brain holds ────────────────────────────────────────────────── */

export interface BrainProfile {
  product_name: string | null;
  product_tagline: string | null;
  product_category: string | null;
  product_description: string | null;
  core_problem: string | null;
  key_differentiators: string[] | null;
  pricing_model: string | null;
  pricing_range: string | null;
  icp_role: string | null;
  icp_company_type: string | null;
  icp_company_size: string | null;
  icp_industry: string | null;
  icp_geography: string | null;
  primary_pain_points: string[] | null;
  gtm_stage: string | null;
  active_channels: string[] | null;
  current_mrr: string | null;
  team_size: number | null;
  vision_statement: string | null;
  target_market_size: string | null;
  approved_at: Date | null;
}

export interface BrainNode { label: string; name: string; description: string | null }
export interface BrainCluster { cluster_type: string; primary_term: string; related_terms: string[] }
export interface BrainOffer {
  offer_key: string; name: string; one_line: string; who_for: string; problem: string;
  what_we_do: string[]; price_band: string | null; proof: string | null;
}
export interface BrainBrand {
  voice_tone: string[] | null; always_say: string[] | null;
  never_say: string[] | null; proof: string[] | null;
}

export interface BrainData {
  profile: BrainProfile | null;
  nodes: BrainNode[];
  /** Approved, active clusters only. */
  vocabulary: BrainCluster[];
  /** Confirmed, active offers only. */
  offers: BrainOffer[];
  /** The brand when approved, else null. */
  brand: BrainBrand | null;
  /** What exists but was not confirmed — reported, never presented. */
  unconfirmed: { clusters: number; offers: number; brand: boolean };
}

/* ── Purposes ────────────────────────────────────────────────────────────── */

export type BrainSection = 'profile' | 'brand' | 'offers' | 'vocabulary' | 'graph';

export type ProfilePart = 'product' | 'customer' | 'gtm' | 'vision';

export interface BrainPurposeSpec {
  /** Sections in priority order; the first is kept longest. `profile` is always first. */
  sections: readonly BrainSection[];
  /** Graph labels in priority order. Labels not listed are not included at all. */
  graphLabels: readonly string[];
  /** Which parts of the profile, and a per-field character cap. Default: all parts, uncapped. */
  profile?: { parts: readonly ProfilePart[]; fieldCap?: number; listCap?: number };
}

export const BRAIN_PURPOSES = {
  /** A pitch deck: what it is, who for, why it wins, proof, in the tenant's voice. */
  deck: {
    sections: ['profile', 'brand', 'offers', 'graph', 'vocabulary'],
    graphLabels: [
      'Differentiator', 'CaseStudy', 'Metric', 'Product', 'Feature', 'PainPoint',
      'UseCase', 'ICP', 'Industry', 'Pricing', 'Competitor', 'Team',
    ],
  },
  /**
   * Framing competitor searches: what the product is, who buys it, and the
   * vocabulary those buyers use. The gist, not the essay — long fields are
   * clipped, because the same profile block rides beside search results and
   * candidate websites that need the room more.
   */
  competitor_research: {
    sections: ['profile', 'vocabulary'],
    graphLabels: [],
    profile: { parts: ['product', 'customer'], fieldCap: 400, listCap: 5 },
  },
  /** Judging a candidate or a search result against the tenant: the profile gist only. */
  competitor_check: {
    sections: ['profile'],
    graphLabels: [],
    profile: { parts: ['product', 'customer'], fieldCap: 400, listCap: 5 },
  },
  /**
   * Drafting what the tenant sells from their site text: what the product is
   * and the offers already confirmed, so the draft does not repeat them.
   */
  offer_draft: {
    sections: ['profile', 'offers'],
    graphLabels: [],
    profile: { parts: ['product'], fieldCap: 600, listCap: 5 },
  },
} as const satisfies Record<string, BrainPurposeSpec>;

export type BrainPurpose = keyof typeof BRAIN_PURPOSES;

/* ── The result ──────────────────────────────────────────────────────────── */

export interface BrainContext {
  purpose: BrainPurpose;
  /** The rendered context, within the budget. */
  text: string;
  profileApproved: boolean;
  /** Sections that had content and were included. */
  included: BrainSection[];
  /** Sections that had content but did not fit. */
  droppedSections: BrainSection[];
  graph: { eligible: number; included: number; droppedByLabel: Record<string, number> };
  /** Human-readable: what exists but was left out as unconfirmed, or is absent. */
  missing: string[];
  roomChars: number;
  /** True when anything with content was left out for size. */
  trimmed: boolean;
  /** The structured data the text was rendered from, for callers that need fields. */
  data: BrainData;
}

export class BrainContextError extends Error {
  constructor(public readonly code: 'PROFILE_NOT_FOUND' | 'BRAIN_CONTEXT_TOO_LARGE', message: string) {
    super(`${code}: ${message}`);
    this.name = 'BrainContextError';
  }
}

/* ── Load ────────────────────────────────────────────────────────────────── */

export async function loadBrain(pool: Pool, tenantId: string): Promise<BrainData> {
  return withTenantClient(pool, tenantId, (c) => loadBrainWith(c, tenantId));
}

async function loadBrainWith(c: PoolClient, tenantId: string): Promise<BrainData> {
  const profile = await c.query<BrainProfile>(
    `SELECT product_name, product_tagline, product_category, product_description,
            core_problem, key_differentiators, pricing_model, pricing_range,
            icp_role, icp_company_type, icp_company_size, icp_industry, icp_geography,
            primary_pain_points, gtm_stage, active_channels, current_mrr, team_size,
            vision_statement, target_market_size, approved_at
       FROM gt_tenant_profile WHERE tenant_id = $1`, [tenantId]);

  const nodes = await c.query<BrainNode>(
    `SELECT label, name, description FROM gt_kg_nodes
      WHERE tenant_id = $1
      ORDER BY label, updated_at DESC, name`, [tenantId]);

  // Same filter as listClusters(approvedOnly) — no is_live split, matching
  // every other reader of this table today.
  const clusters = await c.query<BrainCluster & { approved: boolean }>(
    `SELECT cluster_type, primary_term, related_terms, approved_at IS NOT NULL AS approved
       FROM gt_semantic_clusters
      WHERE tenant_id = $1 AND is_active = true
      ORDER BY (cluster_type = 'category') DESC, confidence_score DESC NULLS LAST, primary_term`,
    [tenantId]);

  const offers = await c.query<BrainOffer & { confirmed: boolean }>(
    `SELECT offer_key, name, one_line, who_for, problem, what_we_do, price_band, proof,
            confirmed_at IS NOT NULL AS confirmed
       FROM gt_offers
      WHERE tenant_id = $1 AND is_active = true
      ORDER BY sort_order, name`, [tenantId]);

  const brand = await c.query<BrainBrand & { approved: boolean }>(
    `SELECT voice_tone, always_say, never_say, proof, approved_at IS NOT NULL AS approved
       FROM gt_tenant_brand WHERE tenant_id = $1`, [tenantId]);

  const b = brand.rows[0];
  return {
    profile: profile.rows[0] ?? null,
    nodes: nodes.rows,
    vocabulary: clusters.rows.filter((r) => r.approved)
      .map(({ cluster_type, primary_term, related_terms }) => ({ cluster_type, primary_term, related_terms })),
    offers: offers.rows.filter((r) => r.confirmed)
      .map(({ confirmed: _c, ...o }) => o),
    brand: b?.approved
      ? { voice_tone: b.voice_tone, always_say: b.always_say, never_say: b.never_say, proof: b.proof }
      : null,
    unconfirmed: {
      clusters: clusters.rows.filter((r) => !r.approved).length,
      offers: offers.rows.filter((r) => !r.confirmed).length,
      brand: !!b && !b.approved,
    },
  };
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

export async function brainContext(
  pool: Pool,
  tenantId: string,
  opts: { purpose: BrainPurpose; reserveOutputTokens: number; fixedText: string },
): Promise<BrainContext> {
  const data = await loadBrain(pool, tenantId);
  const room = charBudgetFor(undefined, opts.reserveOutputTokens, opts.fixedText);
  return renderBrain(data, opts.purpose, room);
}

/* ── Render (pure — tested without a database) ───────────────────────────── */

export function renderBrain(data: BrainData, purpose: BrainPurpose, roomChars: number): BrainContext {
  if (!data.profile) {
    throw new BrainContextError('PROFILE_NOT_FOUND', 'this tenant has no profile yet — the Brain is empty');
  }
  const spec: BrainPurposeSpec = BRAIN_PURPOSES[purpose];
  const profile = data.profile;

  // Reported only for sections this purpose uses — a missing brand is not
  // news to a job that never reads the brand.
  const uses = (sec: BrainSection) => spec.sections.includes(sec);
  const missing: string[] = [];
  if (uses('vocabulary') && !data.vocabulary.length) {
    missing.push(data.unconfirmed.clusters
      ? `vocabulary: ${data.unconfirmed.clusters} cluster(s) drafted, none approved`
      : 'vocabulary: none yet');
  }
  if (uses('offers')) {
    if (!data.offers.length) {
      missing.push(data.unconfirmed.offers
        ? `offers: ${data.unconfirmed.offers} drafted, none confirmed`
        : 'offers: none yet');
    } else if (data.unconfirmed.offers) {
      missing.push(`offers: ${data.unconfirmed.offers} more drafted but not confirmed`);
    }
  }
  if (uses('brand') && !data.brand) missing.push(data.unconfirmed.brand ? 'brand: drafted, not approved' : 'brand: none yet');

  // Graph nodes eligible for this purpose, in priority order.
  const rank = new Map(spec.graphLabels.map((l, i) => [l, i]));
  const eligible = data.nodes
    .filter((n) => rank.has(n.label))
    .sort((a, b) => (rank.get(a.label)! - rank.get(b.label)!));
  if (!eligible.length && uses('graph')) missing.push('knowledge graph: nothing relevant yet');

  const blocks: Record<BrainSection, string | null> = {
    profile:    renderProfile(profile, spec.profile),
    brand:      data.brand ? renderBrand(data.brand) : null,
    offers:     data.offers.length ? renderOffers(data.offers) : null,
    vocabulary: data.vocabulary.length ? renderVocabulary(data.vocabulary) : null,
    graph:      null,   // sized below
  };

  const present = spec.sections.filter((s) => s === 'graph' ? eligible.length > 0 : !!blocks[s]);
  const join = (parts: (string | null)[]) => parts.filter((p): p is string => !!p).join('\n\n');
  const assemble = (sections: BrainSection[], graphNodes: BrainNode[], dropped: number) =>
    join(spec.sections.filter((s) => sections.includes(s)).map((s) =>
      s === 'graph' ? renderGraph(graphNodes, dropped) : blocks[s]));

  // The profile is not negotiable.
  const profileOnly = assemble(['profile'], [], 0);
  if (profileOnly.length > roomChars) {
    throw new BrainContextError('BRAIN_CONTEXT_TOO_LARGE',
      `the profile alone is ${profileOnly.length} chars and only ${roomChars} fit this model's window `
      + 'after the prompt and the answer reserve — shorten the prompt or reserve less for the answer');
  }

  // Keep sections in priority order while the WHOLE of each fits; the graph
  // may be partially kept. Sections after a partial graph still get a chance
  // if they fit in what is left.
  let kept: BrainSection[] = ['profile'];
  let graphNodes: BrainNode[] = [];
  const droppedSections: BrainSection[] = [];
  for (const s of present) {
    if (s === 'profile') continue;
    if (s !== 'graph') {
      const tryKept = [...kept, s];
      if (assemble(tryKept, graphNodes, eligible.length - graphNodes.length).length <= roomChars) kept = tryKept;
      else droppedSections.push(s);
      continue;
    }
    // Largest prefix of the eligible nodes that fits (binary search — the
    // list can be hundreds long and each attempt rebuilds the string).
    let lo = 0;
    let hi = eligible.length;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      const t = assemble([...kept, 'graph'], eligible.slice(0, mid), eligible.length - mid);
      if (t.length <= roomChars) lo = mid; else hi = mid - 1;
    }
    if (lo > 0) { kept = [...kept, 'graph']; graphNodes = eligible.slice(0, lo); }
    else droppedSections.push('graph');
  }

  const droppedNodes = eligible.slice(graphNodes.length);
  const droppedByLabel: Record<string, number> = {};
  for (const n of droppedNodes) droppedByLabel[n.label] = (droppedByLabel[n.label] ?? 0) + 1;

  const text = assemble(kept, graphNodes, droppedNodes.length);
  const trimmed = droppedSections.length > 0 || droppedNodes.length > 0;
  if (trimmed) {
    console.log(`[Brain] ${purpose}: fit ${roomChars} chars — kept ${kept.join(', ')}`
      + (droppedSections.length ? `; dropped sections ${droppedSections.join(', ')}` : '')
      + (droppedNodes.length ? `; ${graphNodes.length} of ${eligible.length} graph nodes` : ''));
  }

  return {
    purpose,
    text,
    profileApproved: !!profile.approved_at,
    included: kept,
    droppedSections,
    graph: { eligible: eligible.length, included: graphNodes.length, droppedByLabel },
    missing,
    roomChars,
    trimmed,
    data,
  };
}

/* ── Section renderers ───────────────────────────────────────────────────── */

const sv = (v: string | null | undefined): string | null => {
  const t = (v ?? '').toString().trim();
  return t.length ? t : null;
};
const s = sv;
const lv = (a: string[] | null | undefined): string | null => {
  if (!a || !a.length) return null;
  const joined = a.map((x) => (x ?? '').trim()).filter((x) => x.length).join(', ');
  return joined.length ? joined : null;
};
const list = lv;
const inline = (parts: (string | null | false)[]): string | null => {
  const kept = parts.filter((p): p is string => !!p);
  return kept.length ? kept.join('  |  ') : null;
};

/** PRODUCT / IDEAL CUSTOMER / GO-TO-MARKET / VISION — the storyteller's layout, kept. */
export function renderProfile(
  p: BrainProfile,
  opts: { parts: readonly ProfilePart[]; fieldCap?: number; listCap?: number } = { parts: ['product', 'customer', 'gtm', 'vision'] },
): string {
  const want = new Set(opts.parts);
  // Clipping is marked with an ellipsis, so the model can tell a field was cut.
  const s = (v: string | null | undefined): string | null => {
    const t = sv(v);
    return t && opts.fieldCap && t.length > opts.fieldCap ? `${t.slice(0, opts.fieldCap)}…` : t;
  };
  const list = (a: string[] | null | undefined): string | null =>
    lv(opts.listCap && a ? a.slice(0, opts.listCap) : a);
  const sections: string[] = [];
  if (want.has('product')) {
    const lines: string[] = [];
    const head = inline([
      s(p.product_name)     && `Name: ${s(p.product_name)}`,
      s(p.product_tagline)  && `Tagline: ${s(p.product_tagline)}`,
      s(p.product_category) && `Category: ${s(p.product_category)}`,
    ]);
    if (head) lines.push(head);
    if (s(p.product_description)) lines.push(`Description: ${s(p.product_description)}`);
    if (s(p.core_problem))        lines.push(`Core problem: ${s(p.core_problem)}`);
    if (list(p.key_differentiators)) lines.push(`Differentiators: ${list(p.key_differentiators)}`);
    const pricing = [s(p.pricing_model), s(p.pricing_range)].filter(Boolean).join(' / ');
    if (pricing) lines.push(`Pricing: ${pricing}`);
    if (lines.length) sections.push(`PRODUCT\n${lines.join('\n')}`);
  }
  if (want.has('customer')) {
    const lines: string[] = [];
    const company = [s(p.icp_company_type), s(p.icp_company_size), s(p.icp_industry)].filter(Boolean).join(', ');
    const head = inline([
      s(p.icp_role)      && `Role: ${s(p.icp_role)}`,
      company            ? `Company: ${company}` : null,
      s(p.icp_geography) && `Geography: ${s(p.icp_geography)}`,
    ]);
    if (head) lines.push(head);
    if (list(p.primary_pain_points)) lines.push(`Pain points: ${list(p.primary_pain_points)}`);
    if (lines.length) sections.push(`IDEAL CUSTOMER\n${lines.join('\n')}`);
  }
  if (want.has('gtm')) {
    const head = inline([
      s(p.gtm_stage)          && `Stage: ${s(p.gtm_stage)}`,
      list(p.active_channels) && `Channels: ${list(p.active_channels)}`,
      s(p.current_mrr)        && `MRR: ${s(p.current_mrr)}`,
      p.team_size != null ? `Team: ${p.team_size}` : null,
    ]);
    if (head) sections.push(`GO-TO-MARKET\n${head}`);
  }
  if (want.has('vision')) {
    const head = inline([
      s(p.vision_statement)   && `Statement: ${s(p.vision_statement)}`,
      s(p.target_market_size) && `Market size: ${s(p.target_market_size)}`,
    ]);
    if (head) sections.push(`VISION\n${head}`);
  }
  // A profile with nothing in it still renders as a heading, so the model is
  // told the profile is empty rather than handed no context at all.
  return sections.length ? sections.join('\n\n') : 'PRODUCT\n(no profile fields captured yet)';
}

function renderBrand(b: BrainBrand): string | null {
  const lines = [
    list(b.voice_tone) && `Voice: ${list(b.voice_tone)}`,
    list(b.always_say) && `Always say: ${list(b.always_say)}`,
    list(b.never_say)  && `Never say: ${list(b.never_say)}`,
    list(b.proof)      && `Proof: ${list(b.proof)}`,
  ].filter((l): l is string => !!l);
  return lines.length ? `BRAND (approved)\n${lines.join('\n')}` : null;
}

function renderOffers(offers: BrainOffer[]): string {
  const lines = offers.map((o) => {
    const parts = [
      `${o.name} — ${o.one_line}`,
      `  For: ${o.who_for}`,
      `  Problem: ${o.problem}`,
      list(o.what_we_do) && `  What we do: ${list(o.what_we_do)}`,
      s(o.price_band)    && `  Price: ${s(o.price_band)}`,
      s(o.proof)         && `  Proof: ${s(o.proof)}`,
    ].filter((l): l is string => !!l);
    return parts.join('\n');
  });
  return `OFFERS (confirmed)\n${lines.join('\n')}`;
}

function renderVocabulary(v: BrainCluster[]): string {
  return `MARKET VOCABULARY (approved)\n${v.map((c) =>
    `- [${c.cluster_type}] ${c.primary_term}${c.related_terms.length ? `: ${c.related_terms.join(', ')}` : ''}`,
  ).join('\n')}`;
}

function renderGraph(nodes: BrainNode[], dropped: number): string | null {
  if (!nodes.length) return null;
  const lines = nodes.map((n) => {
    const d = s(n.description);
    return `[${n.label}] ${n.name}${d ? ` — ${d}` : ''}`;
  });
  const note = dropped > 0
    ? `\n[${dropped} further knowledge-graph entries exist and were not included — `
      + `they did not fit this model's context. Do not claim completeness.]`
    : '';
  return `KNOWLEDGE GRAPH\n${lines.join('\n')}${note}`;
}
