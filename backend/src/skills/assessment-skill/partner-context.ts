/**
 * Resolves the calling user's VaNi console identity — owner or partner.
 *
 * ACCESS MODEL, and why it is this way round.
 *
 * Being authenticated into the tenant IS the access control. Anyone signed
 * into this tenant can already open /contacts, /prospects and the rest;
 * requiring a second, separate grant just to see assessment leads made VaNi
 * the only screen in the product that demanded one, and made an owner
 * looking at their own workspace' leads fail with a permissions error.
 *
 * So: no gt_partner row means OWNER — the person is in the tenant, the
 * leads are the tenant's. A gt_partner row with role='partner' is a
 * RESTRICTION, deliberately added to scope a referral partner down to the
 * leads that came through their own link. A row with role='owner' is
 * allowed and means the same as no row; it exists so partners can be
 * promoted without deleting anything.
 *
 * The trade-off, stated plainly: this fails OPEN for tenant members. If a
 * real referral partner is added as a user but their gt_partner row is
 * forgotten, they see every lead in the tenant. That is acceptable at H1
 * (Agent Topology §1: Vikuna-exclusive, one tenant, a handful of partners,
 * every input controlled) and is the same trust model the rest of the app
 * already uses. It stops being acceptable at the first EXTERNAL tenant —
 * which is already the named trigger in Topology §11 for replacing
 * app-layer isolation with DB-enforced RLS. Revisit here when that fires.
 *
 * Deliberately NOT filtered by is_live: console identity is who someone is,
 * not which environment they are viewing. Leads themselves stay
 * environment-scoped in the queries.
 */

import type { SkillContext } from '../../shared/types';

export interface PartnerContext {
  /** gt_partner.id — null for an owner with no row. Used to scope a partner's leads. */
  partnerRowId: string | null;
  role: 'owner' | 'partner';
}

export async function resolvePartnerContext(ctx: SkillContext): Promise<PartnerContext> {
  const result = await ctx.db.query<{ id: string; role: 'owner' | 'partner' }>(
    `SELECT id, role FROM gt_partner
      WHERE tenant_id = $tenant_id
        AND user_id = $user_id AND is_active = true
      ORDER BY CASE WHEN role = 'owner' THEN 0 ELSE 1 END
      LIMIT 1`,
    { tenant_id: ctx.tenant_id, user_id: ctx.user_id },
  );

  const row = result.rows[0];
  if (!row) return { partnerRowId: null, role: 'owner' };
  return { partnerRowId: row.id, role: row.role };
}
