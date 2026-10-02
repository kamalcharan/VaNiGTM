/**
 * tenant: add_topup — tokens added to one tenant's balance (admin only).
 * Append-only: a mistaken top-up is corrected by its own reason on a later row,
 * never by editing this one. Not idempotent across clicks, so the console asks
 * once and does not auto-retry.
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { addTopup } from '../../../agent-core/token.budget';
import { requireAdmin } from '../shared';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function add_topup(params: { tenant_id?: string; tokens?: number; reason?: string }, ctx: SkillContext) {
  requireAdmin(ctx);
  const tenantId = String(params.tenant_id ?? '');
  if (!UUID.test(tenantId)) throw new Error('tenant_id is required.');
  const tokens = Number(params.tokens);
  const exists = await getPool().query(`SELECT 1 FROM vn_tenants WHERE id = $1`, [tenantId]);
  if (!exists.rows.length) throw new Error('No such tenant.');
  const r = await addTopup(getPool(), tenantId, tokens, ctx.user_id || null, String(params.reason ?? '').slice(0, 200));
  console.log(`[Tenant] top-up of ${tokens} tokens to ${tenantId} by ${ctx.user_id}`);
  return { tenant_id: tenantId, balance: r.balance };
}
