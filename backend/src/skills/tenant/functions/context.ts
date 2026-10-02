/** tenant: context — this workspace in one read (src/tenant/context.ts). */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { getTenantContext } from '../../../tenant/context';

export async function context(_params: Record<string, unknown>, ctx: SkillContext) {
  return getTenantContext(getPool(), ctx.tenant_id, ctx);
}
