'use client';

/**
 * The engine. Give it a lane id; it runs the lane.
 *
 * It knows nothing about what is being onboarded. The product lane and Vara's
 * activation lane are the same code path — which is the test that "onboarding
 * is an agent" is real rather than a label on two hardcoded wizards.
 *
 * The server decides which step is next, always. The client renders what it is
 * told and re-reads after every completion. A local guess about ordering is a
 * bug that only shows up on reload, in front of someone else.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/auth-provider';
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';
import { getLane, type OnboardingStep } from '../lane';
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
}

export default function OnboardingRunner({ laneId, done }: Props) {
  const status = useOnboardingStatus(laneId);
  const { complete, isSaving } = useCompleteStep(laneId);
  const { logout, refresh, user, tenant } = useAuth();
  const toast = useToast();
  const router = useRouter();
  const lane = getLane(laneId);

  const [finished, setFinished] = useState(false);

  // Leaving is the only escape from a gated lane, so it must always work — a
  // wizard that can trap someone is worse than no wizard.
  async function signOut() {
    await logout();
    router.replace('/');
  }

  /**
   * Release the user into the console.
   *
   * The refresh is load-bearing. `needsOnboarding` comes from the tenant
   * snapshot taken at bootstrap — when this lane was still incomplete — so
   * navigating without re-reading /me sends the user to a gate that still
   * believes they are un-onboarded, and it bounces them right back here. That
   * was a real loop, caught in test; do not remove the await.
   */
  async function enterConsole() {
    await refresh();
    router.replace(done);
  }

  if (!lane) {
    return (
      <div className={s.card} role="alert">
        <div className={s.h}>Unknown lane</div>
        <p className={s.sub}>No lane is registered as &ldquo;{laneId}&rdquo;.</p>
      </div>
    );
  }

  return (
    <div className={s.screen}>
      <div className={s.glow} />

      <header className={s.head}>
        <svg className={s.mark} viewBox="0 0 32 32" fill="none" aria-hidden="true">
          <circle cx="16" cy="16" r="3.2" fill="var(--gold)" />
          <circle cx="16" cy="5.5" r="2.4" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
          <circle cx="25" cy="21.5" r="2.4" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
          <circle cx="7" cy="21.5" r="2.4" fill="none" stroke="var(--gold)" strokeWidth="1.5" />
          <circle cx="16" cy="16" r="12.5" stroke="var(--gold)" strokeWidth="1" strokeOpacity="0.22" />
        </svg>
        <span className={s.brand}>VaNi</span>
        <span className={s.headMeta}>{tenant?.name ?? user?.email ?? ''}</span>
        <button type="button" className={s.signOut} onClick={signOut}>Sign out</button>
      </header>

      <div className={s.body}>
        <DataBoundary
          query={status}
          label="your setup"
          skeleton={<SkeletonRows rows={4} lines={1} />}
        >
          {(data) => (
            <Lane
              data={data}
              lane={lane}
              finished={finished}
              isSaving={isSaving}
              onComplete={async (step, payload) => {
                const ok = await complete(step.step_id, payload);
                if (!ok) return;
                // Was this the last one? The server's answer arrives with the
                // refetch, but the toast should fire on the action, not after a
                // round trip the user did not ask to wait for.
                const remaining = data.steps.filter(
                  (x) => x.status !== 'completed' && x.step_id !== step.step_id,
                );
                if (remaining.length === 0) {
                  setFinished(true);
                  toast.success('Setup complete.', 'VaNi has what it needs to start.');
                }
              }}
              onEnter={enterConsole}
            />
          )}
        </DataBoundary>
      </div>
    </div>
  );
}

function Lane({
  data,
  lane,
  finished,
  isSaving,
  onComplete,
  onEnter,
}: {
  data: OnboardingStatus;
  lane: NonNullable<ReturnType<typeof getLane>>;
  finished: boolean;
  isSaving: boolean;
  onComplete: (step: OnboardingStep, payload: Record<string, unknown>) => Promise<void>;
  onEnter: () => void | Promise<void>;
}) {
  const doneCount = data.steps.filter((x) => x.status === 'completed').length;
  const total = data.steps.length;

  // The server names the next step; we look up the screen the client declared
  // for it. A step the server requires but the client has no screen for is a
  // deployment skew, and is surfaced rather than skipped.
  const currentId = data.next_incomplete_step;
  const current = useMemo(
    () => lane.steps.find((x) => x.step_id === currentId),
    [lane.steps, currentId],
  );
  const currentStatus = data.steps.find((x) => x.step_id === currentId);

  // Complete and the user is still here — go on in. Effect, not render, so the
  // navigation is not a side effect of drawing.
  useEffect(() => {
    if (data.complete && finished) {
      const t = setTimeout(() => void onEnter(), 900);
      return () => clearTimeout(t);
    }
  }, [data.complete, finished, onEnter]);

  return (
    <>
      <aside className={s.rail}>
        <div className={s.railTitle}>{lane.title}</div>
        <p className={s.railIntro}>{lane.intro}</p>

        <div className={s.progressText}>{doneCount} of {total} done</div>
        <div className={s.bar}>
          <div className={s.barFill} style={{ width: `${total ? (doneCount / total) * 100 : 0}%` }} />
        </div>

        <ol className={s.steps}>
          {data.steps.map((step, i) => {
            const isDone = step.status === 'completed';
            const isCurrent = step.step_id === currentId;
            return (
              <li
                key={step.step_id}
                className={`${s.step} ${isCurrent ? s.stepCurrent : ''} ${isDone ? s.stepDone : ''}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span className={`${s.dot} ${isDone ? s.dotDone : ''} ${isCurrent ? s.dotCurrent : ''}`}>
                  {isDone ? '✓' : i + 1}
                </span>
                {/* The spec story (VN-10 …) stays in the catalog for
                    traceability and out of the rail. A tenant admin setting up
                    their org does not need our backlog ids. */}
                <span className={s.stepLabel}>{step.title}</span>
              </li>
            );
          })}
        </ol>
      </aside>

      <main className={s.card}>
        {data.complete ? (
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
        ) : !current ? (
          <div role="alert">
            <div className={s.eyebrow}>// STEP UNAVAILABLE</div>
            <div className={s.h}>{currentStatus?.title ?? currentId}</div>
            <p className={s.sub}>
              The server requires this step but this build has no screen for it —
              the console and the API are on different versions. Reload; if it
              persists, this needs a deploy, not a retry.
            </p>
          </div>
        ) : (
          <>
            <div className={s.eyebrow}>
              // STEP {doneCount + 1} OF {total}
            </div>
            <h1 className={s.h}>{current.title}</h1>
            <p className={s.sub}>{current.summary}</p>
            <current.Screen
              initial={{}}
              isSaving={isSaving}
              save={async (payload) => {
                await onComplete(current, payload);
                return true;
              }}
            />
          </>
        )}
      </main>
    </>
  );
}
