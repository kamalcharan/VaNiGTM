/**
 * contact-skill: delete_channel
 * Soft-delete a communication channel.
 */

import { SkillContext } from '../../../shared/types';

interface DeleteChannelParams {
  channel_id: number;
}

interface DeleteChannelResult {
  deleted: true;
  channel_id: number;
  recipe: 'confirmation';
}

export async function delete_channel(
  params: DeleteChannelParams,
  ctx: SkillContext
): Promise<DeleteChannelResult> {
  const { channel_id } = params;

  const res = await ctx.db.query<{ id: number }>(
    `UPDATE ki_contact_channels
     SET is_active = false
     WHERE id = $channel_id AND tenant_id = $tenant_id AND is_live = $is_live AND is_active = true
     RETURNING id`,
    { $channel_id: channel_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );

  if (!res.rows[0]) {
    throw new Error(`Channel ${channel_id} not found`);
  }

  return { deleted: true, channel_id, recipe: 'confirmation' };
}
