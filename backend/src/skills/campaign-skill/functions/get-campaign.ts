/**
 * campaign-skill: get_campaign
 * Single campaign with full details and persona count.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_CAMPAIGN_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-campaign.sql'), 'utf-8'
);

interface GetCampaignParams {
  campaign_id: number;
}

interface CampaignDetail {
  id: number;
  campaign_no: string;
  name: string;
  description: string | null;
  product_name: string | null;
  product_url: string | null;
  target_industries: string[];
  sender_name: string | null;
  sender_email: string | null;
  status: string;
  launched_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
  persona_count: number;
}

interface GetCampaignResult {
  campaign: CampaignDetail;
  recipe: 'campaign-detail';
}

export async function get_campaign(
  params: GetCampaignParams,
  ctx: SkillContext
): Promise<GetCampaignResult> {
  if (!params.campaign_id) {
    throw new Error('campaign_id is required');
  }

  const result = await ctx.db.query<CampaignDetail>(GET_CAMPAIGN_SQL, {
    $tenant_id:   ctx.tenant_id,
    $is_live:     ctx.is_live,
    $campaign_id: params.campaign_id,
  });

  if (!result.rows[0]) {
    throw new Error('Campaign not found');
  }

  return { campaign: result.rows[0], recipe: 'campaign-detail' };
}
