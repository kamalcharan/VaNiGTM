/**
 * channel-skill: update_channel
 * Update channel name, config, or status.
 */
import { SkillContext } from '../../../shared/types';

const VALID_STATUSES = ['connected', 'pending', 'disconnected', 'error'] as const;

interface UpdateChannelParams {
  channel_id: number;
  name?: string;
  config?: Record<string, unknown>;
  status?: string;
}

export async function update_channel(params: UpdateChannelParams, ctx: SkillContext) {
  if (!params.channel_id) throw new Error('channel_id is required');
  if (params.status && !VALID_STATUSES.includes(params.status as typeof VALID_STATUSES[number])) {
    throw new Error(`Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}`);
  }

  const result = await ctx.db.transaction(async (tx) => {
    const sets: string[] = [];
    const values: Record<string, unknown> = {
      $tenant_id: ctx.tenant_id, $is_live: ctx.is_live, $channel_id: params.channel_id,
    };
    if (params.name !== undefined)   { sets.push('name = $name');           values.$name = params.name.trim(); }
    if (params.config !== undefined)  { sets.push('config = $config::jsonb'); values.$config = JSON.stringify(params.config); }
    if (params.status !== undefined)  { sets.push('status = $status');       values.$status = params.status; }
    if (sets.length === 0) throw new Error('No fields to update');
    sets.push('updated_at = now()');

    const res = await tx.query(
      `UPDATE gt_channels SET ${sets.join(', ')}
       WHERE tenant_id = $tenant_id AND is_live = $is_live AND is_active = true AND id = $channel_id
       RETURNING id, name, status, updated_at`, values
    );
    if (!res.rows[0]) throw new Error('Channel not found');
    return res.rows[0];
  });
  return { channel: result, recipe: 'channel-card' as const };
}
