import type { SkillContext } from '../../../shared/types';
import { readState } from '../outreach-notice';

/** The DPDP outreach notice, this workspace's decision on it, and its history. */
export async function outreach_notice(_params: Record<string, unknown>, ctx: SkillContext) {
  return readState(ctx.db, ctx);
}
