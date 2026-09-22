'use client';
/**
 * G2 — Put them in motion, on PathwayShell.
 *
 *   segment → story → cadence → send (locked)
 *
 * The last step is rendered, never hidden: a locked step with its reason on
 * it is a promise the tenant can plan around; a hidden one is a surprise
 * later (rule 12). Everything before it is real and kept.
 */
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArtefactRows, ArtefactSection, PathwayShell, type PathwayStep } from '@/platform/pathway';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import a from '@/skills/gtm-audience/audience.module.css';
import { useMotionState, useMotionWrites, useSegments, useStories } from '../useMotion';
import type { MotionState, MotionStep } from '../mock';
import { SegmentStep } from './SegmentStep';
import { StoryStep } from './StoryStep';
import { CadenceStep } from './CadenceStep';
import { SendStep } from './SendStep';

const STEPS: (PathwayStep & { id: MotionStep })[] = [
  { id: 'segment', label: 'Segment' },
  { id: 'story', label: 'Story' },
  { id: 'cadence', label: 'Cadence' },
  { id: 'send', label: 'Send', locked: true, lockedTag: 'no consent model yet' },
];

export default function MotionPathway() {
  const state = useMotionState();
  const segs = useSegments();
  const stories = useStories();
  const w = useMotionWrites();
  const router = useRouter();
  const params = useSearchParams();
  const wanted = params?.get('step') as MotionStep | null;

  return (
    <DataBoundary query={state} label="the pathway" skeleton={<SkeletonRows rows={4} />}>
      {(st: MotionState) => {
        if (st.nobody) {
          return (
            <div className={a.card} style={{ maxWidth: 720 }}>
              <div className={a.eyebrow}>// PUT THEM IN MOTION</div>
              <h1 className={a.h}>Nobody to put in motion yet</h1>
              <p className={a.sub}>Motion starts from the people you kept in Build the audience — a segment, a story per segment, the cadence window. There is nobody there yet.</p>
              <div className={a.actions}><Link href="/agents/gtm/audience" className={a.primary} style={{ textDecoration: 'none' }}>Build the audience →</Link></div>
            </div>
          );
        }
        const done = new Set<string>(st.done);
        const reopened = wanted && done.has(wanted) ? wanted : null;
        const active: MotionStep = reopened ?? st.step;
        const idx = STEPS.findIndex((x) => x.id === active);
        const segList = segs.data?.data?.segments ?? [];
        const approved = (stories.data?.data?.stories ?? []).filter((s) => s.status === 'approved');
        const artefacts = [
          done.has('segment') && <ArtefactSection key="seg" label="Segments" count={segList.length} onReopen={() => router.push('?step=segment')} reopenLabel="Reopen"><ArtefactRows rows={segList.map((s) => ({ label: s.name.split(' · ')[0], meta: String(s.people.length) }))} /></ArtefactSection>,
          done.has('story') && <ArtefactSection key="story" label="Approved stories" count={approved.length} onReopen={() => router.push('?step=story')} reopenLabel="Reopen"><ArtefactRows rows={approved.map((s) => ({ label: s.title, meta: s.scope }))} /></ArtefactSection>,
          done.has('cadence') && <ArtefactSection key="cad" label="Reserved"><ArtefactRows rows={[{ label: 'slots held for this plan', meta: 'see Cadence' }]} /></ArtefactSection>,
        ].filter(Boolean);
        return (
          <PathwayShell
            eyebrow="GTM · Put them in motion"
            name="A story for each of them"
            headerAction={<button type="button" className={a.quiet} onClick={() => void w.restart()} disabled={w.busy}>Start over</button>}
            steps={STEPS}
            currentIndex={idx}
            completedSteps={done}
            onStepClick={(i) => router.push(`?step=${STEPS[i].id}`)}
            artefacts={artefacts.length ? <>{artefacts}</> : undefined}
          >
            {active === 'segment' ? <SegmentStep /> : active === 'story' ? <StoryStep /> : active === 'cadence' ? <CadenceStep /> : <SendStep />}
          </PathwayShell>
        );
      }}
    </DataBoundary>
  );
}
