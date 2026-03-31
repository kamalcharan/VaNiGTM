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
}

export function VdfWizard({ steps, currentIndex, completedSteps, onStepClick }: VdfWizardProps) {
  return (
    <div className={s.wizard}>
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
                title={step.label}
              >
                {isDone ? (
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="2.5 6 5 8.5 9.5 3.5" />
                  </svg>
                ) : (
                  <span className={s.dotNum}>{i + 1}</span>
                )}
                {!step.mandatory && !isDone && (
                  <span className={s.skipDot} />
                )}
              </button>

              {/* Label */}
              <span className={`${s.label} ${isCurrent ? s.labelCurrent : ''} ${isDone ? s.labelDone : ''}`}>
                {step.label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
