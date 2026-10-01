/**
 * Onboarding IS the mission wizard.
 *
 * The wizard is step 1 of the Smart Profile — company research, market
 * vocabulary, competitors, ideal customer, brand — and it is what actually
 * builds a profile of the business. `user_profile` / `business_profile` capture
 * name, mobile, designation and industry: registration detail, not a profile.
 *
 * Ported from VaNiGTM `frontend/src/app/(app)/brain/mission/page.tsx`, which
 * this replaces rather than reinterprets. Like it, the wizard marks every
 * pending `vn_tenant_onboarding` row complete at the finish line
 * (`metadata: { via: 'mission-wizard' }`), so the gate opens on the same signal
 * for both consoles.
 *
 * The declaration steps — domain, people, model — still run through
 * OnboardingRunner and are currently `enabled: false` in the backend catalog,
 * pending confirmation that the `vani_` spine is applied.
 */

import MissionWizard from '@/skills/onboarding/screens/MissionWizard';

export default function OnboardingPage() {
  return <MissionWizard />;
}
