/**
 * prospect-skill: get_records
 *
 * ONE function for both record surfaces. The user asked for this repeatedly
 * before it was done: both are the same shape, so they share the same code and
 * the same infrastructure.
 *
 *   scope 'mine' -> the tenant's own prospects (gt_prospects)
 *   scope 'pool' -> the shared directory pool  (gt_universe_company_sources)
 *
 * The tables stay separate — they have opposite dedup rules, so the pool KEEPS
 * one row per source per record while a tenant must have exactly one row per
 * company. Everything derived from them is defined once, in gt_record_view
 * (migration 204), and read by one query.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const LIST_SQL  = fs.readFileSync(path.join(__dirname, '../queries/get-records.sql'), 'utf-8');
const STATS_SQL = fs.readFileSync(path.join(__dirname, '../queries/record-stats.sql'), 'utf-8');

export type RecordScope = 'mine' | 'pool';

interface GetRecordsParams {
  scope?: RecordScope;
  search?: string;
  relationship?: string;
  tag_id?: number;
  only_duplicates?: boolean;
  min_quality?: number;
  limit?: number;
  offset?: number;
}

export async function get_records(params: GetRecordsParams, ctx: SkillContext) {
  const scope: RecordScope = params.scope === 'pool' ? 'pool' : 'mine';

  // The pool has no tenant_id, so nothing in the query constrains who reads
  // it. This is the whole protection.
  if (scope === 'pool' && !ctx.is_admin) {
    throw new Error('The common pool is available to admin tenants only.');
  }

  const limit  = Math.min(params.limit ?? 50, 200);
  const offset = params.offset ?? 0;

  const filters = {
    $scope: scope,
    $tenant_id: ctx.tenant_id,
    $is_live: ctx.is_live,
    $search: params.search?.trim() || null,
    // A pool row is nobody's customer, so the relationship filter is
    // meaningless there and is not passed through.
    $relationship: scope === 'mine' ? (params.relationship?.trim() || null) : null,
    $tag_id: params.tag_id ?? null,
    $only_duplicates: params.only_duplicates ?? false,
    $min_quality: params.min_quality ?? null,
  };

  const [listRes, statsRes] = await Promise.all([
    ctx.db.query<Record<string, unknown>>(LIST_SQL, { ...filters, $limit: limit, $offset: offset }),
    ctx.db.query<Record<string, unknown>>(STATS_SQL, {
      $scope: scope, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live,
    }),
  ]);

  return {
    scope,
    records: listRes.rows,
    // Filtered count for "showing N of M"; stats.total is the whole set.
    total: Number((listRes.rows[0] as { filtered_total?: string })?.filtered_total ?? 0),
    stats: statsRes.rows[0] ?? { total: 0 },
    recipe: 'record-list' as const,
  };
}
