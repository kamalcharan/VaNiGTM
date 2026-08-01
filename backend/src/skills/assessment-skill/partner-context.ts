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
  // Deliberately NOT filtered by is_live. Console access is an identity
  // fact — who this person is — not environment data. Filtering it meant a
  // user with a perfectly good gt_partner row (created is_live=true by
  // db:seed-owner) was refused the moment they switched the app into
  // Test/Sandbox mode, with an error that reads like a permissions problem
  // rather than an environment mismatch. The LEADS are still environment-
  // scoped by is_live in the queries themselves; only the question "may
  // this account open the console at all" is not.
  const result = await ctx.db.query<{ id: string; role: 'owner' | 'partner' }>(
    `SELECT id, role FROM gt_partner
      WHERE tenant_id = $tenant_id
        AND user_id = $user_id AND is_active = true
      ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END
      LIMIT 1`,
    { tenant_id: ctx.tenant_id, user_id: ctx.user_id },
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('NO_VANI_CONSOLE_ACCESS: this account has no VaNi AI console access');
  }
  return { partnerRowId: row.id, role: row.role };
}
