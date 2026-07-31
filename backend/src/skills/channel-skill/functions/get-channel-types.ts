/**
 * channel-skill: get_channel_types
 *
 * Master list of channel types (migration 226). Tenant-agnostic — the
 * same set of codes is offered to every tenant, so the compose surface,
 * asset library, and later analytics all speak the same vocabulary.
 *
 * Not the same thing as get_channels: that returns a TENANT's outbound
 * connections (SMTP creds, WhatsApp Business endpoints). This returns
 * the CLASSES of medium the product knows about.
 *
 * kind filter is optional and constrained to the three groupings the
 * compose UI branches on: direct (1:1 send), broadcast (public post),
 * asset (attached to a direct send).
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_CHANNEL_TYPES_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-channel-types.sql'), 'utf-8');

const VALID_KINDS = ['direct', 'broadcast', 'asset'] as const;
type Kind = typeof VALID_KINDS[number];

interface GetChannelTypesParams {
  kind?: Kind;
}

interface ChannelTypeRow {
  id: number;
  code: string;
  name: string;
  kind: Kind;
  sort_order: number;
}

export async function get_channel_types(
  params: GetChannelTypesParams, ctx: SkillContext,
) {
  if (params.kind && !VALID_KINDS.includes(params.kind)) {
    throw new Error(
      `Invalid kind. Must be one of: ${VALID_KINDS.join(', ')}`,
    );
  }

  const res = await ctx.db.query<ChannelTypeRow>(GET_CHANNEL_TYPES_SQL, {
    kind: params.kind ?? null,
  });

  return {
    channel_types: res.rows,
    recipe: 'channel-type-list' as const,
  };
}
