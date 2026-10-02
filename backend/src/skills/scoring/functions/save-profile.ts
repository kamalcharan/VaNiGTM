/** scoring: save_profile — this workspace's own part weights, a new version, then a re-score. */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { emitEvent } from '../../../agent-core/event.store';
import { ProfileError, saveTenantProfile } from '../../../scoring/profiles';
import { requireEditor } from '../shared';

export async function save_profile(params: { part_weights?: unknown; note?: string }, ctx: SkillContext) {
  requireEditor(ctx);
  try {
    const r = await saveTenantProfile(getPool(), ctx.tenant_id, params.part_weights, ctx.user_id || null, params.note?.slice(0, 300));
    const rescore_event_id = r.changed
      ? await emitEvent(getPool(), ctx.tenant_id, 'SCORE_REFRESH_REQUESTED', 'human', { scope: 'tenant', reason: `profile v${r.version}` }, `score-${ctx.tenant_id}`)
      : null;
    return { ...r, rescore_event_id };
  } catch (e) {
    if (e instanceof ProfileError) throw new Error(e.message);
    throw e;
  }
}
