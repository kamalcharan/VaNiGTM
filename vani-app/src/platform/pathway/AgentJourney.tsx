'use client';
/**
 * AgentJourney — where a tenant is with an agent, rendered from the agent's
 * `journey` declaration (registry.ts) and the progress its skill reports.
 *
 * Two shapes, one source:
 *   full  — the agent landing: done steps collapsed, the current one open
 *           with its one action, later steps visible; locked steps show why.
 *   card  — the dashboard: name, pips, one line of state, the next step.
 *
 * Read-only on purpose. PathwayShell is the frame for WORKING a pathway; this
 * is the frame for SEEING where you are. Neither hides a step — a step you can
 * see is a promise, a step you cannot is a surprise later.
 */
import Link from 'next/link';
import type { JourneyDecl, JourneyProgress, JourneyStep } from '@/platform/registry';
import { useSkillQuery } from '@/lib/useSkill';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import s from './AgentJourney.module.css';

type State = 'done' | 'current' | 'later' | 'locked';

export function resolveJourney(decl: JourneyDecl, p: JourneyProgress) {
  const done = new Set(p.done);
  const firstOpen = decl.steps.find((st) => !done.has(st.id) && !st.locked)?.id ?? null;
  const current = p.current && !done.has(p.current) ? p.current : firstOpen;
  const states = decl.steps.map<[JourneyStep, State]>((st) => [
    st,
    done.has(st.id) ? 'done' : st.locked ? 'locked' : st.id === current ? 'current' : 'later',
  ]);
  const currentStep = decl.steps.find((st) => st.id === current) ?? null;
  return { states, currentStep, doneCount: decl.steps.filter((st) => done.has(st.id)).length };
}

export function AgentJourney({
  decl,
  variant = 'full',
  name,
}: {
  decl: JourneyDecl;
  variant?: 'full' | 'card';
  /** Card only: the agent's name. */
  name?: string;
}) {
  const q = useSkillQuery<JourneyProgress>(decl.skill, decl.fn);
  return (
    <DataBoundary query={q} label="journey" skeleton={<SkeletonRows rows={variant === 'card' ? 2 : 4} />}>
      {(p: JourneyProgress) => {
        const r = resolveJourney(decl, p);
        if (variant === 'card') {
          return (
            <div className={s.card}>
              <div className={s.cardHead}>
                <span className={s.cardName}>{name ?? decl.skill}</span>
                <span className={s.cardPos}>{r.doneCount} of {decl.steps.length}</span>
              </div>
              <div className={s.pips}>
                {r.states.map(([st, state]) => (
                  <span key={st.id} className={`${s.pip} ${state === 'done' ? s.pipDone : state === 'current' ? s.pipCurrent : ''}`} title={st.label} />
                ))}
              </div>
              {p.note && <div className={s.cardNote}>{p.note}</div>}
              {r.currentStep ? (
                <div className={s.cardNext}>Next: <Link href={r.currentStep.href}>{r.currentStep.label} →</Link></div>
              ) : (
                <div className={`${s.cardNext} ${s.cardLocked}`}>Every open step is done.</div>
              )}
            </div>
          );
        }
        return (
          <ol className={s.full}>
            {r.states.map(([st, state], i) => (
              <li key={st.id} className={`${s.step} ${s[state]}`} aria-current={state === 'current' ? 'step' : undefined}>
                <span className={s.dot} aria-hidden="true">{state === 'done' ? '✓' : state === 'locked' ? '·' : i + 1}</span>
                <div className={s.body}>
                  <div className={s.label}>{st.label}</div>
                  {state === 'current' && (
                    <div className={s.open}>
                      {st.summary && <p className={s.summary}>{st.summary}</p>}
                      <Link href={st.href} className={s.go}>{st.label} →</Link>
                    </div>
                  )}
                  {state === 'locked' && st.locked && (
                    <p className={s.reason}><b>Locked</b> · {st.locked}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        );
      }}
    </DataBoundary>
  );
}
