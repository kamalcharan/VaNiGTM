/** scoring: follow_platform — back to the platform default, and following it from now on. */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { emitEvent } from '../../../agent-core/event.store';
import { followPlatform } from '../../../scoring/profiles';
import { requireEditor } from '../shared';

export async function follow_platform(_params: Record<string, unknown>, ctx: SkillContext) {
  requireEditor(ctx);
  const r = await followPlatform(getPool(), ctx.tenant_id, ctx.user_id || null);
  const rescore_event_id = r.changed
    ? await emitEvent(getPool(), ctx.tenant_id, 'SCORE_REFRESH_REQUESTED', 'human', { scope: 'tenant', reason: 'back to the platform default' }, `score-${ctx.tenant_id}`)
    : null;
  return { ...r, rescore_event_id };
}
