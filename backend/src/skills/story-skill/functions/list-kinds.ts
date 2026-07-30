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
}

export async function list_kinds(params: ListKindsParams, ctx: SkillContext) {
  const res = await ctx.db.query<Record<string, unknown>>(
    `SELECT id::text, kind_key, display_name, scope, channel,
            prompt_key, arc, stages, is_system, is_active
       FROM gt_content_kinds
      WHERE is_active = true
        AND (is_system = true OR tenant_id = $tenant_id)
        AND ($scope::text IS NULL OR scope = $scope::text)
        AND ($arc::text   IS NULL OR arc   = $arc::text)
        AND ($stage::text IS NULL OR array_length(stages, 1) IS NULL
             OR $stage::text = ANY(stages))
      ORDER BY scope, kind_key`,
    {
      tenant_id: ctx.tenant_id,
      scope: params.scope ?? null,
      arc: params.arc ?? null,
      stage: params.stage ?? null,
    },
  );
  return {
    kinds: res.rows,
    total: res.rows.length,
    recipe: 'kind-list' as const,
  };
}
