/**
 * campaign-skill: get_campaigns
 * Paginated list of campaigns with optional search and status filter.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_CAMPAIGNS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-campaigns.sql'), 'utf-8'
);
const COUNT_CAMPAIGNS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/count-campaigns.sql'), 'utf-8'
);

const VALID_STATUSES = ['draft', 'active', 'paused', 'completed', 'archived'] as const;

interface GetCampaignsParams {
  search?: string;
  status?: string;
  limit?: number;
  offset?: number;
}

interface CampaignListItem {
  id: number;
  campaign_no: string;
  name: string;
  description: string | null;
  status: string;
  target_industries: string[];
  product_name: string | null;
  sender_name: string | null;
  launched_at: string | null;
  created_at: string;
  persona_count: number;
}

interface GetCampaignsResult {
  campaigns: CampaignListItem[];
  total: number;
  recipe: 'campaign-list';
}

export async function get_campaigns(
  params: GetCampaignsParams,
  ctx: SkillContext
): Promise<GetCampaignsResult> {
  const limit  = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  if (params.status && !VALID_STATUSES.includes(params.status as typeof VALID_STATUSES[number])) {
    throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const queryParams = {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $search:    params.search?.trim() || null,
    $status:    params.status || null,
    $limit:     limit,
    $offset:    offset,
  };

  const [dataRes, countRes] = await Promise.all([
    ctx.db.query<CampaignListItem>(GET_CAMPAIGNS_SQL, queryParams),
    ctx.db.query<{ total: number }>(COUNT_CAMPAIGNS_SQL, {
      $tenant_id: queryParams.$tenant_id,
      $is_live:   queryParams.$is_live,
      $search:    queryParams.$search,
      $status:    queryParams.$status,
    }),
  ]);

  return {
    campaigns: dataRes.rows,
    total:     Number(countRes.rows[0]?.total ?? 0),
    recipe:    'campaign-list',
  };
}
