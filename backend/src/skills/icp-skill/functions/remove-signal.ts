/**
 * icp-skill: remove_signal
 * Remove a buying signal (hard delete — signals are lightweight).
 */

import { SkillContext } from '../../../shared/types';

interface RemoveSignalParams {
  signal_id: number;
}

interface RemoveSignalResult {
  deleted: true;
  signal_id: number;
  recipe: 'confirmation';
}

export async function remove_signal(
  params: RemoveSignalParams,
  ctx: SkillContext
): Promise<RemoveSignalResult> {
  if (!params.signal_id) throw new Error('signal_id is required');

  await ctx.db.transaction(async (tx) => {
    const res = await tx.query<{ id: number }>(
      `DELETE FROM gt_persona_signals
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND id = $signal_id
       RETURNING id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $signal_id: params.signal_id }
    );
    if (!res.rows[0]) throw new Error('Signal not found');
  });

  return { deleted: true, signal_id: params.signal_id, recipe: 'confirmation' };
}
