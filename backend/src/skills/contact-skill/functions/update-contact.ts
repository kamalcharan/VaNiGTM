/**
 * contact-skill: update_contact
 * Update contact name or prefix. At least one field required.
 */

import { SkillContext } from '../../../shared/types';

const VALID_PREFIXES = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sri', 'Smt'] as const;

interface UpdateContactParams {
  contact_id: number;
  prefix?: string;
  name?: string;
}

interface UpdateContactResult {
  contact: {
    id: number;
    name: string;
    prefix: string;
    normalized_name: string;
    updated_at: string;
  };
  recipe: 'contact-card';
}

export async function update_contact(
  params: UpdateContactParams,
  ctx: SkillContext
): Promise<UpdateContactResult> {
  const { contact_id, prefix, name } = params;

  if (!prefix && !name) {
    throw new Error('At least one of prefix or name is required');
  }
  if (prefix && !VALID_PREFIXES.includes(prefix as typeof VALID_PREFIXES[number])) {
    throw new Error(`Invalid prefix. Must be one of: ${VALID_PREFIXES.join(', ')}`);
  }

  // Build dynamic SET clause for only provided fields
  const setClauses: string[] = ['updated_at = now()'];
  const queryParams: Record<string, unknown> = {
    $tenant_id:  ctx.tenant_id,
    $is_live:    ctx.is_live,
    $contact_id: contact_id,
  };

  if (prefix) {
    setClauses.push('prefix = $prefix');
    queryParams.$prefix = prefix;
  }
  if (name) {
    setClauses.push('name = $name');
    queryParams.$name = name.trim();
  }

  const res = await ctx.db.query<{
    id: number; name: string; prefix: string; normalized_name: string; updated_at: string;
  }>(
    `UPDATE ki_contacts
     SET ${setClauses.join(', ')}
     WHERE id = $contact_id
       AND tenant_id = $tenant_id
       AND is_live   = $is_live
       AND is_active = true
     RETURNING id, name, prefix, normalized_name, updated_at`,
    queryParams
  );

  if (!res.rows[0]) {
    throw new Error(`Contact ${contact_id} not found or not accessible`);
  }

  return { contact: res.rows[0], recipe: 'contact-card' };
}
