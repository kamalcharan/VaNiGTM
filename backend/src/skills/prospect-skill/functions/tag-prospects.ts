/**
 * prospect-skill: tag_prospects
 *
 * Apply or remove a tag on records, after the fact.
 *
 * Tagging at IMPORT time attaches to the delivery (gt_load_tags) — that is
 * where "FTCCI Telangana" belongs, and every record inherits it. This is the
 * other half: "shortlist", "wrong segment", "met at the trade show" are true
 * of some records and not of the whole delivery, so they attach to the record.
 *
 * Inherited tags cannot be removed here. They are a property of where the
 * record came from, and unpicking that per row would make provenance a lie.
 */

import { SkillContext } from '../../../shared/types';

interface TagProspectsParams {
  prospect_ids: number[];
  tag_id: number;
  /** false removes the direct tag instead of adding it. */
  apply?: boolean;
}

interface TagProspectsResult {
  applied: number;
  removed: number;
  recipe: 'prospect-tag';
}

export async function tag_prospects(
  params: TagProspectsParams,
  ctx: SkillContext,
): Promise<TagProspectsResult> {
  const ids = (params.prospect_ids ?? []).map(Number).filter(Number.isFinite);
  if (ids.length === 0) {
    throw new Error('prospect_ids is required');
  }
  if (!Number.isFinite(Number(params.tag_id))) {
    throw new Error('tag_id is required');
  }
  const apply = params.apply !== false;

  return ctx.db.transaction(async (tx) => {
    // The tag must be one this tenant may use: their own, or a platform tag.
    // Checked here rather than trusted from the client.
    const tag = await tx.query<{ id: number }>(
      `SELECT id FROM gt_tags
       WHERE id = $tag_id AND is_active = true
         AND (tenant_id IS NULL OR tenant_id = $tenant_id)`,
      { $tag_id: params.tag_id, $tenant_id: ctx.tenant_id },
    );
    if (tag.rows.length === 0) {
      throw new Error('Unknown tag, or it belongs to another tenant.');
    }

    if (apply) {
      // The prospect filter is the authorisation: ids naming another tenant's
      // records simply match nothing.
      // RETURNING + rows.length rather than rowCount: the db wrapper's
      // QueryResult does not expose rowCount (the same gap behind the known
      // campaign-skill TS2339).
      const res = await tx.query<{ prospect_id: number }>(
        `INSERT INTO gt_prospect_tags (prospect_id, tag_id, tenant_id, created_by)
         SELECT p.id, $tag_id, $tenant_id, $user_id
         FROM   gt_prospects p
         WHERE  p.id = ANY($ids::bigint[])
           AND  p.tenant_id = $tenant_id
           AND  p.is_live   = $is_live
         ON CONFLICT DO NOTHING
         RETURNING prospect_id`,
        {
          $tag_id: params.tag_id, $tenant_id: ctx.tenant_id,
          $user_id: ctx.user_id, $ids: ids, $is_live: ctx.is_live,
        },
      );
      return { applied: res.rows.length, removed: 0, recipe: 'prospect-tag' as const };
    }

    const res = await tx.query<{ prospect_id: number }>(
      `DELETE FROM gt_prospect_tags
       WHERE tag_id = $tag_id AND tenant_id = $tenant_id
         AND prospect_id = ANY($ids::bigint[])
       RETURNING prospect_id`,
      { $tag_id: params.tag_id, $tenant_id: ctx.tenant_id, $ids: ids },
    );
    return { applied: 0, removed: res.rows.length, recipe: 'prospect-tag' as const };
  });
}
