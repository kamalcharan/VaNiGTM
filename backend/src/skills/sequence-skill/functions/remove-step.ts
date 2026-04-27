/**
 * sequence-skill: remove_step
 * Delete a step and its templates (CASCADE).
 */
import { SkillContext } from '../../../shared/types';

export async function remove_step(params: { step_id: number }, ctx: SkillContext) {
  if (!params.step_id) throw new Error('step_id is required');
  await ctx.db.transaction(async (tx) => {
    const res = await tx.query(
      `DELETE FROM gt_sequence_steps
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND id = $step_id
       RETURNING id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $step_id: params.step_id }
    );
    if (!res.rows[0]) throw new Error('Step not found');
  });
  return { deleted: true, step_id: params.step_id, recipe: 'confirmation' as const };
}
