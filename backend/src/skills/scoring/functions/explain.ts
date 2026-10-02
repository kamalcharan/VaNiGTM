/** scoring: explain — one company's score now, item by item, with the evidence and when it was last refreshed. */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { withTenantClient } from '../../../db';
import { explainPoolCompany, explainProspect } from '../../../scoring/rescore';

export async function explain(params: { prospect_id?: string; company_id?: string }, ctx: SkillContext) {
  const pool = getPool();
  if (params.company_id != null && params.company_id !== '') {
    if (!ctx.is_admin) throw new Error('Pool companies are explained to admin tenants only.');
    const id = String(Number(params.company_id));
    const r = await explainPoolCompany(pool, id);
    if (!r) return { reason: 'NOT_FOUND' };
    // Last refreshed (D-Q8): the later of its newest delivery and its last enrichment.
    const lr = (await pool.query(
      `SELECT GREATEST(c.last_enriched_at, max(COALESCE(l.as_of::timestamptz, l.loaded_at))) AS at
         FROM gt_universe_companies c
         LEFT JOIN gt_universe_company_sources s ON s.company_id = c.id
         LEFT JOIN gt_source_loads l ON l.id = s.load_id AND l.status = 'active'
        WHERE c.id = $1 GROUP BY c.last_enriched_at`, [id])).rows[0];
    return { ...r, last_refreshed: lr?.at ?? null };
  }
  const pid = String(Number(params.prospect_id));
  if (pid === 'NaN') throw new Error('prospect_id or company_id is required.');
  const r = await explainProspect(pool, ctx.tenant_id, pid);
  if (!r) return { reason: 'NOT_FOUND' };
  const lr = await withTenantClient(pool, ctx.tenant_id, async (c) => (await c.query(
    `SELECT GREATEST(last_enriched_at, source_as_of::timestamptz, created_at) AS at FROM gt_prospects WHERE tenant_id = $1 AND id = $2`,
    [ctx.tenant_id, pid])).rows[0]);
  return { ...r, last_refreshed: lr?.at ?? null };
}
