/**
 * One real completion against the declared endpoint.
 *
 * A test that only parsed the URL would pass for a revoked key, a wrong model
 * name and a firewalled host alike — and the tenant would find out when their
 * first agent run failed. So this is a round trip, and `detail` carries what
 * the provider actually said rather than "connection failed".
 *
 * A failed test is a RESULT, not an error: it returns ok:false and the skill
 * call succeeds. Throwing here would make a bad key indistinguishable from our
 * own API being down, which is the opposite of what a test should tell you.
 */

import { SkillContext } from '../../../shared/types';
import { getPool } from '../../../db/pool';
import { testProvider } from '../../../vani/llm-provider.service';

export async function test_provider(_params: Record<string, unknown>, ctx: SkillContext) {
  return testProvider(getPool(), ctx.tenant_id);
}
