/** scoring: rescore — queue a re-score of this workspace's companies, or (admin) the pool's. */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { emitEvent } from '../../../agent-core/event.store';
import { requireAdmin, requireEditor } from '../shared';

export async function rescore(params: { scope?: string }, ctx: SkillContext) {
  const scope = params.scope === 'pool' ? 'pool' : 'tenant';
  if (scope === 'pool') requireAdmin(ctx); else requireEditor(ctx);
  const event_id = await emitEvent(getPool(), ctx.tenant_id, 'SCORE_REFRESH_REQUESTED', 'human',
    { scope, reason: 'asked from the console' }, scope === 'pool' ? 'score-pool' : `score-${ctx.tenant_id}`);
  return { event_id };
}
