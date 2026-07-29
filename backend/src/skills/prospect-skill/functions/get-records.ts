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
import { cleanDefinition, type SegmentDefinition } from '../segments';

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
  /** Derived cluster, e.g. 'manufacturing' (migration 206). */
  industry_canonical?: string;
  /** Derived sub-cluster, e.g. 'pharma' (migration 218). */
  industry_sub?: string;
  /** 'none' | 'done' | 'failed' | 'decided' — research state. */
  research?: string;
  /** Load a saved segment's definition; explicit params still win over it. */
  segment_id?: number;
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

  // A segment is a saved filter, so opening one is loading its definition —
  // but anything the caller passed EXPLICITLY still wins. Otherwise clicking
  // a segment would lock the screen's own controls, and a filter you cannot
  // adjust after applying it is a dead end rather than a starting point.
  let segment: SegmentDefinition = {};
  if (params.segment_id) {
    const seg = await ctx.db.query<{ definition: unknown }>(
      `SELECT definition FROM gt_segments
        WHERE id = $segment_id AND tenant_id = $tenant_id AND is_live = $is_live
          AND is_active`,
      { segment_id: Number(params.segment_id), tenant_id: ctx.tenant_id, is_live: ctx.is_live },
    );
    if (seg.rows.length === 0) throw new Error('No such segment.');
    segment = cleanDefinition(seg.rows[0].definition);
  }

  const pick = <K extends keyof SegmentDefinition>(key: K): string | number | null => {
    const explicit = (params as Record<string, unknown>)[key as string];
    if (typeof explicit === 'string' && explicit.trim()) return explicit.trim();
    if (typeof explicit === 'number' && Number.isFinite(explicit)) return explicit;
    return (segment[key] as string | number | undefined) ?? null;
  };

  const filters = {
    $scope: scope,
    $tenant_id: ctx.tenant_id,
    $is_live: ctx.is_live,
    $search: pick('search'),
    // A pool row is nobody's customer, so the relationship filter is
    // meaningless there and is not passed through.
    $relationship: scope === 'mine' ? pick('relationship') : null,
    $tag_id: pick('tag_id'),
    $only_duplicates: params.only_duplicates ?? false,
    $min_quality: pick('min_quality'),
    $industry: params.industry?.trim() || null,
    $industry_canonical: pick('industry_canonical'),
    $industry_sub: pick('industry_sub'),
    $research: params.research?.trim() || null,
    $domain: pick('domain'),
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
