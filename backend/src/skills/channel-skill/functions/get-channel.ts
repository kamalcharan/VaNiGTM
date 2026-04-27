/**
 * channel-skill: get_channel
 * Single channel with full config.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_CHANNEL_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-channel.sql'), 'utf-8');

export async function get_channel(params: { channel_id: number }, ctx: SkillContext) {
  if (!params.channel_id) throw new Error('channel_id is required');
  const res = await ctx.db.query(GET_CHANNEL_SQL, {
    $tenant_id:  ctx.tenant_id,
    $is_live:    ctx.is_live,
    $channel_id: params.channel_id,
  });
  if (!res.rows[0]) throw new Error('Channel not found');
  return { channel: res.rows[0], recipe: 'channel-detail' as const };
}
