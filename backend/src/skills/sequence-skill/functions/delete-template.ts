/**
 * sequence-skill: delete_template
 * Delete a template variant.
 */
import { SkillContext } from '../../../shared/types';

export async function delete_template(params: { template_id: number }, ctx: SkillContext) {
  if (!params.template_id) throw new Error('template_id is required');
  await ctx.db.transaction(async (tx) => {
    const res = await tx.query(
      `DELETE FROM gt_step_templates
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND id = $template_id
       RETURNING id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $template_id: params.template_id }
    );
    if (!res.rows[0]) throw new Error('Template not found');
  });
  return { deleted: true, template_id: params.template_id, recipe: 'confirmation' as const };
}
