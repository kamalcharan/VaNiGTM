'use client';

import s from './VdfWizard.module.css';

interface VdfWizardStep {
  id: string;
  label: string;
  mandatory?: boolean;
}

export interface VdfWizardProps {
  steps: VdfWizardStep[];
  currentIndex: number;
  completedSteps: Set<string>;
  onStepClick?: (index: number) => void;
  /**
   * `mission` — the agent-wizard top rail: numbered circles joined by a line,
   * each with its label inline, and the ACTIVE step raised into a pill with a
   * live dot. Completed steps stay numbered (no checkmark up top — the ✓ lives
   * in the mission-memory rail instead).
   *
   * The reference labels only the active step; the user asked for every label
   * to stay visible (2026-07-27), so emphasis carries the active state instead
   * of visibility.
   *
   * `default` — every step labelled underneath. Used by the other wizards.
   */
  variant?: 'default' | 'mission';
}

export function VdfWizard({
  steps,
  currentIndex,
  completedSteps,
  onStepClick,
  variant = 'default',
}: VdfWizardProps) {
  const mission = variant === 'mission';

  return (
    <div className={`${s.wizard} ${mission ? s.wizardMission : ''}`}>
      <div className={s.track}>
        {steps.map((step, i) => {
          const isDone = completedSteps.has(step.id);
          const isCurrent = i === currentIndex;
          const isClickable = onStepClick && (isDone || i <= currentIndex);

          return (
            <div key={step.id} className={s.stepWrap}>
              {/* Connecting line */}
              {i > 0 && (
                <div className={`${s.line} ${completedSteps.has(steps[i - 1].id) ? s.lineDone : ''}`} />
              )}

              {/* Dot */}
              <button
                className={`${s.dot} ${isDone ? s.done : ''} ${isCurrent ? s.current : ''}`}
                onClick={() => isClickable && onStepClick?.(i)}
                disabled={!isClickable}
                aria-label={`Step ${i + 1}: ${step.label}`}
                aria-current={isCurrent ? 'step' : undefined}
                title={step.label}
              >
                {isDone && !mission ? (
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="2.5 6 5 8.5 9.5 3.5" />
                  </svg>
                ) : (
                  <span className={s.dotNum}>{i + 1}</span>
                )}
                {mission && <span className={s.pillLabel}>{step.label}</span>}
                {!step.mandatory && !isDone && (
                  <span className={s.skipDot} />
                )}
              </button>

              {/* Label — mission variant carries it inside the active pill instead */}
              {!mission && (
                <span className={`${s.label} ${isCurrent ? s.labelCurrent : ''} ${isDone ? s.labelDone : ''}`}>
                  {step.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
