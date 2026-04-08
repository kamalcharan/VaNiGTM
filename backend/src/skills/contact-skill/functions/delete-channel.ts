/**
 * contact-skill: delete_channel
 * Soft-delete a communication channel.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const DELETE_CHANNEL_SQL = fs.readFileSync(path.join(__dirname, '../queries/delete-channel.sql'), 'utf-8');

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

  const res = await ctx.db.query<{ id: number }>(DELETE_CHANNEL_SQL, {
    $channel_id: channel_id,
    $tenant_id:  ctx.tenant_id,
    $is_live:    ctx.is_live,
  });

  if (!res.rows[0]) {
    throw new Error(`Channel ${channel_id} not found`);
  }

  return { deleted: true, channel_id, recipe: 'confirmation' };
}
