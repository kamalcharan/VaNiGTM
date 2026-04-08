/**
 * contact-skill: add_channel
 * Add a communication channel to a contact.
 * If is_primary=true, unsets the previous primary for that channel type first.
 */

import { SkillContext } from '../../../shared/types';

const VALID_CHANNEL_TYPES = ['email', 'mobile', 'whatsapp', 'instagram', 'twitter', 'linkedin', 'other'] as const;
const VALID_SUBTYPES = ['personal', 'work', 'other'] as const;

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
  const contactCheck = await ctx.db.query<{ id: number }>(
    `SELECT id FROM ki_contacts
     WHERE id = $contact_id AND tenant_id = $tenant_id AND is_live = $is_live AND is_active = true`,
    { $contact_id: contact_id, $tenant_id: ctx.tenant_id, $is_live: ctx.is_live }
  );
  if (!contactCheck.rows[0]) {
    throw new Error(`Contact ${contact_id} not found`);
  }

  const channel = await ctx.db.transaction(async (tx) => {
    // If setting as primary, unset existing primary for this type
    if (is_primary) {
      await tx.query(
        `UPDATE ki_contact_channels
         SET is_primary = false
         WHERE contact_id = $contact_id AND channel_type = $channel_type
           AND is_live = $is_live AND is_active = true AND is_primary = true`,
        { $contact_id: contact_id, $channel_type: channel_type, $is_live: ctx.is_live }
      );
    }

    const res = await tx.query<{
      id: number; channel_type: string; channel_value: string; channel_subtype: string; is_primary: boolean;
    }>(
      `INSERT INTO ki_contact_channels
         (contact_id, tenant_id, is_live, channel_type, channel_value, channel_subtype, is_primary)
       VALUES ($contact_id, $tenant_id, $is_live, $channel_type, $channel_value, $channel_subtype, $is_primary)
       ON CONFLICT (contact_id, channel_type, channel_value, is_live)
         DO UPDATE SET channel_subtype = EXCLUDED.channel_subtype, is_primary = EXCLUDED.is_primary
       RETURNING id, channel_type, channel_value, channel_subtype, is_primary`,
      {
        $contact_id:      contact_id,
        $tenant_id:       ctx.tenant_id,
        $is_live:         ctx.is_live,
        $channel_type:    channel_type,
        $channel_value:   channel_value.trim(),
        $channel_subtype: subtype,
        $is_primary:      is_primary,
      }
    );
    return res.rows[0];
  });

  return { channel, recipe: 'inline-item' };
}
