/**
 * icp-skill: reorder_personas
 * Reorder personas within a campaign.
 */

import { SkillContext } from '../../../shared/types';

interface ReorderPersonasParams {
  campaign_id: number;
  order: { persona_id: number; sort_order: number }[];
}

interface ReorderPersonasResult {
  reordered: true;
  recipe: 'confirmation';
}

export async function reorder_personas(
  params: ReorderPersonasParams,
  ctx: SkillContext
): Promise<ReorderPersonasResult> {
  if (!params.campaign_id) throw new Error('campaign_id is required');
  if (!Array.isArray(params.order) || params.order.length === 0) {
    throw new Error('order array is required');
  }

  await ctx.db.transaction(async (tx) => {
    for (const item of params.order) {
      await tx.query(
        `UPDATE gt_personas SET sort_order = $sort_order, updated_at = now()
         WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true
           AND campaign_id = $campaign_id AND id = $persona_id`,
        {
          $tenant_id:   ctx.tenant_id,
          $is_live:     ctx.is_live,
          $campaign_id: params.campaign_id,
          $persona_id:  item.persona_id,
          $sort_order:  item.sort_order,
        }
      );
    }
  });

  return { reordered: true, recipe: 'confirmation' };
}
