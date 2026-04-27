/**
 * channel-skill: test_channel
 * Mark a channel as tested. Updates last_tested_at and status.
 */
import { SkillContext } from '../../../shared/types';

export async function test_channel(params: { channel_id: number; success: boolean }, ctx: SkillContext) {
  if (!params.channel_id) throw new Error('channel_id is required');
  if (typeof params.success !== 'boolean') throw new Error('success (boolean) is required');

  const result = await ctx.db.transaction(async (tx) => {
    const newStatus = params.success ? 'connected' : 'error';
    const res = await tx.query(
      `UPDATE gt_channels SET status = $status, last_tested_at = now(), updated_at = now()
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $channel_id
       RETURNING id, status, last_tested_at`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $channel_id: params.channel_id, $status: newStatus }
    );
    if (!res.rows[0]) throw new Error('Channel not found');
    return res.rows[0];
  });
  return { channel: result, recipe: 'channel-card' as const };
}
