/**
 * research-skill: get_offers
 *
 * What this tenant sells, plus a per-offer readiness verdict and the exact
 * list of what is missing. The screen renders that list as a checklist —
 * the research batch will not start until it is empty, so the user needs to
 * see every gap at once rather than discovering them one at a time.
 */

import { SkillContext } from '../../../shared/types';
import { readOffers, catalogueProblems, offerIsReady, type Offer } from '../offer-catalogue';

interface GetOffersResult {
  offers: (Offer & { is_ready: boolean })[];
  problems: string[];
  ready: boolean;
  recipe: 'offer-list';
}

export async function get_offers(
  _params: Record<string, unknown>,
  ctx: SkillContext,
): Promise<GetOffersResult> {
  const offers = await readOffers(ctx.db, ctx.tenant_id);
  const problems = catalogueProblems(offers);
  return {
    offers: offers.map((o) => ({ ...o, is_ready: offerIsReady(o) })),
    problems,
    ready: offers.length > 0 && problems.length === 0,
    recipe: 'offer-list',
  };
}
