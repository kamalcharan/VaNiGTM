'use client';

/**
 * VdfPathwayShell — the frame every pathway wears.
 *
 * A pathway is work with an order: numbered steps, visible progress, a record
 * of what each step produced, and a next thing to do. That is the difference
 * between a pathway and a list of destinations, and this component is where it
 * lives so every pathway gets it for free.
 *
 * ── PROVENANCE ─────────────────────────────────────────────────────────────
 *
 * This is not a new design. The Mission Wizard already contained exactly this
 * arrangement — stepper across the top, artefacts accumulating down the left,
 * findings on the right — and had done since onboarding was built. Extracting
 * it makes the wizard the first CONSUMER of the pattern rather than its owner,
 * so `/gtm/audience` and everything after it inherit the behaviour instead of
 * reimplementing it.
 *
 * The wizard must look and behave exactly as it did. That is the test for this
 * refactor: not "does the shell work" but "is the wizard unchanged".
 *
 * ── THE THREE-COLUMN TRICK, PRESERVED ──────────────────────────────────────
 *
 * The grid widens from `280px 1fr` to `240px 1fr 240px` only when a findings
 * rail is actually present, via `.layout:has(.findings)`. That is why
 * `findings` is optional and why the aside is rendered by the shell rather
 * than passed through as an already-wrapped node — `:has()` matches on the
 * shell's own hashed class name, so the wrapper has to come from this module.
 */

import { type ReactNode } from 'react';
import { VdfWizard } from '../wizard/VdfWizard';
import s from './VdfPathwayShell.module.css';

export interface VdfPathwayStep {
  id: string;
  label: string;
  /** Present but not yet reachable. Rendered, not hidden. */
  locked?: boolean;
  lockedTag?: string;
}

export interface VdfPathwayShellProps {
  /** Small eyebrow above the name — "Mission · Onboarding", "GTM · Aria". */
  eyebrow: string;
  /** The pathway itself — "Set up your GTM engine", "Build the audience". */
  name: string;
  /** Optional control beside the name (a back link, a reset). */
  headerAction?: ReactNode;

  steps: VdfPathwayStep[];
  currentIndex: number;
  /** Step ids the user has completed. */
  completedSteps?: Set<string>;
  onStepClick?: (index: number) => void;

  /** Left rail: what the completed steps produced. */
  artefacts?: ReactNode;
  /** Right rail: what the pathway noticed along the way. Optional by design. */
  findings?: ReactNode;

  /**
   * The pathway is finished. Consumers use this to swap the stage for a
   * summary; the shell only stops treating the last step as "in progress".
   */
  done?: boolean;

  /** The current step's content. */
  children: ReactNode;
}

export function VdfPathwayShell({
  eyebrow,
  name,
  headerAction,
  steps,
  currentIndex,
  completedSteps,
  onStepClick,
  artefacts,
  findings,
  done = false,
  children,
}: VdfPathwayShellProps) {
  const completed = completedSteps
    ?? (done ? new Set(steps.map((st) => st.id)) : new Set<string>());

  return (
    <div className={s.page}>
      <header className={s.top}>
        <div className={s.mission}>
          <span className={s.missionLabel}>{eyebrow}</span>
          <span className={s.missionName}>{name}</span>
          {headerAction}
        </div>
        <div className={s.railWrap}>
          <VdfWizard
            variant="mission"
            steps={steps.map(({ id, label }) => ({ id, label, mandatory: true }))}
            currentIndex={currentIndex}
            completedSteps={completed}
            onStepClick={onStepClick}
          />
        </div>
      </header>

      <div className={s.layout}>
        {artefacts && <aside className={s.left}>{artefacts}</aside>}

        <main className={s.main}>{children}</main>

        {/* Rendered here, not passed in pre-wrapped: the grid widens via
            `.layout:has(.findings)`, which can only match this module's own
            hashed class. */}
        {findings && <aside className={s.findings}>{findings}</aside>}
      </div>
    </div>
  );
}
