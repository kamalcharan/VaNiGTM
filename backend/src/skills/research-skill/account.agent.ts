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
 *                     EVERY offer, with "none" a first-class outcome
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
import { callLLMValidated } from '../../agent-core/llm.client';
import { loadPrompt } from '../../agent-core/prompt.store';
import { IngestionAgent } from '../ingestion-skill/ingestion.agent';
import { loadOfferCatalogue, catalogueForPrompt, type OfferCatalogue } from './offer-catalogue';

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
}

interface PageText { url: string; text: string }

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
    const catalogueText = catalogueForPrompt(catalogue);
    const validOfferIds = new Set(catalogue.offers.map((o) => o.id));

    await appendStep(pool, runId, {
      step_name: 'offer_catalogue',
      action: 'Loaded the offers to score against',
      output_summary: catalogue.offers.map((o) => o.name).join(' · '),
      status: 'ok',
    });

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
    const targets = await db.query<TargetRow>(
      `SELECT p.id, p.name, p.domain_normalized, p.website, p.industry_raw
         FROM gt_prospects p
        WHERE p.tenant_id = $tenant_id
          AND p.is_live   = $is_live
          AND p.is_active = true
          AND p.domain_normalized IS NOT NULL
          AND ($tag_id::bigint IS NULL OR EXISTS (
                SELECT 1 FROM gt_prospect_tags pt
                 WHERE pt.prospect_id = p.id AND pt.tag_id = $tag_id::bigint))
          AND ($ids::bigint[] IS NULL OR p.id = ANY($ids::bigint[]))
          AND ($refresh::boolean OR NOT EXISTS (
                SELECT 1 FROM gt_account_briefs b
                 WHERE b.prospect_id = p.id
                   AND b.tenant_id   = $tenant_id
                   AND b.is_live     = $is_live))
        ORDER BY p.completeness DESC NULLS LAST, p.id
        LIMIT $limit`,
      {
        tenant_id: tenantId, is_live: isLive,
        tag_id: tagId ?? null,
        ids: explicitIds.length > 0 ? explicitIds : null,
        refresh, limit,
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

    let written = 0;
    let unreadable = 0;
    let recommended = 0;

    for (const target of queue) {
      const prospectId = Number(target.id);
      const domain = target.domain_normalized!;

      try {
        const brief = await this.researchOne(
          pool, tenantId, runId, target, catalogueText, validOfferIds,
        );

        await this.writeBrief(db, tenantId, isLive, prospectId, runId, brief);
        if (brief.status === 'unreadable' || brief.status === 'extract_failed') unreadable++;
        else if (brief.recommended_offer) recommended++;
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
        const ours = /^LLM_|^TOKEN_BUDGET|^PROMPT_NOT_FOUND/.test(message);
        await this.writeBrief(db, tenantId, isLive, prospectId, runId, {
          status: ours ? 'extract_failed' : 'unreadable',
          domain,
          error: message.slice(0, 500),
        });
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

    await setStatus(pool, runId, 'completed', {
      output: {
        researched: written,
        unreadable,
        with_recommendation: recommended,
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
    catalogueText: string,
    validOfferIds: Set<string>,
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

    const briefText = [
      `What they make: ${meaningful(extracted.what_they_make) ?? 'not stated'}`,
      `Scale: ${meaningful(extracted.scale_signals) ?? 'not stated'}`,
      `Service/AMC: ${meaningful(extracted.service_signals) ?? 'not stated'}`,
      `Digital maturity: ${meaningful(extracted.digital_maturity) ?? 'not stated'}`,
      `Certifications: ${(extracted.certifications ?? []).join(', ') || 'not stated'}`,
      `Industry as filed: ${target.industry_raw ?? 'not stated'}`,
    ].join('\n');

    // 4. FIT — every offer scored; "none" is a real answer.
    const fit = await callLLMValidated(
      {
        pool, tenantId, runId,
        system: await loadPrompt(pool, 'research-skill.account_fit', tenantId),
        messages: [{
          role: 'user',
          content: `Company brief:\n${briefText}\n\nOUR OFFERS:\n${catalogueText}`,
        }],
        maxTokens: 1_200,
      },
      FitSchema,
    );

    // A model that returns an offer id we never gave it has invented one.
    const chosen = fit.recommended_offer && validOfferIds.has(fit.recommended_offer)
      ? fit.recommended_offer
      : null;
    if (fit.recommended_offer && !chosen) {
      await appendStep(pool, runId, {
        step_name: 'fit_score',
        action: `${target.name}: discarded an offer id that is not in the catalogue`,
        output_summary: `"${fit.recommended_offer}" — treated as no fit`,
        status: 'error',
      });
    } else {
      await appendStep(pool, runId, {
        step_name: 'fit_score',
        action: `${target.name}: scored against ${validOfferIds.size} offer(s)`,
        output_summary: chosen ? `→ ${chosen}` : '→ no fit',
        status: 'ok',
      });
    }

    // 5. HOOK — only when there is something to open with.
    let hook: string | null = null;
    if (chosen) {
      const offerName = [...validOfferIds].includes(chosen) ? chosen : '';
      const h = await callLLMValidated(
        {
          pool, tenantId, runId,
          system: await loadPrompt(pool, 'research-skill.account_hook', tenantId),
          messages: [{
            role: 'user',
            content: `Company brief:\n${briefText}\n\nOffer we intend to discuss: ${offerName}`,
          }],
          maxTokens: 250,
        },
        HookSchema,
      );
      hook = meaningful(h.hook);
      await appendStep(pool, runId, {
        step_name: 'hook',
        action: `${target.name}: opening observation`,
        output_summary: hook ?? 'none — the brief was too thin to say anything specific',
        status: 'ok',
      });
    }

    const fitMap: Record<string, { score: number; reason: string }> = {};
    for (const s of fit.scores) {
      if (validOfferIds.has(s.offer_id)) fitMap[s.offer_id] = { score: s.score, reason: s.reason };
    }

    return {
      status: 'drafted',
      domain,
      site_health: home.health.summary,
      pages_read: pages.length,
      what_they_make: meaningful(extracted.what_they_make),
      scale_signals: meaningful(extracted.scale_signals),
      service_signals: meaningful(extracted.service_signals),
      digital_maturity: meaningful(extracted.digital_maturity),
      named_contacts: extracted.named_contacts ?? [],
      fit: fitMap,
      recommended_offer: chosen,
      fit_reason: meaningful(fit.reason),
      hook,
      raw_evidence: kept.map((e) => ({ ...e, excerpt: e.excerpt.slice(0, EXCERPT_CAP) })),
    };
  }

  /* ── Persistence ───────────────────────────────────────────────────── */

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
            digital_maturity, named_contacts, fit, recommended_offer, fit_reason,
            hook, raw_evidence, error, status)
         VALUES
           ($tenant_id, $is_live, $prospect_id, $run_id, $domain, now(), $pages_read,
            $site_health, $what_they_make, $scale_signals, $service_signals,
            $digital_maturity, $named_contacts::jsonb, $fit::jsonb, $recommended_offer,
            $fit_reason, $hook, $raw_evidence::jsonb, $error, $status)
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
            named_contacts    = EXCLUDED.named_contacts,
            fit               = EXCLUDED.fit,
            recommended_offer = EXCLUDED.recommended_offer,
            fit_reason        = EXCLUDED.fit_reason,
            hook              = EXCLUDED.hook,
            raw_evidence      = EXCLUDED.raw_evidence,
            error             = EXCLUDED.error,
            status            = EXCLUDED.status,
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
          named_contacts: JSON.stringify(brief.named_contacts ?? []),
          fit: JSON.stringify(brief.fit ?? {}),
          recommended_offer: brief.recommended_offer ?? null,
          fit_reason: brief.fit_reason ?? null,
          hook: brief.hook ?? null,
          raw_evidence: JSON.stringify(brief.raw_evidence ?? []),
          error: brief.error ?? null,
          status: brief.status ?? 'drafted',
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
