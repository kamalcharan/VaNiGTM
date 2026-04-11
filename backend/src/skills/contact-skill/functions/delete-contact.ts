/**
 * contact-skill: delete_contact
 * Soft-delete a contact. Cannot deactivate if the contact has an active client record.
 * (A contact that was once a client CAN be deactivated once their client record is deactivated.)
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

  // Check contact exists
  const check = await ctx.db.query<{ exists: boolean }>(
    `SELECT 1 AS exists FROM ki_contacts
     WHERE id = $contact_id AND tenant_id = $tenant_id AND is_live = $is_live AND is_active = true`,
    { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );

  if (!check.rows[0]) {
    throw new Error(`Contact ${contact_id} not found`);
  }

  // Block deactivation if the contact has an ACTIVE client record
  // (Once the client is deactivated, the contact can be deactivated too)
  const activeClient = await ctx.db.query<{ id: number }>(
    `SELECT id FROM ki_clients
     WHERE contact_id = $contact_id AND tenant_id = $tenant_id AND is_live = $is_live AND is_active = true
     LIMIT 1`,
    { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );

  if (activeClient.rows[0]) {
    throw new Error(`Cannot deactivate contact ${contact_id} — they have an active client record. Deactivate the client first.`);
  }

  await ctx.db.query(
    `UPDATE ki_contacts
     SET is_active = false, updated_at = now()
     WHERE id = $contact_id AND tenant_id = $tenant_id AND is_live = $is_live`,
    { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );

  return { deleted: true, contact_id, recipe: 'confirmation' };
}
