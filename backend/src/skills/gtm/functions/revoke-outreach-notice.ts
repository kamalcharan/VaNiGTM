import type { SkillContext } from '../../../shared/types';
import { append, lockAndRead, readState } from '../outreach-notice';

/**
 * Switch GTM sending off. Takes effect at once: the gate reads the latest row
 * on every check. Nothing already sent is affected.
 */
export async function revoke_outreach_notice(_params: Record<string, unknown>, ctx: SkillContext) {
  return ctx.db.transaction(async (tx) => {
    const state = await lockAndRead(tx, ctx, 'revoke');
    // Replay: nothing is in force — nothing to append.
    if (!state.in_force) return { ...state, changed: false };
    await append(tx, ctx, 'revoke', null);
    return { ...(await readState(tx, ctx)), changed: true };
  });
}
