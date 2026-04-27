/**
 * sequence-skill: update_sequence
 * Update sequence name, description, or status.
 */
import { SkillContext } from '../../../shared/types';

const VALID_STATUSES = ['draft', 'live', 'paused', 'completed'] as const;

interface UpdateSequenceParams {
  sequence_id: number;
  name?: string;
  description?: string;
  status?: string;
}

export async function update_sequence(params: UpdateSequenceParams, ctx: SkillContext) {
  if (!params.sequence_id) throw new Error('sequence_id is required');
  if (params.status && !VALID_STATUSES.includes(params.status as typeof VALID_STATUSES[number])) {
    throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const result = await ctx.db.transaction(async (tx) => {
    const sets: string[] = [];
    const values: Record<string, unknown> = {
      $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $sequence_id: params.sequence_id,
    };
    if (params.name !== undefined)        { sets.push('name = $name');               values.$name = params.name.trim(); }
    if (params.description !== undefined) { sets.push('description = $description'); values.$description = params.description.trim(); }
    if (params.status !== undefined)      { sets.push('status = $status');           values.$status = params.status; }
    if (sets.length === 0) throw new Error('No fields to update');
    sets.push('updated_at = now()');

    const res = await tx.query(
      `UPDATE gt_sequences SET ${sets.join(', ')}
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $sequence_id
       RETURNING id, name, status, updated_at`, values
    );
    if (!res.rows[0]) throw new Error('Sequence not found');
    return res.rows[0];
  });
  return { sequence: result, recipe: 'sequence-card' as const };
}
