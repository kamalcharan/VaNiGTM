/**
 * sequence-skill: reorder_steps
 * Reorder steps within a sequence.
 */
import { SkillContext } from '../../../shared/types';

interface ReorderStepsParams {
  sequence_id: number;
  order: { step_id: number; sort_order: number }[];
}

export async function reorder_steps(params: ReorderStepsParams, ctx: SkillContext) {
  if (!params.sequence_id) throw new Error('sequence_id is required');
  if (!Array.isArray(params.order) || params.order.length === 0) throw new Error('order array is required');

  await ctx.db.transaction(async (tx) => {
    for (const item of params.order) {
      await tx.query(
        `UPDATE gt_sequence_steps SET sort_order = $sort_order, updated_at = now()
         WHERE tenant_id = $tenant_id AND is_live = $is_live AND sequence_id = $sequence_id AND id = $step_id`,
        {
          $tenant_id:   ctx.tenant_id,
          $is_live:     ctx.is_live,
          $sequence_id: params.sequence_id,
          $step_id:     item.step_id,
          $sort_order:  item.sort_order,
        }
      );
    }
  });
  return { reordered: true, recipe: 'confirmation' as const };
}
