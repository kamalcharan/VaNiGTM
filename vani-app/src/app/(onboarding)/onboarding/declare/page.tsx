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
 * The wizard's finish line sends a tenant here whenever any lane step is
 * still pending (it completes none itself — see finishOnboarding). With
 * ?step=<id> a finished step reopens, which is how a detail such as the
 * industry is changed after onboarding (DeclareScreen).
 */

import { Suspense } from 'react';
import DeclareScreen from '@/skills/onboarding/screens/DeclareScreen';

export default function DeclarePage() {
  return <Suspense fallback={null}><DeclareScreen /></Suspense>;
}
