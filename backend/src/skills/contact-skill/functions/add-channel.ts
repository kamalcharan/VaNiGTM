/**
 * contact-skill: add_channel
 * Add a communication channel to a contact.
 * If is_primary=true, unsets the previous primary for that channel type first.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const VALID_CHANNEL_TYPES = ['email', 'mobile', 'whatsapp', 'instagram', 'twitter', 'linkedin', 'other'] as const;
const VALID_SUBTYPES      = ['personal', 'work', 'other'] as const;

const CHECK_CONTACT_SQL       = fs.readFileSync(path.join(__dirname, '../queries/check-contact.sql'),       'utf-8');
const UNSET_PRIMARY_SQL       = fs.readFileSync(path.join(__dirname, '../queries/unset-primary-channel.sql'), 'utf-8');
const UPSERT_CHANNEL_SQL      = fs.readFileSync(path.join(__dirname, '../queries/upsert-channel.sql'),      'utf-8');

interface AddChannelParams {
  contact_id: number;
  channel_type: string;
  channel_value: string;
  channel_subtype?: string;
  is_primary?: boolean;
}

interface AddChannelResult {
  channel: {
    id: number;
    channel_type: string;
    channel_value: string;
    channel_subtype: string;
    is_primary: boolean;
  };
  recipe: 'inline-item';
}

export async function add_channel(
  params: AddChannelParams,
  ctx: SkillContext
): Promise<AddChannelResult> {
  const { contact_id, channel_type, channel_value, is_primary = false } = params;

  if (!VALID_CHANNEL_TYPES.includes(channel_type as typeof VALID_CHANNEL_TYPES[number])) {
    throw new Error(`Invalid channel_type. Must be one of: ${VALID_CHANNEL_TYPES.join(', ')}`);
  }
  if (!channel_value?.trim()) {
    throw new Error('channel_value is required');
  }
  const subtype = VALID_SUBTYPES.includes(params.channel_subtype as typeof VALID_SUBTYPES[number])
    ? params.channel_subtype! : 'personal';

  // Verify contact belongs to this tenant
  const contactCheck = await ctx.db.query<{ id: number }>(CHECK_CONTACT_SQL, {
    $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live,
  });
  if (!contactCheck.rows[0]) {
    throw new Error(`Contact ${contact_id} not found`);
  }

  const channel = await ctx.db.transaction(async (tx) => {
    if (is_primary) {
      await tx.query(UNSET_PRIMARY_SQL, {
        $contact_id:  contact_id,
        $channel_type: channel_type,
        $is_live:      ctx.is_live,
      });
    }

    const res = await tx.query<{
      id: number; channel_type: string; channel_value: string; channel_subtype: string; is_primary: boolean;
    }>(UPSERT_CHANNEL_SQL, {
      $contact_id:      contact_id,
      $tenant_id:       ctx.tenant_id,
      $is_live:         ctx.is_live,
      $channel_type:    channel_type,
      $channel_value:   channel_value.trim(),
      $channel_subtype: subtype,
      $is_primary:      is_primary,
    });
    return res.rows[0];
  });

  return { channel, recipe: 'inline-item' };
}
