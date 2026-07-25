/**
 * contact-skill: get_contacts
 * Paginated list of contacts with optional search.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_CONTACTS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-contacts.sql'), 'utf-8'
);
const COUNT_CONTACTS_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/count-contacts.sql'), 'utf-8'
);

interface GetContactsParams {
  search?: string;
  show_inactive?: boolean;
  limit?: number;
  offset?: number;
}

interface ContactListItem {
  id: number;
  prefix: string;
  name: string;
  normalized_name: string;
  job_title: string | null;
  company_name: string | null;
  score: number;
  is_active: boolean;
  primary_mobile: string | null;
  primary_email: string | null;
  created_at: string;
}

interface GetContactsResult {
  contacts: ContactListItem[];
  total: number;
  recipe: 'contact-list';
}

export async function get_contacts(
  params: GetContactsParams,
  ctx: SkillContext
): Promise<GetContactsResult> {
  const limit  = Math.min(params.limit  ?? 50, 200);
  const offset = params.offset ?? 0;

  const queryParams = {
    $tenant_id:    ctx.tenant_id,
    $is_live:      ctx.is_live,
    $show_inactive: params.show_inactive ?? false,
    $search:       params.search?.trim() || null,
    $limit:        limit,
    $offset:       offset,
  };

  const [dataRes, countRes] = await Promise.all([
    ctx.db.query<ContactListItem>(GET_CONTACTS_SQL, queryParams),
    ctx.db.query<{ total: string }>(COUNT_CONTACTS_SQL, {
      $tenant_id:    queryParams.$tenant_id,
      $is_live:      queryParams.$is_live,
      $show_inactive: queryParams.$show_inactive,
      $search:       queryParams.$search,
    }),
  ]);

  return {
    contacts: dataRes.rows,
    total:    Number(countRes.rows[0]?.total ?? 0),
    recipe:   'contact-list',
  };
}
