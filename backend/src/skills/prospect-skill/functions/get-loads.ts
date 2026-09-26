/**
 * prospect-skill: get_loads
 *
 * The deliveries behind a record surface. A load is ONE dataset from a
 * publisher (migration 193): "FTCCI Hyderabad Oct 2023", or a tenant's own
 * upload. It is the unit of provenance ("where did this row come from"), of
 * freshness (as_of lives here, not on the publisher) and of rollback (a bad
 * file is undone by retiring its load).
 *
 * Same two scopes as get_records, same gate: the pool's loads carry no
 * tenant_id, so nothing in the query constrains who reads them.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';
import type { RecordScope } from './get-records';

const LOADS_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-loads.sql'), 'utf-8');

export interface LoadRow {
  id: string;
  label: string;
  region: string | null;
  state_code: string | null;
  as_of: string | null;
  row_count: number | null;
  status: 'active' | 'retired' | 'failed';
  loaded_at: string;
  file_checksum: string | null;
  is_pool: boolean;
  source_code: string;
  source_name: string;
  source_kind: 'directory' | 'provider' | 'upload';
  tier: number;
  /** Live rows in the record view that came from this load. */
  records: number;
  with_domain: number;
  duplicates: number;
  avg_completeness: string | null;
  avg_validity: string | null;
  tags: { id: number; label: string; is_platform: boolean }[];
}

export async function get_loads(params: { scope?: RecordScope }, ctx: SkillContext) {
  const scope: RecordScope = params.scope === 'pool' ? 'pool' : 'mine';

  // The pool has no tenant_id, so nothing in the query constrains who reads
  // it. This is the whole protection — the same line get_records carries.
  if (scope === 'pool' && !ctx.is_admin) {
    throw new Error('The common pool is available to admin tenants only.');
  }

  const r = await ctx.db.query<LoadRow>(LOADS_SQL, {
    $scope: scope, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live,
  });
  const loads = r.rows.map((x) => ({ ...x, id: String(x.id) }));
  const active = loads.filter((l) => l.status === 'active').length;

  return {
    scope,
    loads,
    total: loads.length,
    // Rule 9b: an empty list says what it means for THIS scope.
    detail: loads.length
      ? `${loads.length} ${loads.length === 1 ? 'delivery' : 'deliveries'}, ${active} active.`
      : scope === 'pool'
        ? 'The pool has had no deliveries yet. An admin tenant feeds it by importing a directory as a common-pool dataset.'
        : 'Nothing imported yet. Every list you bring lands as a delivery here.',
    recipe: 'load-list' as const,
  };
}
