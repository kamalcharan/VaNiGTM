'use client';
/**
 * The home screen — reference `welcome()` in views-context.js, plus the
 * mission entry (`missionEntry()` in failure.js) that the prototype imported
 * but never rendered. Charan, 2026-09-29: the Failure Review mission is in,
 * so the choice is shown here, under the hero.
 */
import { useMission } from '../mission/MissionProvider';
import type { MissionType } from '../mission/types';
import { Btn } from '../ui';

const JOURNEY: [string, string][] = [
  ['Where you stand', 'Readiness and evidence gaps.'], ['What needs attention', 'Exceptions, risks and controls.'],
  ['What to automate', 'Proposed scope and human handling.'], ['What it could be worth', 'Value estimates with explicit assumptions.'],
  ['How to proceed', 'Priorities, owners and a practical roadmap.'],
];

export function Welcome() {
  const { m, go, update, openModal } = useMission();

  const choose = (id: MissionType) => {
    if (m.furthest > 0 && id !== m.missionType) { openModal('choose-mission', { id }); return; }
    update((d) => { d.missionType = id; });
    go(m.resumeStage ?? 0);
  };

  return (
    <main id="main">
      <section className="mission-welcome strategy-hero">
        <div>
          <div className="eyebrow">AUTOMATION READINESS &amp; STRATEGY</div>
          <h1>Before you automate,<br /><em>know where you stand.</em></h1>
          <p className="hero-lede">Understand your process, its exceptions and the risks of automating it. Bring your team’s knowledge and available evidence together to build an Automation Strategy—what to automate, what to fix first, and what should stay with people.</p>
          <Btn onClick={() => go(m.resumeStage ?? 0)}>{m.savedAt ? 'Resume my strategy assessment →' : 'Assess my process →'}</Btn>
          <p className="micro">Manual, partly automated or already automated: explore readiness, existing failures and the corrections needed.</p>
          <p className="micro">Your company context carries forward from onboarding. Your strategy is yours to use with your team or an implementation partner of your choice.</p>
          <div className="hero-proof"><span><b>01</b>Describe your process</span><span><b>02</b>Examine the evidence</span><span><b>03</b>Decide your next move</span></div>
        </div>
        <div className="card welcome-mission strategy-preview">
          <div className="eyebrow">YOUR AUTOMATION STRATEGY</div>
          <h2>An informed next move<br />for your business.</h2>
          <div className="journey-preview">
            {JOURNEY.map(([title, detail], i) => <div key={title}><span>0{i + 1}</span><div><strong>{title}</strong><p>{detail}</p></div></div>)}
          </div>
          <div className="strategy-delivery-label">Downloadable strategy · Email · Optional WhatsApp</div>
          <p className="micro">Incomplete evidence? Your strategy identifies what must be validated before you commit.</p>
        </div>
      </section>
      <section className="mission-entry">
        <h2>What decision brings you here?</h2>
        <div className="choice-grid">
          <div className="card"><h3>Assess automation readiness</h3><p>Understand what is ready, risky or missing before investing.</p><Btn onClick={() => choose('readiness')}>Assess my process →</Btn></div>
          <div className="card"><h3>Review a process failure</h3><p>Understand what went wrong and build a corrective action plan.</p><Btn onClick={() => choose('failure')}>Review what went wrong →</Btn></div>
        </div>
      </section>
      <p className="hero-preview-note">UX preview: editable example company profile. Live analysis and message delivery are not connected.</p>
    </main>
  );
}
