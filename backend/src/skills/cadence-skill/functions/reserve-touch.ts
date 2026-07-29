/**
 * cadence-skill: reserve_touch
 *
 * Claim a slot on a person's attention. The governor decides when.
 *
 * This is the door every planned touch goes through — the agenda, a campaign
 * run, an agent proposing a ghost. Bypassing it is how R. Menon ends up with
 * the AMC nudge and the payback calculator in the same week.
 */

import { SkillContext } from '../../../shared/types';
import { reserve } from '../cadence.service';

const CHANNELS = ['email', 'phone', 'linkedin', 'whatsapp', 'other'];

interface ReserveTouchParams {
  contact_id: number;
  channel: string;
  /** ISO. Defaults to now — "as soon as the governor allows". */
  desired_at?: string;
  prospect_id?: number;
  journey_id?: number;
  note?: string;
}

export async function reserve_touch(params: ReserveTouchParams, ctx: SkillContext) {
  const contactId = Number(params.contact_id);
  if (!Number.isFinite(contactId)) throw new Error('contact_id is required');
  if (!CHANNELS.includes(params.channel)) {
    throw new Error(`channel must be one of: ${CHANNELS.join(', ')}.`);
  }

  const desired = params.desired_at ? new Date(params.desired_at) : new Date();
  if (Number.isNaN(desired.getTime())) throw new Error('desired_at is not a date');

  return ctx.db.transaction(async (tx) => {
    const r = await reserve(tx, { tenant_id: ctx.tenant_id, is_live: ctx.is_live }, {
      contact_id: contactId,
      channel: params.channel,
      desired_at: desired,
      prospect_id: Number.isFinite(Number(params.prospect_id)) ? Number(params.prospect_id) : null,
      journey_id: Number.isFinite(Number(params.journey_id)) ? Number(params.journey_id) : null,
      note: params.note ?? null,
      user_id: ctx.user_id,
    });
    return { ...r, recipe: 'cadence-reservation' as const };
  });
}
