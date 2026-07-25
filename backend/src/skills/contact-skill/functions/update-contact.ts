/**
 * contact-skill: update_contact
 * Update contact name, prefix, or demographic fields.
 * At least one field required.
 */

import { SkillContext } from '../../../shared/types';


interface UpdateContactParams {
  contact_id:       number;
  prefix?:          string;
  name?:            string;
  job_title?:       string | null;
  company_name?:    string | null;
  company_domain?:  string | null;
  linkedin_url?:    string | null;
  location?:        string | null;
}

interface UpdateContactResult {
  contact: {
    id:              number;
    name:            string;
    prefix:          string;
    normalized_name: string;
    job_title:       string | null;
    company_name:    string | null;
    company_domain:  string | null;
    linkedin_url:    string | null;
    location:        string | null;
    updated_at:      string;
  };
  recipe: 'contact-card';
}

export async function update_contact(
  params: UpdateContactParams,
  ctx: SkillContext
): Promise<UpdateContactResult> {
  const { contact_id, prefix, name, job_title, company_name, company_domain, linkedin_url, location } = params;

  const hasUpdate = prefix !== undefined || name !== undefined ||
    job_title !== undefined || company_name !== undefined ||
    company_domain !== undefined || linkedin_url !== undefined ||
    location !== undefined;

  if (!hasUpdate) {
    throw new Error('At least one field is required to update');
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
  if (job_title !== undefined) {
    setClauses.push('job_title = $job_title');
    queryParams.$job_title = job_title?.trim() || null;
  }
  if (company_name !== undefined) {
    setClauses.push('company_name = $company_name');
    queryParams.$company_name = company_name?.trim() || null;
  }
  if (company_domain !== undefined) {
    setClauses.push('company_domain = $company_domain');
    queryParams.$company_domain = company_domain?.trim()?.toLowerCase() || null;
  }
  if (linkedin_url !== undefined) {
    setClauses.push('linkedin_url = $linkedin_url');
    queryParams.$linkedin_url = linkedin_url?.trim() || null;
  }
  if (location !== undefined) {
    setClauses.push('location = $location');
    queryParams.$location = location?.trim() || null;
  }

  const res = await ctx.db.query<{
    id: number; name: string; prefix: string; normalized_name: string;
    job_title: string | null; company_name: string | null; company_domain: string | null;
    linkedin_url: string | null; location: string | null; updated_at: string;
  }>(
    `UPDATE gt_contacts
     SET ${setClauses.join(', ')}
     WHERE id         = $contact_id
       AND tenant_id  = $tenant_id
       AND is_live    = $is_live
       AND is_active  = true
     RETURNING id, name, prefix, normalized_name, job_title, company_name, company_domain, linkedin_url, location, updated_at`,
    queryParams
  );

  if (!res.rows[0]) {
    throw new Error(`Contact ${contact_id} not found or not accessible`);
  }

  return { contact: res.rows[0], recipe: 'contact-card' };
}
