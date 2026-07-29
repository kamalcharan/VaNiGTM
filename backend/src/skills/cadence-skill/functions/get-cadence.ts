/**
 * cadence-skill: get_cadence
 *
 * One person's calendar of attention — what has been sent, what is held,
 * and how much room is left.
 *
 * This is the contact's cadence strip in both candidate designs: the line
 * under the runway axis with a crossed-out slot and an arrow showing where
 * the governor moved it to. The move has to be visible or it is exactly the
 * silent behaviour rule 12 forbids.
 */

import { SkillContext } from '../../../shared/types';
import { loadPolicy, claimedTouches } from '../cadence.service';
import { fits } from '../governor';

interface GetCadenceParams {
  contact_id: number;
  channel?: string;
  /** How far back and forward to draw. Default 30 each way. */
  days?: number;
}

export async function get_cadence(params: GetCadenceParams, ctx: SkillContext) {
  const contactId = Number(params.contact_id);
  if (!Number.isFinite(contactId)) throw new Error('contact_id is required');
  const days = Math.min(Math.max(Number(params.days) || 30, 1), 180);
  const scope = { tenant_id: ctx.tenant_id, is_live: ctx.is_live };

  const who = await ctx.db.query<{ name: string; job_title: string | null }>(
    `SELECT name, job_title FROM gt_contacts
      WHERE id = $id AND tenant_id = $tenant_id AND is_live = $is_live`,
    { id: contactId, tenant_id: ctx.tenant_id, is_live: ctx.is_live },
  );
  if (!who.rows[0]) throw new Error('No such contact.');

  const policy = await loadPolicy(ctx.db, scope, params.channel ?? 'email');
  const claimed = await claimedTouches(ctx.db, scope, contactId, new Date(), days);
  const times = claimed.map((c) => c.at);

  // The moves, so the strip can draw the arrow rather than just the result.
  const moves = await ctx.db.query<Record<string, unknown>>(
    `SELECT id::text, requested_at, scheduled_at, moved_reason, channel, status
       FROM gt_touch_reservations
      WHERE tenant_id = $tenant_id AND is_live = $is_live
        AND contact_id = $contact_id
        AND scheduled_at <> requested_at
        AND scheduled_at > now() - ($days::int || ' days')::interval
      ORDER BY scheduled_at`,
    { tenant_id: ctx.tenant_id, is_live: ctx.is_live, contact_id: contactId, days },
  );

  // "Can anything go out today at all" — the question the strip answers at
  // a glance, computed with the same rule that will judge the real request.
  const now = new Date();
  const openNow = fits(times, now, policy);

  return {
    contact: { id: contactId, name: who.rows[0].name, job_title: who.rows[0].job_title },
    policy: {
      max_touches: policy.max_touches, window_days: policy.window_days,
      quiet_dows: policy.quiet_dows, quiet_from: policy.quiet_from,
      quiet_to: policy.quiet_to, timezone: policy.timezone, source: policy.source,
    },
    touches: claimed.map((c) => ({
      at: c.at.toISOString(), kind: c.kind, channel: c.channel, id: c.id,
    })),
    moves: moves.rows,
    // Count inside the window ENDING now — what the cap is actually against.
    in_window: times.filter((t) =>
      t.getTime() > now.getTime() - policy.window_days * 86_400_000
      && t.getTime() <= now.getTime()).length,
    open_now: openNow,
    recipe: 'cadence-strip' as const,
  };
}
