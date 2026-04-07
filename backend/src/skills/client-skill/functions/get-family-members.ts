/**
 * client-skill: get_family_members
 * Get all clients in the same family group, with family name.
 */

import { SkillContext } from '../../../shared/types';

interface GetFamilyMembersParams {
  family_id: string;
}

interface FamilyMember {
  id: number;
  client_uid: string;
  name: string;
  prefix: string;
  is_family_head: boolean;
  ext_ref_id: string | null;
  risk_profile: string | null;
}

interface GetFamilyMembersResult {
  members: FamilyMember[];
  family_name: string | null;
  recipe: 'data-table';
}

export async function get_family_members(
  params: GetFamilyMembersParams,
  ctx: SkillContext
): Promise<GetFamilyMembersResult> {
  const { family_id } = params;

  const familyRes = await ctx.db.query<{ family_name: string | null }>(
    `SELECT family_name FROM ki_families WHERE id = $family_id AND tenant_id = $tenant_id AND is_live = $is_live`,
    { $family_id: family_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );

  if (!familyRes.rows[0]) {
    throw new Error(`Family ${family_id} not found`);
  }

  const membersRes = await ctx.db.query<FamilyMember>(
    `SELECT cl.id, cl.client_uid, cl.is_family_head, cl.ext_ref_id, cl.risk_profile,
            c.name, c.prefix
     FROM ki_clients cl
     JOIN ki_contacts c ON c.id = cl.contact_id
     WHERE cl.family_id = $family_id AND cl.tenant_id = $tenant_id
       AND cl.is_live = $is_live AND cl.is_active = true
     ORDER BY cl.is_family_head DESC, c.name ASC`,
    { $family_id: family_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );

  return {
    members:     membersRes.rows,
    family_name: familyRes.rows[0].family_name,
    recipe:      'data-table',
  };
}
