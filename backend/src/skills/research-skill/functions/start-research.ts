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
import { readOffers, catalogueProblems } from '../offer-catalogue';
import { emitEvent } from '../../../agent-core/event.store';
import { getPool } from '../../../db/pool';

interface StartResearchParams {
  tag_id?: number;
  prospect_ids?: number[];
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
  const ids = Array.isArray(params.prospect_ids)
    ? params.prospect_ids.map(Number).filter(Number.isFinite)
    : [];
  if (!tagId && ids.length === 0) {
    throw new Error('Pick a cohort tag, or select the companies to research.');
  }

  // The whole split, said out loud BEFORE anything starts. Re-running a
  // batch used to silently re-crawl companies that already had a brief;
  // now the caller sees "10 selected, 7 already researched, 3 to do" and
  // decides, rather than discovering it from the bill.
  const counts = await ctx.db.query<{
    selected: string; reachable: string; researched: string;
  }>(
    `SELECT count(*)::text                                   AS selected,
            count(*) FILTER (WHERE p.domain_normalized IS NOT NULL)::text
                                                             AS reachable,
            count(*) FILTER (WHERE p.domain_normalized IS NOT NULL
                               AND EXISTS (
                    SELECT 1 FROM gt_account_briefs b
                     WHERE b.prospect_id = p.id
                       AND b.tenant_id   = $tenant_id
                       AND b.is_live     = $is_live))::text   AS researched
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
    },
  );

  const selected = Number(counts.rows[0]?.selected ?? 0);
  const reachableCount = Number(counts.rows[0]?.reachable ?? 0);
  const alreadyResearched = Number(counts.rows[0]?.researched ?? 0);
  const refresh = params.refresh === true;
  const todo = refresh ? reachableCount : reachableCount - alreadyResearched;

  const split = {
    selected,
    reachable: reachableCount,
    no_website: selected - reachableCount,
    already_researched: alreadyResearched,
    to_research: todo,
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
