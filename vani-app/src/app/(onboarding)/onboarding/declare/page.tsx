/**
 * The declaration steps — the product lane run by the engine.
 *
 * `/onboarding` is the mission wizard (Smart Profile steps 1–5: research,
 * vocabulary, competitors, ICP, brand). THIS page runs the lane catalog's
 * declaration steps — registration detail plus the vani_ spine declarations
 * (domain today; people and model when they turn on) — through
 * OnboardingRunner, which reconciles against the server catalog and renders
 * whichever steps are still pending.
 *
 * RequireSession sends a tenant here when the wizard's steps are done but a
 * declaration step is not; the wizard's own finish line routes through the
 * gate, so it lands here automatically when a declaration is still owed.
 */

import OnboardingRunner from '@/skills/onboarding/screens/OnboardingRunner';
import { PRODUCT_LANE_ID } from '@/skills/onboarding/lane';

export default function DeclarePage() {
  return <OnboardingRunner laneId={PRODUCT_LANE_ID} done="/dashboard" />;
}
