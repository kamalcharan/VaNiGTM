/**
 * channel-skill: create_channel
 * Create a new outreach channel.
 */
import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const INSERT_CHANNEL_SQL = fs.readFileSync(path.join(__dirname, '../queries/insert-channel.sql'), 'utf-8');

const VALID_TYPES = ['email', 'whatsapp', 'linkedin'] as const;

interface CreateChannelParams {
  channel_type: string;
  name: string;
  config?: Record<string, unknown>;
}

export async function create_channel(params: CreateChannelParams, ctx: SkillContext) {
  if (!VALID_TYPES.includes(params.channel_type as typeof VALID_TYPES[number])) {
    throw new Error(`Invalid channel_type. Must be one of: ${VALID_TYPES.join(', ')}`);
  }
  if (!params.name?.trim()) throw new Error('Channel name is required');

  const result = await ctx.db.transaction(async (tx) => {
    const res = await tx.query(INSERT_CHANNEL_SQL, {
      $tenant_id:    ctx.tenant_id,
      $is_live:      ctx.is_live,
      $channel_type: params.channel_type,
      $name:         params.name.trim(),
      $config:       JSON.stringify(params.config ?? {}),
      $created_by:   ctx.user_id,
    });
    return res.rows[0];
  });
  return { channel: result, recipe: 'channel-card' as const };
}
