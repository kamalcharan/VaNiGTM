/**
 * story-skill: list_stories
 *
 * Every story on one journey — the ledger the compose screen reads to
 * satisfy "the journey's earlier stories visible while writing" (R-S2).
 *
 * Ordered by seq, oldest first. Includes drafts because a draft in
 * another tab is still work the next author must not repeat.
 */

import { SkillContext } from '../../../shared/types';

interface ListStoriesParams {
  journey_id?: number;
  prospect_id?: number;
  status?: 'draft' | 'approved' | 'sent' | 'archived';
}

export async function list_stories(params: ListStoriesParams, ctx: SkillContext) {
  const journeyId = Number(params.journey_id);
  const prospectId = Number(params.prospect_id);
  if (!Number.isFinite(journeyId) && !Number.isFinite(prospectId)) {
    throw new Error('journey_id or prospect_id is required');
  }

  const res = await ctx.db.query<Record<string, unknown>>(
    `SELECT s.id::text, s.journey_id::text, s.seq, s.kind_key, s.author, s.author_id,
            s.offer, s.subject, s.body, s.evidence_refs, s.asset_ids, s.status,
            s.sent_as_touch::text, s.approved_by, s.approved_at, s.sent_at,
            s.created_by, s.created_at, s.updated_at,
            j.prospect_id::text, p.name AS prospect_name
       FROM gt_journey_stories s
       JOIN gt_journeys j ON j.id = s.journey_id
       JOIN gt_prospects p ON p.id = j.prospect_id
      WHERE s.tenant_id = $tenant_id AND s.is_live = $is_live
        AND ($journey_id::bigint  IS NULL OR s.journey_id = $journey_id::bigint)
        AND ($prospect_id::bigint IS NULL OR j.prospect_id = $prospect_id::bigint)
        AND ($status::text IS NULL OR s.status = $status::text)
      ORDER BY j.id, s.seq`,
    {
      tenant_id: ctx.tenant_id, is_live: ctx.is_live,
      journey_id: Number.isFinite(journeyId) ? journeyId : null,
      prospect_id: Number.isFinite(prospectId) ? prospectId : null,
      status: params.status ?? null,
    },
  );

  return {
    stories: res.rows,
    total: res.rows.length,
    recipe: 'story-list' as const,
  };
}
