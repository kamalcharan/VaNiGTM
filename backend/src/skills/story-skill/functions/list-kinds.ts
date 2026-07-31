/**
 * story-skill: list_kinds
 *
 * The content kinds this tenant may write — the D7 registry, read.
 *
 * System rows appear for every tenant. Tenant-scoped rows appear when
 * that tenant has added a kind of its own. Same posture as gt_prompts.
 */

import { SkillContext } from '../../../shared/types';

interface ListKindsParams {
  scope?: 'asset' | 'move';
  arc?: 'acquisition' | 'lifetime';
  /** Filter to kinds that serve this journey state (per stages TEXT[]).
   *  Empty stages means "any", so an empty-stages kind matches every filter. */
  stage?: string;
  /** Filter to kinds tied to this channel type id (mig 226). Optional. */
  channel_type_id?: number;
}

export async function list_kinds(params: ListKindsParams, ctx: SkillContext) {
  const channelTypeId = params.channel_type_id == null ? null
    : Number(params.channel_type_id);
  if (channelTypeId !== null && !Number.isFinite(channelTypeId)) {
    throw new Error('channel_type_id must be a number.');
  }

  // Left join so kinds without a channel FK still surface (the migration
  // 227 backfill left tenant rows with unknown channel strings NULL).
  const res = await ctx.db.query<Record<string, unknown>>(
    `SELECT ck.id::text, ck.kind_key, ck.display_name, ck.scope, ck.channel,
            ck.channel_type_id, ct.code AS channel_type_code, ct.name AS channel_type_name,
            ck.prompt_key, ck.arc, ck.stages, ck.is_system, ck.is_active
       FROM gt_content_kinds ck
       LEFT JOIN gt_channel_types ct ON ct.id = ck.channel_type_id
      WHERE ck.is_active = true
        AND (ck.is_system = true OR ck.tenant_id = $tenant_id)
        AND ($scope::text IS NULL OR ck.scope = $scope::text)
        AND ($arc::text   IS NULL OR ck.arc   = $arc::text)
        AND ($stage::text IS NULL OR array_length(ck.stages, 1) IS NULL
             OR $stage::text = ANY(ck.stages))
        AND ($channel_type_id::int IS NULL OR ck.channel_type_id = $channel_type_id::int)
      ORDER BY ck.scope, ck.kind_key`,
    {
      tenant_id: ctx.tenant_id,
      scope: params.scope ?? null,
      arc: params.arc ?? null,
      stage: params.stage ?? null,
      channel_type_id: channelTypeId,
    },
  );
  return {
    kinds: res.rows,
    total: res.rows.length,
    recipe: 'kind-list' as const,
  };
}
