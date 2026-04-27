/**
 * contact-skill: get_pipeline
 * Paginated contacts assigned to a campaign with pipeline stage.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_PIPELINE_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-pipeline.sql'), 'utf-8');
const GET_STATS_SQL    = fs.readFileSync(path.join(__dirname, '../queries/get-pipeline-stats.sql'), 'utf-8');

interface GetPipelineParams {
  campaign_id: number;
  stage?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export async function get_pipeline(params: GetPipelineParams, ctx: SkillContext) {
  if (!params.campaign_id) throw new Error('campaign_id is required');

  const limit  = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const qp = {
    $tenant_id:   ctx.tenant_id,
    $is_live:     ctx.is_live,
    $campaign_id: params.campaign_id,
    $stage:       params.stage || null,
    $search:      params.search?.trim() || null,
    $limit:       limit,
    $offset:      offset,
  };

  const [dataRes, statsRes] = await Promise.all([
    ctx.db.query(GET_PIPELINE_SQL, qp),
    ctx.db.query(GET_STATS_SQL, {
      $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $campaign_id: params.campaign_id,
    }),
  ]);

  return {
    contacts: dataRes.rows,
    stats:    statsRes.rows[0] ?? { total: 0, identified: 0, contacted: 0, engaged: 0, interested: 0, qualified: 0, converted: 0, lost: 0 },
    recipe:   'pipeline-view' as const,
  };
}
