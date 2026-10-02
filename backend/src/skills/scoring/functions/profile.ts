/** scoring: profile — what is in force here, the platform default beside it, and the history. */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { platformLatest, profileHistory, resolveProfile } from '../../../scoring/profiles';
import { ITEMS, LEVEL_KEYS, LEVEL_LABEL, PART_KEYS, PART_LABEL } from '../../../scoring/score';
import { canEdit } from '../shared';

export async function profile(_params: Record<string, unknown>, ctx: SkillContext) {
  const pool = getPool();
  const p = await resolveProfile(pool, ctx.tenant_id);
  const platform = await platformLatest(pool);
  return {
    in_force: {
      scope: p.scope, version: p.version, platform_version: p.platformVersion, own: p.own,
      based_on_version: p.basedOnVersion, platform_changed: p.platformChanged, part_weights: p.partWeights,
    },
    platform: { version: platform.version, part_weights: platform.part_weights, item_weights: platform.item_weights, level_bounds: platform.level_bounds },
    parts: PART_KEYS.map((k) => ({ key: k, label: PART_LABEL[k], items: Object.entries(ITEMS[k]).map(([ik, r]) => ({ key: ik, label: r.label })) })),
    levels: LEVEL_KEYS.map((k) => ({ key: k, label: LEVEL_LABEL[k] })),
    can_edit: canEdit(ctx),
    can_edit_platform: ctx.is_admin === true,
    history: await profileHistory(pool, ctx.tenant_id),
  };
}
