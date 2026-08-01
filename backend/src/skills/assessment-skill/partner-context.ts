/**
 * Resolves the calling user's VaNi AI console identity (owner or partner)
 * from gt_partner, looked up by ctx.user_id — deliberately NOT from
 * vn_roles/vn_user_roles. VaNi AI owns this mapping end to end rather than
 * coupling to the GTM RBAC system, which models a different thing
 * (per-tenant staff roles, not "which referral partner is this").
 *
 * Used by every console-facing assessment-skill function to decide: see
 * everything in the tenant (owner), or only own leads (partner).
 */

import type { SkillContext } from '../../shared/types';

export interface PartnerContext {
  partnerRowId: string;
  role: 'owner' | 'partner';
}

export async function resolvePartnerContext(ctx: SkillContext): Promise<PartnerContext> {
  const result = await ctx.db.query<{ id: string; role: 'owner' | 'partner' }>(
    `SELECT id, role FROM gt_partner
      WHERE tenant_id = $tenant_id AND is_live = $is_live
        AND user_id = $user_id AND is_active = true`,
    { tenant_id: ctx.tenant_id, is_live: ctx.is_live, user_id: ctx.user_id },
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('NO_VANI_CONSOLE_ACCESS: this account has no VaNi AI console access');
  }
  return { partnerRowId: row.id, role: row.role };
}
