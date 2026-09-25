'use client';
/**
 * G1 — Build the audience, on PathwayShell (rule 9c: one stepper).
 *
 *   hot list → find → qualify → people
 *
 * The pathway's position is READ from `gtm.audience_state` (still preview:
 * nothing on the API holds it); the tenant moves it with `gtm.advance`. Data
 * never advances it on its own — a fed pool must not skip anyone past the hot
 * list. Everything in the artefact rail is REAL: prospects, briefs, the
 * audience count. A finished step collapses into the rail and can be reopened
 * from the stepper; `?step=` deep-links.
 */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArtefactRows, ArtefactSection, PathwayShell, type PathwayStep } from '@/platform/pathway';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useSkillQuery } from '@/lib/useSkill';
import { useAudienceState, useAudienceWrites, useBriefs, useHotList } from '../useAudience';
import type { AudienceState, AudienceStep } from '../mock';
import { BringStep } from './BringStep';
import { FindStep } from './FindStep';
import { QualifyStep } from './QualifyStep';
import { PeopleStep } from './PeopleStep';
import s from '../audience.module.css';

const STEPS: (PathwayStep & { id: AudienceStep })[] = [
  { id: 'bring', label: 'Hot list' },
  { id: 'find', label: 'Find' },
  { id: 'qualify', label: 'Qualify' },
  { id: 'people', label: 'People' },
];

export default function AudiencePathway() {
  const state = useAudienceState();
  const hot = useHotList();
  const briefs = useBriefs();
  const audience = useSkillQuery<{ total: number }>('contact-skill', 'get_contacts', { limit: 1 });
  const w = useAudienceWrites();
  const router = useRouter();
  const params = useSearchParams();
  const wanted = params?.get('step') as AudienceStep | null;

  return (
    <DataBoundary query={state} label="the pathway" skeleton={<SkeletonRows rows={4} />}>
      {(st: AudienceState) => {
        const done = new Set<string>(st.done);
        const reopened = wanted && done.has(wanted) ? wanted : null;
        const active: AudienceStep = reopened ?? st.step;
        const idx = STEPS.findIndex((x) => x.id === active);

        const rows = hot.data?.data?.rows ?? [];
        const all = briefs.data?.data?.briefs ?? [];
        const worth = all.filter((b) => b.status === 'approved');
        const people = audience.data?.data?.total ?? 0;
        const artefacts = [
          done.has('bring') && rows.length > 0 && (
            <ArtefactSection key="bring" label="Hot list" count={rows.length} onReopen={() => router.push('?step=bring')} reopenLabel="Reopen">
              <ArtefactRows rows={[{ label: 'from the pool', meta: String(rows.filter((r) => r.source === 'pool').length) }, { label: 'from your list', meta: String(rows.filter((r) => r.source === 'mine' || r.also_mine).length) }]} />
            </ArtefactSection>),
          done.has('find') && all.length > 0 && (
            <ArtefactSection key="find" label="Researched" count={all.length} onReopen={() => router.push('?step=find')} reopenLabel="Reopen">
              <ArtefactRows rows={all.slice(0, 8).map((b) => ({ label: b.name, meta: b.status === 'unreadable' || b.status === 'extract_failed' ? 'failed' : undefined }))} />
            </ArtefactSection>),
          done.has('qualify') && (
            <ArtefactSection key="qualify" label="Worth a message" count={worth.length} onReopen={() => router.push('?step=qualify')} reopenLabel="Reopen">
              <ArtefactRows rows={worth.map((b) => { const best = Object.values(b.fit ?? {}).map((f) => f.score); return { label: b.name, meta: best.length ? `${Math.round(Math.max(...best) * 100)}%` : undefined }; })} />
            </ArtefactSection>),
          st.finished && (
            <ArtefactSection key="people" label="Your audience" count={people}>
              <ArtefactRows rows={[{ label: 'under People', meta: String(people) }]} />
            </ArtefactSection>),
        ].filter(Boolean);

        // Context rides in the left rail rather than a third column: inside
        // the workspace shell a findings rail leaves the step itself ~400px,
        // and a brief with three evidence lines needs more than that.
        const pool = hot.data?.data?.pool_state;
        artefacts.unshift(
          <ArtefactSection key="ctx" label="Context">
            <div className={s.finding}><b>Global data</b>{pool === 'fed' ? 'Pool fed for your market.' : pool === 'unfed' ? 'Pool never fed for your market — upload is the road that works.' : '…'}</div>
            <div className={s.finding}><b>Companies</b>Every row, imported or researched, is under <Link href="/agents/gtm/companies">Companies</Link>.</div>
            <div className={s.finding}><b>Never the pool</b>What research learns stays in your workspace. Rule 13.</div>
          </ArtefactSection>,
        );

        return (
          <PathwayShell
            eyebrow="GTM · Build the audience"
            name="A list worth a message"
            headerAction={<button type="button" className={s.quiet} onClick={() => void w.restart()} disabled={w.busy}>Start over</button>}
            steps={STEPS}
            currentIndex={idx}
            completedSteps={done}
            onStepClick={(i) => router.push(`?step=${STEPS[i].id}`)}
            artefacts={<>{artefacts}</>}
            done={st.finished && !reopened}
          >
            {st.finished && !reopened ? (
              <div className={s.done}>
                <div className={s.eyebrow} style={{ color: 'var(--teal-light)' }}>// AUDIENCE BUILT</div>
                <h1 className={s.h}>{people} {people === 1 ? 'person' : 'people'} at {worth.length} {worth.length === 1 ? 'company' : 'companies'} are waiting for a story</h1>
                <p className={s.sub}>Every screen opened on something GTM had already done and asked for one decision. The offers were never typed here; the profile was never re-asked; every row said where it came from.</p>
                <div className={s.metrics}>
                  <div className={s.metric}><div className={s.mK}>Proposed → worth it</div><div className={s.mV}>{rows.length} → {worth.length}</div></div>
                  <div className={s.metric}><div className={s.mK}>People</div><div className={s.mV}>{people}</div></div>
                  <div className={s.metric}><div className={s.mK}>Forms filled</div><div className={s.mV}>0</div></div>
                </div>
                <div className={s.actions}>
                  <Link href="/agents/gtm/people" className={s.primary} style={{ textDecoration: 'none' }}>See your audience →</Link>
                  <Link href="/agents/gtm/motion" className={s.quiet} style={{ textDecoration: 'none' }}>Put them in motion</Link>
                </div>
              </div>
            ) : active === 'bring' ? <BringStep /> : active === 'find' ? <FindStep /> : active === 'qualify' ? <QualifyStep /> : <PeopleStep />}
          </PathwayShell>
        );
      }}
    </DataBoundary>
  );
}
