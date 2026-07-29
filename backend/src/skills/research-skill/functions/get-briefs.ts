/**
 * research-skill: get_briefs
 *
 * The research output, as a queue of decisions. Stats describe the whole
 * batch; the rows describe the current filter — a reviewer needs both, and
 * conflating them is how "12 of 12 done" gets shown for a filtered page.
 */

import fs from 'fs';
import path from 'path';
import { SkillContext } from '../../../shared/types';

const QUERIES = path.resolve(__dirname, '..', 'queries');
const sql = (f: string) => fs.readFileSync(path.join(QUERIES, f), 'utf8');

interface GetBriefsParams {
  status?: string;
  offer?: string;
  /**
   * One of the stat cards, as a filter.
   *
   * with_offer | no_fit | smaller_ask | fit_unclear | unevidenced |
   * decided | undecided
   *
   * Rejected loudly rather than ignored: a filter that silently does nothing
   * shows the unfiltered list, which reads as "all 97 are too close to call".
   */
  view?: string;
  search?: string;
  page?: number;
  limit?: number;
  offset?: number;
}

const VIEWS = new Set([
  'with_offer', 'no_fit', 'smaller_ask', 'fit_unclear',
  'unevidenced', 'decided', 'undecided',
]);

export async function get_briefs(params: GetBriefsParams, ctx: SkillContext) {
  const view = params.view?.trim() || null;
  if (view && !VIEWS.has(view)) {
    throw new Error(`Unknown view "${view}". One of: ${[...VIEWS].join(', ')}.`);
  }

  const limit = Math.min(Math.max(Number(params.limit) || 25, 1), 100);
  const offset = params.page && Number(params.page) > 0
    ? (Number(params.page) - 1) * limit
    : Number(params.offset) || 0;

  const scope = { tenant_id: ctx.tenant_id, is_live: ctx.is_live };

  const [rows, stats] = await Promise.all([
    ctx.db.query(sql('get-briefs.sql'), {
      ...scope,
      status: params.status ?? null,
      offer: params.offer ?? null,
      view: view ?? null,
      search: params.search ?? null,
      limit,
      offset,
    }),
    ctx.db.query(sql('brief-stats.sql'), scope),
  ]);

  const total = rows.rows.length > 0
    ? Number((rows.rows[0] as Record<string, unknown>).filtered_total)
    : 0;

  return {
    briefs: rows.rows,
    total,
    page: Math.floor(offset / limit) + 1,
    limit,
    stats: stats.rows[0] ?? {},
    recipe: 'brief-list' as const,
  };
}
