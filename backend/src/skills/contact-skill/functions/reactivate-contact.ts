/**
 * contact-skill: reactivate_contact
 * Re-activate a previously deactivated contact.
 */

import { SkillContext } from '../../../shared/types';

interface ReactivateContactParams {
  contact_id: number;
}

interface ReactivateContactResult {
  reactivated: true;
  contact_id: number;
  recipe: 'confirmation';
}

export async function reactivate_contact(
  params: ReactivateContactParams,
  ctx: SkillContext
): Promise<ReactivateContactResult> {
  const { contact_id } = params;

  const res = await ctx.db.query<{ id: number }>(
    `UPDATE ki_contacts
     SET is_active = true, updated_at = now()
     WHERE id        = $contact_id
       AND tenant_id = $tenant_id
       AND is_live   = $is_live
       AND is_active = false
     RETURNING id`,
    { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );

  if (!res.rows[0]) {
    throw new Error(`Contact ${contact_id} not found or already active`);
  }

  return { reactivated: true, contact_id, recipe: 'confirmation' };
}
