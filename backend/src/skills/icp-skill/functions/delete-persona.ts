/**
 * icp-skill: delete_persona
 * Soft-delete a persona (sets is_active = false).
 */

import { SkillContext } from '../../../shared/types';

interface DeletePersonaParams {
  persona_id: number;
}

interface DeletePersonaResult {
  deleted: true;
  persona_id: number;
  recipe: 'confirmation';
}

export async function delete_persona(
  params: DeletePersonaParams,
  ctx: SkillContext
): Promise<DeletePersonaResult> {
  if (!params.persona_id) throw new Error('persona_id is required');

  await ctx.db.transaction(async (tx) => {
    const res = await tx.query<{ id: number }>(
      `UPDATE gt_personas SET is_active = false, updated_at = now()
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $persona_id
       RETURNING id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $persona_id: params.persona_id }
    );
    if (!res.rows[0]) throw new Error('Persona not found');
  });

  return { deleted: true, persona_id: params.persona_id, recipe: 'confirmation' };
}
