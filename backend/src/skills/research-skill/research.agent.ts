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
 *   6. writes each accepted competitor into the KG THE MOMENT it is
 *      earned (node + Company —DIFFERENTIATES_FROM→ edge) — a crash
 *      after candidate 3 keeps candidates 1–3
 *
 * Resume-from-failure (migration 191): after every expensive stage the
 * working state is merged into gt_agent_runs.checkpoint. When the wizard
 * retries with resume=true, the event payload carries resume_run_id; this
 * run restores the failed run's checkpoint and skips completed stages —
 * visibly, as a 'restore' step. LLM timeouts and TOKEN_BUDGET_EXCEEDED
 * therefore cost only the calls that never happened.
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
import { appendStep, setStatus, saveCheckpoint, loadCheckpoint } from '../../agent-core/agent.runner';
import { callLLMValidated } from '../../agent-core/llm.client';
import { searchWeb, type WebSearchResult } from '../../agent-core/search.client';
import { upsertNode, upsertEdge } from '../../agent-core/kg.store';
import { IngestionAgent } from '../ingestion-skill/ingestion.agent';

export const RESEARCH_AGENT_NAME = 'COMPETITOR_RESEARCH_REQUESTED';

// Prompt sizing (user direction: many small prompts, never one big one —
// each stage is its own LLM call, and the per-call context is kept lean so
// slow VPS inference stays inside the timeout):
const MAX_QUERIES = 4;
const RESULTS_PER_QUERY = 8;
const SHORTLIST_RESULTS_CAP = 20;  // results shown to the shortlist prompt
const SNIPPET_CAP = 160;           // chars of each result snippet in-prompt
const MAX_VERIFY = 6;              // candidates whose sites we actually read
const SITE_TEXT_CAP = 2_500;       // chars of candidate-site text per verify call
const FIELD_CAP = 400;             // chars per long profile field in-prompt

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
  site_belongs_to_candidate: z.boolean(),
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

interface Candidate {
  name: string;
  domain: string | null;
  reason: string;
}

/** Per-candidate outcome, keyed by name in the checkpoint. */
interface Assessed {
  accepted: boolean;
  verified: boolean;
  site_read: boolean;   // counts against MAX_VERIFY on resume
  description: string;
  angle: string | null;
  domain: string | null;
  evidence_url: string | null;
}

/** Shape of gt_agent_runs.checkpoint for this agent (all keys optional —
    each stage adds its own as it completes). */
interface ResearchCheckpoint {
  queries?: string[];
  results?: WebSearchResult[];
  candidates?: Candidate[];
  assessed?: Record<string, Assessed>;
}

export class CompetitorResearchAgent {
  static async run(
    pool: Pool,
    tenantId: string,
    payload: Record<string, unknown>,
    runId: string,
  ): Promise<void> {
    const db = createTenantDb(pool, tenantId);

    // RESUME — the route found the latest failed run with a checkpoint and
    // put its id in the payload; load the working state from that run.
    const resumedFrom = payload.resume_run_id as string | undefined;
    const cp: ResearchCheckpoint = resumedFrom
      ? ((await loadCheckpoint(pool, resumedFrom)) as ResearchCheckpoint | null) ?? {}
      : {};
    if (resumedFrom) {
      const assessedCount = Object.keys(cp.assessed ?? {}).length;
      await appendStep(pool, runId, {
        step_name: 'restore',
        action: `Resuming from run #${resumedFrom} — skipping what's already done`,
        output_summary: [
          cp.queries ? `${cp.queries.length} queries` : null,
          cp.results ? `${cp.results.length} search results` : null,
          cp.candidates ? `${cp.candidates.length} candidates` : null,
          assessedCount ? `${assessedCount} already assessed` : null,
        ].filter(Boolean).join(', ') || 'nothing restorable — starting fresh',
        status: 'ok',
      });
      // Carry the restored state forward onto THIS run so a second failure
      // resumes from here, not from the older run.
      await saveCheckpoint(pool, runId, cp as Record<string, unknown>);
    }

    // 1. PROFILE — research is framed by it; without one there is nothing
    //    to research against. Always loaded fresh (cheap, and edits since
    //    the failed run should be honoured).
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

    // Ignore list — competitors the human already ruled out ("Remove" in the
    // wizard sets properties.dismissed=true). A dismissed company must never
    // be re-proposed by a later research run.
    const dismissedResult = await db.query<{ name: string }>(
      `SELECT name FROM gt_kg_nodes
        WHERE tenant_id = $tenant_id AND label = 'Competitor'
          AND COALESCE((properties->>'dismissed')::boolean, false) = true`,
      { tenant_id: tenantId },
    );
    const dismissedNames = dismissedResult.rows.map((r) => r.name);
    const dismissedSet = new Set(dismissedNames.map((n) => n.toLowerCase().trim()));

    // Lean profile context shared by every prompt — long fields truncated;
    // competitor research needs the gist, not the essay.
    const clip = (v: string | null): string | null =>
      v && v.length > FIELD_CAP ? `${v.slice(0, FIELD_CAP)}…` : v;
    const profileContext = JSON.stringify({
      product_name: profile.product_name,
      product_description: clip(profile.product_description),
      core_problem: clip(profile.core_problem),
      key_differentiators: (profile.key_differentiators ?? []).slice(0, 5),
      icp_role: profile.icp_role,
      icp_company_type: profile.icp_company_type,
      icp_industry: profile.icp_industry,
      primary_pain_points: (profile.primary_pain_points ?? []).slice(0, 5),
    }, null, 2);

    // 2. FRAME QUERIES (skipped on resume when checkpointed)
    let queries: string[];
    if (cp.queries && cp.queries.length > 0) {
      queries = cp.queries;
    } else {
      ({ queries } = await callLLMValidated(
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
      ));
      await saveCheckpoint(pool, runId, { queries });

      await appendStep(pool, runId, {
        step_name: 'frame_queries',
        action: 'Framed the competitive landscape',
        output_summary: queries.map((q) => `"${q}"`).join(' · '),
        status: 'ok',
      });
    }

    // 3. SEARCH (skipped on resume when checkpointed) — every query is a
    //    visible step; a failed search fails the run (config/instance
    //    problem the user must see, not paper over).
    let results: WebSearchResult[];
    if (cp.results && cp.results.length > 0) {
      results = cp.results;
    } else {
      const seen = new Map<string, WebSearchResult>();
      for (const query of queries) {
        const found = await searchWeb(query, RESULTS_PER_QUERY);
        for (const r of found) {
          const host = hostnameOf(r.url);
          if (!host || ownDomains.has(host)) continue;
          if (!seen.has(r.url)) seen.set(r.url, r);
        }
        await appendStep(pool, runId, {
          step_name: 'web_search',
          action: `Searched: "${query}"`,
          output_summary: `${found.length} results`,
          status: 'ok',
        });
      }
      results = [...seen.values()].slice(0, 30);
      if (results.length === 0) {
        throw new Error(
          'SEARCH_EMPTY: every query returned zero results — check the SearXNG ' +
          'instance and its enabled engines (docs/searxng-setup.md)',
        );
      }
      await saveCheckpoint(pool, runId, { results });
    }

    // 4. SHORTLIST (skipped on resume when checkpointed). Listicles and
    //    review sites are useful EVIDENCE (they name vendors) but are not
    //    themselves candidates.
    let candidates: Candidate[];
    if (cp.candidates && cp.candidates.length > 0) {
      // Resumed shortlist still respects the ignore list — the human may
      // have dismissed companies between the failed run and this resume.
      candidates = cp.candidates.filter((c) => !dismissedSet.has(c.name.toLowerCase().trim()));
    } else {
      const resultsBlock = results
        .slice(0, SHORTLIST_RESULTS_CAP)
        .map((r, i) => `${i + 1}. ${r.title}\n   ${r.url}\n   ${r.snippet.slice(0, SNIPPET_CAP)}`)
        .join('\n');

      const shortlisted = await callLLMValidated(
        {
          pool, tenantId, runId,
          system:
            'You are a competitive-intelligence researcher. From the search results, ' +
            'identify actual VENDOR companies that compete with the profiled company — ' +
            'products a buyer would evaluate instead. Directories, listicles, review ' +
            'sites (G2, Capterra, Wikipedia, Reddit, LinkedIn) are evidence, never ' +
            'candidates. "domain" must be the candidate\'s OWN website domain — a ' +
            'directory, review-site, analyst or blog URL that merely MENTIONS the ' +
            "candidate is NEVER its domain. If the candidate's own site does not " +
            'appear in the results, use null — NEVER guess and NEVER borrow the ' +
            'domain of the page that mentioned them. Respond with ONLY JSON inside ' +
            '<candidates> tags: <candidates>{"candidates": [{"name": "...", ' +
            '"domain": "example.com" | null, "reason": "why this competes"}]}' +
            '</candidates>. Max 8, best first.' +
            (dismissedNames.length > 0
              ? ` NEVER include these companies — the user already ruled them out: ${dismissedNames.join(', ')}.`
              : ''),
          messages: [{
            role: 'user',
            content: `Company profile:\n${profileContext}\n\nSearch results:\n${resultsBlock}`,
          }],
          maxTokens: 800,
        },
        CandidatesSchema,
        'candidates',
      );
      const proposed = shortlisted.candidates as Candidate[];

      // Hard filter behind the prompt: drop anything on the ignore list.
      candidates = proposed.filter((c) => !dismissedSet.has(c.name.toLowerCase().trim()));
      const ignored = proposed.length - candidates.length;

      await saveCheckpoint(pool, runId, { candidates });

      await appendStep(pool, runId, {
        step_name: 'shortlist',
        action: 'Shortlisted candidate competitors',
        output_summary: (candidates.length > 0
          ? candidates.map((c) => c.name).join(', ')
          : 'none found in the results')
          + (ignored > 0 ? ` (${ignored} skipped — on your ignore list)` : ''),
        status: candidates.length > 0 ? 'ok' : 'skipped',
      });
    }

    // Company node — looked up BEFORE the verify loop so each accepted
    // competitor gets its differentiation edge the moment it is written.
    const companyResult = await db.query<{ id: string }>(
      `SELECT id FROM gt_kg_nodes
        WHERE tenant_id = $tenant_id AND label = 'Company'
        ORDER BY created_at ASC
        LIMIT 1`,
      { tenant_id: tenantId },
    );
    const companyNodeId = companyResult.rows[0]?.id ?? null;

    // 5+6. VERIFY + WRITE, incrementally. Each candidate: fetch its real
    // site, LLM-judge fit, and — if accepted — persist node + edge NOW.
    // The assessed map is checkpointed after every candidate, so a crash
    // at candidate 4 resumes at candidate 4.
    const assessed: Record<string, Assessed> = { ...(cp.assessed ?? {}) };
    let siteReads = Object.values(assessed).filter((a) => a.site_read).length;

    const writeCompetitor = async (a: Assessed, name: string): Promise<void> => {
      const nodeId = await upsertNode(pool, tenantId, {
        label: 'Competitor',
        name,
        description: a.description,
        properties: {
          source: 'research',
          domain: a.domain,
          verified: a.verified,
          evidence_url: a.evidence_url,
          ...(a.angle ? { angle: a.angle } : {}),
          confirmed: false,
        },
      }, runId);
      if (companyNodeId) {
        await upsertEdge(
          pool, tenantId,
          companyNodeId, 'DIFFERENTIATES_FROM', nodeId,
          { source: 'research', ...(a.angle ? { basis: a.angle } : {}) },
          runId,
        );
      }
    };

    for (const candidate of candidates) {
      if (assessed[candidate.name]) continue; // done in a previous run

      const domain = normalizeDomain(candidate.domain);
      let outcome: Assessed;

      if (!domain || siteReads >= MAX_VERIFY) {
        // No verifiable domain (or over the read cap): keep for the human
        // gate, transparently marked unverified.
        outcome = {
          accepted: true,
          verified: false,
          site_read: false,
          description: candidate.reason,
          angle: null,
          domain,
          evidence_url: null,
        };
        await writeCompetitor(outcome, candidate.name);
        await appendStep(pool, runId, {
          step_name: 'verify',
          action: `${candidate.name}: kept unverified`,
          output_summary: domain ? 'verification cap reached' : 'no domain in the search evidence',
          status: 'skipped',
        });
      } else {
        siteReads += 1;
        const siteUrl = `https://${domain}`;
        let siteText: string | null = null;
        try {
          siteText = (await IngestionAgent.fetchUrlText(siteUrl)).text;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          outcome = {
            accepted: true,
            verified: false,
            site_read: true,
            description: candidate.reason,
            angle: null,
            domain,
            evidence_url: siteUrl,
          };
          await writeCompetitor(outcome, candidate.name);
          await appendStep(pool, runId, {
            step_name: 'verify',
            action: `${candidate.name}: site unreadable — kept unverified`,
            output_summary: msg.slice(0, 160),
            status: 'error',
          });
          assessed[candidate.name] = outcome;
          await saveCheckpoint(pool, runId, { assessed });
          continue;
        }

        const assessment = await callLLMValidated(
          {
            pool, tenantId, runId,
            system:
              'You are a competitive-intelligence analyst. FIRST decide whether the ' +
              `website text actually belongs to the candidate company itself — if it ` +
              'is a different company, a directory, an analyst page or a listicle, ' +
              'set site_belongs_to_candidate=false. THEN decide whether the ' +
              'candidate ACTUALLY competes with the profiled company — a buyer ' +
              'would evaluate one instead of the other. If yes, summarize the ' +
              "candidate's positioning (1-2 sentences) and the profiled company's " +
              'strongest differentiation angle against it (1 sentence). Respond with ' +
              'ONLY JSON inside <assessment> tags: <assessment>' +
              '{"site_belongs_to_candidate": true|false, "is_competitor": ' +
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

        if (!assessment.site_belongs_to_candidate) {
          // Wrong site (borrowed listicle/analyst domain) — the verdict is
          // meaningless. Keep the candidate unverified WITHOUT the bogus
          // domain, for the human gate to rule on.
          outcome = {
            accepted: true,
            verified: false,
            site_read: true,
            description: candidate.reason,
            angle: null,
            domain: null,
            evidence_url: null,
          };
          await writeCompetitor(outcome, candidate.name);
          await appendStep(pool, runId, {
            step_name: 'verify',
            action: `${candidate.name}: ${domain} isn't their site — kept unverified, domain cleared`,
            output_summary: 'the search evidence only had pages that mention them',
            status: 'skipped',
          });
          assessed[candidate.name] = outcome;
          await saveCheckpoint(pool, runId, { assessed });
          continue;
        }

        if (assessment.is_competitor) {
          outcome = {
            accepted: true,
            verified: true,
            site_read: true,
            description: assessment.positioning,
            angle: assessment.angle,
            domain,
            evidence_url: siteUrl,
          };
          await writeCompetitor(outcome, candidate.name);
          await appendStep(pool, runId, {
            step_name: 'verify',
            action: `${candidate.name}: verified against its site`,
            output_summary: assessment.angle.slice(0, 160),
            status: 'ok',
          });
        } else {
          outcome = {
            accepted: false,
            verified: true,
            site_read: true,
            description: assessment.positioning,
            angle: null,
            domain,
            evidence_url: siteUrl,
          };
          await appendStep(pool, runId, {
            step_name: 'verify',
            action: `${candidate.name}: read its site — not a real competitor, dropped`,
            output_summary: assessment.positioning.slice(0, 160),
            status: 'ok',
          });
        }
      }

      assessed[candidate.name] = outcome;
      await saveCheckpoint(pool, runId, { assessed });
    }

    const written = Object.values(assessed).filter((a) => a.accepted).length;
    await appendStep(pool, runId, {
      step_name: 'kg_write',
      action: 'Competitor map complete in your knowledge graph',
      output_summary: `${written} competitor${written === 1 ? '' : 's'} mapped` +
        (companyNodeId ? ' with differentiation edges' : ''),
      status: 'ok',
    });

    await setStatus(pool, runId, 'completed', {
      output: {
        queries,
        results_considered: results.length,
        candidates_shortlisted: candidates.length,
        competitors_written: written,
        ...(resumedFrom ? { resumed_from_run: resumedFrom } : {}),
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
