/**
 * client-skill: get_clients
 * Paginated list of clients with optional search, risk_profile filter, and bookmark filter.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_CLIENTS_SQL   = fs.readFileSync(path.join(__dirname, '../queries/get-clients.sql'),   'utf-8');
const COUNT_CLIENTS_SQL = fs.readFileSync(path.join(__dirname, '../queries/count-clients.sql'), 'utf-8');

interface ClientFilters {
  search?: string;
  risk_profile?: string;
  bookmarked_only?: boolean;
  recent_only?: boolean;
  in_family?: boolean;
  show_inactive?: boolean;
}

interface GetClientsParams {
  filters?: ClientFilters;
  limit?: number;
  offset?: number;
}

interface GetClientsResult {
  clients: Record<string, unknown>[];
  total: number;
  recipe: 'client-list';
}

export async function get_clients(
  params: GetClientsParams,
  ctx: SkillContext
): Promise<GetClientsResult> {
  const filters = params.filters ?? {};
  const limit  = Math.min(params.limit  ?? 50, 200);
  const offset = params.offset ?? 0;

  const queryParams = {
    $tenant_id:       ctx.tenant_id,
    $is_live:         ctx.is_live,
    $user_id:         ctx.user_id,
    $search:          filters.search?.trim() || null,
    $risk_profile:    filters.risk_profile || null,
    $bookmarked_only: filters.bookmarked_only ?? null,
    $recent_only:     filters.recent_only ?? null,
    $in_family:       filters.in_family ?? null,
    $show_inactive:   filters.show_inactive ?? false,
    $limit:           limit,
    $offset:          offset,
  };

  const countParams = {
    $tenant_id:       queryParams.$tenant_id,
    $is_live:         queryParams.$is_live,
    $user_id:         queryParams.$user_id,
    $search:          queryParams.$search,
    $risk_profile:    queryParams.$risk_profile,
    $bookmarked_only: queryParams.$bookmarked_only,
    $recent_only:     queryParams.$recent_only,
    $in_family:       queryParams.$in_family,
    $show_inactive:   queryParams.$show_inactive,
  };

  const [dataRes, countRes] = await Promise.all([
    ctx.db.query(GET_CLIENTS_SQL, queryParams),
    ctx.db.query<{ total: string }>(COUNT_CLIENTS_SQL, countParams),
  ]);

  return {
    clients: dataRes.rows,
    total:   Number(countRes.rows[0]?.total ?? 0),
    recipe:  'client-list',
  };
}
