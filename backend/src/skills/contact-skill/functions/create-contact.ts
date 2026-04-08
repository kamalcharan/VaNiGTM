/**
 * contact-skill: create_contact
 * Creates a new prospect contact with optional communication channels.
 * All writes in a single transaction.
 */

import { SkillContext } from '../../../shared/types';

const VALID_PREFIXES = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sri', 'Smt'] as const;
const VALID_CHANNEL_TYPES = ['email', 'mobile', 'whatsapp', 'instagram', 'twitter', 'linkedin', 'other'] as const;
const VALID_SUBTYPES = ['personal', 'work', 'other'] as const;

interface ChannelInput {
  channel_type: string;
  channel_value: string;
  channel_subtype?: string;
  is_primary?: boolean;
}

interface CreateContactParams {
  prefix: string;
  name: string;
  channels?: ChannelInput[];
}

interface ChannelItem {
  id: number;
  channel_type: string;
  channel_value: string;
  channel_subtype: string;
  is_primary: boolean;
}

interface CreateContactResult {
  contact: {
    id: number;
    name: string;
    prefix: string;
    normalized_name: string;
    is_client: boolean;
    channels: ChannelItem[];
  };
  recipe: 'contact-card';
}

export async function create_contact(
  params: CreateContactParams,
  ctx: SkillContext
): Promise<CreateContactResult> {
  const { prefix, name, channels = [] } = params;

  if (!VALID_PREFIXES.includes(prefix as typeof VALID_PREFIXES[number])) {
    throw new Error(`Invalid prefix. Must be one of: ${VALID_PREFIXES.join(', ')}`);
  }
  if (!name?.trim()) {
    throw new Error('Contact name is required');
  }

  const result = await ctx.db.transaction(async (tx) => {
    const contactRes = await tx.query<{
      id: number; name: string; prefix: string; normalized_name: string; is_client: boolean;
    }>(
      `INSERT INTO ki_contacts (tenant_id, is_live, prefix, name, created_by)
       VALUES ($tenant_id, $is_live, $prefix, $name, $created_by)
       RETURNING id, prefix, name, normalized_name, is_client`,
      {
        $tenant_id: ctx.tenant_id,
        $is_live:   ctx.is_live,
        $prefix:    prefix,
        $name:      name.trim(),
        $created_by: ctx.user_id,
      }
    );
    const contact = contactRes.rows[0];

    const insertedChannels: ChannelItem[] = [];
    for (const ch of channels) {
      if (!VALID_CHANNEL_TYPES.includes(ch.channel_type as typeof VALID_CHANNEL_TYPES[number])) continue;
      const subtype = VALID_SUBTYPES.includes(ch.channel_subtype as typeof VALID_SUBTYPES[number])
        ? ch.channel_subtype! : 'personal';

      const chRes = await tx.query<ChannelItem>(
        `INSERT INTO ki_contact_channels
           (contact_id, tenant_id, is_live, channel_type, channel_value, channel_subtype, is_primary)
         VALUES ($contact_id, $tenant_id, $is_live, $channel_type, $channel_value, $channel_subtype, $is_primary)
         ON CONFLICT (contact_id, channel_type, channel_value, is_live) DO NOTHING
         RETURNING id, channel_type, channel_value, channel_subtype, is_primary`,
        {
          $contact_id:      contact.id,
          $tenant_id:       ctx.tenant_id,
          $is_live:         ctx.is_live,
          $channel_type:    ch.channel_type,
          $channel_value:   ch.channel_value.trim(),
          $channel_subtype: subtype,
          $is_primary:      ch.is_primary ?? false,
        }
      );
      if (chRes.rows[0]) insertedChannels.push(chRes.rows[0]);
    }

    return { ...contact, channels: insertedChannels };
  });

  return { contact: result, recipe: 'contact-card' };
}
