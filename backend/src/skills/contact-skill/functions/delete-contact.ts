/**
 * contact-skill: delete_contact
 * Soft-delete a contact. Cannot delete if already converted to a client.
 */

import { SkillContext } from '../../../shared/types';

interface DeleteContactParams {
  contact_id: number;
}

interface DeleteContactResult {
  deleted: true;
  contact_id: number;
  recipe: 'confirmation';
}

export async function delete_contact(
  params: DeleteContactParams,
  ctx: SkillContext
): Promise<DeleteContactResult> {
  const { contact_id } = params;

  // Check contact exists and is not already a client
  const check = await ctx.db.query<{ is_client: boolean }>(
    `SELECT is_client FROM ki_contacts
     WHERE id = $contact_id AND tenant_id = $tenant_id AND is_live = $is_live AND is_active = true`,
    { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );

  if (!check.rows[0]) {
    throw new Error(`Contact ${contact_id} not found`);
  }
  if (check.rows[0].is_client) {
    throw new Error(`Cannot delete contact ${contact_id} — they have been converted to a client`);
  }

  await ctx.db.query(
    `UPDATE ki_contacts
     SET is_active = false, updated_at = now()
     WHERE id = $contact_id AND tenant_id = $tenant_id AND is_live = $is_live`,
    { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );

  return { deleted: true, contact_id, recipe: 'confirmation' };
}
