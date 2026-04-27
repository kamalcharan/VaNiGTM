/**
 * campaign-skill: clear_demo_data
 * Removes ALL GTM data from the TEST environment for this tenant.
 * ONLY works when is_live = false. Throws in live mode.
 * Does NOT touch ki_contacts — only gt_* tables.
 */

import { SkillContext } from '../../../shared/types';

export async function clear_demo_data(
  _params: Record<string, never>,
  ctx: SkillContext
) {
  if (ctx.is_live) {
    throw new Error('Can only clear demo data in TEST mode. Switch to Test environment first.');
  }

  const counts: Record<string, number> = {};

  await ctx.db.transaction(async (tx) => {
    const tables = [
      'gt_activity_feed',
      'gt_agent_runs',
      'gt_campaign_metrics',
      'gt_stage_log',
      'gt_contact_assignments',
      'gt_step_templates',
      'gt_sequence_steps',
      'gt_sequences',
      'gt_channels',
      'gt_persona_signals',
      'gt_personas',
      'gt_campaigns',
    ];

    for (const table of tables) {
      const res = await tx.query(
        `DELETE FROM ${table} WHERE tenant_id = $tenant_id AND is_live = false`,
        { $tenant_id: ctx.tenant_id }
      );
      counts[table] = res.rowCount ?? 0;
    }
  });

  const totalDeleted = Object.values(counts).reduce((a, b) => a + b, 0);

  return {
    cleared: true,
    total_deleted: totalDeleted,
    counts,
    message: `Cleared ${totalDeleted} rows across ${Object.keys(counts).length} GTM tables.`,
    recipe: 'confirmation' as const,
  };
}
