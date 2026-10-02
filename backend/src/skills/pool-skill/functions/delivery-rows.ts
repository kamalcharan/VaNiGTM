/** pool-skill: delivery_rows — the companies one delivery fed, by state, with their Complete progress. */
import type { SkillContext } from '../../../types/skill.types';
import { requireAdmin, sql, int } from '../shared';

const STATES = ['all', 'waiting', 'complete', 'held', 'junk', 'duplicate', 'unmatched'] as const;

export async function delivery_rows(
  params: { load_id: string | number; state?: string; limit?: number; offset?: number }, ctx: SkillContext,
) {
  requireAdmin(ctx);
  const loadId = Number(params.load_id);
  if (!Number.isInteger(loadId)) throw new Error('load_id is required.');
  const state = (STATES as readonly string[]).includes(params.state ?? '') ? params.state! : 'all';
  const limit = int(params.limit, 50, 200) || 50;
  const offset = int(params.offset, 0, 1_000_000);
  if (state === 'unmatched') {
    const r = await ctx.db.query<any>(sql('unmatched-rows'), { $load_id: loadId, $limit: limit, $offset: offset });
    return { state, total: Number(r.rows[0]?.filtered_total ?? 0), rows: r.rows.map(({ filtered_total, ...x }) => x) };
  }
  const r = await ctx.db.query<any>(sql('delivery-rows'), { $load_id: loadId, $state: state, $limit: limit, $offset: offset });
  return {
    state,
    total: Number(r.rows[0]?.filtered_total ?? 0),
    rows: r.rows.map(({ filtered_total, complete_checks, ...x }) => ({
      ...x,
      passed: complete_checks?.passed ?? null,
      total_checks: complete_checks?.total ?? null,
      open: (complete_checks?.checks ?? []).filter((k: any) => k.status !== 'pass' && k.status !== 'na')
        .map((k: any) => ({ key: k.key, label: k.label, status: k.status })),
    })),
  };
}
