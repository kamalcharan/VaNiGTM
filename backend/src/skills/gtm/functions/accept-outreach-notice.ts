import type { SkillContext } from '../../../shared/types';
import { append, lockAndRead, readState } from '../outreach-notice';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Accept the notice the person was SHOWN. `notice_id` is what they read; if
 * the platform published a newer version in between, the accept is refused
 * rather than recorded against words they never saw.
 */
export async function accept_outreach_notice(params: { notice_id?: unknown }, ctx: SkillContext) {
  const noticeId = typeof params.notice_id === 'string' ? params.notice_id : '';
  if (!UUID.test(noticeId)) throw new Error('notice_id is required — the id of the notice that was shown.');

  return ctx.db.transaction(async (tx) => {
    const state = await lockAndRead(tx, ctx, 'accept');
    if (!state.notice) throw new Error('The DPDP outreach notice has not been published yet, so there is nothing to accept.');
    if (state.notice.id !== noticeId) {
      throw new Error(`The notice changed while it was open (now version ${state.notice.version}). Read the current version and accept that.`);
    }
    // Replay: the same notice is already accepted — nothing to append.
    if (state.status === 'accepted') return { ...state, changed: false };
    await append(tx, ctx, 'accept', noticeId);
    return { ...(await readState(tx, ctx)), changed: true };
  });
}
