/**
 * sequence-skill: add_step
 * Add a step to a sequence.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SQL = fs.readFileSync(path.join(__dirname, '../queries/insert-step.sql'), 'utf-8');

const VALID_STEP_TYPES = ['email', 'whatsapp', 'linkedin', 'wait', 'condition'] as const;

interface AddStepParams {
  sequence_id: number;
  step_type: string;
  title: string;
  description?: string;
  day_offset?: number;
  channel_id?: number;
  wait_duration_hours?: number;
  condition_type?: string;
}

export async function add_step(params: AddStepParams, ctx: SkillContext) {
  if (!params.sequence_id) throw new Error('sequence_id is required');
  if (!params.title?.trim()) throw new Error('Step title is required');
  if (!VALID_STEP_TYPES.includes(params.step_type as typeof VALID_STEP_TYPES[number])) {
    throw new Error(`Invalid step_type. Must be one of: ${VALID_STEP_TYPES.join(', ')}`);
  }

  const result = await ctx.db.transaction(async (tx) => {
    // Verify sequence exists
    const check = await tx.query(
      `SELECT id FROM gt_sequences WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $sequence_id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $sequence_id: params.sequence_id }
    );
    if (!check.rows[0]) throw new Error('Sequence not found');

    const res = await tx.query(SQL, {
      $sequence_id:         params.sequence_id,
      $tenant_id:           ctx.tenant_id,
      $is_live:             ctx.is_live,
      $step_type:           params.step_type,
      $title:               params.title.trim(),
      $description:         params.description?.trim() || null,
      $day_offset:          params.day_offset ?? 0,
      $wait_duration_hours: params.wait_duration_hours ?? null,
      $condition_type:      params.condition_type || null,
      $channel_id:          params.channel_id ?? null,
    });
    return res.rows[0];
  });
  return { step: result, recipe: 'step-card' as const };
}
