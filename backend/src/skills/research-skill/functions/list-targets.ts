/**
 * research-skill: list_targets
 *
 * The companies you could research, each with what is already known about it.
 *
 * ── WHY THIS EXISTS RATHER THAN "RESEARCH 10" ─────────────────────────
 *
 * The batch used to be picked by a number: research 10, or 25, or 50, ordered
 * by completeness. That is fine for a first smoke test and useless after it.
 * Once you have read some briefs you know which companies you want read
 * properly, which one had a bad crawl, which four are the ones that actually
 * matter — and "10" cannot express any of that.
 *
 * So the picker gets the same facts the agent uses to decide: has this been
 * researched, did our extraction fall over, is its judgement stale against
 * the current offers, has a human already ruled on it. Choosing then becomes
 * a decision rather than a guess.
 */

import { SkillContext } from '../../../shared/types';
import { catalogueFingerprint } from '../offer-catalogue';
import { readCorrections, correctionsFingerprint, judgementFingerprint } from '../corrections';
import { readLessons } from '../lessons';

interface ListTargetsParams {
  tag_id?: number;
  search?: string;
  /** 'all' | 'new' | 'researched' | 'failed' | 'stale' | 'decided' */
  state?: string;
  limit?: number;
  offset?: number;
}

export async function list_targets(params: ListTargetsParams, ctx: SkillContext) {
  const limit = Math.min(Math.max(Number(params.limit) || 100, 1), 500);
  const offset = Math.max(Number(params.offset) || 0, 0);

  const fingerprint = judgementFingerprint(
    await catalogueFingerprint(ctx.db, ctx.tenant_id),
    correctionsFingerprint(
      await readCorrections(ctx.db, ctx.tenant_id, ctx.is_live),
      await readLessons(ctx.db, ctx.tenant_id, ctx.is_live),
    ),
  );

  const res = await ctx.db.query<Record<string, unknown>>(
    `SELECT p.id,
            p.ref,
            p.name,
            p.domain_normalized                    AS domain,
            p.industry_raw,
            b.status                               AS brief_status,
            b.facts_at IS NOT NULL                 AS has_facts,
            b.decided_at IS NOT NULL               AS decided,
            COALESCE(b.human_offer, b.recommended_offer) AS offer,
            b.error,
            b.updated_at                           AS researched_at,
            -- Judged against a different offer set or a different set of your
            -- rulings: one LLM call to fix, no crawling.
            (b.id IS NOT NULL
             AND b.facts_at IS NOT NULL
             AND b.decided_at IS NULL
             AND b.status NOT IN ('unreadable','extract_failed')
             AND b.offers_fingerprint IS DISTINCT FROM $fingerprint) AS stale,
            COUNT(*) OVER ()                       AS filtered_total
       FROM gt_prospects p
       LEFT JOIN gt_account_briefs b
              ON b.prospect_id = p.id
             AND b.tenant_id   = $tenant_id
             AND b.is_live     = $is_live
      WHERE p.tenant_id = $tenant_id
        AND p.is_live   = $is_live
        AND p.is_active = true
        -- No domain means nothing to read. Excluded here rather than shown
        -- and greyed, because a picker offering unpickable rows is noise.
        AND p.domain_normalized IS NOT NULL
        AND ($tag_id::bigint IS NULL OR EXISTS (
              SELECT 1 FROM gt_prospect_tags pt
               WHERE pt.prospect_id = p.id AND pt.tag_id = $tag_id::bigint))
        AND ($search::text IS NULL
             OR p.name ILIKE '%' || $search::text || '%'
             OR p.domain_normalized ILIKE '%' || $search::text || '%')
        AND ($state::text IS NULL OR $state::text = 'all'
             OR ($state::text = 'new'        AND b.id IS NULL)
             OR ($state::text = 'failed'     AND b.status IN ('extract_failed','unreadable'))
             OR ($state::text = 'decided'    AND b.decided_at IS NOT NULL)
             OR ($state::text = 'researched' AND b.facts_at IS NOT NULL)
             OR ($state::text = 'stale'      AND b.facts_at IS NOT NULL
                                             AND b.decided_at IS NULL
                                             AND b.status NOT IN ('unreadable','extract_failed')
                                             AND b.offers_fingerprint IS DISTINCT FROM $fingerprint))
      -- Never researched first: that is what someone opening this is usually
      -- looking for.
      ORDER BY (b.id IS NOT NULL), p.completeness DESC NULLS LAST, p.name
      LIMIT $limit OFFSET $offset`,
    {
      tenant_id: ctx.tenant_id, is_live: ctx.is_live,
      tag_id: Number(params.tag_id) || null,
      search: params.search?.trim() || null,
      state: params.state?.trim() || null,
      fingerprint, limit, offset,
    },
  );

  const total = res.rows.length > 0 ? Number(res.rows[0].filtered_total) : 0;

  return {
    targets: res.rows,
    total,
    limit,
    offset,
    recipe: 'target-list' as const,
  };
}
