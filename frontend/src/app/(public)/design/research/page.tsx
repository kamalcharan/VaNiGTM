'use client';

/** /design/research — research & competitors (POA 1.2). Synthetic data. */

import { DesignShell, Panel } from '../DesignShell';
import s from './research.module.css';

const COMPETITORS = [
  {
    name: 'Northbeam Analytics', tier: 'Primary threat',
    strengths: ['40+ integrations', 'Enterprise brand'],
    weaknesses: ['6–8 week onboarding', 'Needs a data team'],
    angle: 'Live before their kickoff call.',
  },
  {
    name: 'Clearsight Metrics', tier: 'Down-market',
    strengths: ['Cheap entry tier', 'Self-serve'],
    weaknesses: ['No revenue attribution', 'Dashboards only'],
    angle: 'They show clicks; we show closed-won.',
  },
  {
    name: 'Fathomline', tier: 'Adjacent',
    strengths: ['Agency white-label', 'Report polish'],
    weaknesses: ['Weak API', 'No CRM depth'],
    angle: 'Built for the in-house team the agency hands off to.',
  },
  {
    name: 'TraceLoop', tier: 'Adjacent',
    strengths: ['Developer-loved pipeline', 'Event fidelity'],
    weaknesses: ['No GTM workflows', 'Engineer-only UX'],
    angle: 'Attribution your marketers can actually operate.',
  },
];

export default function ResearchDesignPage() {
  return (
    <DesignShell
      path="/design/research"
      eyebrow="Research · Competitors"
      title="The market, mapped and weaponized"
      lede="VaNi keeps competitor intel current and turns it into positioning angles — the angles feed campaigns, decks and emails automatically."
    >
      <div className={s.grid}>
        {COMPETITORS.map((c) => (
          <Panel key={c.name} label={c.tier} className={s.compPanel}>
            <div className={s.compHead}>
              <span className={s.compName}>{c.name}</span>
            </div>
            <div className={s.cols}>
              <div className={s.col}>
                <span className={s.colLabel}>Strengths</span>
                <ul className={s.list}>
                  {c.strengths.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </div>
              <div className={s.col}>
                <span className={s.colLabel}>Weaknesses</span>
                <ul className={s.list}>
                  {c.weaknesses.map((x) => <li key={x}>{x}</li>)}
                </ul>
              </div>
            </div>
            <div className={s.angle}>
              <span className={s.angleLabel}>Your angle</span>
              <span className={s.angleText}>“{c.angle}”</span>
            </div>
          </Panel>
        ))}
      </div>
    </DesignShell>
  );
}
