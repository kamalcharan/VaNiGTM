'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useShellConfig } from '@/lib/shell-config';
import { useToast } from '@/components/toast';
import { VdfWizard } from '@/components/vdf';
import OnboardUserProfile from '@/components/onboarding/OnboardUserProfile';
import OnboardBusiness from '@/components/onboarding/OnboardBusiness';
import OnboardTheme from '@/components/onboarding/OnboardTheme';
import OnboardInvite from '@/components/onboarding/OnboardInvite';
import OnboardPreferences from '@/components/onboarding/OnboardPreferences';
import OnboardImport from '@/components/onboarding/OnboardImport';
import s from './onboarding-page.module.css';

const STEP_COMPONENTS: Record<string, React.ComponentType<{ onComplete: () => void; onSkip?: () => void }>> = {
  OnboardUserProfile,
  OnboardBusiness,
  OnboardTheme,
  OnboardInvite,
  OnboardPreferences,
  OnboardImport,
};

export default function OnboardingPage() {
  const router = useRouter();
  const { onboarding, product } = useShellConfig();
  const { showToast } = useToast();
  const steps = onboarding.steps;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<string>>(new Set());

  const currentStep = steps[currentIndex];
  const StepComponent = STEP_COMPONENTS[currentStep.component];

  const handleComplete = useCallback(() => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      next.add(currentStep.id);
      return next;
    });

    if (currentIndex < steps.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      showToast({ message: 'Onboarding complete! Welcome to your dashboard.', type: 'success' });
      router.push('/dashboard');
    }
  }, [currentStep, currentIndex, steps.length, router, showToast]);

  const handleSkip = useCallback(() => {
    if (currentIndex < steps.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      showToast({ message: 'Onboarding complete!', type: 'success' });
      router.push('/dashboard');
    }
  }, [currentIndex, steps.length, router, showToast]);

  const handleStepClick = useCallback((index: number) => {
    setCurrentIndex(index);
  }, []);

  const wizardSteps = steps.map((step) => ({
    id: step.id,
    label: step.title,
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
