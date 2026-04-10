/**
 * contact-skill: update_contact
 * Update contact name, prefix, or demographic fields.
 * At least one field required.
 */

import { SkillContext } from '../../../shared/types';

const VALID_PREFIXES   = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sri', 'Smt'] as const;
const VALID_MARITAL    = ['single', 'married', 'family', 'other'] as const;

interface UpdateContactParams {
  contact_id:       number;
  prefix?:          string;
  name?:            string;
  age?:             number | null;
  city?:            string | null;
  marital_status?:  string | null;
  dependents_count?: number | null;
}

interface UpdateContactResult {
  contact: {
    id:              number;
    name:            string;
    prefix:          string;
    normalized_name: string;
    age:             number | null;
    city:            string | null;
    marital_status:  string | null;
    dependents_count: number | null;
    updated_at:      string;
  };
  recipe: 'contact-card';
}

export async function update_contact(
  params: UpdateContactParams,
  ctx: SkillContext
): Promise<UpdateContactResult> {
  const { contact_id, prefix, name, age, city, marital_status, dependents_count } = params;

  const hasUpdate = prefix !== undefined || name !== undefined ||
    age !== undefined || city !== undefined ||
    marital_status !== undefined || dependents_count !== undefined;

  if (!hasUpdate) {
    throw new Error('At least one field is required to update');
  }
  if (prefix && !VALID_PREFIXES.includes(prefix as typeof VALID_PREFIXES[number])) {
    throw new Error(`Invalid prefix. Must be one of: ${VALID_PREFIXES.join(', ')}`);
  }
  if (marital_status && marital_status !== null &&
      !VALID_MARITAL.includes(marital_status as typeof VALID_MARITAL[number])) {
    throw new Error(`Invalid marital_status. Must be one of: ${VALID_MARITAL.join(', ')}`);
  }

  // Dynamic SET clause — only include fields that were explicitly provided
  const setClauses: string[] = ['updated_at = now()'];
  const queryParams: Record<string, unknown> = {
    $tenant_id:  ctx.tenant_id,
    $is_live:    ctx.is_live,
    $contact_id: contact_id,
  };

  if (prefix !== undefined) {
    setClauses.push('prefix = $prefix');
    queryParams.$prefix = prefix;
  }
  if (name !== undefined) {
    setClauses.push('name = $name');
    queryParams.$name = name.trim();
  }
  if (age !== undefined) {
    setClauses.push('age = $age');
    queryParams.$age = age;
  }
  if (city !== undefined) {
    setClauses.push('city = $city');
    queryParams.$city = city?.trim() || null;
  }
  if (marital_status !== undefined) {
    setClauses.push('marital_status = $marital_status');
    queryParams.$marital_status = marital_status;
  }
  if (dependents_count !== undefined) {
    setClauses.push('dependents_count = $dependents_count');
    queryParams.$dependents_count = dependents_count;
  }

  const res = await ctx.db.query<{
    id: number; name: string; prefix: string; normalized_name: string;
    age: number | null; city: string | null; marital_status: string | null;
    dependents_count: number | null; updated_at: string;
  }>(
    `UPDATE ki_contacts
     SET ${setClauses.join(', ')}
     WHERE id         = $contact_id
       AND tenant_id  = $tenant_id
       AND is_live    = $is_live
       AND is_active  = true
     RETURNING id, name, prefix, normalized_name, age, city, marital_status, dependents_count, updated_at`,
    queryParams
  );

  if (!res.rows[0]) {
    throw new Error(`Contact ${contact_id} not found or not accessible`);
  }

  return { contact: res.rows[0], recipe: 'contact-card' };
}
