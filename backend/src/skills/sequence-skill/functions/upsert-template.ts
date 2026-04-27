/**
 * sequence-skill: upsert_template
 * Create or update a message template for a step.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const SQL = fs.readFileSync(path.join(__dirname, '../queries/upsert-template.sql'), 'utf-8');

interface UpsertTemplateParams {
  step_id: number;
  variant_label?: string;
  subject?: string;
  body: string;
}

export async function upsert_template(params: UpsertTemplateParams, ctx: SkillContext) {
  if (!params.step_id) throw new Error('step_id is required');
  if (!params.body?.trim()) throw new Error('Template body is required');

  const result = await ctx.db.transaction(async (tx) => {
    // Verify step exists
    const check = await tx.query(
      `SELECT id FROM gt_sequence_steps WHERE tenant_id = $tenant_id AND is_live = $is_live AND id = $step_id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $step_id: params.step_id }
    );
    if (!check.rows[0]) throw new Error('Step not found');

    const res = await tx.query(SQL, {
      $step_id:       params.step_id,
      $tenant_id:     ctx.tenant_id,
      $is_live:       ctx.is_live,
      $variant_label: params.variant_label || 'A',
      $subject:       params.subject?.trim() || null,
      $body:          params.body.trim(),
    });
    return res.rows[0];
  });
  return { template: result, recipe: 'template-card' as const };
}
