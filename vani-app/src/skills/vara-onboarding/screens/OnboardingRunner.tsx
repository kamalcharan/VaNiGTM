'use client';

/**
 * Vara onboarding — the two-step proposal loop.
 *
 * UX PREVIEW ONLY. No API calls. Reads mock-data.ts, marks completion in
 * sessionStorage so the landing page updates accordingly. When the design
 * is signed off, the same components stay; only the data source changes
 * (Smart Profile read + tiered resolver call replace the mocks).
 */

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { UX_DONE_KEY } from '../mock-data';
import u from '@/platform/shell/ui.module.css';
import s from '../vara-onboarding.module.css';
import { PickFamilyStep } from './PickFamilyStep';
import { ReviewPlaybookStep } from './ReviewPlaybookStep';

export default function VaraOnboardingRunner() {
  const router = useRouter();
  const [step, setStep] = useState<1 | 2>(1);
  const [family, setFamily] = useState<string | null>(null);

  function approve() {
    try {
      sessionStorage.setItem(UX_DONE_KEY, '1');
    } catch {
      /* private mode — the landing page just won't show the done state */
    }
    router.replace('/agents/vara');
  }

  return (
    <div className={s.wrap}>
      <div className={u.eyebrow}>// AGENTS · VARA · ONBOARDING</div>
      <h1 className={u.h1}>Take Vara live for your workspace</h1>

      <div className={s.uxBanner}>
        <b>Design preview.</b> This is the UX-only draft — actions save nothing to
        the backend yet. Waiting on your sign-off before wiring the real reads
        (Smart Profile, playbook registry) and writes (family profile, scoring
        config, subscription flip).
      </div>

      <div className={s.steps} aria-label="Onboarding steps">
        <span className={step === 1 ? `${s.stepDot} ${s.stepDotActive}` : `${s.stepDot} ${s.stepDotDone}`}>
          1 · Family
        </span>
        <span className={step === 2 ? `${s.stepDot} ${s.stepDotActive}` : s.stepDot}>
          2 · Review & approve
        </span>
      </div>

      {step === 1 && (
        <PickFamilyStep
          selected={family}
          onSelect={setFamily}
          onNext={() => setStep(2)}
        />
      )}
      {step === 2 && family && (
        <ReviewPlaybookStep
          family={family}
          onBack={() => setStep(1)}
          onApprove={approve}
        />
      )}
    </div>
  );
}
