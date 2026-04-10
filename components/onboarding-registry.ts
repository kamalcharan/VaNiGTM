/**
 * KI-Prime Onboarding Component Registry
 *
 * Maps string component names (from OnboardingStepDef.component) to actual
 * React component references. The wizard page uses this map to resolve
 * which component to render for each step.
 *
 * Usage in the wizard:
 *   import { ONBOARDING_COMPONENTS } from '@product-config/onboarding-registry';
 *   const StepComponent = ONBOARDING_COMPONENTS[currentStep.component];
 *   if (StepComponent) return <StepComponent onComplete={handleContinue} onSkip={handleSkip} />;
 */
import type { ComponentType } from 'react';
import OnboardUserProfile from './onboarding/OnboardUserProfile';
import OnboardBusiness from './onboarding/OnboardBusiness';
import OnboardTheme from './onboarding/OnboardTheme';
import OnboardInvite from './onboarding/OnboardInvite';
import OnboardPreferences from './onboarding/OnboardPreferences';
import OnboardImport from './onboarding/OnboardImport';

export interface OnboardingStepProps {
  onComplete: (data?: Record<string, unknown>) => void;
  onSkip?: () => void;
}

export const ONBOARDING_COMPONENTS: Record<string, ComponentType<OnboardingStepProps>> = {
  OnboardUserProfile,
  OnboardBusiness,
  OnboardTheme,
  OnboardInvite,
  OnboardPreferences,
  OnboardImport,
};
