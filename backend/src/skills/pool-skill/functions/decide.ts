/**
 * pool-skill: decide — a person's decision on one pool company (admin only).
 * Each decision is idempotent by shape: repeating it leaves the same state.
 * The Idempotency-Key header is not stored server-side yet (vani-app CLAUDE.md
 * §2, "current state") — so the console does not auto-retry.
 */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { decide as apply, DecisionError, JUNK_REASONS, type Decision } from '../../../etl/pool-decisions';
import { requireAdmin } from '../shared';

export async function decide(
  params: { company_id: string | number; decision: string; reason?: string }, ctx: SkillContext,
) {
  requireAdmin(ctx);
  const id = String(Number(params.company_id));
  if (id === 'NaN') throw new Error('company_id is required.');
  const kinds = ['company', 'individual', 'not_duplicate', 'junk', 'restore'];
  if (!kinds.includes(params.decision)) throw new Error(`decision must be one of: ${kinds.join(', ')}.`);
  if (params.decision === 'junk' && !(JUNK_REASONS as readonly string[]).includes(params.reason ?? '')) {
    throw new Error(`A junk reason is required: one of ${JUNK_REASONS.join(', ')}.`);
  }
  const d = (params.decision === 'junk' ? { kind: 'junk', reason: params.reason } : { kind: params.decision }) as Decision;
  try {
    return { company: await apply(getPool(), id, d, ctx.user_id) };
  } catch (e) {
    if (e instanceof DecisionError) throw new Error(e.message);
    throw e;
  }
}
