/**
 * contact-skill: update_stage
 * Update the pipeline stage for a contact assignment.
 */
import { SkillContext } from '../../../shared/types';

const VALID_STAGES = ['identified', 'contacted', 'engaged', 'interested', 'qualified', 'converted', 'lost'] as const;

interface UpdateStageParams {
  assignment_id: number;
  stage: string;
  trigger_detail?: string;
}

export async function update_stage(params: UpdateStageParams, ctx: SkillContext) {
  if (!params.assignment_id) throw new Error('assignment_id is required');
  if (!VALID_STAGES.includes(params.stage as typeof VALID_STAGES[number])) {
    throw new Error(`Invalid stage. Must be one of: ${VALID_STAGES.join(', ')}`);
  }

  const result = await ctx.db.transaction(async (tx) => {
    // Get current stage
    const current = await tx.query<{ id: number; stage: string }>(
      `SELECT id, stage FROM gt_contact_assignments
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND id = $assignment_id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $assignment_id: params.assignment_id }
    );
    if (!current.rows[0]) throw new Error('Assignment not found');

    const fromStage = current.rows[0].stage;
    if (fromStage === params.stage) return current.rows[0];

    // Update stage
    const extras: string[] = [];
    if (params.stage === 'contacted' && !current.rows[0]) extras.push('first_contacted_at = COALESCE(first_contacted_at, now())');
    if (params.stage === 'converted') extras.push('converted_at = now()');
    extras.push('last_activity_at = now()');

    const setClauses = [`stage = $stage`, 'updated_at = now()', ...extras].join(', ');
    const res = await tx.query(
      `UPDATE gt_contact_assignments SET ${setClauses}
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND id = $assignment_id
       RETURNING id, stage, score, last_activity_at`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $assignment_id: params.assignment_id, $stage: params.stage }
    );

    // Audit log
    await tx.query(
      `INSERT INTO gt_stage_log (assignment_id, tenant_id, is_live, from_stage, to_stage, trigger_type, trigger_detail, created_by)
       VALUES ($assignment_id, $tenant_id, $is_live, $from_stage, $to_stage, 'manual', $trigger_detail, $user_id)`,
      {
        $assignment_id: params.assignment_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live,
        $from_stage: fromStage, $to_stage: params.stage,
        $trigger_detail: params.trigger_detail || null, $user_id: ctx.user_id,
      }
    );

    return res.rows[0];
  });

  return { assignment: result, recipe: 'pipeline-card' as const };
}
