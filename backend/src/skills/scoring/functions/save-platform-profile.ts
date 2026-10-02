/**
 * scoring: save_platform_profile — the platform default, a new version (admin).
 * Re-scores the common pool and the admin's own workspace; every other tenant
 * that follows the default is re-scored by its own next rescore (and its
 * Scoring tab reads the new version at once).
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { emitEvent } from '../../../agent-core/event.store';
import { ProfileError, savePlatformProfile } from '../../../scoring/profiles';
import { requireAdmin } from '../shared';

export async function save_platform_profile(
  params: { part_weights?: unknown; item_weights?: unknown; level_bounds?: unknown; note?: string }, ctx: SkillContext,
) {
  requireAdmin(ctx);
  try {
    const r = await savePlatformProfile(getPool(), { ...params, note: params.note?.slice(0, 300) }, ctx.user_id || null);
    const pool = await emitEvent(getPool(), ctx.tenant_id, 'SCORE_REFRESH_REQUESTED', 'human', { scope: 'pool', reason: `platform v${r.version}` }, 'score-pool');
    const own = await emitEvent(getPool(), ctx.tenant_id, 'SCORE_REFRESH_REQUESTED', 'human', { scope: 'tenant', reason: `platform v${r.version}` }, `score-${ctx.tenant_id}`);
    return { version: r.version, rescore_event_ids: [pool, own] };
  } catch (e) {
    if (e instanceof ProfileError) throw new Error(e.message);
    throw e;
  }
}
