/**
 * contact-skill: create_contact
 * Creates a new prospect contact with optional communication channels.
 * All writes in a single transaction.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

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
  name: string;
  prefix?: string;
  channels?: ChannelInput[];
  job_title?: string;
  company_name?: string;
  company_domain?: string;
  linkedin_url?: string;
  location?: string;
  source?: string;   // 'manual' | 'upload' | 'byo:<provider>' | 'platform:<provider>'
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
    prefix: string | null;
    normalized_name: string;
    job_title: string | null;
    company_name: string | null;
    score: number;
    channels: ChannelItem[];
  };
  recipe: 'contact-card';
}

export async function create_contact(
  params: CreateContactParams,
  ctx: SkillContext
): Promise<CreateContactResult> {
  const { name, prefix, channels = [], job_title, company_name, company_domain, linkedin_url, location, source } = params;

  if (!name?.trim()) {
    throw new Error('Contact name is required');
  }

  const result = await ctx.db.transaction(async (tx) => {
    const contactRes = await tx.query<{
      id: number; contact_no: string; name: string; prefix: string | null; normalized_name: string;
      job_title: string | null; company_name: string | null; score: number;
    }>(INSERT_CONTACT_SQL, {
      $tenant_id:      ctx.tenant_id,
      $is_live:        ctx.is_live,
      $prefix:         prefix?.trim() || null,
      $name:           name.trim(),
      $job_title:      job_title?.trim() || null,
      $company_name:   company_name?.trim() || null,
      $company_domain: company_domain?.trim()?.toLowerCase() || null,
      $linkedin_url:   linkedin_url?.trim() || null,
      $location:       location?.trim() || null,
      $source:         source?.trim() || 'manual',
      $created_by:     ctx.user_id,
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
