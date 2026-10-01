'use client';

/**
 * /onboarding/declare — the lane's own steps, with two optional query params:
 *
 *   ?step=<step_id>   open that step even if it is done (changing a detail
 *                     later — Vara's "Set your industry" uses business_profile)
 *   ?next=/some/path  where to go when the step is saved, instead of /dashboard
 *
 * Both are checked: an unknown step is ignored rather than opening the
 * runner's "step unavailable" card, and `next` must be a path on this site so
 * the link cannot send anyone elsewhere.
 */

import { useSearchParams } from 'next/navigation';
import OnboardingRunner from './OnboardingRunner';
import { getLane, PRODUCT_LANE_ID } from '../lane';
import '../lanes';

export default function DeclareScreen() {
  const params = useSearchParams();
  const lane = getLane(PRODUCT_LANE_ID);
  const step = params.get('step');
  const reopen = step && lane?.steps.some((x) => x.step_id === step) ? step : null;
  const next = params.get('next');
  const done = next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard';
  return <OnboardingRunner laneId={PRODUCT_LANE_ID} done={done} reopen={reopen} />;
}
