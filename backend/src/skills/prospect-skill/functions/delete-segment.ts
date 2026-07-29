/**
 * prospect-skill: delete_segment
 *
 * Soft, not hard. A segment may already be named in a research run's history
 * or a campaign, and a dangling id that used to mean something is worse than
 * a row nobody lists. `is_active = false` also frees the name, which is the
 * only reason anyone deletes one in practice.
 */

import { SkillContext } from '../../../shared/types';

export async function delete_segment(
  params: { segment_id: number },
  ctx: SkillContext,
) {
  const id = Number(params.segment_id);
  if (!Number.isFinite(id)) throw new Error('segment_id is required');

  return ctx.db.transaction(async (tx) => {
    // tenant_id and is_live in the WHERE clause ARE the authorisation.
    const res = await tx.query<{ id: number; name: string }>(
      `UPDATE gt_segments
          SET is_active = false, updated_at = now()
        WHERE id = $id AND tenant_id = $tenant_id AND is_live = $is_live
          AND is_active
        RETURNING id, name`,
      { id, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
    );
    if (res.rows.length === 0) throw new Error('No such segment.');

    return {
      segment_id: id,
      name: res.rows[0].name,
      message: `"${res.rows[0].name}" removed. The companies in it are untouched.`,
      recipe: 'segment-card' as const,
    };
  });
}
