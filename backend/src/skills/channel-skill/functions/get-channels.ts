/**
 * channel-skill: get_channels
 * List all channels for the tenant, optionally filtered by type.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_CHANNELS_SQL = fs.readFileSync(path.join(__dirname, '../queries/get-channels.sql'), 'utf-8');

const VALID_TYPES = ['email', 'whatsapp', 'linkedin'] as const;

interface GetChannelsParams { channel_type?: string; }

export async function get_channels(params: GetChannelsParams, ctx: SkillContext) {
  if (params.channel_type && !VALID_TYPES.includes(params.channel_type as typeof VALID_TYPES[number])) {
    throw new Error(`Invalid channel_type. Must be one of: ${VALID_TYPES.join(', ')}`);
  }
  const res = await ctx.db.query(GET_CHANNELS_SQL, {
    $tenant_id:    ctx.tenant_id,
    $is_live:      ctx.is_live,
    $channel_type: params.channel_type || null,
  });
  return { channels: res.rows, recipe: 'channel-list' as const };
}
