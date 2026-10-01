'use client';

/**
 * PathwayShell — the frame every pathway wears.
 *
 * A pathway is work with an order: numbered steps, visible progress, a record
 * of what each step produced, and a next thing to do. That is what separates a
 * pathway from a list of destinations, and it lives here so every pathway gets
 * it for free.
 *
 * ── PROVENANCE ────────────────────────────────────────────────────────────
 *
 * Reimplemented to the same contract as VaNiGTM's
 * `frontend/src/components/vdf/pathway-shell/VdfPathwayShell.tsx`: same props,
 * same three-column arrangement, same `:has()` grid trick. Not a copy — VDF is
 * a different design system, so the CSS is rewritten on the VaNi token layer.
 * Keeping the PROP CONTRACT identical is deliberate: a step ported from there
 * should drop in, and a diverged signature turns that into a debugging session.
 *
 * ── WHY THE FINDINGS ASIDE IS RENDERED HERE ───────────────────────────────
 *
 * The grid widens from `280px 1fr` to `240px 1fr 240px` only when a findings
 * rail actually exists, via `.layout:has(.findings)`. `:has()` matches on this
 * module's own hashed class name, so the wrapper has to come from this file —
 * it cannot be passed in already wrapped. That is the reason for the shape of
 * this component, not an accident of it.
 */

import type { ReactNode } from 'react';
import s from './PathwayShell.module.css';

export interface PathwayStep {
  id: string;
  label: string;
  /** Present but not yet reachable. Rendered, never hidden — a locked step
   *  still tells the user what is coming, which a hidden one cannot. */
  locked?: boolean;
  lockedTag?: string;
}

export interface PathwayShellProps {
  /** Eyebrow above the name — "VaNi · Onboarding". */
  eyebrow: string;
  /** The pathway itself — "Set up VaNi". */
  name: string;
  /** Optional control beside the name — a back link, a reset. Small things. */
  headerAction?: ReactNode;
  /**
   * Far-right controls, after the stepper. An ADDITIVE extension to VaNiGTM's
   * contract, not a change to it: a step passing only `headerAction` still
   * behaves identically. It exists because session controls (who am I, sign
   * out) read as wedged between the name and the stepper when forced through
   * `headerAction`, which is meant for something small next to the title.
   */
  trailing?: ReactNode;

  steps: PathwayStep[];
  currentIndex: number;
  /** Step ids already completed. */
  completedSteps?: Set<string>;
  onStepClick?: (index: number) => void;

  /** Left rail: what the completed steps produced. */
  artefacts?: ReactNode;
  /** Right rail: what the pathway noticed along the way. Optional by design. */
  findings?: ReactNode;

  /** The pathway is finished; the shell stops treating the last step as live. */
  done?: boolean;

  /** The current step's content. */
  children: ReactNode;
}

export function PathwayShell({
  eyebrow,
  name,
  headerAction,
  trailing,
  steps,
  currentIndex,
  completedSteps,
  onStepClick,
  artefacts,
  findings,
  done = false,
  children,
}: PathwayShellProps) {
  const completed =
    completedSteps ?? (done ? new Set(steps.map((st) => st.id)) : new Set<string>());

  return (
    <div className={s.page}>
      <header className={s.top}>
        <div className={s.pathway}>
          <span className={s.eyebrow}>{eyebrow}</span>
          <span className={s.name}>{name}</span>
        </div>
        {headerAction}
        <div className={s.railWrap}>
          <Stepper
            steps={steps}
            currentIndex={currentIndex}
            completed={completed}
            onStepClick={onStepClick}
          />
        </div>
        {trailing && <div className={s.trailing}>{trailing}</div>}
      </header>

      <div className={s.layout}>
        {artefacts && <aside className={s.left}>{artefacts}</aside>}

        <main className={s.main}>{children}</main>

        {/* Rendered here, not passed in pre-wrapped — see the header comment. */}
        {findings && <aside className={s.findings}>{findings}</aside>}
      </div>
    </div>
  );
}

/**
 * The stepper. Its own component so the shell reads as a layout, but not its
 * own file — nothing else needs it, and a stepper with one consumer that lives
 * apart from its consumer is how two steppers eventually exist.
 */
function Stepper({
  steps,
  currentIndex,
  completed,
  onStepClick,
}: {
  steps: PathwayStep[];
  currentIndex: number;
  completed: Set<string>;
  onStepClick?: (index: number) => void;
}) {
  return (
    <ol className={s.stepper}>
      {steps.map((step, i) => {
        const isDone = completed.has(step.id);
        const isCurrent = i === currentIndex && !isDone;
        // Only a completed step is navigable. Jumping forward past a step the
        // pathway has not produced yet would show a card with nothing in it.
        const clickable = !!onStepClick && isDone && !step.locked;

        const cls = [
          s.step,
          isDone ? s.stepDone : '',
          isCurrent ? s.stepCurrent : '',
          step.locked ? s.stepLocked : '',
        ]
          .filter(Boolean)
          .join(' ');

        return (
          <li key={step.id} className={cls} aria-current={isCurrent ? 'step' : undefined}>
            <button
              type="button"
              className={s.stepBtn}
              onClick={clickable ? () => onStepClick(i) : undefined}
              disabled={!clickable}
              aria-label={
                step.locked
                  ? `${step.label} — locked`
                  : isDone
                    ? `${step.label} — done, reopen`
                    : step.label
              }
            >
              <span className={s.dot} aria-hidden="true">
                {isDone ? '✓' : step.locked ? '·' : i + 1}
              </span>
              <span className={s.stepLabel}>{step.label}</span>
              {step.locked && step.lockedTag && (
                <span className={s.lockedTag}>{step.lockedTag}</span>
              )}
            </button>
            {i < steps.length - 1 && <span className={s.connector} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}
