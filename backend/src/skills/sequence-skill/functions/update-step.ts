/**
 * sequence-skill: update_step
 * Update an existing step.
 */
import { SkillContext } from '../../../shared/types';

interface UpdateStepParams {
  step_id: number;
  title?: string;
  description?: string;
  day_offset?: number;
  channel_id?: number;
  wait_duration_hours?: number;
  condition_type?: string;
}

export async function update_step(params: UpdateStepParams, ctx: SkillContext) {
  if (!params.step_id) throw new Error('step_id is required');

  const result = await ctx.db.transaction(async (tx) => {
    const sets: string[] = [];
    const values: Record<string, unknown> = {
      $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $step_id: params.step_id,
    };
    if (params.title !== undefined)               { sets.push('title = $title');                             values.$title = params.title.trim(); }
    if (params.description !== undefined)          { sets.push('description = $description');                 values.$description = params.description.trim(); }
    if (params.day_offset !== undefined)           { sets.push('day_offset = $day_offset');                   values.$day_offset = params.day_offset; }
    if (params.channel_id !== undefined)           { sets.push('channel_id = $channel_id');                   values.$channel_id = params.channel_id; }
    if (params.wait_duration_hours !== undefined)  { sets.push('wait_duration_hours = $wait_duration_hours'); values.$wait_duration_hours = params.wait_duration_hours; }
    if (params.condition_type !== undefined)       { sets.push('condition_type = $condition_type');           values.$condition_type = params.condition_type; }
    if (sets.length === 0) throw new Error('No fields to update');
    sets.push('updated_at = now()');

    const res = await tx.query(
      `UPDATE gt_sequence_steps SET ${sets.join(', ')}
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND id = $step_id
       RETURNING id, title, updated_at`, values
    );
    if (!res.rows[0]) throw new Error('Step not found');
    return res.rows[0];
  });
  return { step: result, recipe: 'step-card' as const };
}
