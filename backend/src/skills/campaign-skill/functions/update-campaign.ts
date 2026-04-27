/**
 * campaign-skill: update_campaign
 * Update campaign details. Cannot update if status is completed or archived.
 */

import { SkillContext } from '../../../shared/types';

interface UpdateCampaignParams {
  campaign_id: number;
  name?: string;
  description?: string;
  product_name?: string;
  product_url?: string;
  target_industries?: string[];
  sender_name?: string;
  sender_email?: string;
}

interface UpdateCampaignResult {
  campaign: { id: number; name: string; updated_at: string };
  recipe: 'campaign-card';
}

export async function update_campaign(
  params: UpdateCampaignParams,
  ctx: SkillContext
): Promise<UpdateCampaignResult> {
  if (!params.campaign_id) {
    throw new Error('campaign_id is required');
  }

  const result = await ctx.db.transaction(async (tx) => {
    // Check current status
    const check = await tx.query<{ id: number; status: string }>(
      `SELECT id, status FROM gt_campaigns
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $campaign_id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $campaign_id: params.campaign_id }
    );

    if (!check.rows[0]) throw new Error('Campaign not found');
    if (['completed', 'archived'].includes(check.rows[0].status)) {
      throw new Error('Cannot update a completed or archived campaign');
    }

    // Build dynamic SET clause
    const sets: string[] = [];
    const values: Record<string, unknown> = {
      $tenant_id:   ctx.tenant_id,
      $is_live:     ctx.is_live,
      $campaign_id: params.campaign_id,
    };

    if (params.name !== undefined)              { sets.push('name = $name');                         values.$name = params.name.trim(); }
    if (params.description !== undefined)        { sets.push('description = $description');           values.$description = params.description.trim(); }
    if (params.product_name !== undefined)        { sets.push('product_name = $product_name');         values.$product_name = params.product_name.trim(); }
    if (params.product_url !== undefined)         { sets.push('product_url = $product_url');           values.$product_url = params.product_url.trim(); }
    if (params.target_industries !== undefined)   { sets.push('target_industries = $target_industries::jsonb'); values.$target_industries = JSON.stringify(params.target_industries); }
    if (params.sender_name !== undefined)         { sets.push('sender_name = $sender_name');           values.$sender_name = params.sender_name.trim(); }
    if (params.sender_email !== undefined)        { sets.push('sender_email = $sender_email');         values.$sender_email = params.sender_email.trim(); }

    if (sets.length === 0) throw new Error('No fields to update');

    sets.push('updated_at = now()');

    const sql = `UPDATE gt_campaigns SET ${sets.join(', ')}
                 WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $campaign_id
                 RETURNING id, name, updated_at`;

    const res = await tx.query<{ id: number; name: string; updated_at: string }>(sql, values);
    return res.rows[0];
  });

  return { campaign: result, recipe: 'campaign-card' };
}
