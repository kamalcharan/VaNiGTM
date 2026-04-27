/**
 * icp-skill: update_persona
 * Update an existing persona.
 */

import { SkillContext } from '../../../shared/types';

const VALID_SENIORITY = ['c-suite', 'vp', 'director', 'manager', 'individual-contributor'] as const;

interface UpdatePersonaParams {
  persona_id: number;
  title?: string;
  emoji?: string;
  description?: string;
  tags?: string[];
  company_size_min?: number;
  company_size_max?: number;
  seniority_level?: string;
}

interface UpdatePersonaResult {
  persona: { id: number; title: string; emoji: string; updated_at: string };
  recipe: 'persona-card';
}

export async function update_persona(
  params: UpdatePersonaParams,
  ctx: SkillContext
): Promise<UpdatePersonaResult> {
  if (!params.persona_id) throw new Error('persona_id is required');

  if (params.seniority_level && !VALID_SENIORITY.includes(params.seniority_level as typeof VALID_SENIORITY[number])) {
    throw new Error(`Invalid seniority_level. Must be one of: ${VALID_SENIORITY.join(', ')}`);
  }

  const result = await ctx.db.transaction(async (tx) => {
    const sets: string[] = [];
    const values: Record<string, unknown> = {
      $tenant_id:  ctx.tenant_id,
      $is_live:    ctx.is_live,
      $persona_id: params.persona_id,
    };

    if (params.title !== undefined)            { sets.push('title = $title');                       values.$title = params.title.trim(); }
    if (params.emoji !== undefined)             { sets.push('emoji = $emoji');                       values.$emoji = params.emoji; }
    if (params.description !== undefined)       { sets.push('description = $description');           values.$description = params.description.trim(); }
    if (params.tags !== undefined)              { sets.push('tags = $tags::jsonb');                  values.$tags = JSON.stringify(params.tags); }
    if (params.company_size_min !== undefined)  { sets.push('company_size_min = $company_size_min'); values.$company_size_min = params.company_size_min; }
    if (params.company_size_max !== undefined)  { sets.push('company_size_max = $company_size_max'); values.$company_size_max = params.company_size_max; }
    if (params.seniority_level !== undefined)   { sets.push('seniority_level = $seniority_level');   values.$seniority_level = params.seniority_level; }

    if (sets.length === 0) throw new Error('No fields to update');

    sets.push('updated_at = now()');

    const sql = `UPDATE gt_personas SET ${sets.join(', ')}
                 WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $persona_id
                 RETURNING id, title, emoji, updated_at`;

    const res = await tx.query<{ id: number; title: string; emoji: string; updated_at: string }>(sql, values);
    if (!res.rows[0]) throw new Error('Persona not found');
    return res.rows[0];
  });

  return { persona: result, recipe: 'persona-card' };
}
