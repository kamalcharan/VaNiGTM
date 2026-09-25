/**
 * profile-skill: confirm_offer — the human gate on one offer. Stamps
 * confirmed_at and recomputes the profile score. Editing fields never does
 * this; only confirming does.
 */
import { SkillContext } from '../../../shared/types';
import { getPool } from '../../../db';
import { confirmOffer } from '../offer-draft.service';

export async function confirm_offer(params: { offer_key: string }, ctx: SkillContext) {
  const key = String(params.offer_key ?? '').trim();
  if (!key) throw new Error('MISSING_FIELDS: offer_key is required');
  await confirmOffer(getPool(), ctx.tenant_id, key);
  return { success: true, offer_key: key, recipe: 'offer-card' };
}
