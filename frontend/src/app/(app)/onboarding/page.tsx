'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useShellConfig } from '@/lib/shell-config';
import { useToast } from '@/components/toast';
import { VdfWizard } from '@/components/vdf';
import { useCompleteOnboardingStep } from '@/hooks/useOnboarding';
import { ME_QUERY_KEY } from '@/hooks/useMe';
import OnboardUserProfile from '@/components/onboarding/OnboardUserProfile';
import OnboardBusiness from '@/components/onboarding/OnboardBusiness';
import OnboardPlatform from '@/components/onboarding/OnboardPlatform';
import OnboardTheme from '@/components/onboarding/OnboardTheme';
import OnboardInvite from '@/components/onboarding/OnboardInvite';
import OnboardPreferences from '@/components/onboarding/OnboardPreferences';
import s from './onboarding-page.module.css';

const STEP_COMPONENTS: Record<string, React.ComponentType<{ onComplete: () => void; onSkip?: () => void; onBack?: () => void }>> = {
  OnboardUserProfile,
  OnboardBusiness,
  OnboardPlatform,
  OnboardTheme,
  OnboardInvite,
  OnboardPreferences,
};

export default function OnboardingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { onboarding, product } = useShellConfig();
  const { showToast } = useToast();
  const completeStep = useCompleteOnboardingStep();
  const steps = onboarding.steps;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const currentStep = steps[currentIndex];
  const StepComponent = STEP_COMPONENTS[currentStep.component];

  const handleComplete = useCallback(async () => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.add(currentStep.id);
      return next;
    });

    try {
      const result = await completeStep.mutateAsync({ step_id: currentStep.id });
      if (result.onboarding_complete) {
        // Wait for /me to reflect onboarding_complete: true before navigating
        // so the layout guard doesn't redirect back to /onboarding
        await queryClient.refetchQueries({ queryKey: ME_QUERY_KEY });
        showToast({ message: 'Welcome to VaNi-GTM!', type: 'success' });
        router.push('/dashboard');
      } else if (currentIndex < steps.length - 1) {
        setCurrentIndex(currentIndex + 1);
      }
    } catch {
      // API failed — still advance so the user isn't blocked
      if (currentIndex < steps.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        router.push('/dashboard');
      }
    }
  }, [currentStep, currentIndex, steps.length, router, showToast, completeStep, queryClient]);

  const handleSkip = useCallback(() => {
    if (currentIndex < steps.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // Optional last step skipped — mandatory steps already marked complete,
      // onboarding_complete is already true in the DB. Navigate directly.
      showToast({ message: 'Onboarding complete!', type: 'success' });
      router.push('/dashboard');
    }
  }, [currentIndex, steps.length, router, showToast]);

  const handleBack = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  }, [currentIndex]);

  const handleStepClick = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const wizardSteps = steps.map((step) => ({
    id: step.id,
    label: step.mandatory ? `${step.title} *` : step.title,
    mandatory: step.mandatory,
  }));

  return (
    <div className={s.page}>
      <header className={s.topbar}>
        <div className={s.brand}>
          <div className={s.brandIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>
          <span className={s.brandName}>{product.name}</span>
        </div>

        <div className={s.wizardWrap}>
          <VdfWizard
            steps={wizardSteps}
            currentIndex={currentIndex}
            completedSteps={completedSteps}
            onStepClick={handleStepClick}
          />
        </div>

        <div className={s.progress}>
          Step {currentIndex + 1} of {steps.length}
        </div>
      </header>

      <main className={s.main}>
        {StepComponent ? (
          <StepComponent
            onComplete={handleComplete}
            onSkip={!currentStep.mandatory ? handleSkip : undefined}
            onBack={currentIndex > 0 ? handleBack : undefined}
          />
        ) : (
          <div className={s.missing}>
            Component &ldquo;{currentStep.component}&rdquo; not found
          </div>
        )}
      </main>
    </div>
  );
}
