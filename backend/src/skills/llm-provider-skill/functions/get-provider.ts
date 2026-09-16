/**
 * What this workspace has declared, minus the secret.
 *
 * `null` is the PLATFORM posture, not a failure: every tenant starts there and
 * most stay. The screen needs to tell those two apart from an error, which is
 * why posture is returned explicitly rather than inferred from a null.
 */

import { SkillContext } from '../../../shared/types';
import { getPool } from '../../../db/pool';
import { getProviderSummary } from '../../../vani/llm-provider.service';

export async function get_provider(_params: Record<string, unknown>, ctx: SkillContext) {
  const provider = await getProviderSummary(getPool(), ctx.tenant_id);
  return { provider, posture: provider ? 'byok' : 'platform' };
}
