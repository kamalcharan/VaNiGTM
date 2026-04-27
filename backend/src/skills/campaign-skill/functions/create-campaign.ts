/**
 * campaign-skill: create_campaign
 * Create a new GTM campaign. All writes in a single transaction.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const INSERT_CAMPAIGN_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/insert-campaign.sql'), 'utf-8'
);

interface CreateCampaignParams {
  name: string;
  description?: string;
  product_name?: string;
  product_url?: string;
  target_industries?: string[];
  sender_name?: string;
  sender_email?: string;
}

interface CreateCampaignResult {
  campaign: {
    id: number;
    campaign_no: string;
    name: string;
    status: string;
    created_at: string;
  };
  recipe: 'campaign-card';
}

export async function create_campaign(
  params: CreateCampaignParams,
  ctx: SkillContext
): Promise<CreateCampaignResult> {
  if (!params.name?.trim()) {
    throw new Error('Campaign name is required');
  }

  const result = await ctx.db.transaction(async (tx) => {
    const res = await tx.query<{
      id: number; campaign_no: string; name: string; status: string; created_at: string;
    }>(INSERT_CAMPAIGN_SQL, {
      $tenant_id:         ctx.tenant_id,
      $is_live:           ctx.is_live,
      $name:              params.name.trim(),
      $description:       params.description?.trim() || null,
      $product_name:      params.product_name?.trim() || null,
      $product_url:       params.product_url?.trim() || null,
      $target_industries: JSON.stringify(params.target_industries ?? []),
      $sender_name:       params.sender_name?.trim() || null,
      $sender_email:      params.sender_email?.trim() || null,
      $created_by:        ctx.user_id,
    });

    return res.rows[0];
  });

  return { campaign: result, recipe: 'campaign-card' };
}
