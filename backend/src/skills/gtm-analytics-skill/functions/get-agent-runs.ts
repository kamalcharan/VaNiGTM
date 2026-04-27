/**
 * gtm-analytics-skill: get_agent_runs
 * Paginated agent decision log with filters.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_SQL   = fs.readFileSync(path.join(__dirname, '../queries/get-agent-runs.sql'), 'utf-8');
const COUNT_SQL = fs.readFileSync(path.join(__dirname, '../queries/count-agent-runs.sql'), 'utf-8');

const VALID_TYPES   = ['orchestrator', 'outreach', 'prospecting', 'conversion', 'aeo', 'feedback'] as const;
const VALID_STATUSES = ['success', 'partial', 'error', 'skipped'] as const;

interface Params {
  agent_type?: string;
  status?: string;
  campaign_id?: number;
  limit?: number;
  offset?: number;
}

export async function get_agent_runs(params: Params, ctx: SkillContext) {
  if (params.agent_type && !VALID_TYPES.includes(params.agent_type as typeof VALID_TYPES[number])) {
    throw new Error(`Invalid agent_type. Must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (params.status && !VALID_STATUSES.includes(params.status as typeof VALID_STATUSES[number])) {
    throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const limit  = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;
  const qp = {
    $tenant_id:   ctx.tenant_id,
    $is_live:     ctx.is_live,
    $agent_type:  params.agent_type || null,
    $status:      params.status || null,
    $campaign_id: params.campaign_id ?? null,
    $limit:       limit,
    $offset:      offset,
  };

  const [dataRes, countRes] = await Promise.all([
    ctx.db.query(GET_SQL, qp),
    ctx.db.query<{ total: number }>(COUNT_SQL, {
      $tenant_id: qp.$tenant_id, $is_live: qp.$is_live,
      $agent_type: qp.$agent_type, $status: qp.$status, $campaign_id: qp.$campaign_id,
    }),
  ]);

  return {
    runs:   dataRes.rows,
    total:  Number(countRes.rows[0]?.total ?? 0),
    recipe: 'agent-runs' as const,
  };
}
