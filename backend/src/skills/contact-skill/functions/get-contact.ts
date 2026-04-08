/**
 * contact-skill: get_contact
 * Single contact with all channels and snapshot summary.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_CONTACT_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-contact.sql'), 'utf-8'
);

interface GetContactParams {
  contact_id: number;
}

interface GetContactResult {
  contact: Record<string, unknown> | null;
  recipe: 'contact-profile';
}

export async function get_contact(
  params: GetContactParams,
  ctx: SkillContext
): Promise<GetContactResult> {
  const res = await ctx.db.query(GET_CONTACT_SQL, {
    $tenant_id:  ctx.tenant_id,
    $is_live:    ctx.is_live,
    $contact_id: params.contact_id,
  });

  return {
    contact: res.rows[0] ?? null,
    recipe:  'contact-profile',
  };
}
