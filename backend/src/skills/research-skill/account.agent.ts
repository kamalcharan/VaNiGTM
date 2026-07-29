/**
 * Account Research Agent — the manufacturing pilot, Step 2.
 *
 * Reads ONE prospect company's own website and produces the brief a human
 * writes a first message from:
 *
 *   1. fetch_site   — static read of the domain (IngestionAgent.fetchUrlText),
 *                     escalating to a headless render when the static page is
 *                     too thin to say anything
 *   2. crawl_pages  — about / products / quality / contact, where they exist
 *   3. extract      — page text → structured facts, every one carrying the URL
 *                     and excerpt it came from
 *   4. fit_score    — those facts against the tenant's offer catalogue, scoring
 *                     EVERY offer, with "none" a first-class outcome. The
 *                     offers are rendered in a per-company order so no offer
 *                     wins on position, and the smallest-sane-ask rule is
 *                     applied to the scores afterwards, in code.
 *   5. hook         — the one specific, verifiable observation the approach
 *                     opens with
 *   6. write        — gt_account_briefs
 *
 * ── ONE RUN, MANY ACCOUNTS, WRITTEN AS THEY ARE EARNED ────────────────
 *
 * A batch of 100 accounts is ONE run, not 100. Each brief is written the
 * moment it is finished and the checkpoint records the prospect id, so a
 * crash at account 60 keeps 59 briefs and a resume starts at 60. Same
 * "earn it → write it" posture as ingestion and competitor research.
 *
 * ── FAILURE POSTURE (CLAUDE.md rule 12) ───────────────────────────────
 *
 * A missing or half-written offer catalogue fails the whole run BEFORE any
 * crawling — fit scoring against a blank produces a confident number that
 * then decides who gets contacted.
 *
 * One unreadable site is NOT a run failure. It is written as
 * status='unreadable' with the real reason in `error`, and it is never a
 * guessed brief: an invented detail in a first touch is the one mistake that
 * cannot be walked back.
 */

import type { Pool } from 'pg';
import { z } from 'zod';
import { createTenantDb } from '../../db';
import { appendStep, setStatus, saveCheckpoint, loadCheckpoint } from '../../agent-core/agent.runner';
import { callLLMValidated, getTokenBudget } from '../../agent-core/llm.client';
import { loadPrompt } from '../../agent-core/prompt.store';
import { IngestionAgent } from '../ingestion-skill/ingestion.agent';
import {
  loadOfferCatalogue, catalogueForPrompt, catalogueFingerprint, chooseOffer,
  FIT_MARGIN, type OfferCatalogue,
} from './offer-catalogue';
import {
  readCorrections, correctionsForPrompt, correctionsFingerprint,
  judgementFingerprint,
} from './corrections';
import { readLessons, lessonsForPrompt } from './lessons';

export const ACCOUNT_RESEARCH_AGENT_NAME = 'ACCOUNT_RESEARCH_REQUESTED';

/* ── Sizing ──────────────────────────────────────────────────────────────
 * Small prompts, one per stage. A 2,500-char cap per page keeps the whole
 * extract call inside the VPS timeout on qwen3:8b; more text buys very
 * little, because what we want is on the first screen of an About page. */
const MAX_SUBPAGES      = 6;
const PAGE_TEXT_CAP     = 2_500;
const TOTAL_TEXT_CAP    = 8_000;
const MIN_USABLE_TEXT   = 200;   // below this a page said nothing
const EXCERPT_CAP       = 200;

/* ── What a company costs ────────────────────────────────────────────────
 *
 * Measured, not guessed: extract sends up to TOTAL_TEXT_CAP of page text and
 * takes up to 2,000 back; fit sends the brief plus the catalogue plus the
 * learned rules and takes up to 1,200; hook is small. Input tokens count
 * against the budget too, which is what made "100k a day" quietly mean seven
 * companies rather than the fifty it sounds like.
 *
 * Deliberately a slight OVER-estimate. Stopping one company early is a
 * non-event; stopping one company late means a half-finished brief and a
 * failure the reviewer has to interpret. */
export const COST_FULL_RESEARCH = 14_000;  // crawl + extract + fit + hook
export const COST_RESCORE_ONLY  = 3_500;   // fit + hook, facts already held

/** Paths worth trying, in the order they pay off for a manufacturer. */
const SUBPAGE_HINTS = [
  'about', 'about-us', 'company', 'profile',
  'products', 'product', 'services',
  'quality', 'certifications', 'accreditation', 'infrastructure',
  // Hiring and news pay for themselves: several offer fit signals are about
  // roles being hired, expansions and press. Careers was missing entirely,
  // which meant "hiring IT/QA but no data lead" could never be evidenced.
  'careers', 'career', 'jobs', 'news', 'press', 'media', 'investors',
  'contact', 'contact-us',
];

/* ── Stage schemas ───────────────────────────────────────────────────── */

const EvidenceSchema = z.object({
  claim: z.string(),
  url: z.string(),
  excerpt: z.string(),
});

const ExtractSchema = z.object({
  what_they_make: z.string().nullable().optional(),
  scale_signals: z.string().nullable().optional(),
  service_signals: z.string().nullable().optional(),
  digital_maturity: z.string().nullable().optional(),
  certifications: z.array(z.string()).optional(),
  named_contacts: z.array(z.object({
    name: z.string().optional().nullable(),
    title: z.string().optional().nullable(),
    email: z.string().optional().nullable(),
    phone: z.string().optional().nullable(),
  })).optional(),
  evidence: z.array(EvidenceSchema).optional(),
});
export type ExtractResult = z.infer<typeof ExtractSchema>;

const FitSchema = z.object({
  scores: z.array(z.object({
    offer_id: z.string(),
    score: z.number().min(0).max(1),
    reason: z.string(),
  })),
  recommended_offer: z.string().nullable(),
  reason: z.string().nullable().optional(),
  confidence: z.number().min(0).max(1).optional(),
});
export type FitResult = z.infer<typeof FitSchema>;

const HookSchema = z.object({
  hook: z.string().nullable(),
  evidence_url: z.string().nullable().optional(),
});

/* ── Types ───────────────────────────────────────────────────────────── */

interface TargetRow {
  id: number;
  name: string;
  domain_normalized: string | null;
  website: string | null;
  industry_raw: string | null;
  /** Set when this company already has usable facts — then no crawl is needed. */
  facts_at: string | null;
  what_they_make: string | null;
  scale_signals: string | null;
  service_signals: string | null;
  digital_maturity: string | null;
  certifications: string[] | null;
}

interface PageText { url: string; text: string }

/** The offer-independent half of a brief. */
export interface BriefFacts {
  what_they_make: string | null;
  scale_signals: string | null;
  service_signals: string | null;
  digital_maturity: string | null;
  certifications: string[];
}

interface AccountCheckpoint {
  /** Prospect ids already written this run — a resume skips them. */
  done?: number[];
}

/* ── Helpers ─────────────────────────────────────────────────────────── */

/** "not stated" and its cousins are absence of evidence — store NULL. */
export function meaningful(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const s = value.trim();
  if (s.length === 0) return null;
  if (/^(not stated|not specified|unknown|n\/?a|none|null|-)$/i.test(s)) return null;
  return s;
}

/**
 * Drop any claim the page text does not actually contain.
 *
 * The model is told to quote an excerpt from the source; this checks that it
 * did. An excerpt that appears in no fetched page is a fabrication, and the
 * claim resting on it goes with it. Cheap, and it catches the exact failure
 * that would put an invented certification into a first email.
 */
export function verifyEvidence(
  evidence: z.infer<typeof EvidenceSchema>[],
  pages: PageText[],
): { kept: z.infer<typeof EvidenceSchema>[]; dropped: number } {
  const haystack = pages.map((p) => p.text.toLowerCase().replace(/\s+/g, ' ')).join('\n');
  const kept = evidence.filter((e) => {
    const needle = (e.excerpt ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
    // Too short to verify meaningfully — treat as unsupported.
    if (needle.length < 15) return false;
    return haystack.includes(needle.slice(0, 120));
  });
  return { kept, dropped: evidence.length - kept.length };
}

/**
 * Does this company need the expensive half?
 *
 * Facts already gathered and still good = judge only, no network at all. One
 * function rather than two copies of the condition, because the budget
 * ESTIMATE and the loop must agree — an estimate that prices a re-score as a
 * crawl refuses batches that would have finished comfortably.
 */
export function needsCrawl(
  t: Pick<TargetRow, 'facts_at' | 'what_they_make' | 'scale_signals'>,
  refresh: boolean,
): boolean {
  if (refresh) return true;
  return t.facts_at === null
    || (t.what_they_make === null && t.scale_signals === null);
}

const originOf = (domain: string): string =>
  domain.startsWith('http') ? domain : `https://${domain}`;

/**
 * The addresses one site actually answers on, in order.
 *
 * A single https://<domain> attempt writes off companies that are perfectly
 * reachable: plenty of Indian manufacturers serve only on www, and plenty
 * have TLS that node rejects while a browser shrugs. Aurobindo Pharma — a
 * company with a market cap in the billions — failed the first batch on
 * exactly this.
 *
 * NOT a silent fallback: these are the same site, every attempt is reported
 * in the fetch_site step, and the one that answered is recorded.
 */
export function urlVariants(domain: string): string[] {
  if (domain.startsWith('http')) return [domain];
  const bare = domain.replace(/^www\./, '');
  return [
    `https://${bare}`,
    `https://www.${bare}`,
    `http://${bare}`,
    `http://www.${bare}`,
  ];
}

/* ── Agent ───────────────────────────────────────────────────────────── */

export class AccountResearchAgent {
  static async run(
    pool: Pool,
    tenantId: string,
    payload: Record<string, unknown>,
    runId: string,
  ): Promise<void> {
    const db = createTenantDb(pool, tenantId);
    const isLive = payload.is_live === true;

    // Resume: the caller passes the failed run's id; its checkpoint tells us
    // which accounts are already written.
    const resumedFrom = payload.resume_run_id as string | undefined;
    const cp: AccountCheckpoint = resumedFrom
      ? ((await loadCheckpoint(pool, resumedFrom)) as AccountCheckpoint | null) ?? {}
      : {};
    const done = new Set<number>(cp.done ?? []);

    if (resumedFrom) {
      await appendStep(pool, runId, {
        step_name: 'restore',
        action: `Resumed from run ${resumedFrom}`,
        output_summary: `${done.size} account(s) already researched — skipping those`,
        status: 'ok',
      });
    }

    // ── The catalogue, BEFORE anything is crawled ──────────────────────
    // A half-written catalogue must cost zero crawls. loadOfferCatalogue
    // throws naming every missing field.
    let catalogue: OfferCatalogue;
    try {
      catalogue = await loadOfferCatalogue(db, tenantId);
    } catch (err) {
      await appendStep(pool, runId, {
        step_name: 'offer_catalogue',
        action: 'Checked the offer catalogue before crawling anything',
        output_summary: (err as Error).message.split('\n')[0],
        status: 'error',
      });
      throw err;
    }
    await appendStep(pool, runId, {
      step_name: 'offer_catalogue',
      action: 'Loaded the offers to score against',
      output_summary: catalogue.offers
        .map((o) => `${o.name} (${o.commitment})`).join(' · '),
      status: 'ok',
    });

    // ── What this reviewer has already decided ─────────────────────────
    //
    // Ratified lessons first — those are rules a human has agreed to, and
    // they are what the fit prompt leans on. The raw rulings go in as the
    // evidence underneath them, capped, so a lesson is never an assertion
    // without cases.
    const lessons = await readLessons(db, tenantId, isLive);
    const corrections = await readCorrections(db, tenantId, isLive);
    const offerName = (k: string | null): string =>
      (k ? catalogue.offers.find((o) => o.id === k)?.name ?? k : 'no fit');
    const learnedText = [
      lessonsForPrompt(lessons),
      correctionsForPrompt(corrections, offerName),
    ].filter(Boolean).join('\n\n');

    const decidedCount = corrections.disagreements.length + corrections.confirmations.length;
    if (lessons.length > 0 || decidedCount > 0) {
      await appendStep(pool, runId, {
        step_name: 'prior_decisions',
        action: 'Read what you have already ruled on',
        output_summary: `${lessons.length} ratified lesson(s) · `
          + `${corrections.disagreements.length} disagreement(s) and `
          + `${corrections.confirmations.length} confirmation(s) shown as examples`,
        status: 'ok',
      });
    }

    // ── The cohort ─────────────────────────────────────────────────────
    const tagId = payload.tag_id as number | undefined;
    const explicitIds = Array.isArray(payload.prospect_ids)
      ? (payload.prospect_ids as unknown[]).map(Number).filter(Number.isFinite)
      : [];
    const limit = Number(payload.limit) > 0 ? Number(payload.limit) : 500;
    // Re-running a batch used to re-crawl every company from scratch: the
    // checkpoint only skips within ONE run. A company already researched is
    // skipped unless the caller explicitly asks to refresh it.
    const refresh = payload.refresh === true;

    if (!tagId && explicitIds.length === 0) {
      throw new Error(
        'COHORT_MISSING: pass tag_id (a cohort tag) or prospect_ids in the event payload.',
      );
    }

    // Only rows with a domain: there is nothing to research without one, and
    // silently including them would make the batch look bigger than the work.
    //
    // The stamp covers BOTH inputs to a judgement — the offers and what the
    // reviewer has ruled. Either moving makes an undecided judgement stale.
    const fingerprint = judgementFingerprint(
      await catalogueFingerprint(db, tenantId),
      correctionsFingerprint(corrections, lessons),
    );

    // Existing facts come back with the row, so a company that only needs
    // re-scoring never touches the network.
    const targets = await db.query<TargetRow>(
      `SELECT p.id, p.name, p.domain_normalized, p.website, p.industry_raw,
              b.facts_at, b.what_they_make, b.scale_signals, b.service_signals,
              b.digital_maturity, b.certifications
         FROM gt_prospects p
         LEFT JOIN gt_account_briefs b
                ON b.prospect_id = p.id
               AND b.tenant_id   = $tenant_id
               AND b.is_live     = $is_live
        WHERE p.tenant_id = $tenant_id
          AND p.is_live   = $is_live
          AND p.is_active = true
          AND p.domain_normalized IS NOT NULL
          AND ($tag_id::bigint IS NULL OR EXISTS (
                SELECT 1 FROM gt_prospect_tags pt
                 WHERE pt.prospect_id = p.id AND pt.tag_id = $tag_id::bigint))
          AND ($ids::bigint[] IS NULL OR p.id = ANY($ids::bigint[]))
          -- A brief only counts as "done" if it is actually a brief.
          -- extract_failed is OUR pipeline falling over — it says nothing
          -- about the company and is retried automatically, or those rows
          -- would be written off forever for a bug of ours. unreadable is
          -- a finding about them, so it is skipped unless refresh is asked
          -- for.
          -- Selected when it needs EITHER half: no brief at all, our own
          -- extraction failed, or the judgement was made against a different
          -- offer set. The loop then works out which half to run.
          -- A brief a human has RULED ON is never re-judged. Their decision
          -- stands until they change it; re-scoring it would silently move
          -- the offer out from under a ruling that named a different one.
          AND ($refresh::boolean OR b.id IS NULL
               OR b.status = 'extract_failed'
               OR (b.status <> 'unreadable'
                   AND b.decided_at IS NULL
                   AND b.offers_fingerprint IS DISTINCT FROM $fingerprint))
        ORDER BY p.completeness DESC NULLS LAST, p.id
        LIMIT $limit`,
      {
        tenant_id: tenantId, is_live: isLive,
        tag_id: tagId ?? null,
        ids: explicitIds.length > 0 ? explicitIds : null,
        refresh, fingerprint, limit,
      },
    );

    const queue = targets.rows.filter((t) => !done.has(Number(t.id)));

    await appendStep(pool, runId, {
      step_name: 'cohort',
      action: refresh
        ? 'Selected the accounts to research (refreshing existing briefs)'
        : 'Selected the accounts to research (skipping any already researched)',
      output_summary: `${targets.rows.length} to research`
        + (done.size > 0 ? `, ${queue.length} still to do this run` : ''),
      status: 'ok',
    });

    if (queue.length === 0) {
      await setStatus(pool, runId, 'completed', {
        output: {
          researched: 0,
          message: refresh
            ? 'Nothing to research — no reachable accounts in the cohort.'
            : 'Nothing new to research — every reachable company in this cohort '
              + 'already has a brief. Re-run with refresh to redo them.',
        },
      });
      return;
    }

    // ── What today's budget can actually pay for ───────────────────────
    //
    // Said BEFORE the first crawl. Without this the run works its way down a
    // hundred companies, crawls each one, and only discovers at the LLM call
    // that the budget went at company eight — burning network and time on
    // ninety-two companies to produce ninety-two failure rows.
    const budget = await getTokenBudget(pool, tenantId);
    if (budget.capped) {
      // Priced over the ACTUAL queue, not by dividing through by the worst
      // case. A cohort that only needs re-scoring costs a quarter as much,
      // and pricing it as crawls refused batches that would have finished
      // comfortably — which is exactly the kind of wrong "no" that makes a
      // budget feel like a bug.
      let acc = 0;
      let affordable = 0;
      for (const t of queue) {
        acc += needsCrawl(t, refresh) ? COST_FULL_RESEARCH : COST_RESCORE_ONLY;
        if (acc > budget.remaining) break;
        affordable++;
      }

      await appendStep(pool, runId, {
        step_name: 'budget',
        action: `${budget.used.toLocaleString()} of ${budget.limit.toLocaleString()} tokens used today`,
        output_summary: affordable >= queue.length
          ? `${budget.remaining.toLocaleString()} left — enough for all ${queue.length}`
          : `${budget.remaining.toLocaleString()} left — about ${affordable} of `
            + `${queue.length} compan${affordable === 1 ? 'y' : 'ies'}. `
            + 'The rest stop cleanly and resume when the budget does.',
        status: affordable >= queue.length ? 'ok' : 'error',
      });

      // Not even the first company is affordable: refuse before crawling, and
      // say whose limit it is. A run that crawls a hundred sites and writes a
      // hundred failures teaches the reviewer nothing except distrust.
      if (affordable < 1) {
        await setStatus(pool, runId, 'completed', {
          output: {
            researched: 0,
            stopped_for_budget: true,
            tokens_used: budget.used,
            tokens_limit: budget.limit,
            message: `Today's token budget is spent (${budget.used.toLocaleString()} of `
              + `${budget.limit.toLocaleString()}). Nothing was crawled. This is our own `
              + 'cap, not the model refusing — raise the daily limit on the Research '
              + 'screen, or it resets at midnight UTC.',
          },
        });
        return;
      }
    }

    let written = 0;
    let unreadable = 0;
    let recommended = 0;
    let rescoredOnly = 0;
    /** Set when the budget ran out mid-batch — a clean stop, not a failure. */
    let stoppedForBudget = false;
    let notAttempted = 0;
    // Companies where the smallest-sane-ask rule moved the recommendation off
    // the top scorer, and companies where the top two were indistinguishable.
    // Both are how you tell whether the rule is doing anything.
    let laddered = 0;
    let unclear = 0;

    for (const target of queue) {
      const prospectId = Number(target.id);
      const domain = target.domain_normalized!;

      try {
        // Does this company need the expensive half, or only the cheap one?
        // Worked out first, because it also decides what this company COSTS.
        // Facts already gathered and still good = judge only, no network at
        // all. That is the whole point of the split: editing an offer costs
        // one call per company rather than a re-crawl.
        const hasFacts = !needsCrawl(target, refresh);

        // ── Can this company be paid for? ──────────────────────────────
        //
        // Checked here, before the crawl, and re-read each time because the
        // budget is per TENANT — another agent may have spent it while this
        // batch was running.
        //
        // A company we cannot afford is NOT written as a failed brief. It was
        // never attempted; recording it as extract_failed would mark ninety
        // companies as broken when the only thing that happened is that we
        // ran out of budget, and a later run would then treat them as
        // retryable pipeline failures rather than untouched work.
        if (budget.capped) {
          const cost = hasFacts ? COST_RESCORE_ONLY : COST_FULL_RESEARCH;
          const now = await getTokenBudget(pool, tenantId);
          if (now.remaining < cost) {
            stoppedForBudget = true;
            notAttempted = queue.length - queue.indexOf(target);
            await appendStep(pool, runId, {
              step_name: 'budget_stop',
              action: `Stopped at ${target.name} — today's token budget is spent`,
              output_summary: `${written} brief(s) written and kept · `
                + `${notAttempted} not attempted. Nothing was lost; re-run when the `
                + 'budget resets or after raising it.',
              status: 'error',
            });
            break;
          }
        }

        let facts: BriefFacts;
        let factHalf: Record<string, unknown> | null = null;

        if (hasFacts) {
          facts = {
            what_they_make: target.what_they_make,
            scale_signals: target.scale_signals,
            service_signals: target.service_signals,
            digital_maturity: target.digital_maturity,
            certifications: target.certifications ?? [],
          };
          rescoredOnly++;
          await appendStep(pool, runId, {
            step_name: 'reuse_facts',
            action: `${target.name}: re-scoring against the current offers`,
            output_summary: 'facts already gathered — no crawl',
            status: 'ok',
          });
        } else {
          factHalf = await this.researchOne(pool, tenantId, runId, target);
          // Nothing readable: record the gap and move on — there is nothing
          // to judge.
          if (factHalf.status !== 'facts') {
            // Non-destructive: a company that HAD a readable site last week
            // and does not today keeps last week's brief, with the new
            // failure recorded on it.
            await this.writeFailure(
              db, tenantId, isLive, prospectId, runId,
              factHalf.status as 'unreadable' | 'extract_failed',
              (factHalf.domain as string) ?? null,
              (factHalf.error as string) ?? 'unreadable',
            );
            unreadable++;
            written++;
            done.add(prospectId);
            await saveCheckpoint(pool, runId, { done: [...done] });
            continue;
          }
          facts = {
            what_they_make: (factHalf.what_they_make as string | null) ?? null,
            scale_signals: (factHalf.scale_signals as string | null) ?? null,
            service_signals: (factHalf.service_signals as string | null) ?? null,
            digital_maturity: (factHalf.digital_maturity as string | null) ?? null,
            certifications: (factHalf.certifications as string[]) ?? [],
          };
        }

        const verdict = await this.judge(
          pool, tenantId, runId, target.name, facts,
          target.industry_raw, catalogue, learnedText,
          // Seeded on the prospect: the offers are rendered in a different
          // order for every company, so no offer wins on position — and the
          // SAME order every time this company is re-scored, so a moved
          // score means the wording moved.
          String(prospectId),
        );

        if (factHalf) {
          await this.writeBrief(db, tenantId, isLive, prospectId, runId, {
            ...factHalf, ...verdict, status: 'drafted', offers_fingerprint: fingerprint,
          });
        } else {
          await this.writeJudgement(db, tenantId, isLive, prospectId, runId, {
            ...verdict, offers_fingerprint: fingerprint,
          });
        }

        if (verdict.recommended_offer) recommended++;
        if (verdict.recommended_offer
            && verdict.best_fit_offer !== verdict.recommended_offer) laddered++;
        if (typeof verdict.fit_margin === 'number'
            && verdict.fit_margin < FIT_MARGIN) unclear++;
        written++;
      } catch (err) {
        // One account's failure is not the batch's. Record it AS the brief,
        // so a reviewer sees the gap rather than a silently shorter list.
        //
        // And say WHOSE failure it was: a model that truncated mid-JSON says
        // nothing about the company and is retryable, while a dead website is
        // a finding about them. Recording both as 'unreadable' would have the
        // pilot conclude that Telangana pharma has no web presence when the
        // truth was a token limit.
        const message = err instanceof Error ? err.message : String(err);

        // Budget is not a per-company failure — it is the end of the batch.
        // Recording it as one would write extract_failed across every
        // remaining company, which reads as "our pipeline is broken on ninety
        // companies" when the truth is "we stopped spending". Break, keep
        // everything already earned, and report it as a stop.
        if (message.startsWith('TOKEN_BUDGET_EXCEEDED')) {
          stoppedForBudget = true;
          notAttempted = queue.length - queue.indexOf(target);
          await appendStep(pool, runId, {
            step_name: 'budget_stop',
            action: `Stopped at ${target.name} — today's token budget ran out mid-company`,
            output_summary: `${written} brief(s) written and kept · `
              + `${notAttempted} not attempted.`,
            status: 'error',
          });
          break;
        }

        const ours = /^LLM_|^PROMPT_NOT_FOUND/.test(message);
        await this.writeFailure(
          db, tenantId, isLive, prospectId, runId,
          ours ? 'extract_failed' : 'unreadable', domain, message,
        );
        unreadable++;
        written++;
        await appendStep(pool, runId, {
          step_name: 'account_failed',
          action: `${target.name} (${domain})`,
          output_summary: message.slice(0, 200),
          status: 'error',
        });
      }

      done.add(prospectId);
      // After EVERY account: a crash costs one account, not the batch.
      await saveCheckpoint(pool, runId, { done: [...done] });
    }

    const after = await getTokenBudget(pool, tenantId);

    await setStatus(pool, runId, 'completed', {
      output: {
        researched: written,
        // A budget stop is a COMPLETED run that did less than asked, not a
        // failed one. Everything written is real; nothing was half-done. The
        // screen reads these to say so plainly instead of showing a green
        // tick over a batch that covered a fifth of the cohort.
        stopped_for_budget: stoppedForBudget,
        not_attempted: notAttempted,
        // Usage is recorded whether or not a cap exists — this is how
        // anyone finds out what a batch of a hundred actually costs.
        tokens_used: after.tracked ? after.used : null,
        tokens_limit: after.limit,
        // Companies whose facts were reused — no crawl, one LLM call. The
        // number that shows what the facts/judgement split is worth.
        rescored_without_crawling: rescoredOnly,
        unreadable,
        with_recommendation: recommended,
        // Opened with something smaller than the best-fitting offer.
        smaller_first_ask: laddered,
        // Top two offers inside the margin — the brief flags these rather
        // than presenting a coin toss as a decision.
        fit_unclear: unclear,
        no_fit: written - unreadable - recommended,
        offers: catalogue.offers.length,
      },
    });
  }

  /* ── One account, six stages ───────────────────────────────────────── */

  private static async researchOne(
    pool: Pool,
    tenantId: string,
    runId: string,
    target: TargetRow,
  ): Promise<Record<string, unknown>> {
    const domain = target.domain_normalized!;
    const root = target.website && target.website.startsWith('http')
      ? target.website
      : originOf(domain);

    // 1. FETCH — the home page, static first, across the addresses the site
    //    might answer on.
    let home: { text: string; html: string; health: { summary: string } } | null = null;
    let reached = root;
    const attempts: string[] = [];

    for (const candidate of urlVariants(target.website ?? domain)) {
      try {
        home = await IngestionAgent.fetchUrlText(candidate);
        reached = candidate;
        break;
      } catch (err) {
        const why = (err as Error).message.replace(/^URL_FETCH_FAILED: \S+ — /, '');
        attempts.push(`${candidate} (${why})`);
      }
    }

    if (!home) {
      // A dead domain is a real, reportable finding about the company —
      // every address we tried is named so it can be argued with.
      return {
        status: 'unreadable', domain,
        error: `No address answered. Tried: ${attempts.join('; ')}`.slice(0, 500),
      };
    }

    const pages: PageText[] = [];
    if (home.text.length >= MIN_USABLE_TEXT) {
      pages.push({ url: reached, text: home.text.slice(0, PAGE_TEXT_CAP) });
    } else if (IngestionAgent.renderConfigured()) {
      // Escalation, not a fallback: visible as its own step, and a failure
      // here is reported rather than papered over.
      try {
        const html = await IngestionAgent.renderPageViaN8n(reached);
        const rendered = IngestionAgent.extractFromHtml(html);
        if (rendered.text.length >= MIN_USABLE_TEXT) {
          pages.push({ url: reached, text: rendered.text.slice(0, PAGE_TEXT_CAP) });
        }
        await appendStep(pool, runId, {
          step_name: 'render_page',
          action: `${target.name}: static page too thin — rendered it`,
          output_summary: `${rendered.text.length} chars`,
          status: 'ok',
        });
      } catch (err) {
        await appendStep(pool, runId, {
          step_name: 'render_page',
          action: `${target.name}: render failed`,
          output_summary: (err as Error).message.slice(0, 160),
          status: 'error',
        });
      }
    }

    await appendStep(pool, runId, {
      step_name: 'fetch_site',
      action: `${target.name} — ${reached}`,
      output_summary: home.health.summary
        + (attempts.length > 0 ? ` · first ${attempts.length} address(es) did not answer` : ''),
      status: pages.length > 0 ? 'ok' : 'error',
    });

    // 2. CRAWL — a handful of paths that pay off for a manufacturer.
    const linked = this.subpagesFrom(home.html, reached).slice(0, MAX_SUBPAGES);
    for (const url of linked) {
      if (pages.reduce((n, p) => n + p.text.length, 0) >= TOTAL_TEXT_CAP) break;
      try {
        const sub = await IngestionAgent.fetchUrlText(url);
        if (sub.text.length >= MIN_USABLE_TEXT) {
          pages.push({ url, text: sub.text.slice(0, PAGE_TEXT_CAP) });
        }
      } catch { /* one dead subpage is not worth a step of its own */ }
    }

    if (pages.length === 0) {
      return {
        status: 'unreadable', domain,
        site_health: home.health.summary,
        error: 'The site returned no readable text — nothing to research. '
             + 'A brief invented from an empty page is worse than no brief.',
      };
    }

    await appendStep(pool, runId, {
      step_name: 'crawl_pages',
      action: `${target.name}: read ${pages.length} page(s)`,
      output_summary: pages.map((p) => new URL(p.url).pathname).join(' · '),
      status: 'ok',
    });

    const pageBlock = pages
      .map((p) => `SOURCE: ${p.url}\n${p.text}`)
      .join('\n\n---\n\n');

    // 3. EXTRACT — facts, each carrying its source.
    const extracted = await callLLMValidated(
      {
        pool, tenantId, runId,
        system: await loadPrompt(pool, 'research-skill.account_extract', tenantId),
        messages: [{ role: 'user', content: `Company: ${target.name}\n\n${pageBlock}` }],
        // 900 truncated a real API manufacturer mid-string on its own
        // product list, and a half-written JSON object fails validation
        // no matter how good the content was.
        maxTokens: 2_000,
      },
      ExtractSchema,
    );

    // The anti-hallucination gate. A claim whose excerpt appears on no page
    // we actually fetched is dropped, and the drop is visible.
    const { kept, dropped } = verifyEvidence(extracted.evidence ?? [], pages);
    await appendStep(pool, runId, {
      step_name: 'extract',
      action: `${target.name}: extracted the facts`,
      output_summary: `${kept.length} evidenced claim(s)`
        + (dropped > 0 ? ` · ${dropped} dropped as unsupported by any page read` : ''),
      status: dropped > 0 ? 'error' : 'ok',
    });

    // FACTS END HERE. Everything above is about the COMPANY and costs a
    // crawl plus an extraction call; everything below is a judgement against
    // OUR offers and costs one or two. Keeping the halves apart is what makes
    // editing an offer cost one call per company instead of a re-crawl.
    return {
      status: 'facts',
      domain,
      site_health: home.health.summary,
      pages_read: pages.length,
      what_they_make: meaningful(extracted.what_they_make),
      scale_signals: meaningful(extracted.scale_signals),
      service_signals: meaningful(extracted.service_signals),
      digital_maturity: meaningful(extracted.digital_maturity),
      certifications: extracted.certifications ?? [],
      named_contacts: extracted.named_contacts ?? [],
      raw_evidence: kept.map((e) => ({ ...e, excerpt: e.excerpt.slice(0, EXCERPT_CAP) })),
    };
  }

  /* ── Stage 2: judgement — cheap, and redone whenever offers move ───── */

  private static async judge(
    pool: Pool,
    tenantId: string,
    runId: string,
    companyName: string,
    facts: BriefFacts,
    industryRaw: string | null,
    catalogue: OfferCatalogue,
    /** Ratified lessons + recent rulings. Empty until a human decides something. */
    learnedText: string,
    seed: string,
  ): Promise<Record<string, unknown>> {
    const catalogueText = catalogueForPrompt(catalogue, seed);
    const validOfferIds = new Set(catalogue.offers.map((o) => o.id));
    const offerName = new Map(catalogue.offers.map((o) => [o.id, o.name]));

    const briefText = [
      `What they make: ${facts.what_they_make ?? 'not stated'}`,
      `Scale: ${facts.scale_signals ?? 'not stated'}`,
      `Service/AMC: ${facts.service_signals ?? 'not stated'}`,
      `Digital maturity: ${facts.digital_maturity ?? 'not stated'}`,
      `Certifications: ${(facts.certifications ?? []).join(', ') || 'not stated'}`,
      `Industry as filed: ${industryRaw ?? 'not stated'}`,
    ].join('\n');

    // 4. FIT — every offer scored; "none" is a real answer.
    const fit = await callLLMValidated(
      {
        pool, tenantId, runId,
        system: await loadPrompt(pool, 'research-skill.account_fit', tenantId),
        messages: [{
          role: 'user',
          content: `Company brief:\n${briefText}\n\nOUR OFFERS:\n${catalogueText}`
            + (learnedText ? `\n\n${learnedText}` : ''),
        }],
        maxTokens: 1_200,
      },
      FitSchema,
    );

    // A model that returns an offer id we never gave it has invented one.
    const modelChoice = fit.recommended_offer && validOfferIds.has(fit.recommended_offer)
      ? fit.recommended_offer
      : null;
    if (fit.recommended_offer && !modelChoice) {
      await appendStep(pool, runId, {
        step_name: 'fit_score',
        action: `${companyName}: discarded an offer id that is not in the catalogue`,
        output_summary: `"${fit.recommended_offer}" — treated as no fit`,
        status: 'error',
      });
    }

    const scored: { offer_id: string; score: number; reason: string }[] = fit.scores
      .filter((s) => typeof s.offer_id === 'string' && validOfferIds.has(s.offer_id))
      .map((s) => ({
        offer_id: s.offer_id as string,
        score: Number(s.score) || 0,
        reason: String(s.reason ?? ''),
      }));

    // ── THE LADDER ────────────────────────────────────────────────────
    //
    // The model has said how well each offer MATCHES this company. It has
    // not been asked — and is not told anything that would let it answer —
    // how big an ask each one is. That second question is settled here, in
    // code, where the rule is one function anyone can read and argue with.
    //
    // Only ever narrows an existing yes. If the model found no fit, there is
    // no fit; the rule picks a smaller ask, it never invents one.
    const choice = modelChoice
      ? chooseOffer(scored, catalogue.offers)
      : { best: null, recommended: null, margin: null, unclear: false, laddered_from: null };

    // The model named an offer but returned no usable scores — take it at
    // its word rather than dropping a real fit on a technicality.
    const bestFit = choice.best ?? modelChoice;
    const chosen = choice.recommended ?? modelChoice;

    if (modelChoice) {
      await appendStep(pool, runId, {
        step_name: 'fit_score',
        action: `${companyName}: scored against ${validOfferIds.size} offer(s)`,
        output_summary: choice.laddered_from
          ? `best fit ${offerName.get(bestFit!) ?? bestFit} → opening with `
            + `${offerName.get(chosen!) ?? chosen} (same fit band, smaller first ask)`
          : `→ ${offerName.get(chosen!) ?? chosen}`
            + (choice.margin !== null ? ` · clear by ${choice.margin.toFixed(2)}` : ''),
        status: 'ok',
      });

      // Said out loud rather than buried in a column: two scores this close
      // are the same score, and a reviewer who cannot see that will read a
      // coin toss as a judgement.
      if (choice.unclear) {
        await appendStep(pool, runId, {
          step_name: 'fit_unclear',
          action: `${companyName}: top two offers are within ${choice.margin?.toFixed(2)}`,
          output_summary: 'not distinguishable on the evidence — the brief says so',
          status: 'ok',
        });
      }
    } else {
      await appendStep(pool, runId, {
        step_name: 'fit_score',
        action: `${companyName}: scored against ${validOfferIds.size} offer(s)`,
        output_summary: '→ no fit',
        status: 'ok',
      });
    }

    // 5. HOOK — only when there is something to open with, and about the
    //    offer we will ACTUALLY open with. Previously this was handed the
    //    raw offer key ("cdo-as-a-service"), which is not how anyone would
    //    write the sentence it is being asked for.
    let hook: string | null = null;
    if (chosen) {
      const h = await callLLMValidated(
        {
          pool, tenantId, runId,
          system: await loadPrompt(pool, 'research-skill.account_hook', tenantId),
          messages: [{
            role: 'user',
            content: `Company brief:\n${briefText}\n\n`
              + `Offer we intend to discuss: ${offerName.get(chosen) ?? chosen}`,
          }],
          maxTokens: 250,
        },
        HookSchema,
      );
      hook = meaningful(h.hook);
      await appendStep(pool, runId, {
        step_name: 'hook',
        action: `${companyName}: opening observation`,
        output_summary: hook ?? 'none — the brief was too thin to say anything specific',
        status: 'ok',
      });
    }

    const fitMap: Record<string, { score: number; reason: string }> = {};
    for (const sc of scored) {
      fitMap[sc.offer_id] = { score: sc.score, reason: sc.reason };
    }

    return {
      fit: fitMap,
      recommended_offer: chosen,
      best_fit_offer: bestFit,
      fit_margin: choice.margin,
      fit_reason: meaningful(fit.reason),
      hook,
    };
  }

  /* ── Persistence ───────────────────────────────────────────────────── */

  /**
   * Update ONLY the judgement half. Facts, evidence and site health are left
   * exactly as they were — a re-score must never be able to damage the
   * expensive half it did not gather.
   */
  private static async writeJudgement(
    db: ReturnType<typeof createTenantDb>,
    tenantId: string,
    isLive: boolean,
    prospectId: number,
    runId: string,
    verdict: Record<string, unknown>,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.query(
        `UPDATE gt_account_briefs
            SET fit                = $fit::jsonb,
                recommended_offer  = $recommended_offer,
                best_fit_offer     = $best_fit_offer,
                fit_margin         = $fit_margin,
                fit_reason         = $fit_reason,
                hook               = $hook,
                offers_fingerprint = $offers_fingerprint,
                judged_at          = now(),
                run_id             = $run_id,
                -- A row that only carried facts becomes a real brief now.
                status             = CASE WHEN status IN ('extract_failed')
                                         THEN 'drafted' ELSE status END,
                updated_at         = now()
          WHERE prospect_id = $prospect_id
            AND tenant_id   = $tenant_id
            AND is_live     = $is_live`,
        {
          prospect_id: prospectId, tenant_id: tenantId, is_live: isLive,
          run_id: runId,
          fit: JSON.stringify(verdict.fit ?? {}),
          recommended_offer: verdict.recommended_offer ?? null,
          best_fit_offer: verdict.best_fit_offer ?? null,
          fit_margin: verdict.fit_margin ?? null,
          fit_reason: verdict.fit_reason ?? null,
          hook: verdict.hook ?? null,
          offers_fingerprint: verdict.offers_fingerprint ?? null,
        },
      );
    });
  }

  /**
   * Record that an attempt failed, WITHOUT destroying what an earlier attempt
   * earned.
   *
   * ── THE BUG THIS EXISTS FOR ───────────────────────────────────────────
   *
   * Failures used to go through writeBrief, whose ON CONFLICT sets every
   * column from EXCLUDED. So a company with a perfectly good brief — facts,
   * evidence, a real fit score — had all of it overwritten with NULLs the
   * moment ANY later attempt failed. In the pilot, Venkateshwara Hatcheries
   * had been scored at 0.72 for AI Automations; a re-run hit the token cap,
   * the catch block called writeBrief, and the brief became "No fit" with an
   * empty fit map. The research was not just wasted, it was deleted — and by
   * an error that had nothing to do with that company.
   *
   * So: the error and the run id are recorded, and NOTHING else moves. A row
   * that already carries facts keeps its status too — it is still a real
   * brief; a retry falling over does not un-know what we learned.
   */
  private static async writeFailure(
    db: ReturnType<typeof createTenantDb>,
    tenantId: string,
    isLive: boolean,
    prospectId: number,
    runId: string,
    status: 'extract_failed' | 'unreadable',
    domain: string | null,
    error: string,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO gt_account_briefs
           (tenant_id, is_live, prospect_id, run_id, domain, status, error, fetched_at)
         VALUES
           ($tenant_id, $is_live, $prospect_id, $run_id, $domain, $status, $error, now())
         ON CONFLICT (tenant_id, is_live, prospect_id) DO UPDATE SET
            run_id     = EXCLUDED.run_id,
            error      = EXCLUDED.error,
            -- Facts already gathered mean this is still a brief. Only a row
            -- that never got anywhere becomes a failure row.
            status     = CASE WHEN gt_account_briefs.facts_at IS NOT NULL
                              THEN gt_account_briefs.status
                              ELSE EXCLUDED.status END,
            updated_at = now()`,
        {
          tenant_id: tenantId, is_live: isLive, prospect_id: prospectId,
          run_id: runId, domain, status, error: error.slice(0, 500),
        },
      );
    });
  }

  private static async writeBrief(
    db: ReturnType<typeof createTenantDb>,
    tenantId: string,
    isLive: boolean,
    prospectId: number,
    runId: string,
    brief: Record<string, unknown>,
  ): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.query(
        `INSERT INTO gt_account_briefs
           (tenant_id, is_live, prospect_id, run_id, domain, fetched_at, pages_read,
            site_health, what_they_make, scale_signals, service_signals,
            digital_maturity, certifications, named_contacts, fit, recommended_offer,
            best_fit_offer, fit_margin, fit_reason, hook, raw_evidence, error, status,
            facts_at, judged_at, offers_fingerprint)
         VALUES
           ($tenant_id, $is_live, $prospect_id, $run_id, $domain, now(), $pages_read,
            $site_health, $what_they_make, $scale_signals, $service_signals,
            $digital_maturity, $certifications::text[], $named_contacts::jsonb,
            $fit::jsonb, $recommended_offer, $best_fit_offer, $fit_margin,
            $fit_reason, $hook,
            $raw_evidence::jsonb, $error, $status,
            $facts_at, $judged_at, $offers_fingerprint)
         ON CONFLICT (tenant_id, is_live, prospect_id) DO UPDATE SET
            run_id            = EXCLUDED.run_id,
            domain            = EXCLUDED.domain,
            fetched_at        = EXCLUDED.fetched_at,
            pages_read        = EXCLUDED.pages_read,
            site_health       = EXCLUDED.site_health,
            what_they_make    = EXCLUDED.what_they_make,
            scale_signals     = EXCLUDED.scale_signals,
            service_signals   = EXCLUDED.service_signals,
            digital_maturity  = EXCLUDED.digital_maturity,
            certifications    = EXCLUDED.certifications,
            named_contacts    = EXCLUDED.named_contacts,
            fit               = EXCLUDED.fit,
            recommended_offer = EXCLUDED.recommended_offer,
            best_fit_offer    = EXCLUDED.best_fit_offer,
            fit_margin        = EXCLUDED.fit_margin,
            fit_reason        = EXCLUDED.fit_reason,
            hook              = EXCLUDED.hook,
            raw_evidence      = EXCLUDED.raw_evidence,
            error             = EXCLUDED.error,
            status            = EXCLUDED.status,
            facts_at          = EXCLUDED.facts_at,
            judged_at         = EXCLUDED.judged_at,
            offers_fingerprint = EXCLUDED.offers_fingerprint,
            -- Re-researching replaces knowledge, so a human's earlier
            -- decision no longer applies to what the row now says.
            decided_by        = NULL,
            decided_at        = NULL,
            decision_note     = NULL,
            updated_at        = now()`,
        {
          tenant_id: tenantId, is_live: isLive, prospect_id: prospectId, run_id: runId,
          domain: brief.domain ?? null,
          pages_read: brief.pages_read ?? 0,
          site_health: brief.site_health ?? null,
          what_they_make: brief.what_they_make ?? null,
          scale_signals: brief.scale_signals ?? null,
          service_signals: brief.service_signals ?? null,
          digital_maturity: brief.digital_maturity ?? null,
          certifications: (brief.certifications as string[]) ?? [],
          named_contacts: JSON.stringify(brief.named_contacts ?? []),
          fit: JSON.stringify(brief.fit ?? {}),
          recommended_offer: brief.recommended_offer ?? null,
          best_fit_offer: brief.best_fit_offer ?? null,
          fit_margin: brief.fit_margin ?? null,
          fit_reason: brief.fit_reason ?? null,
          hook: brief.hook ?? null,
          raw_evidence: JSON.stringify(brief.raw_evidence ?? []),
          error: brief.error ?? null,
          status: brief.status ?? 'drafted',
          // Facts only count as gathered when there was something to gather.
          facts_at: brief.what_they_make || brief.scale_signals ? new Date() : null,
          judged_at: brief.fit ? new Date() : null,
          offers_fingerprint: brief.offers_fingerprint ?? null,
        },
      );
    });
  }

  /* ── Subpage discovery ─────────────────────────────────────────────── */

  /**
   * Same-host links whose path looks like one of SUBPAGE_HINTS. Deliberately
   * dumb: guessing /about on a site that has no such page costs one 404,
   * while following every link costs the timeout.
   */
  static subpagesFrom(html: string, root: string): string[] {
    let origin: string;
    try { origin = new URL(root).origin; } catch { return []; }

    const found = new Map<string, number>();
    const hrefRe = /href\s*=\s*["']([^"']+)["']/gi;
    let m: RegExpExecArray | null;

    while ((m = hrefRe.exec(html)) !== null) {
      let url: URL;
      try { url = new URL(m[1], origin); } catch { continue; }
      if (url.origin !== origin) continue;

      const path = url.pathname.toLowerCase().replace(/\.(html?|php|aspx?)$/, '');
      if (path === '/' || path === '') continue;

      const rank = SUBPAGE_HINTS.findIndex((hint) => {
        const segs = path.split('/').filter(Boolean);
        return segs.some((s) => s === hint || s.replace(/[-_]/g, '') === hint.replace(/[-_]/g, ''));
      });
      if (rank === -1) continue;

      url.hash = '';
      const clean = url.toString();
      if (!found.has(clean) || rank < found.get(clean)!) found.set(clean, rank);
    }

    return [...found.entries()]
      .sort((a, b) => a[1] - b[1])
      .map(([url]) => url);
  }
}
