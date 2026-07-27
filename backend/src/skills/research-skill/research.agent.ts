/**
 * Competitor Research Agent — GTM pipeline v2, stage 1.
 *
 * Competitors almost never appear on a tenant's own website; they must be
 * RESEARCHED outward from the profile/ICP. This agent:
 *
 *   1. loads the drafted profile (product, ICP, pains)
 *   2. frames web-search queries with the LLM
 *   3. searches via self-hosted SearXNG (agent-core/search.client)
 *   4. shortlists candidate vendors from the results
 *   5. verifies each candidate against its REAL site (static fetch via
 *      IngestionAgent.fetchUrlText) and has the LLM judge fit — this is
 *      the anti-hallucination gate: a name the model invented dies here
 *   6. writes verified competitors into the KG as Competitor nodes
 *      (properties: source/domain/verified/angle, confirmed=false) with a
 *      Company —DIFFERENTIATES_FROM→ Competitor edge
 *
 * The human rules on the map in the wizard (keep/remove → /competitors/
 * confirm). Every step lands in gt_agent_runs.steps for the live feed.
 *
 * Failure posture (CLAUDE.md rule 12): missing profile or search config
 * fails the run loudly. A single candidate whose site can't be read is
 * NOT a failure — it is kept, marked verified=false, recorded as a
 * visible step, and left to the human gate.
 */

import type { Pool } from 'pg';
import { z } from 'zod';
import { createTenantDb } from '../../db';
import { appendStep, setStatus } from '../../agent-core/agent.runner';
import { callLLMValidated } from '../../agent-core/llm.client';
import { searchWeb, type WebSearchResult } from '../../agent-core/search.client';
import { upsertNode, upsertEdge } from '../../agent-core/kg.store';
import { IngestionAgent } from '../ingestion-skill/ingestion.agent';

const MAX_QUERIES = 4;
const RESULTS_PER_QUERY = 8;
const MAX_VERIFY = 6;          // candidates whose sites we actually read
const SITE_TEXT_CAP = 4_000;   // chars of candidate-site text shown to the LLM

const QueriesSchema = z.object({
  queries: z.array(z.string().min(3)).min(1).max(MAX_QUERIES),
});

const CandidatesSchema = z.object({
  candidates: z.array(z.object({
    name: z.string().min(1),
    domain: z.string().nullable(),
    reason: z.string(),
  })).max(10),
});

const AssessmentSchema = z.object({
  is_competitor: z.boolean(),
  positioning: z.string(),
  angle: z.string(),
});

interface ProfileRow {
  product_name: string | null;
  product_description: string | null;
  core_problem: string | null;
  key_differentiators: string[] | null;
  icp_role: string | null;
  icp_company_type: string | null;
  icp_industry: string | null;
  primary_pain_points: string[] | null;
}

export class CompetitorResearchAgent {
  static async run(
    pool: Pool,
    tenantId: string,
    _payload: Record<string, unknown>,
    runId: string,
  ): Promise<void> {
    const db = createTenantDb(pool, tenantId);

    // 1. PROFILE — research is framed by it; without one there is nothing
    //    to research against.
    const profileResult = await db.query<ProfileRow>(
      `SELECT product_name, product_description, core_problem,
              key_differentiators, icp_role, icp_company_type,
              icp_industry, primary_pain_points
         FROM gt_tenant_profile
        WHERE tenant_id = $tenant_id`,
      { tenant_id: tenantId },
    );
    const profile = profileResult.rows[0];
    if (!profile?.product_name && !profile?.product_description) {
      throw new Error(
        'PROFILE_NOT_FOUND: competitor research needs a drafted profile — run website research first',
      );
    }

    await appendStep(pool, runId, {
      step_name: 'load_profile',
      action: `Framing research around ${profile.product_name ?? 'your product'}`,
      status: 'ok',
    });

    // Own domains — never propose the tenant to themselves.
    const ownSources = await db.query<{ url: string | null }>(
      `SELECT url FROM gt_kb_sources
        WHERE tenant_id = $tenant_id AND source_type = 'url'`,
      { tenant_id: tenantId },
    );
    const ownDomains = new Set(
      ownSources.rows
        .map((r) => hostnameOf(r.url))
        .filter((h): h is string => Boolean(h)),
    );

    const profileContext = JSON.stringify({
      product_name: profile.product_name,
      product_description: profile.product_description,
      core_problem: profile.core_problem,
      key_differentiators: profile.key_differentiators,
      icp_role: profile.icp_role,
      icp_company_type: profile.icp_company_type,
      icp_industry: profile.icp_industry,
      primary_pain_points: profile.primary_pain_points,
    }, null, 2);

    // 2. FRAME QUERIES
    const { queries } = await callLLMValidated(
      {
        pool, tenantId, runId,
        system:
          'You are a competitive-intelligence researcher. Given a company profile, ' +
          'write web-search queries that will surface its direct competitors — ' +
          'vendors a buyer would evaluate instead. Prefer queries like ' +
          '"<category> tools for <buyer>", "<product-type> alternatives", ' +
          '"top <category> companies <industry>". Respond with ONLY JSON inside ' +
          `<queries> tags: <queries>{"queries": ["...", "..."]}</queries>. Max ${MAX_QUERIES} queries.`,
        messages: [{ role: 'user', content: `Company profile:\n${profileContext}` }],
        maxTokens: 300,
      },
      QueriesSchema,
      'queries',
    );

    await appendStep(pool, runId, {
      step_name: 'frame_queries',
      action: 'Framed the competitive landscape',
      output_summary: queries.map((q) => `"${q}"`).join(' · '),
      status: 'ok',
    });

    // 3. SEARCH — every query is a visible step; a failed search fails the
    //    run (config/instance problem the user must see, not paper over).
    const seen = new Map<string, WebSearchResult>();
    for (const query of queries) {
      const results = await searchWeb(query, RESULTS_PER_QUERY);
      for (const r of results) {
        const host = hostnameOf(r.url);
        if (!host || ownDomains.has(host)) continue;
        if (!seen.has(r.url)) seen.set(r.url, r);
      }
      await appendStep(pool, runId, {
        step_name: 'web_search',
        action: `Searched: "${query}"`,
        output_summary: `${results.length} results`,
        status: 'ok',
      });
    }
    const results = [...seen.values()].slice(0, 30);
    if (results.length === 0) {
      throw new Error(
        'SEARCH_EMPTY: every query returned zero results — check the SearXNG ' +
        'instance and its enabled engines (docs/searxng-setup.md)',
      );
    }

    // 4. SHORTLIST candidate vendors from the result set. Listicles and
    //    review sites are useful EVIDENCE (they name vendors) but are not
    //    themselves candidates.
    const resultsBlock = results
      .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet}`)
      .join('\n');

    const { candidates } = await callLLMValidated(
      {
        pool, tenantId, runId,
        system:
          'You are a competitive-intelligence researcher. From the search results, ' +
          'identify actual VENDOR companies that compete with the profiled company — ' +
          'products a buyer would evaluate instead. Directories, listicles, review ' +
          'sites (G2, Capterra, Wikipedia, Reddit, LinkedIn) are evidence, never ' +
          'candidates. For each candidate give its primary domain ONLY if it appears ' +
          'in the results (a result URL or clearly stated); otherwise use null — ' +
          'NEVER guess a domain. Respond with ONLY JSON inside <candidates> tags: ' +
          '<candidates>{"candidates": [{"name": "...", "domain": "example.com" | null, ' +
          '"reason": "why this competes"}]}</candidates>. Max 8, best first.',
        messages: [{
          role: 'user',
          content: `Company profile:\n${profileContext}\n\nSearch results:\n${resultsBlock}`,
        }],
        maxTokens: 800,
      },
      CandidatesSchema,
      'candidates',
    );

    await appendStep(pool, runId, {
      step_name: 'shortlist',
      action: 'Shortlisted candidate competitors',
      output_summary: candidates.length > 0
        ? candidates.map((c) => c.name).join(', ')
        : 'none found in the results',
      status: candidates.length > 0 ? 'ok' : 'skipped',
    });

    // 5. VERIFY each candidate against its real site + judge fit.
    const accepted: Array<{
      name: string;
      domain: string | null;
      description: string;
      angle: string | null;
      verified: boolean;
      evidenceUrl: string | null;
    }> = [];

    let verified = 0;
    for (const candidate of candidates) {
      const domain = normalizeDomain(candidate.domain);

      if (!domain || verified >= MAX_VERIFY) {
        // No verifiable domain (or over the read cap): keep for the human
        // gate, transparently marked unverified.
        accepted.push({
          name: candidate.name,
          domain,
          description: candidate.reason,
          angle: null,
          verified: false,
          evidenceUrl: null,
        });
        await appendStep(pool, runId, {
          step_name: 'verify',
          action: `${candidate.name}: kept unverified`,
          output_summary: domain ? 'verification cap reached' : 'no domain in the search evidence',
          status: 'skipped',
        });
        continue;
      }

      verified += 1;
      const siteUrl = `https://${domain}`;
      let siteText: string | null = null;
      try {
        siteText = (await IngestionAgent.fetchUrlText(siteUrl)).text;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        accepted.push({
          name: candidate.name,
          domain,
          description: candidate.reason,
          angle: null,
          verified: false,
          evidenceUrl: siteUrl,
        });
        await appendStep(pool, runId, {
          step_name: 'verify',
          action: `${candidate.name}: site unreadable — kept unverified`,
          output_summary: msg.slice(0, 160),
          status: 'error',
        });
        continue;
      }

      const assessment = await callLLMValidated(
        {
          pool, tenantId, runId,
          system:
            'You are a competitive-intelligence analyst. Decide whether the ' +
            'candidate company ACTUALLY competes with the profiled company — a ' +
            'buyer would evaluate one instead of the other. If yes, summarize the ' +
            "candidate's positioning (1-2 sentences) and the profiled company's " +
            'strongest differentiation angle against it (1 sentence). Respond with ' +
            'ONLY JSON inside <assessment> tags: <assessment>{"is_competitor": ' +
            'true|false, "positioning": "...", "angle": "..."}</assessment>.',
          messages: [{
            role: 'user',
            content:
              `Profiled company:\n${profileContext}\n\n` +
              `Candidate: ${candidate.name} (${domain})\n` +
              `Candidate website text:\n${siteText.slice(0, SITE_TEXT_CAP)}`,
          }],
          maxTokens: 400,
        },
        AssessmentSchema,
        'assessment',
      );

      if (!assessment.is_competitor) {
        await appendStep(pool, runId, {
          step_name: 'verify',
          action: `${candidate.name}: read its site — not a real competitor, dropped`,
          output_summary: assessment.positioning.slice(0, 160),
          status: 'ok',
        });
        continue;
      }

      accepted.push({
        name: candidate.name,
        domain,
        description: assessment.positioning,
        angle: assessment.angle,
        verified: true,
        evidenceUrl: siteUrl,
      });
      await appendStep(pool, runId, {
        step_name: 'verify',
        action: `${candidate.name}: verified against its site`,
        output_summary: assessment.angle.slice(0, 160),
        status: 'ok',
      });
    }

    // 6. KG WRITE — Competitor nodes + Company —DIFFERENTIATES_FROM→ edges.
    const companyResult = await db.query<{ id: string }>(
      `SELECT id FROM gt_kg_nodes
        WHERE tenant_id = $tenant_id AND label = 'Company'
        ORDER BY created_at ASC
        LIMIT 1`,
      { tenant_id: tenantId },
    );
    const companyNodeId = companyResult.rows[0]?.id ?? null;

    let written = 0;
    for (const comp of accepted) {
      const nodeId = await upsertNode(pool, tenantId, {
        label: 'Competitor',
        name: comp.name,
        description: comp.description,
        properties: {
          source: 'research',
          domain: comp.domain,
          verified: comp.verified,
          evidence_url: comp.evidenceUrl,
          ...(comp.angle ? { angle: comp.angle } : {}),
          confirmed: false,
        },
      }, runId);
      written += 1;

      if (companyNodeId) {
        await upsertEdge(
          pool, tenantId,
          companyNodeId, 'DIFFERENTIATES_FROM', nodeId,
          { source: 'research', ...(comp.angle ? { basis: comp.angle } : {}) },
          runId,
        );
      }
    }

    await appendStep(pool, runId, {
      step_name: 'kg_write',
      action: 'Mapped competitors into your knowledge graph',
      output_summary: `${written} competitor${written === 1 ? '' : 's'} written` +
        (companyNodeId ? ' with differentiation edges' : ''),
      status: 'ok',
    });

    await setStatus(pool, runId, 'completed', {
      output: {
        queries,
        results_considered: results.length,
        candidates_shortlisted: candidates.length,
        competitors_written: written,
      },
    });
  }
}

/* ── helpers ────────────────────────────────────────────────────────────── */

function hostnameOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return null;
  }
}

/** "https://www.Foo.com/x" | "www.foo.com" | "foo.com" → "foo.com" */
function normalizeDomain(domain: string | null): string | null {
  if (!domain) return null;
  const trimmed = domain.trim().toLowerCase();
  if (!trimmed) return null;
  const viaUrl = hostnameOf(trimmed.includes('://') ? trimmed : `https://${trimmed}`);
  if (!viaUrl || !viaUrl.includes('.')) return null;
  return viaUrl;
}
