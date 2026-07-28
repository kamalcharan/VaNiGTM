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
const STATS_SQL  = fs.readFileSync(path.join(__dirname, '../queries/record-stats.sql'), 'utf-8');
const FACETS_SQL = fs.readFileSync(path.join(__dirname, '../queries/record-facets.sql'), 'utf-8');

export type RecordScope = 'mine' | 'pool';

interface GetRecordsParams {
  scope?: RecordScope;
  search?: string;
  relationship?: string;
  tag_id?: number;
  only_duplicates?: boolean;
  min_quality?: number;
  /** Exact industry_raw value, from the facets list. */
  industry?: string;
  /** 'has' | 'none' | a substring to match. */
  domain?: string;
  show_inactive?: boolean;
  /** 1-based. Translated to offset here so callers do not do the arithmetic. */
  page?: number;
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
  const page   = Math.max(1, params.page ?? 1);
  const offset = params.offset ?? (page - 1) * limit;

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
    $industry: params.industry?.trim() || null,
    $domain: params.domain?.trim() || null,
    $show_inactive: params.show_inactive ?? false,
  };

  const [listRes, statsRes, facetsRes] = await Promise.all([
    ctx.db.query<Record<string, unknown>>(LIST_SQL, { ...filters, $limit: limit, $offset: offset }),
    ctx.db.query<Record<string, unknown>>(STATS_SQL, {
      $scope: scope, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live,
    }),
    // The values a filter can actually offer. Built from the data, so a
    // dropdown never presents an option that matches nothing.
    ctx.db.query<Record<string, unknown>>(FACETS_SQL, {
      $scope: scope, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live,
    }),
  ]);

  return {
    scope,
    records: listRes.rows,
    // Filtered count for "showing N of M"; stats.total is the whole set.
    total: Number((listRes.rows[0] as { filtered_total?: string })?.filtered_total ?? 0),
    page,
    limit,
    facets: facetsRes.rows[0] ?? { industries: [], tags: [], with_domain: 0, without_domain: 0 },
    stats: statsRes.rows[0] ?? { total: 0 },
    recipe: 'record-list' as const,
  };
}
