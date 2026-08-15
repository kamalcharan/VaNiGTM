/**
 * research-skill: save_offer
 *
 * Create or update one offer. Everything a prospect could end up reading
 * lives here, so the write is deliberately plain: no partial merge magic,
 * the screen sends the whole offer back.
 *
 * Validation is NOT applied on save. A half-written offer must be storable —
 * that is how anyone fills one in. The gate is at research time
 * (loadOfferCatalogue), where an incomplete offer would otherwise become a
 * confident fit score.
 */

import { SkillContext } from '../../../shared/types';
import { isCommitment, COMMITMENTS, type Commitment } from '../offer-catalogue';
import { getPool } from '../../../db';
import { recomputeProfileScore } from '../../profile-skill/profile.service';

interface SaveOfferParams {
  offer_key?: string;
  name: string;
  one_line?: string;
  who_for?: string;
  problem?: string;
  what_we_do?: string[];
  signals?: string[];
  disqualifiers?: string[];
  price_band?: string;
  proof?: string;
  commitment?: string;
}

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

const cleanList = (xs: unknown): string[] =>
  Array.isArray(xs)
    ? xs.map((x) => String(x ?? '').trim()).filter((x) => x.length > 0)
    : [];

export async function save_offer(
  params: SaveOfferParams,
  ctx: SkillContext,
): Promise<{ offer_key: string; recipe: 'offer-card' }> {
  const name = String(params.name ?? '').trim();
  if (!name) throw new Error('An offer needs a name.');

  const key = (params.offer_key ?? '').trim() || slugify(name);
  if (!key) throw new Error('Could not derive an id from that name — give it letters or numbers.');

  // The one field here that is NOT free text, because a rung the ladder rule
  // does not recognise would silently be treated as 'project' and quietly
  // change which offer a real company hears about first. Omitted = leave what
  // is there (a caller that does not mention it must not reset it).
  let commitment: Commitment | null = null;
  if (params.commitment !== undefined && params.commitment !== null) {
    if (!isCommitment(params.commitment)) {
      throw new Error(
        `commitment must be one of ${COMMITMENTS.join(', ')} — got "${params.commitment}".`,
      );
    }
    commitment = params.commitment;
  }

  // A brand-new hand-typed offer has no agent draft to distrust — it
  // confirms itself on creation (user ruling, 2026-08-15, same as the
  // migration 239 backfill for pre-existing rows). Editing an offer that
  // already exists — confirmed or an untouched agent draft — never changes
  // confirmed_at here; only the explicit confirm action does.
  const existing = await ctx.db.query<{ offer_key: string }>(
    `SELECT offer_key FROM gt_offers WHERE tenant_id = $tenant_id AND offer_key = $offer_key`,
    { tenant_id: ctx.tenant_id, offer_key: key },
  );
  const isNew = existing.rows.length === 0;

  await ctx.db.transaction(async (tx) => {
    await tx.query(
      `INSERT INTO gt_offers
         (tenant_id, offer_key, name, one_line, who_for, problem,
          what_we_do, signals, disqualifiers, price_band, proof,
          commitment, created_by, source, confirmed_at)
       VALUES
         ($tenant_id, $offer_key, $name, $one_line, $who_for, $problem,
          $what_we_do::text[], $signals::text[], $disqualifiers::text[],
          $price_band, $proof, COALESCE($commitment::text, 'project'), $user_id,
          'human', now())
       ON CONFLICT (tenant_id, offer_key) DO UPDATE SET
          commitment    = COALESCE($commitment::text, gt_offers.commitment),
          name          = EXCLUDED.name,
          one_line      = EXCLUDED.one_line,
          who_for       = EXCLUDED.who_for,
          problem       = EXCLUDED.problem,
          what_we_do    = EXCLUDED.what_we_do,
          signals       = EXCLUDED.signals,
          disqualifiers = EXCLUDED.disqualifiers,
          price_band    = EXCLUDED.price_band,
          proof         = EXCLUDED.proof,
          updated_at    = now()`,
      {
        tenant_id: ctx.tenant_id, offer_key: key, name,
        one_line: String(params.one_line ?? '').trim(),
        who_for: String(params.who_for ?? '').trim(),
        problem: String(params.problem ?? '').trim(),
        what_we_do: cleanList(params.what_we_do),
        signals: cleanList(params.signals),
        disqualifiers: cleanList(params.disqualifiers),
        price_band: String(params.price_band ?? '').trim() || null,
        proof: String(params.proof ?? '').trim() || null,
        commitment,
        user_id: ctx.user_id,
      },
    );
  });

  // Only a newly-created offer changes the confirmed count this function can
  // affect — recompute here since skill functions have no other hook for it
  // (recomputeProfileScore needs the raw pool, which SkillContext does not
  // carry; getPool() is the same singleton every request already uses).
  if (isNew) {
    await recomputeProfileScore(getPool(), ctx.tenant_id);
  }

  return { offer_key: key, recipe: 'offer-card' as const };
}
