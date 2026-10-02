/**
 * pool-skill: resolve — queue the worker job that matches unmatched source rows
 * into companies and runs the Complete test (one delivery, or all of them;
 * `reassess` also re-derives every company — after a tier change, say).
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { emitEvent } from '../../../agent-core/event.store';
import { requireAdmin } from '../shared';

export async function resolve(params: { load_id?: string | number; reassess?: boolean }, ctx: SkillContext) {
  requireAdmin(ctx);
  const loadId = params.load_id == null || params.load_id === '' ? null : Number(params.load_id);
  if (loadId !== null && !Number.isInteger(loadId)) throw new Error('load_id must be a delivery id.');
  const eventId = await emitEvent(getPool(), ctx.tenant_id, 'POOL_RESOLVE_REQUESTED', 'human',
    { load_id: loadId, reassess: params.reassess === true }, loadId ? `load-${loadId}` : 'pool');
  return { event_id: eventId, queued: true };
}
