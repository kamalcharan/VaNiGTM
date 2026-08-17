import OnboardingRunner from '@/skills/onboarding/screens/OnboardingRunner';
import { PRODUCT_LANE_ID } from '@/skills/onboarding/lane';

export default function OnboardingPage() {
  return <OnboardingRunner laneId={PRODUCT_LANE_ID} done="/dashboard" />;
}
