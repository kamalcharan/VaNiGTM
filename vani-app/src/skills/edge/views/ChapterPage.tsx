'use client';
/**
 * A chapter, in the mission workspace — reference `render()`'s
 * `.workspace.mission-workspace` branch: the chapter sidebar, breadcrumb,
 * mobile nav, the chapter view and the contextual help line.
 *
 * Chapters that have not been ported yet render an honest not-yet card in
 * Edge's own markup (vani-app CLAUDE.md §1: "not loaded" and "not built" must
 * never look like content). They leave `NOT_YET` as they land.
 */
import { useEffect } from 'react';
import { useMission } from '../mission/MissionProvider';
import { processes, slugOfStage } from '../mission/domain';
import { Btn, Intro } from '../ui';
import { ContextView } from './ContextView';
import { PeopleView } from './PeopleView';
import { ScopeView } from './ScopeView';
import { DiscoveryView } from './DiscoveryView';
import { IncidentView } from './IncidentView';
import { StoryThread } from './StoryThread';
import { BoardView } from './BoardView';
import { RulesView } from './RulesView';
import { EvidenceView } from './EvidenceView';
import { ExplorerView } from './ExplorerView';
import { FindingsView } from './FindingsView';
import { ReadinessView } from './ReadinessView';
import { ComparisonView, HypothesesView, ActionsView } from './FailureViews';
import { ValueView } from './ValueView';
import { StrategyView } from './StrategyView';
import { VerificationView, FailureReportView } from './FailureEnd';

const VIEWS: Record<number, React.ComponentType> = {
  0: ContextView, 1: PeopleView, 2: ScopeView, 3: DiscoveryView, 4: BoardView, 5: RulesView, 6: EvidenceView,
  7: ExplorerView, 8: FindingsView, 9: ReadinessView, 10: ValueView, 11: StrategyView,
};
/** The failure-review mission swaps chapters in from 4 (index 3) — reference `missionView()`'s switch. */
const FailureBoard = () => <BoardView title="Map the intended work and the failure location." />;
const FAILURE_VIEWS: Record<number, React.ComponentType> = {
  3: IncidentView, 4: FailureBoard, 5: RulesView, 6: EvidenceView, 7: ComparisonView, 8: HypothesesView, 9: ActionsView, 10: VerificationView, 11: FailureReportView,
};

function NotYet({ stage }: { stage: number }) {
  const { chapters, go } = useMission();
  const [name, sub] = chapters[stage];
  return (
    <>
      <Intro step={name.toUpperCase()} title={sub + '.'} sub="This chapter is being ported from the Edge reference. It lands in a later slice; nothing here is hidden." />
      <div className="card">
        <h2>Not built yet</h2>
        <p>The reference for this chapter is <code>VaNiGTM/docs/EDGE/vani-edge/</code>, chapter {stage + 1} of 12. Until it lands, go back to the last confirmed chapter.</p>
        <Btn kind="secondary" onClick={() => go(Math.max(0, stage - 1))}>← Back</Btn>
      </div>
    </>
  );
}

export function ChapterPage() {
  const { m, stage, chapters, go, openModal, hydrated } = useMission();
  const p = processes[m.process];

  // A chapter beyond the furthest reached is not open yet — same as the
  // prototype's disabled sidebar links, applied to a typed URL.
  useEffect(() => {
    if (hydrated && stage > m.furthest) go(m.furthest);
  }, [hydrated, stage, m.furthest, go]);

  // Reference `go()`: focus the chapter heading on arrival, so a keyboard
  // user starts at the chapter and the skip link does not take focus.
  useEffect(() => {
    const h = document.querySelector<HTMLHeadingElement>('#main h1');
    if (h) { h.tabIndex = -1; h.focus({ preventScroll: true }); }
  }, [stage, m.quiz, m.failureIntake]);

  if (stage < 0 || !chapters[stage]) {
    return (
      <main id="main" className="workspace-main">
        <div className="card"><h2>No such chapter</h2><p>The mission has twelve chapters: {chapters.map((c, i) => slugOfStage(i)).join(', ')}.</p><Btn onClick={() => go(-1)}>Home</Btn></div>
      </main>
    );
  }

  const View = m.missionType === 'failure' ? (FAILURE_VIEWS[stage] ?? (stage < 3 ? VIEWS[stage] : undefined)) : VIEWS[stage];
  const showStory = m.missionType !== 'failure' && stage >= 2 && stage !== 3;
  const open = m.tasks.filter((t) => t.status !== 'Resolved').length;

  return (
    <div className="workspace mission-workspace">
      <aside className="sidebar">
        <span className="workspace-label">YOUR GUIDED MISSION</span>
        <nav aria-label="Mission progress">
          {chapters.map(([name], i) => (
            <button
              key={name + i}
              type="button"
              className={`stage-link ${i === stage ? 'current' : ''}`}
              onClick={() => go(i)}
              disabled={i > m.furthest}
              aria-current={i === stage ? 'step' : undefined}
            >
              <span className="stage-number">{i < stage ? '✓' : i + 1}</span>{name}
            </button>
          ))}
        </nav>
        <div className="sidebar-note">
          <strong>{m.company}</strong>
          <p>{p.name}<br />{m.mode === 'sample' ? 'Sample evidence selected' : 'Your evidence workspace'}</p>
          <Btn kind="text" onClick={() => openModal('memory')}>Mission memory</Btn>
          <Btn kind="text" onClick={() => go(1)}>Contributions ({open})</Btn>
        </div>
      </aside>
      <main id="main" className={`workspace-main compact-chapter chapter-${stage}`}>
        <div className="breadcrumb"><span>{p.short} / {chapters[stage][1]}</span><span>{stage + 1} / {chapters.length}</span></div>
        <div className="mission-mobile-nav">
          <button type="button" onClick={() => openModal('memory')}>Mission summary ↗</button>
          <span>{m.storage ? 'Saved on this device' : 'Session only'}</span>
        </div>
        {showStory && <StoryThread />}
        {View ? <View /> : <NotYet stage={stage} />}
        <div className="contextual-help">
          Need another perspective?{' '}
          <Btn kind="text" onClick={() => openModal('assign', { topic: chapters[stage][1] })}>Ask your team</Btn>
          <Btn kind="text" onClick={() => openModal('assist', { topic: chapters[stage][1] })}>Work through this with us</Btn>
        </div>
      </main>
    </div>
  );
}
