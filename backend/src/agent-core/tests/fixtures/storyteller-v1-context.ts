/**
 * The storyteller's context builder as it was on main at 5579b2d, copied
 * VERBATIM (git show 5579b2d:backend/src/skills/storyteller-skill/storyteller.agent.ts).
 * It exists only so brain-context.test.ts can prove the `deck` purpose sends
 * the model exactly what the storyteller sent before it moved to brain.context.
 * Do not edit it to make a test pass — that would defeat its purpose.
 */
/* eslint-disable */
import type { TenantProfile } from '../../../skills/profile-skill/profile.service';
import type { KGNode } from '../../kg.store';

export function oldDeckContext(profile: TenantProfile, nodes: KGNode[], roomChars: number): string {
  return fitContext(profile, nodes, roomChars);
}

function fitContext(profile: TenantProfile, nodes: KGNode[], roomChars: number): string {
  const full = serializeContext(profile, nodes);
  if (full.length <= roomChars) return full;

  // Halve the node list until it fits. Binary rather than one-by-one because
  // this runs on a few hundred nodes and each attempt rebuilds the string.
  let lo = 0;
  let hi = nodes.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (serializeContext(profile, nodes.slice(0, mid)).length <= roomChars) lo = mid;
    else hi = mid - 1;
  }

  const kept = nodes.slice(0, lo);
  const dropped = nodes.length - kept.length;
  console.log(`[Storyteller] knowledge graph trimmed: ${kept.length} of ${nodes.length} nodes `
    + `fit the model window (${roomChars} chars)`);
  const body = serializeContext(profile, kept);
  return dropped > 0
    ? `${body}\n\n[${dropped} further knowledge-graph entries exist and were not included — `
      + `they did not fit this model's context. Do not claim completeness.]`
    : body;
}

function serializeContext(profile: TenantProfile, nodes: KGNode[]): string {
  const sections: string[] = [];

  // trimmed scalar, or null if empty
  const s = (v: string | null | undefined): string | null => {
    const t = (v ?? '').toString().trim();
    return t.length ? t : null;
  };
  // TEXT[] joined with ', ', or null if empty
  const list = (a: string[] | null | undefined): string | null => {
    if (!a || a.length === 0) return null;
    const joined = a.map((x) => (x ?? '').trim()).filter((x) => x.length).join(', ');
    return joined.length ? joined : null;
  };
  // join present labelled parts with a separator, or null if none
  const inline = (parts: (string | null)[]): string | null => {
    const kept = parts.filter((p): p is string => !!p);
    return kept.length ? kept.join('  |  ') : null;
  };

  // PRODUCT
  {
    const lines: string[] = [];
    const head = inline([
      s(profile.product_name)     && `Name: ${s(profile.product_name)}`,
      s(profile.product_tagline)  && `Tagline: ${s(profile.product_tagline)}`,
      s(profile.product_category) && `Category: ${s(profile.product_category)}`,
    ]);
    if (head) lines.push(head);
    if (s(profile.product_description)) lines.push(`Description: ${s(profile.product_description)}`);
    if (s(profile.core_problem))        lines.push(`Core problem: ${s(profile.core_problem)}`);
    if (list(profile.key_differentiators)) lines.push(`Differentiators: ${list(profile.key_differentiators)}`);
    const pricing = [s(profile.pricing_model), s(profile.pricing_range)].filter(Boolean).join(' / ');
    if (pricing) lines.push(`Pricing: ${pricing}`);
    if (lines.length) sections.push(`PRODUCT\n${lines.join('\n')}`);
  }

  // IDEAL CUSTOMER
  {
    const lines: string[] = [];
    const company = [s(profile.icp_company_type), s(profile.icp_company_size), s(profile.icp_industry)]
      .filter(Boolean).join(', ');
    const head = inline([
      s(profile.icp_role)      && `Role: ${s(profile.icp_role)}`,
      company                  ? `Company: ${company}` : null,
      s(profile.icp_geography) && `Geography: ${s(profile.icp_geography)}`,
    ]);
    if (head) lines.push(head);
    if (list(profile.primary_pain_points)) lines.push(`Pain points: ${list(profile.primary_pain_points)}`);
    if (lines.length) sections.push(`IDEAL CUSTOMER\n${lines.join('\n')}`);
  }

  // GO-TO-MARKET
  {
    const head = inline([
      s(profile.gtm_stage)          && `Stage: ${s(profile.gtm_stage)}`,
      list(profile.active_channels) && `Channels: ${list(profile.active_channels)}`,
      s(profile.current_mrr)        && `MRR: ${s(profile.current_mrr)}`,
      profile.team_size != null ? `Team: ${profile.team_size}` : null,
    ]);
    if (head) sections.push(`GO-TO-MARKET\n${head}`);
  }

  // VISION
  {
    const head = inline([
      s(profile.vision_statement)   && `Statement: ${s(profile.vision_statement)}`,
      s(profile.target_market_size) && `Market size: ${s(profile.target_market_size)}`,
    ]);
    if (head) sections.push(`VISION\n${head}`);
  }

  // KNOWLEDGE GRAPH — one line per node; omit null description.
  {
    const lines = nodes.map((n) => {
      const d = s(n.description);
      return `[${n.label}] ${n.name}${d ? ` — ${d}` : ''}`;
    });
    if (lines.length) sections.push(`KNOWLEDGE GRAPH\n${lines.join('\n')}`);
  }

  return sections.join('\n\n');
}
