/**
 * contact-skill: create_contact
 * Creates a new prospect contact with optional communication channels.
 * All writes in a single transaction.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const VALID_PREFIXES      = ['Mr', 'Mrs', 'Ms', 'Dr', 'Prof', 'Sri', 'Smt'] as const;
const VALID_CHANNEL_TYPES = ['email', 'mobile', 'whatsapp', 'instagram', 'twitter', 'linkedin', 'other'] as const;
const VALID_SUBTYPES      = ['personal', 'work', 'other'] as const;

const INSERT_CONTACT_SQL = fs.readFileSync(path.join(__dirname, '../queries/insert-contact.sql'), 'utf-8');
const INSERT_CHANNEL_SQL = fs.readFileSync(path.join(__dirname, '../queries/insert-channel.sql'), 'utf-8');

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
  age?: number;
  city?: string;
  marital_status?: 'single' | 'married' | 'family' | 'other';
  dependents_count?: number;
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
    contact_no: string;
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
  const { prefix, name, channels = [], age, city, marital_status, dependents_count } = params;

  const VALID_MARITAL = ['single', 'married', 'family', 'other'] as const;

  if (!VALID_PREFIXES.includes(prefix as typeof VALID_PREFIXES[number])) {
    throw new Error(`Invalid prefix. Must be one of: ${VALID_PREFIXES.join(', ')}`);
  }
  if (!name?.trim()) {
    throw new Error('Contact name is required');
  }
  if (marital_status && !VALID_MARITAL.includes(marital_status as typeof VALID_MARITAL[number])) {
    throw new Error(`Invalid marital_status. Must be one of: ${VALID_MARITAL.join(', ')}`);
  }

  const result = await ctx.db.transaction(async (tx) => {
    const contactRes = await tx.query<{
      id: number; contact_no: string; name: string; prefix: string; normalized_name: string; is_client: boolean;
    }>(INSERT_CONTACT_SQL, {
      $tenant_id:        ctx.tenant_id,
      $is_live:          ctx.is_live,
      $prefix:           prefix,
      $name:             name.trim(),
      $created_by:       ctx.user_id,
      $age:              age ?? null,
      $city:             city?.trim() || null,
      $marital_status:   marital_status || null,
      $dependents_count: dependents_count ?? null,
    });
    const contact = contactRes.rows[0];

    const insertedChannels: ChannelItem[] = [];
    for (const ch of channels) {
      if (!VALID_CHANNEL_TYPES.includes(ch.channel_type as typeof VALID_CHANNEL_TYPES[number])) continue;
      const subtype = VALID_SUBTYPES.includes(ch.channel_subtype as typeof VALID_SUBTYPES[number])
        ? ch.channel_subtype! : 'personal';

      const chRes = await tx.query<ChannelItem>(INSERT_CHANNEL_SQL, {
        $contact_id:      contact.id,
        $tenant_id:       ctx.tenant_id,
        $is_live:         ctx.is_live,
        $channel_type:    ch.channel_type,
        $channel_value:   ch.channel_value.trim(),
        $channel_subtype: subtype,
        $is_primary:      ch.is_primary ?? false,
      });
      if (chRes.rows[0]) insertedChannels.push(chRes.rows[0]);
    }

    return { ...contact, channels: insertedChannels };
  });

  return { contact: result, recipe: 'contact-card' };
}
