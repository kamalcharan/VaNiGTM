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
import { appendStep, setStatus, saveCheckpoint, loadCheckpoint } from '../../agent-core/agent.runner';
import { callLLMValidated } from '../../agent-core/llm.client';
import { resolvePrompt, renderPrompt } from '../../vani/prompt-store';
import { slugifyIndustry } from '../../vani/industry-slug';
import { visiblePacksOfDomain } from './review-state';

/**
 * TWO prompts, because one call cannot fit the answer.
 *
 * Run 87 asked for 5-8 families with 10-15 titles each in a single response,
 * produced 10,317 characters and died at position 10,302 — truncated mid-JSON
 * against max_tokens. Raising the cap does not work either: run 86 spent 221
 * seconds on ~2600 tokens, so an 8000-token budget lands past the deployed
 * LLM_PRIMARY_TIMEOUT_MS of 280000. The output has to get smaller per call.
 *
 * Stage 1 names the families and their titles — the match key, and the only
 * part the doorway needs to be useful. Stage 2 runs once per family for its
 * scoring shape, a few hundred tokens each. Every call fits a 4B model inside
 * the timeout, and the run checkpoints between them, so a failure on family
 * four keeps families one to three.
 */
const FAMILIES_KEY = 'vara.domain_pack.families';
const STARTER_KEY = 'vara.domain_pack.starter';

/** How long a run may hold a domain before another is allowed to retry it. */
const IN_PROGRESS_TTL = '1 hour';

/**
 * How many family shapes to ask for at once.
 *
 * Stage 2's calls are independent — nothing about Data Engineering's scoring
 * depends on Product Management's — and running them one after another made
 * the whole job as slow as the sum of its parts. Run 92 was still going after
 * 2h18m. Research is background work and nobody sits watching it, but a
 * two-hour turnaround makes the prompt impossible to iterate on, and the first
 * tenant in a brand-new industry gets nothing for two hours.
 *
 * Four, not eight: this shares an endpoint with every other tenant's agents,
 * and a fan-out wide enough to saturate it would make someone else's
 * conversation time out. Raise it only with a measurement of what the endpoint
 * actually sustains.
 */
const SHAPE_CONCURRENCY = 4;

/* ── Shape of what the model returns ────────────────────────────────────── */

const MusthaveSchema = z.object({
  name:   z.string().min(2),
  weight: z.number().int().min(1).max(100),
  years:  z.number().int().min(0).max(40).optional(),
  why:    z.string().optional(),
});

/** Stage 1 — who the industry hires, and what those jobs are called. */
const FamilyIdSchema = z.object({
  family_name:       z.string().min(2),
  hint:              z.string().optional(),
  suggested_titles:  z.array(z.string()).default([]),
  role_summary_hint: z.string().optional(),
});

const FamiliesSchema = z.object({
  families: z.array(FamilyIdSchema).min(1).max(8),
});

/** Stage 2 — how ONE family is assessed. */
const StarterSchema = z.object({
  musthaves: z.array(MusthaveSchema).min(1),
  knockouts: z.array(z.object({ label: z.string(), rule: z.string() })).default([]),
  threshold: z.number().int().min(0).max(100).default(30),
  band_hint: z.string().optional(),
});

/** The two stages joined — what toPackRow writes. */
const FamilySchema = FamilyIdSchema.merge(StarterSchema);

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

    // "Already done" means a RESEARCHED pack, not any pack.
    //
    // Migration 244 seeded three handcrafted packs for 'technology-saas' in
    // August — Vikuna's generic starter, written before any tenant existed.
    // Treating those as "this industry has been studied" is what made the
    // doorway show engineering families to a Customer Success hire and call
    // it knowledge. A seeded pack is a placeholder; it does not mean anyone
    // looked at how this industry actually hires.
    //
    // The marker is `payload.researched`, which toPackRow writes and 244 does
    // not. So a seeded-only industry still gets researched once, and once a
    // researched pack is published further requests no-op — the guard still
    // bounds the work, it just measures the right thing.
    //
    // `force` skips this entirely: an operator re-researching an industry
    // whose RESEARCHED packs have gone stale. The in-progress check below
    // still applies either way, and nothing is published without review —
    // force produces a draft, not a row.
    if (!force) {
      // Latest version per code FIRST, then the state — retiring a pack
      // writes a new version, so judging row by row would let the previous
      // one stand in for it and block the industry forever.
      const pack = await client.query(
        `SELECT 1 FROM (${visiblePacksOfDomain('$1')}) v
          WHERE payload -> 'researched' IS NOT NULL LIMIT 1`,
        [slug],
      );
      if (pack.rows.length) {
        await client.query('COMMIT');
        return 'pack-exists';
      }
    }

    // The age bound applies to queued/running ONLY. Those can be orphaned by
    // a worker restart — every deploy does it — and without the bound a dead
    // run would block its industry forever.
    //
    // `awaiting` is kept in the predicate for runs drafted before publishing
    // moved into the agent (2026-09-17). Nothing parks there now — a finished
    // run publishes and completes — but a draft left over from the old path
    // must still hold its industry rather than being researched again beside
    // it. Unbounded on purpose: such a run is waiting on a person, not stuck.
    const busy = await client.query(
      `SELECT 1 FROM gt_agent_runs
        WHERE agent_name = 'DOMAIN_ENRICHMENT_REQUESTED'
          AND inputs ->> 'domain' = $1
          AND id <> $2
          AND (
            status = 'awaiting'
            OR (status IN ('queued', 'running')
                AND started_at > now() - interval '${IN_PROGRESS_TTL}')
          )
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

    // Prompts are rows, not string literals — Prompt Studio edits them.
    // resolvePrompt throws PromptNotFoundError if migration 251 has not been
    // applied, which is the correct loud failure: a missing prompt is a deploy
    // defect and must not fall back to something hardcoded.
    const famPrompt = await resolvePrompt(pool, FAMILIES_KEY);
    const starterPrompt = await resolvePrompt(pool, STARTER_KEY);

    await appendStep(pool, runId, {
      step_name: 'prompt',
      action: `Resolved ${FAMILIES_KEY} v${famPrompt.version} and `
        + `${STARTER_KEY} v${starterPrompt.version} (${famPrompt.scope})`,
      status: 'ok',
    });

    // ── Stage 1 ───────────────────────────────────────────────────────────
    // Resumed from the checkpoint when present, so a retry after a stage-2
    // timeout does not pay for this again.
    const saved = (await loadCheckpoint(pool, runId)) ?? {};
    let ids = (saved.families as z.infer<typeof FamilyIdSchema>[] | undefined) ?? null;

    if (ids) {
      await appendStep(pool, runId, {
        step_name: 'restore',
        action: `Resumed ${ids.length} families from checkpoint`,
        status: 'ok',
      });
    } else {
      const t0 = Date.now();
      const listed = await callLLMValidated(
        {
          tenantId, pool, runId,
          system: renderPrompt(famPrompt, { industry, domain_slug: slug }),
          messages: [{
            role: 'user',
            content: `Name the role families the "${industry}" industry hires for.`,
          }],
          maxTokens: 2200,
          temperature: 0.3,
        },
        FamiliesSchema,
      );
      ids = listed.families;
      await saveCheckpoint(pool, runId, { families: ids });
      await appendStep(pool, runId, {
        step_name: 'families',
        action: `Named ${ids.length} role families for "${slug}"`,
        output_summary: ids.map((f) => f.family_name).join(', ').slice(0, 200),
        duration_ms: Date.now() - t0,
        status: 'ok',
      });
    }

    // ── Stage 2, several families at once ─────────────────────────────────
    // Independent calls, so they run concurrently in batches. Sequentially this
    // took over two hours; the calls do not depend on each other and never did.
    //
    // Each shape is written to the checkpoint as it lands, so a crash keeps
    // what was already paid for. Those intermediate writes are BEST EFFORT
    // under concurrency — two completions racing can clobber one another's
    // snapshot — so the loop writes again after every batch settles, which is
    // the write that is actually relied on. The worst a lost intermediate
    // costs is re-shaping one family.
    const shapes = { ...((saved.shapes as Record<string, unknown>) ?? {}) };
    const todo = ids.filter((id) => !shapes[id.family_name]);
    const failures: string[] = [];

    for (let i = 0; i < todo.length; i += SHAPE_CONCURRENCY) {
      const batch = todo.slice(i, i + SHAPE_CONCURRENCY);
      const settled = await Promise.allSettled(batch.map(async (id) => {
        const t0 = Date.now();
        const shape = await callLLMValidated(
          {
            tenantId, pool, runId,
            system: renderPrompt(starterPrompt, {
              industry,
              family_name: id.family_name,
              family_hint: id.hint ?? '',
              family_titles: (id.suggested_titles ?? []).join(', '),
            }),
            messages: [{
              role: 'user',
              content: `How is "${id.family_name}" assessed in ${industry}?`,
            }],
            maxTokens: 900,
            temperature: 0.3,
          },
          StarterSchema,
        );
        shapes[id.family_name] = shape;
        await appendStep(pool, runId, {
          step_name: 'starter',
          action: `Shaped "${id.family_name}" — ${shape.musthaves.length} must-haves, `
            + `${shape.knockouts.length} knockouts, threshold ${shape.threshold}`,
          duration_ms: Date.now() - t0,
          status: 'ok',
        });
        return id.family_name;
      }));

      // The write that matters: after the batch, with everything it produced.
      await saveCheckpoint(pool, runId, { shapes });

      settled.forEach((r, k) => {
        if (r.status === 'rejected') {
          failures.push(`${batch[k].family_name}: ${r.reason?.message ?? r.reason}`);
        }
      });
    }

    if (failures.length) {
      // Loud, and naming every family that failed rather than only the first —
      // one timeout and one refusal are different problems and a retry should
      // not have to discover the second after fixing the first. The checkpoint
      // holds whatever did land, so the retry pays only for these.
      throw new Error(
        `DOMAIN_ENRICHMENT_SHAPE_FAILED: ${failures.length} of ${todo.length} families `
        + `could not be shaped — ${failures.join(' | ')}`,
      );
    }

    const families: ResearchedFamily[] = ids.map((id) => normaliseWeights({
      ...id,
      ...(shapes[id.family_name] as z.infer<typeof StarterSchema>),
    } as ResearchedFamily));

    // Before anything is offered for review. A leaked template reaching a human
    // depends on them reading 40 must-haves carefully enough to notice one
    // repeated — which is exactly the kind of check a person should not be the
    // last line of.
    assertNoTemplateLeak(families);

    await appendStep(pool, runId, {
      step_name: 'research',
      action: `Drafted ${families.length} role families for "${slug}"`,
      output_summary: families.map((f) => f.family_name).join(', ').slice(0, 200),
      status: 'ok',
    });

    // Publish. The tenant who asked gets the answer now; Vikuna's review
    // promotes it to `reviewed` afterwards. This used to park at `awaiting`
    // and wait for `npm run packs --publish`, which meant the tenant who paid
    // for a 20-minute run got nothing until someone at Vikuna ran a CLI —
    // overnight, for run 92.
    const packs = families.map(
      (f) => toPackRow(slug, f, industry, famPrompt.version, tenantId));
    const published = await publishPacks(pool, packs);

    await appendStep(pool, runId, {
      step_name: 'publish',
      action: `Published ${published.length} families to ${slug}`,
      output_summary: published.join(', ').slice(0, 200),
      status: 'ok',
    });

    await setStatus(pool, runId, 'completed', {
      output: {
        domain: slug,
        families: families.length,
        status: 'published',
        review_state: 'unreviewed',
        published,
      },
    });
  },
};

/**
 * Write a drafted set into `vani_domain_pack`. One transaction: all families
 * or none, because a partially published industry is worse than an
 * unpublished one — a tenant would see three of eight with nothing telling
 * them the rest exist.
 *
 * Shared with the operator CLI so a promotion and a first publish cannot drift
 * apart on the two rules that matter: append-only versioning, and reusing the
 * code a family already has in this domain.
 */
export async function publishPacks(
  pool: Pool,
  packs: { code: string; domain: string; payload: Record<string, any> }[],
): Promise<string[]> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const out: string[] = [];
    for (const p of packs) {
      // A family already in this domain keeps ITS code, whatever the agent
      // derived — migration 244 seeded 'talent-technology-saas-backend-eng'
      // by hand and the agent slugifies the same family to
      // '...-backend-engineering'. Two codes for one family is two rows out
      // of the doorway's DISTINCT ON (code).
      const existing = await client.query(
        `SELECT code FROM vani_domain_pack
          WHERE domain = $1
            AND lower(btrim(payload ->> 'family_name')) = lower(btrim($2))
          ORDER BY version DESC LIMIT 1`,
        [p.domain, p.payload.family_name],
      );
      const code: string = existing.rows[0]?.code ?? p.code;

      // Append-only: a correction is a new version, never an UPDATE, so
      // anything that recorded "pack v1" can still read v1.
      const v = await client.query(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next FROM vani_domain_pack WHERE code = $1`,
        [code],
      );
      await client.query(
        `INSERT INTO vani_domain_pack (code, version, domain, payload)
         VALUES ($1, $2, $3, $4::jsonb)`,
        [code, v.rows[0].next, p.domain, JSON.stringify(p.payload)],
      );
      out.push(`${code} v${v.rows[0].next}`);
    }
    await client.query('COMMIT');
    return out;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/* ── Template leak ──────────────────────────────────────────────────────── */

/**
 * Refuse a draft where one must-have has been copied across most families.
 *
 * Run 90 produced eight good families and put "Owns a service in production
 * — can be paged at 2am and resolve it unaided" as the TOP-WEIGHTED must-have
 * in six of them, including Product Management, Customer Success and Technical
 * Support. Nobody pages a CSM at 2am about a service.
 *
 * It was copied verbatim out of the prompt, which offered exactly that line as
 * an illustration of a good `why`. The model read the example as a template.
 * The prompt is fixed too (migration 252), but a prompt cannot be relied on
 * not to leak — a model that copies will find something else to copy. This
 * check is deterministic and catches the whole class.
 *
 * Interesting confirmation from that run: the two families that ESCAPED the
 * leak, Security & Compliance and Business Analysis, are also the two with by
 * far the best must-haves. They are where the Haiku failover took over. So the
 * leak is what the smaller model does under pressure, which is precisely why
 * this cannot be a prompt-only fix.
 *
 * MORE THAN HALF is the bar. A must-have shared by two or three of eight
 * families can be genuine — "strong communication" plausibly is. One shared by
 * most of them is either a leak or a pack so generic it would score every
 * candidate identically, and both are worth failing over.
 *
 * Fails loudly rather than dropping the offender: removing it silently leaves
 * weights that no longer sum to 100 and hides the real problem (rule 12).
 */
export function assertNoTemplateLeak(families: ResearchedFamily[]): void {
  if (families.length < 3) return;   // too few for "most" to mean anything

  const seen = new Map<string, string[]>();
  for (const f of families) {
    for (const m of f.musthaves) {
      const key = m.name.trim().toLowerCase().replace(/\s+/g, ' ');
      const list = seen.get(key) ?? [];
      list.push(f.family_name);
      seen.set(key, list);
    }
  }

  const limit = Math.floor(families.length / 2);
  for (const [name, inFamilies] of seen) {
    if (inFamilies.length > limit) {
      throw new Error(
        `RESEARCH_TEMPLATE_LEAK: "${name}" appears as a must-have in `
        + `${inFamilies.length} of ${families.length} families `
        + `(${inFamilies.join(', ')}). A must-have shared by most families `
        + `scores nobody apart, and is usually an example copied from the prompt.`,
      );
    }
  }
}

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
  requestedBy: string | null = null,
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
        // Published and visible, but not yet read by a human at Vikuna. The
        // console shows this, so "researched" and "researched and checked"
        // never read the same. See review-state.ts for why it is a label
        // rather than a gate.
        review_state: 'unreviewed',
        // Who paid the 20 minutes. Provenance, never a visibility filter —
        // scoping by requester strands the second tenant in the industry.
        requested_by: requestedBy,
        // Both stages, so a published pack can be traced to the exact text
        // that produced it. The starter prompt is the one that shaped the
        // scoring, and is the one to look at when a pack scores oddly.
        prompt_key: FAMILIES_KEY,
        starter_prompt_key: STARTER_KEY,
        prompt_version: promptVersion,
        at: new Date().toISOString(),
      },
    },
  };
}
