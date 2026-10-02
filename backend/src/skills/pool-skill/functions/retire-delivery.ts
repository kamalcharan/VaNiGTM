/** pool-skill: retire_delivery — withdraw a delivery without deleting it; its companies are re-tested. */
import type { SkillContext } from '../../../types/skill.types';
import { getPool } from '../../../db/pool';
import { retireDelivery, DecisionError } from '../../../etl/pool-decisions';
import { requireAdmin } from '../shared';

export async function retire_delivery(params: { load_id: string | number }, ctx: SkillContext) {
  requireAdmin(ctx);
  const loadId = Number(params.load_id);
  if (!Number.isInteger(loadId)) throw new Error('load_id is required.');
  try {
    return await retireDelivery(getPool(), loadId);
  } catch (e) {
    if (e instanceof DecisionError) throw new Error(e.message);
    throw e;
  }
}
