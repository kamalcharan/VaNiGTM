/** tenant: topups — every tenant's top-up balance (admin only). Numbers per tenant, from a SECURITY DEFINER function. */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { requireAdmin } from '../shared';

export async function topups(_params: Record<string, unknown>, ctx: SkillContext) {
  requireAdmin(ctx);
  const r = await getPool().query(
    `SELECT t.id AS tenant_id, t.slug, COALESCE(p.display_name, p.name, t.slug) AS name,
            COALESCE(b.added, 0) AS added, COALESCE(b.drawn, 0) AS drawn, COALESCE(b.balance, 0) AS balance, b.last_topup_at
       FROM vn_tenants t
       LEFT JOIN vn_tenant_profiles p ON p.tenant_id = t.id
       LEFT JOIN gt_token_topup_balances() b ON b.tenant_id = t.id
      ORDER BY COALESCE(b.last_topup_at, 'epoch') DESC, name`);
  return { tenants: r.rows.map((x: any) => ({ ...x, added: Number(x.added), drawn: Number(x.drawn), balance: Number(x.balance) })) };
}
