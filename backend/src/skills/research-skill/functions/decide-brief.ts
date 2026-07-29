/**
 * research-skill: decide_brief
 *
 * A human's ruling on one brief: approve it, send it to a different offer,
 * or rule the company out.
 *
 * "Do not contact" is a first-class decision and REQUIRES a reason. Those
 * reasons are the pilot's most useful output after the reply rate — they are
 * what tells us whether the segment was wrong, the offer was wrong, or the
 * research simply could not see enough.
 */

import { SkillContext } from '../../../shared/types';

interface DecideBriefParams {
  brief_id: number;
  decision: 'approved' | 'rejected' | 'no_contact';
  /** Set when approving with a different offer than the agent chose. */
  offer_key?: string;
  note?: string;
}

const DECISIONS = new Set(['approved', 'rejected', 'no_contact']);

export async function decide_brief(params: DecideBriefParams, ctx: SkillContext) {
  const briefId = Number(params.brief_id);
  if (!Number.isFinite(briefId)) throw new Error('brief_id is required');
  if (!DECISIONS.has(params.decision)) {
    throw new Error(`decision must be one of: ${[...DECISIONS].join(', ')}`);
  }
  const note = String(params.note ?? '').trim();
  if (params.decision !== 'approved' && note.length < 3) {
    throw new Error(
      'A reason is required when ruling a company out. These reasons are how we '
      + 'learn whether the segment or the offer was wrong.',
    );
  }

  return ctx.db.transaction(async (tx) => {
    // The offer must be one this tenant actually sells — a reassignment is
    // typed by a human and cannot be trusted any more than the model's.
    if (params.offer_key) {
      const ok = await tx.query(
        `SELECT 1 FROM gt_offers
          WHERE tenant_id = $tenant_id AND offer_key = $offer_key AND is_active = true`,
        { tenant_id: ctx.tenant_id, offer_key: params.offer_key },
      );
      if (ok.rows.length === 0) throw new Error(`No active offer "${params.offer_key}".`);
    }

    // tenant_id and is_live in the WHERE clause ARE the authorisation — a
    // brief id from another tenant simply matches nothing.
    const res = await tx.query<{ id: number }>(
      // recommended_offer is NOT touched. It is what the agent proposed, and
      // overwriting it with the human's choice destroyed the single most
      // useful thing the pilot produces — the disagreement between the two.
      // The reviewer's choice goes in human_offer (migration 213), and reads
      // take COALESCE(human_offer, recommended_offer).
      `UPDATE gt_account_briefs
          SET status            = $decision,
              human_offer       = COALESCE($offer_key, human_offer),
              decision_note     = NULLIF($note, ''),
              decided_by        = $user_id,
              decided_at        = now(),
              updated_at        = now()
        WHERE id = $brief_id AND tenant_id = $tenant_id AND is_live = $is_live
        RETURNING id`,
      {
        brief_id: briefId, decision: params.decision,
        offer_key: params.offer_key ?? null, note,
        user_id: ctx.user_id, tenant_id: ctx.tenant_id, is_live: ctx.is_live,
      },
    );
    if (res.rows.length === 0) throw new Error('No such brief.');
    return { brief_id: briefId, decision: params.decision, recipe: 'brief-card' as const };
  });
}
