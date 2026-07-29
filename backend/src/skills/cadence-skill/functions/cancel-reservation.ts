/**
 * cadence-skill: cancel_reservation
 *
 * Give a slot back.
 *
 * Cancelling matters as much as reserving: a held slot that nobody sends
 * keeps blocking the next real touch, and a governor that only ever adds
 * pressure becomes the thing people work around.
 */

import { SkillContext } from '../../../shared/types';

interface CancelParams { reservation_id: number; reason?: string }

export async function cancel_reservation(params: CancelParams, ctx: SkillContext) {
  const id = Number(params.reservation_id);
  if (!Number.isFinite(id)) throw new Error('reservation_id is required');

  return ctx.db.transaction(async (tx) => {
    const res = await tx.query<{ id: string; contact_id: string }>(
      // Only a HELD reservation can be cancelled. One already sent is a
      // historical fact, and rewriting it would change the cadence record
      // after the person was actually contacted.
      `UPDATE gt_touch_reservations
          SET status = 'cancelled',
              note = COALESCE(NULLIF($reason, ''), note),
              updated_at = now()
        WHERE id = $id AND tenant_id = $tenant_id AND is_live = $is_live
          AND status = 'held'
        RETURNING id::text, contact_id::text`,
      {
        id, tenant_id: ctx.tenant_id, is_live: ctx.is_live,
        reason: String(params.reason ?? '').trim(),
      },
    );
    if (!res.rows[0]) {
      throw new Error('No held reservation with that id — it may already be sent or cancelled.');
    }
    return {
      reservation_id: id,
      contact_id: Number(res.rows[0].contact_id),
      message: 'Slot released. It is available to the next planned touch.',
      recipe: 'cadence-reservation' as const,
    };
  });
}
