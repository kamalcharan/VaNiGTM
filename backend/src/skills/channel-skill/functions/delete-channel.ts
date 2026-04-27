/**
 * channel-skill: delete_channel
 * Soft-delete a channel (sets is_active = false).
 */
import { SkillContext } from '../../../shared/types';

export async function delete_channel(params: { channel_id: number }, ctx: SkillContext) {
  if (!params.channel_id) throw new Error('channel_id is required');
  await ctx.db.transaction(async (tx) => {
    const res = await tx.query(
      `UPDATE gt_channels SET is_active = false, updated_at = now()
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $channel_id
       RETURNING id`,
      { $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $channel_id: params.channel_id }
    );
    if (!res.rows[0]) throw new Error('Channel not found');
  });
  return { deleted: true, channel_id: params.channel_id, recipe: 'confirmation' as const };
}
