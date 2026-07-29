/**
 * research-skill: start_research
 *
 * Queue the account research batch from the screen.
 *
 * Emits ACCOUNT_RESEARCH_REQUESTED for the worker rather than running here:
 * a hundred accounts is hours of crawling and LLM calls, which is not
 * something an HTTP request should hold open.
 *
 * The offer catalogue is validated BEFORE the event is emitted, so a
 * half-written offer produces an error the user can act on instead of a run
 * that fails three seconds later in a log they are not watching.
 */

import { SkillContext } from '../../../shared/types';
import { readOffers, catalogueProblems, catalogueFingerprint } from '../offer-catalogue';
import { readCorrections, correctionsFingerprint, judgementFingerprint } from '../corrections';
import { readLessons } from '../lessons';
import { emitEvent } from '../../../agent-core/event.store';
import { getPool } from '../../../db/pool';
import { getTokenBudget } from '../../../agent-core/llm.client';
import { segmentPredicate } from '../../prospect-skill/segment-sql';
import { cleanDefinition } from '../../prospect-skill/segments';
import { COST_FULL_RESEARCH } from '../account.agent';

interface StartResearchParams {
  tag_id?: number;
  prospect_ids?: number[];
  /**
   * Research a saved segment.
   *
   * Resolved to explicit prospect ids HERE, not carried into the run. A
   * segment is a live definition — if the batch carried the definition
   * instead, a rule change mid-run would move the cohort underneath it and
   * nobody could say afterwards which companies were actually researched.
   * Resolving now means the run is a fixed list, and the list is a record.
   */
  segment_id?: number;
  limit?: number;
  /** Redo companies that already have a brief. Default false. */
  refresh?: boolean;
  /** Report the split without queueing anything. */
  preview?: boolean;
}

export async function start_research(params: StartResearchParams, ctx: SkillContext) {
  const offers = await readOffers(ctx.db, ctx.tenant_id);
  if (offers.length === 0) {
    throw new Error('Add what you sell before researching anyone — fit scoring needs it.');
  }
  const problems = catalogueProblems(offers);
  if (problems.length > 0) {
    throw new Error(
      `Your offers are not ready:\n- ${problems.join('\n- ')}\n\n`
      + 'Scoring against a blank produces a number that looks meaningful and is not, '
      + 'and that number decides who gets contacted.',
    );
  }

  const tagId = Number(params.tag_id) || null;
  let ids = Array.isArray(params.prospect_ids)
    ? params.prospect_ids.map(Number).filter(Number.isFinite)
    : [];

  if (params.segment_id && ids.length === 0) {
    const seg = await ctx.db.query<{ definition: unknown }>(
      `SELECT definition FROM gt_segments
        WHERE id = $segment_id AND tenant_id = $tenant_id AND is_live = $is_live
          AND is_active`,
      { segment_id: Number(params.segment_id), tenant_id: ctx.tenant_id, is_live: ctx.is_live },
    );
    if (seg.rows.length === 0) throw new Error('No such segment.');

    const members = await ctx.db.query<{ id: string }>(
      `SELECT p.id::text FROM gt_prospects p
        WHERE p.tenant_id = $tenant_id
          AND p.is_live   = $is_live
          AND p.is_active = true
          AND p.domain_normalized IS NOT NULL
          AND ${segmentPredicate('p', '$definition::jsonb')}`,
      {
        tenant_id: ctx.tenant_id, is_live: ctx.is_live,
        definition: JSON.stringify(cleanDefinition(seg.rows[0].definition)),
      },
    );
    ids = members.rows.map((r) => Number(r.id));

    if (ids.length === 0) {
      throw new Error(
        'Nothing in that segment has a website, so there is nothing to read. '
        + 'The segment itself is fine — widen it, or check the website filter.',
      );
    }
  }

  if (!tagId && ids.length === 0) {
    throw new Error('Pick a cohort, a segment, or select the companies to research.');
  }

  // The whole split, said out loud BEFORE anything starts. Re-running a
  // batch used to silently re-crawl companies that already had a brief;
  // now the caller sees "10 selected, 7 already researched, 3 to do" and
  // decides, rather than discovering it from the bill.
  // Counted by what the brief actually SAYS, not merely that one exists.
  // "4 already researched" was including two rows that failed — one because
  // their site did not answer, one because our own extraction truncated —
  // which would have written both off permanently.
  const counts = await ctx.db.query<{
    selected: string; reachable: string; researched: string;
    retryable: string; unreadable: string; needs_rescore: string;
  }>(
    `SELECT count(*)::text                                   AS selected,
            count(*) FILTER (WHERE p.domain_normalized IS NOT NULL)::text
                                                             AS reachable,
            count(*) FILTER (WHERE p.domain_normalized IS NOT NULL
                               AND EXISTS (
                    SELECT 1 FROM gt_account_briefs b
                     WHERE b.prospect_id = p.id
                       AND b.tenant_id   = $tenant_id
                       AND b.is_live     = $is_live
                       AND b.status NOT IN ('extract_failed','unreadable')))::text
                                                             AS researched,
            count(*) FILTER (WHERE p.domain_normalized IS NOT NULL
                               AND EXISTS (
                    SELECT 1 FROM gt_account_briefs b
                     WHERE b.prospect_id = p.id
                       AND b.tenant_id   = $tenant_id
                       AND b.is_live     = $is_live
                       AND b.status = 'extract_failed'))::text AS retryable,
            count(*) FILTER (WHERE p.domain_normalized IS NOT NULL
                               AND EXISTS (
                    SELECT 1 FROM gt_account_briefs b
                     WHERE b.prospect_id = p.id
                       AND b.tenant_id   = $tenant_id
                       AND b.is_live     = $is_live
                       AND b.status = 'unreadable'))::text     AS unreadable,
            -- Facts already gathered, judgement made against a DIFFERENT
            -- offer set. These cost one LLM call and no crawl at all.
            count(*) FILTER (WHERE p.domain_normalized IS NOT NULL
                               AND EXISTS (
                    SELECT 1 FROM gt_account_briefs b
                     WHERE b.prospect_id = p.id
                       AND b.tenant_id   = $tenant_id
                       AND b.is_live     = $is_live
                       AND b.facts_at IS NOT NULL
                       AND b.status NOT IN ('unreadable','extract_failed')
                       -- A brief the reviewer has ruled on is never
                       -- re-judged; their decision stands.
                       AND b.decided_at IS NULL
                       AND b.offers_fingerprint IS DISTINCT FROM $fingerprint))::text
                                                                   AS needs_rescore
       FROM gt_prospects p
      WHERE p.tenant_id = $tenant_id AND p.is_live = $is_live
        AND p.is_active
        AND ($tag_id::bigint IS NULL OR EXISTS (
              SELECT 1 FROM gt_prospect_tags pt
               WHERE pt.prospect_id = p.id AND pt.tag_id = $tag_id::bigint))
        AND ($ids::bigint[] IS NULL OR p.id = ANY($ids::bigint[]))`,
    {
      tenant_id: ctx.tenant_id, is_live: ctx.is_live,
      tag_id: tagId, ids: ids.length > 0 ? ids : null,
      // The same stamp the agent writes: offers AND what the reviewer has
      // taught it. Ratify a lesson and the undecided briefs go stale here,
      // which is what puts "N re-scoring" on screen before the button.
      fingerprint: judgementFingerprint(
        await catalogueFingerprint(ctx.db, ctx.tenant_id),
        correctionsFingerprint(
          await readCorrections(ctx.db, ctx.tenant_id, ctx.is_live),
          await readLessons(ctx.db, ctx.tenant_id, ctx.is_live),
        ),
      ),
    },
  );

  const selected = Number(counts.rows[0]?.selected ?? 0);
  const reachableCount = Number(counts.rows[0]?.reachable ?? 0);
  const alreadyResearched = Number(counts.rows[0]?.researched ?? 0);
  const retryable = Number(counts.rows[0]?.retryable ?? 0);
  const unreadable = Number(counts.rows[0]?.unreadable ?? 0);
  const needsRescore = Number(counts.rows[0]?.needs_rescore ?? 0);
  const refresh = params.refresh === true;

  // Never researched, PLUS the ones our own pipeline failed on, PLUS the ones
  // whose judgement predates the current offers. A dead website is skipped
  // unless refresh is asked for — a finding about them, not a retryable bug.
  const todo = refresh
    ? reachableCount
    : reachableCount - alreadyResearched - unreadable + needsRescore;

  // How much of this the day's tokens can actually pay for. Answered BEFORE
  // the button, because the alternative is what happened on the first real
  // batch: a hundred companies queued against a budget that covered seven,
  // discovered at company eight.
  const budget = await getTokenBudget(getPool(), ctx.tenant_id);
  const affordable = budget.capped
    ? Math.floor(budget.remaining / COST_FULL_RESEARCH)
    : null;

  const split = {
    selected,
    reachable: reachableCount,
    no_website: selected - reachableCount,
    // "Done" means judged against the CURRENT offers.
    already_researched: alreadyResearched - needsRescore,
    extraction_failed: retryable,
    no_address_answered: unreadable,
    // The cheap half: one call each, no crawling.
    needs_rescore: refresh ? 0 : needsRescore,
    to_research: todo,
    tokens_used_today: budget.tracked ? budget.used : null,
    tokens_limit: budget.limit,
    /** Companies today's remaining budget covers. null = nothing is metered. */
    affordable_today: affordable,
  };

  // Preview: answer the question, queue nothing.
  if (params.preview === true) {
    return { ...split, queued: 0, event_id: null, recipe: 'research-preview' as const };
  }

  if (reachableCount === 0) {
    throw new Error(
      'None of those companies has a website, so there is nothing to research. '
      + 'Filter the cohort by "has domain" to see what is reachable.',
    );
  }
  if (todo === 0) {
    throw new Error(
      `All ${reachableCount} reachable companies here already have a brief. `
      + 'Tick "redo existing briefs" if you want them researched again.',
    );
  }
  // Refuse before queueing rather than after crawling. The run would stop
  // cleanly either way, but a batch that cannot start is better said here
  // than discovered in a run feed.
  if (affordable !== null && affordable < 1) {
    throw new Error(
      `Today's token budget is spent — ${budget.used.toLocaleString()} of `
      + `${budget.limit.toLocaleString()} used, and one company costs about `
      + `${COST_FULL_RESEARCH.toLocaleString()}. This is our own cap, not the model `
      + 'refusing. Raise the daily limit below, or it resets at midnight UTC.',
    );
  }

  const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 500);

  const eventId = await emitEvent(
    getPool(), ctx.tenant_id, 'ACCOUNT_RESEARCH_REQUESTED', 'human',
    {
      is_live: ctx.is_live,
      limit,
      refresh,
      ...(tagId ? { tag_id: tagId } : {}),
      ...(ids.length ? { prospect_ids: ids } : {}),
    },
  );

  return {
    ...split,
    event_id: eventId,
    queued: Math.min(limit, todo),
    recipe: 'research-queued' as const,
  };
}
