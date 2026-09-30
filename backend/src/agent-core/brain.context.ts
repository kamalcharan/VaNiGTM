/**
 * brain.context — the one way an agent reads the tenant's Brain.
 *
 * ARCH.md §7 / AGENTS.md §3 / POA D2. Before this module each agent assembled
 * its own slice of the Smart Profile with its own SQL and its own trimming.
 * Now the reads live here, in one tenant transaction (so RLS applies under
 * vanigtm_app), and each agent asks for a named PURPOSE.
 *
 * SCOPE, deliberately: it reads only what its callers read today — the
 * profile, the knowledge graph and the approved market vocabulary. Moving an
 * agent here must not change what that agent sends to the model (Charan,
 * 2026-09-30: no drift, nothing unintended). So an agent may take only the
 * DATA (`loadBrain`) and keep its own prompt layout — research and offer
 * drafting do — or a rendered purpose that is proven identical to what it
 * built before (`deck`, tested against the storyteller's old code verbatim).
 * Offers and brand join when an agent that needs them is converted and the
 * change in its output is agreed first.
 *
 * Rules enforced here:
 * 1. THE BUDGET IS THE AUTHORITY. Graph nodes are dropped from the end
 *    until the context fits `roomChars` (from `charBudgetFor`). The profile is never trimmed: if it alone does
 *    not fit, the call is refused with the numbers (BRAIN_CONTEXT_TOO_LARGE).
 * 2. NOTHING IS TRIMMED SILENTLY (rule 12). The result reports dropped
 *    sections and nodes, and when nodes were dropped the text tells the model
 *    so, so it does not speak for what it never saw.
 * 3. ONLY APPROVED VOCABULARY is read; a drafted cluster is never returned
 *    as the tenant's own.
 *
 * A purpose is product content (which parts, in what order) and lives in
 * code beside the agents, like a prompt contract — not deployment config.
 * Inline SQL is agent-core infra (CLAUDE.md rule 6).
 */
import type { Pool, PoolClient } from 'pg';
import { withTenantClient } from '../db/query';
import { charBudgetFor } from './llm.gate';

/* ── What is read ────────────────────────────────────────────────────────── */

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
}

export interface BrainNode { label: string; name: string; description: string | null }
export interface BrainCluster { cluster_type: string; primary_term: string; related_terms: string[] }

export interface BrainData {
  profile: BrainProfile | null;
  /** Every node, in stored order (label, name). */
  nodes: BrainNode[];
  /** Approved, active clusters only. */
  vocabulary: BrainCluster[];
}

/* ── Purposes ────────────────────────────────────────────────────────────── */

export type BrainSection = 'profile' | 'graph';

export interface BrainPurposeSpec {
  /** Sections in order; `profile` first. The graph is always the whole graph. */
  sections: readonly BrainSection[];
}

export const BRAIN_PURPOSES = {
  /** A pitch deck: the whole profile and every graph node — what the storyteller always sent. */
  deck: {
    sections: ['profile', 'graph'],
  },
} as const satisfies Record<string, BrainPurposeSpec>;

export type BrainPurpose = keyof typeof BRAIN_PURPOSES;

/* ── The result ──────────────────────────────────────────────────────────── */

export interface BrainContext {
  purpose: BrainPurpose;
  /** The rendered context, within the budget. */
  text: string;
  graph: { total: number; included: number };
  roomChars: number;
  /** True when graph nodes were left out for size. */
  trimmed: boolean;
}

export class BrainContextError extends Error {
  constructor(public readonly code: 'PROFILE_NOT_FOUND' | 'BRAIN_CONTEXT_TOO_LARGE', message: string) {
    super(`${code}: ${message}`);
    this.name = 'BrainContextError';
  }
}

/* ── Load ────────────────────────────────────────────────────────────────── */

/** `graph: false` skips the node read for callers that never use the graph. */
export async function loadBrain(pool: Pool, tenantId: string, opts: { graph?: boolean } = {}): Promise<BrainData> {
  return withTenantClient(pool, tenantId, (c) => loadBrainWith(c, tenantId, opts.graph !== false));
}

async function loadBrainWith(c: PoolClient, tenantId: string, withGraph: boolean): Promise<BrainData> {
  const profile = await c.query<BrainProfile>(
    `SELECT product_name, product_tagline, product_category, product_description,
            core_problem, key_differentiators, pricing_model, pricing_range,
            icp_role, icp_company_type, icp_company_size, icp_industry, icp_geography,
            primary_pain_points, gtm_stage, active_channels, current_mrr, team_size,
            vision_statement, target_market_size
       FROM gt_tenant_profile WHERE tenant_id = $1`, [tenantId]);

  // Same order kg.store getNodes() used, so the storyteller's trim is unchanged.
  const nodes = withGraph
    ? (await c.query<BrainNode>(
        `SELECT label, name, description FROM gt_kg_nodes
          WHERE tenant_id = $1 ORDER BY label, name`, [tenantId])).rows
    : [];

  // listClusters(approvedOnly)'s filter and order, verbatim — no is_live
  // split, matching every reader of this table today.
  const clusters = await c.query<BrainCluster>(
    `SELECT cluster_type, primary_term, related_terms
       FROM gt_semantic_clusters
      WHERE tenant_id = $1
        AND is_active = true
        AND approved_at IS NOT NULL
      ORDER BY (cluster_type = 'category') DESC, confidence_score DESC NULLS LAST, primary_term`,
    [tenantId]);

  return {
    profile: profile.rows[0] ?? null,
    nodes,
    vocabulary: clusters.rows,
  };
}

/* ── Entry point ─────────────────────────────────────────────────────────── */

export async function brainContext(
  pool: Pool,
  tenantId: string,
  opts: { purpose: BrainPurpose; reserveOutputTokens: number; fixedText: string },
): Promise<BrainContext & { data: BrainData }> {
  const data = await loadBrain(pool, tenantId);
  const room = charBudgetFor(undefined, opts.reserveOutputTokens, opts.fixedText);
  return { ...renderBrain(data, opts.purpose, room), data };
}

/* ── Render (pure — tested without a database) ───────────────────────────── */

export function renderBrain(data: BrainData, purpose: BrainPurpose, roomChars: number): BrainContext {
  if (!data.profile) {
    throw new BrainContextError('PROFILE_NOT_FOUND', 'this tenant has no profile yet — the Brain is empty');
  }
  const spec: BrainPurposeSpec = BRAIN_PURPOSES[purpose];
  const profileText = renderProfile(data.profile);
  const nodes = spec.sections.includes('graph') ? data.nodes : [];

  const assemble = (graphNodes: BrainNode[], dropped: number) =>
    [profileText, renderGraph(graphNodes, dropped)]
      .filter((p): p is string => !!p)
      .join('\n\n');

  // The profile is not negotiable.
  if (profileText.length > roomChars) {
    throw new BrainContextError('BRAIN_CONTEXT_TOO_LARGE',
      `the profile alone is ${profileText.length} chars and only ${roomChars} fit this model's window `
      + 'after the prompt and the answer reserve — shorten the prompt or reserve less for the answer');
  }

  // Largest prefix of the nodes that fits (binary search — hundreds of nodes,
  // and each attempt rebuilds the string). Measured WITHOUT the "N further
  // entries" note, then the note is appended: exactly the storyteller's rule
  // before the move, kept so its decks do not change. The note (~150 chars)
  // sits inside the budget's slack (LLM_BUDGET_SLACK_TOKENS), which exists
  // for this kind of wrapper text.
  let lo = 0;
  let hi = nodes.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (assemble(nodes.slice(0, mid), 0).length <= roomChars) lo = mid;
    else hi = mid - 1;
  }
  const graphNodes = nodes.slice(0, lo);
  const droppedNodes = nodes.length - lo;
  const text = assemble(graphNodes, droppedNodes);
  if (droppedNodes > 0) {
    console.log(`[Brain] ${purpose}: ${lo} of ${nodes.length} graph nodes fit ${roomChars} chars`);
  }

  return {
    purpose, text,
    graph: { total: nodes.length, included: lo },
    roomChars, trimmed: droppedNodes > 0,
  };
}

/* ── Section renderers ───────────────────────────────────────────────────── */

const sv = (v: string | null | undefined): string | null => {
  const t = (v ?? '').toString().trim();
  return t.length ? t : null;
};
const lv = (a: string[] | null | undefined): string | null => {
  if (!a || !a.length) return null;
  const joined = a.map((x) => (x ?? '').trim()).filter((x) => x.length).join(', ');
  return joined.length ? joined : null;
};
const inline = (parts: (string | null | false)[]): string | null => {
  const kept = parts.filter((p): p is string => !!p);
  return kept.length ? kept.join('  |  ') : null;
};

/** PRODUCT / IDEAL CUSTOMER / GO-TO-MARKET / VISION — the storyteller's layout, unchanged. */
export function renderProfile(p: BrainProfile): string {
  const s = sv;
  const list = lv;
  const sections: string[] = [];
  {
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
  {
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
  {
    const head = inline([
      s(p.gtm_stage)          && `Stage: ${s(p.gtm_stage)}`,
      list(p.active_channels) && `Channels: ${list(p.active_channels)}`,
      s(p.current_mrr)        && `MRR: ${s(p.current_mrr)}`,
      p.team_size != null ? `Team: ${p.team_size}` : null,
    ]);
    if (head) sections.push(`GO-TO-MARKET\n${head}`);
  }
  {
    const head = inline([
      s(p.vision_statement)   && `Statement: ${s(p.vision_statement)}`,
      s(p.target_market_size) && `Market size: ${s(p.target_market_size)}`,
    ]);
    if (head) sections.push(`VISION\n${head}`);
  }
  return sections.join('\n\n');
}

/** The storyteller's graph block and trim note, word for word. */
function renderGraph(nodes: BrainNode[], dropped: number): string | null {
  const note = dropped > 0
    ? `[${dropped} further knowledge-graph entries exist and were not included — `
      + `they did not fit this model's context. Do not claim completeness.]`
    : null;
  if (!nodes.length) return note;
  const lines = nodes.map((n) => {
    const d = sv(n.description);
    return `[${n.label}] ${n.name}${d ? ` — ${d}` : ''}`;
  });
  return `KNOWLEDGE GRAPH\n${lines.join('\n')}${note ? `\n\n${note}` : ''}`;
}
