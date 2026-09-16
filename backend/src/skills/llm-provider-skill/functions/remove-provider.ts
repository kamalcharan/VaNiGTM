/**
 * Drop the provider and return to the platform model.
 *
 * Deliberately does not delete anything else: the tenant's usage history in
 * gt_tenant_context stays, because "what did last month cost" outlives the
 * credential that incurred it.
 */

import { SkillContext } from '../../../shared/types';
import { getPool } from '../../../db/pool';
import { deleteProvider } from '../../../vani/llm-provider.service';

export async function remove_provider(_params: Record<string, unknown>, ctx: SkillContext) {
  await deleteProvider(getPool(), ctx.tenant_id);
  return { provider: null, posture: 'platform' };
}
