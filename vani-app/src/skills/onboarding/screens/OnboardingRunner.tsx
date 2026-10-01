'use client';

/**
 * The engine. Give it a lane id; it runs the lane.
 *
 * It knows nothing about what is being onboarded — the product lane and Vara's
 * future activation lane are the same code path. That is the test that
 * "onboarding is an agent" is real rather than a label on two hardcoded wizards.
 *
 * ── THE SHAPE, AND WHY ────────────────────────────────────────────────────
 *
 * A confirmed step REDUCES and moves into the left rail; the next step runs in
 * the centre. So the pathway accumulates a visible record of what it produced
 * instead of discarding each step the moment it passes. That arrangement is
 * PathwayShell's, ported from VaNiGTM's mission wizard, and the reduction shape
 * is each step's own editorial choice (see lane.ts `Artefact`).
 *
 * The server decides which step is next, always. The client renders what it is
 * told and re-reads after every completion — a local guess about ordering is a
 * bug that surfaces on reload, in front of someone else.
 *
 * ── ONE HONEST LIMITATION ─────────────────────────────────────────────────
 *
 * Artefact detail is session-scoped: it renders the values THIS session
 * confirmed. After a reload the rail shows a confirmed marker without the
 * detail, because `/onboarding/status` returns step state, not step contents.
 * That is deliberate over two alternatives — duplicating the values into the
 * step's JSONB (which the DB rules forbid) or fabricating them (which rule 9d
 * forbids). It resolves when the profile read lands with the research step.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';
import { ArtefactSection, PathwayShell, type PathwayStep } from '@/platform/pathway';
import { getLane, type OnboardingLane, type OnboardingStep } from '../lane';
// Load-bearing: registers every lane in the CLIENT bundle. The engine resolves
// lanes at render time, so a registration that only ran on the server would
// leave it with nothing — which is exactly what happened before this import.
import '../lanes';
import { useCompleteStep, useOnboardingStatus, type OnboardingStatus } from '../useOnboarding';
import s from '../onboarding.module.css';

interface Props {
  laneId: string;
  /** Where to go once the lane completes. */
  done: string;
  /**
   * A finished step to open straight away — how a tenant changes a detail
   * after onboarding (Vara's "Set your industry" sends ?step=business_profile).
   */
  reopen?: string | null;
}

export default function OnboardingRunner({ laneId, done, reopen = null }: Props) {
  const status = useOnboardingStatus(laneId);
  const { complete, isSaving } = useCompleteStep(laneId);
  const { logout, refresh, tenant } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const lane = getLane(laneId);

  /** Values confirmed this session, per step id. Feeds the rail and reopens. */
  const [confirmed, setConfirmed] = useState<Record<string, Record<string, unknown>>>({});
  /** Set when the user reopens a done step, overriding the server's "next". */
  const [reopened, setReopened] = useState<string | null>(reopen);
  const [finished, setFinished] = useState(false);

  // Leaving is the only escape from a gated lane, so it must always work — a
  // wizard that can trap someone is worse than no wizard.
  const signOut = useCallback(async () => {
    await logout();
    router.replace('/');
  }, [logout, router]);

  /**
   * Release the user into the console.
   *
   * The refresh is load-bearing. `needsOnboarding` comes from the tenant
   * snapshot taken at bootstrap — when this lane was still incomplete — so
   * navigating without re-reading /me sends the user to a gate that still
   * believes they are un-onboarded, and it bounces them right back here. That
   * was a real loop, caught in test; do not remove the await.
   */
  const enterConsole = useCallback(async () => {
    await refresh();
    router.replace(done);
  }, [refresh, router, done]);

  if (!lane) {
    return (
      <div className={s.card} role="alert">
        <div className={s.h}>Unknown lane</div>
        <p className={s.sub}>No lane is registered as &ldquo;{laneId}&rdquo;.</p>
      </div>
    );
  }

  return (
    <DataBoundary
      query={status}
      label="your setup"
      skeleton={
        <div style={{ padding: 24 }}>
          <SkeletonRows rows={4} lines={1} />
        </div>
      }
    >
      {(data) => (
        <Lane
          data={data}
          lane={lane}
          confirmed={confirmed}
          reopened={reopened}
          finished={finished}
          isSaving={isSaving}
          orgName={tenant?.name}
          onReopen={setReopened}
          onSignOut={signOut}
          onEnter={enterConsole}
          onComplete={async (step, payload) => {
            const ok = await complete(step.step_id, payload);
            if (!ok) return;
            setConfirmed((prev) => ({ ...prev, [step.step_id]: payload }));
            setReopened(null);
            // Was that the last one? The server's answer arrives with the
            // refetch, but the toast should fire on the action rather than
            // after a round trip nobody asked to wait for.
            const remaining = data.steps.filter(
              (x) => x.status !== 'completed' && x.step_id !== step.step_id,
            );
            if (remaining.length === 0) {
              setFinished(true);
              toast.success('Setup complete.', 'VaNi has what it needs to start.');
            }
          }}
        />
      )}
    </DataBoundary>
  );
}

function Lane({
  data,
  lane,
  confirmed,
  reopened,
  finished,
  isSaving,
  orgName,
  onReopen,
  onSignOut,
  onEnter,
  onComplete,
}: {
  data: OnboardingStatus;
  lane: OnboardingLane;
  confirmed: Record<string, Record<string, unknown>>;
  reopened: string | null;
  finished: boolean;
  isSaving: boolean;
  orgName?: string;
  onReopen: (stepId: string | null) => void;
  onSignOut: () => void;
  onEnter: () => void | Promise<void>;
  onComplete: (step: OnboardingStep, payload: Record<string, unknown>) => Promise<void>;
}) {
  const doneIds = useMemo(
    () => new Set(data.steps.filter((x) => x.status === 'completed').map((x) => x.step_id)),
    [data.steps],
  );

  // The stepper follows the SERVER's step list, not the client lane's, so a
  // step the API requires still appears even if this build has no screen for it.
  const steps: PathwayStep[] = data.steps.map((st) => ({
    id: st.step_id,
    label: lane.steps.find((x) => x.step_id === st.step_id)?.shortLabel ?? st.title,
  }));

  // A reopen overrides the server's "next"; otherwise the server decides.
  const activeId = reopened ?? data.next_incomplete_step;
  const activeIndex = Math.max(0, data.steps.findIndex((x) => x.step_id === activeId));
  const current = lane.steps.find((x) => x.step_id === activeId);
  const currentStatus = data.steps.find((x) => x.step_id === activeId);

  const isComplete = data.complete && !reopened;

  // Complete and the user is still here — go in. Effect, not render, so the
  // navigation is not a side effect of drawing.
  useEffect(() => {
    if (isComplete && finished) {
      const t = setTimeout(() => void onEnter(), 900);
      return () => clearTimeout(t);
    }
  }, [isComplete, finished, onEnter]);

  /**
   * The rail: every confirmed step, in lane order, reduced to its own shape.
   * Steps still to come are absent — the rail is a record, not a preview.
   */
  const artefacts = lane.steps
    .filter((st) => doneIds.has(st.step_id) && st.step_id !== reopened)
    .map((st) => {
      const values = confirmed[st.step_id];
      const reopen = isComplete ? undefined : () => onReopen(st.step_id);
      if (st.Artefact && values) {
        return <st.Artefact key={st.step_id} values={values} onReopen={reopen} />;
      }
      // No detail for this step in this session (a reload, or a step with no
      // declared reduction). Say that, rather than invent a card.
      return (
        <ArtefactSection key={st.step_id} label={st.shortLabel} onReopen={reopen}>
          <p className={s.railConfirmed}>Confirmed earlier.</p>
        </ArtefactSection>
      );
    });

  return (
    <PathwayShell
      eyebrow={`VaNi · ${lane.scope === 'product' ? 'Onboarding' : 'Activation'}`}
      name={lane.title}
      trailing={
        <div className={s.headActions}>
          {orgName && <span className={s.headOrg}>{orgName}</span>}
          <button type="button" className={s.signOut} onClick={onSignOut}>
            Sign out
          </button>
        </div>
      }
      steps={steps}
      currentIndex={activeIndex}
      completedSteps={doneIds}
      onStepClick={isComplete ? undefined : (i) => onReopen(data.steps[i].step_id)}
      artefacts={artefacts.length ? <>{artefacts}</> : undefined}
      done={isComplete}
    >
      {isComplete ? (
        <div className={s.card}>
          <div className={s.done}>
            <div className={s.doneMark} aria-hidden="true">✓</div>
            <div className={s.h}>You&rsquo;re set up.</div>
            <p className={s.sub}>
              Everything VaNi needs is declared. Agents you activate from here
              inherit it and will not ask again.
            </p>
            <button type="button" className={s.primary} onClick={() => void onEnter()}>
              Go to the console →
            </button>
          </div>
        </div>
      ) : !current ? (
        <div className={s.card} role="alert">
          <div className={s.eyebrow}>// STEP UNAVAILABLE</div>
          <div className={s.h}>{currentStatus?.title ?? activeId}</div>
          <p className={s.sub}>
            The server requires this step but this build has no screen for it —
            the console and the API are on different versions. Reload; if it
            persists, this needs a deploy, not a retry.
          </p>
        </div>
      ) : (
        <div className={s.card}>
          <div className={s.eyebrow}>
            // STEP {activeIndex + 1} OF {steps.length}
            {reopened && ' · REOPENED'}
          </div>
          <h1 className={s.h}>{current.title}</h1>
          <p className={s.sub}>{current.summary}</p>
          <current.Screen
            initial={confirmed[current.step_id] ?? {}}
            isSaving={isSaving}
            save={async (payload) => {
              await onComplete(current, payload);
              return true;
            }}
          />
        </div>
      )}
    </PathwayShell>
  );
}
