/**
 * Domain-enrichment agent — researches an industry's role families so a
 * tenant arriving at JD Studio has recommendations already waiting.
 *
 * WHY IT RUNS IN THE BACKGROUND
 * Emitted when `business_profile` completes, which is early — the tenant then
 * spends the mission wizard, domain, people and model steps onboarding while
 * this runs. By the time they write a JD the research is done and the lookup
 * is a plain SELECT, not an LLM call. That timing is the whole point: if the
 * model were consulted at JD-writing time, an LLM outage would block a tenant
 * mid-task, and rule 12 forbids quietly substituting something generic.
 *
 * WHAT IT PRODUCES
 * Rows shaped exactly like the handcrafted packs in 244 — one per family,
 * `payload.vara.starter` with musthaves/knockouts/threshold. It does NOT
 * publish them. The run parks at `awaiting` and a human approves, because a
 * pack is PLATFORM data every tenant in the industry inherits; one bad
 * generated pack would be wrong for all of them at once.
 *
 * WHAT IT MUST NEVER READ
 * Public market knowledge only — never a tenant's JDs, contacts or profile.
 * A domain pack is shared, so learning it from one tenant's hiring would make
 * that tenant's targeting visible to everyone in their industry, competitors
 * included. Same reasoning as rule 13 one table over. The prompt says so and
 * the code passes nothing tenant-specific but the industry string the tenant
 * typed about themselves.
 */

import type { Pool } from 'pg';
import { z } from 'zod';
import { appendStep, setStatus } from '../../agent-core/agent.runner';
import { callLLMValidated } from '../../agent-core/llm.client';
import { resolvePrompt, renderPrompt } from '../../vani/prompt-store';
import { slugifyIndustry } from '../../vani/industry-slug';

const PROMPT_KEY = 'vara.domain_pack.research';

/** How long a run may hold a domain before another is allowed to retry it. */
const IN_PROGRESS_TTL = '1 hour';

/* ── Shape of what the model returns ────────────────────────────────────── */

const MusthaveSchema = z.object({
  name:   z.string().min(2),
  weight: z.number().int().min(1).max(100),
  years:  z.number().int().min(0).max(40).optional(),
  why:    z.string().optional(),
});

const FamilySchema = z.object({
  family_name:       z.string().min(2),
  hint:              z.string().optional(),
  suggested_titles:  z.array(z.string()).default([]),
  role_summary_hint: z.string().optional(),
  musthaves:         z.array(MusthaveSchema).min(1),
  knockouts:         z.array(z.object({ label: z.string(), rule: z.string() })).default([]),
  threshold:         z.number().int().min(0).max(100).default(30),
  band_hint:         z.string().optional(),
});

const ResearchSchema = z.object({
  families: z.array(FamilySchema).min(1).max(8),
});

export type ResearchedFamily = z.infer<typeof FamilySchema>;

/* ── Claim ──────────────────────────────────────────────────────────────── */

export type ClaimOutcome = 'claimed' | 'pack-exists' | 'in-progress';

/**
 * Decide, once, whether this run should do the work — and mark the domain as
 * taken in the same breath.
 *
 * The check CANNOT live at emit time. A domain pack is platform-wide, so two
 * tenants in the same industry signing up a minute apart would both see "no
 * pack" and both research it. Here, an advisory lock keyed on the slug
 * serialises check-and-mark, so exactly one run passes.
 *
 * Both reads are deliberately CROSS-TENANT — tenant B's in-flight run has to
 * be visible while tenant A checks, because they are competing for the same
 * shared artefact. That works today only because gt_agent_runs' RLS is still
 * unforced (migration 236 skipped it on purpose). When it is forced, this
 * function needs a SECURITY DEFINER helper or it will silently degrade to
 * per-tenant and every tenant will research their own copy of the industry.
 * It will not error — it will just quietly do the work N times.
 *
 * The in-progress check is age-bounded because the queue has no stale-row
 * reclaim: a worker killed mid-research (every deploy does this) leaves a run
 * at 'running' forever, and without the bound that dead run would block the
 * industry permanently.
 */
export async function claimDomain(
  pool: Pool,
  runId: string | number,
  slug: string,
  force = false,
): Promise<ClaimOutcome> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Serialise every claimant for this slug. Transaction-scoped, so it is
    // released by COMMIT/ROLLBACK even if this process dies.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`domain-pack:${slug}`]);

    // `force` skips ONLY this check — an operator asking to re-research an
    // industry whose packs are stale. The in-progress check below still
    // applies, so two forced requests cannot both run, and nothing is
    // published without review either way: force produces a draft, not a row.
    if (!force) {
      const pack = await client.query(
        `SELECT 1 FROM vani_domain_pack
          WHERE domain = $1 AND payload -> 'vara' -> 'starter' IS NOT NULL
          LIMIT 1`,
        [slug],
      );
      if (pack.rows.length) {
        await client.query('COMMIT');
        return 'pack-exists';
      }
    }

    const busy = await client.query(
      `SELECT 1 FROM gt_agent_runs
        WHERE agent_name = 'DOMAIN_ENRICHMENT_REQUESTED'
          AND status IN ('queued', 'running', 'awaiting')
          AND inputs ->> 'domain' = $1
          AND id <> $2
          AND started_at > now() - interval '${IN_PROGRESS_TTL}'
        LIMIT 1`,
      [slug, runId],
    );
    if (busy.rows.length) {
      await client.query('COMMIT');
      return 'in-progress';
    }

    // Stamp the domain on THIS run inside the lock. That is what makes the
    // next claimant see it; writing it after COMMIT would reopen the race the
    // lock exists to close.
    await client.query(
      `UPDATE gt_agent_runs
          SET inputs = COALESCE(inputs, '{}'::jsonb) || jsonb_build_object('domain', $1::text)
        WHERE id = $2`,
      [slug, runId],
    );

    await client.query('COMMIT');
    return 'claimed';
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* ── Agent ──────────────────────────────────────────────────────────────── */

export const DomainPackAgent = {
  async run(
    pool: Pool,
    tenantId: string,
    payload: Record<string, unknown>,
    runId: string,
  ): Promise<void> {
    const industry = String(payload.industry ?? '').trim();
    const slug = String(payload.domain ?? '').trim() || slugifyIndustry(industry);

    if (!slug) {
      // Nothing to key a pack on. Loud, not silent: a completed run claiming
      // success here would read as "this industry has no families".
      throw new Error('DOMAIN_ENRICHMENT_NO_INDUSTRY: event carried no usable industry');
    }

    // force arrives only from `npm run packs -- --research <id> --force`;
    // the onboarding path never sets it.
    const outcome = await claimDomain(pool, runId, slug, payload.force === true);
    if (outcome !== 'claimed') {
      await appendStep(pool, runId, {
        step_name: 'claim',
        action: outcome === 'pack-exists'
          ? `Packs already published for "${slug}" — nothing to research`
          : `Another run is already researching "${slug}"`,
        status: 'skipped',
      });
      await setStatus(pool, runId, 'completed', {
        output: { domain: slug, skipped: outcome, families: 0 },
      });
      return;
    }

    await appendStep(pool, runId, {
      step_name: 'claim',
      action: `Claimed "${slug}" — no packs published and no run in flight`,
      status: 'ok',
    });

    // The prompt is a row, not a string literal — Prompt Studio edits it.
    // resolvePrompt throws PromptNotFoundError if migration 249 has not been
    // applied, which is the correct loud failure: a missing prompt is a
    // deploy defect and must not fall back to something hardcoded.
    const prompt = await resolvePrompt(pool, PROMPT_KEY);
    const system = renderPrompt(prompt, { industry, domain_slug: slug });

    await appendStep(pool, runId, {
      step_name: 'prompt',
      action: `Resolved ${PROMPT_KEY} v${prompt.version} (${prompt.scope})`,
      status: 'ok',
    });

    const started = Date.now();
    const research = await callLLMValidated(
      {
        tenantId,
        pool,
        runId,
        system,
        messages: [{
          role: 'user',
          content: `Describe the role families the "${industry}" industry hires for most often.`,
        }],
        maxTokens: 2600,
        temperature: 0.3,
      },
      ResearchSchema,
    );

    const families = research.families.map(normaliseWeights);

    await appendStep(pool, runId, {
      step_name: 'research',
      action: `Drafted ${families.length} role families for "${slug}"`,
      output_summary: families.map((f) => f.family_name).join(', ').slice(0, 200),
      duration_ms: Date.now() - started,
      status: 'ok',
    });

    // Park for review. A pack is platform data — one bad generated pack is
    // wrong for every tenant in the industry at once, so nothing is published
    // until a human says so. HUMAN_APPROVED commits it.
    await setStatus(pool, runId, 'awaiting', {
      awaiting_input: {
        kind: 'domain_pack_review',
        domain: slug,
        industry,
        researched_at: new Date().toISOString(),
        prompt_version: prompt.version,
        packs: families.map((f) => toPackRow(slug, f, industry, prompt.version)),
      },
      output: { domain: slug, families: families.length, status: 'awaiting_review' },
    });
  },
};

/* ── Shaping ────────────────────────────────────────────────────────────── */

/**
 * Force musthave weights to sum to 100.
 *
 * The prompt asks for it; a small model obliges most of the time. "Most of
 * the time" is not good enough for a number a score divides by, and silently
 * scoring against weights summing to 94 would skew every candidate in the
 * industry without anyone seeing a symptom. Largest-remainder, so the
 * rounding lands on the biggest weights rather than accumulating on the last.
 */
export function normaliseWeights(family: ResearchedFamily): ResearchedFamily {
  const total = family.musthaves.reduce((sum, m) => sum + m.weight, 0);
  if (total === 100 || total <= 0) return family;

  const scaled = family.musthaves.map((m) => ({ m, exact: (m.weight * 100) / total }));
  const out = scaled.map(({ m, exact }) => ({ ...m, weight: Math.floor(exact) }));

  let remainder = 100 - out.reduce((sum, m) => sum + m.weight, 0);
  const order = scaled
    .map(({ exact }, i) => ({ i, frac: exact - Math.floor(exact) }))
    .sort((a, b) => b.frac - a.frac);

  for (let k = 0; remainder > 0 && k < order.length; k++, remainder--) {
    out[order[k].i].weight += 1;
  }

  return { ...family, musthaves: out };
}

/**
 * One vani_domain_pack row per family, matching 244's handcrafted shape
 * exactly so a researched pack and a seeded one are indistinguishable to
 * every reader.
 *
 * `researched` carries provenance and a date. Packs are append-only and
 * versioned, so the alternative to recording this is a pack nobody can tell
 * is four years stale.
 */
export function toPackRow(
  slug: string,
  family: ResearchedFamily,
  industry: string,
  promptVersion: number,
) {
  const familySlug = slugifyIndustry(family.family_name);
  return {
    code: `talent-${slug}-${familySlug}`,
    domain: slug,
    payload: {
      family_name: family.family_name,
      hint: family.hint ?? '',
      suggested_titles: family.suggested_titles,
      vara: {
        starter: {
          role_summary_hint: family.role_summary_hint ?? '',
          musthaves: family.musthaves,
          knockouts: family.knockouts,
          threshold: family.threshold,
          window_days: 3,
          band_hint: family.band_hint ?? 'Band varies by seniority — set on the JD.',
        },
      },
      researched: {
        by: 'domain-pack-agent',
        source: 'public market knowledge (LLM)',
        industry_as_typed: industry,
        prompt_key: PROMPT_KEY,
        prompt_version: promptVersion,
        at: new Date().toISOString(),
      },
    },
  };
}
