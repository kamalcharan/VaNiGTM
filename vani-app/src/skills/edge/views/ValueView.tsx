'use client';
/**
 * Chapter 11 — Value & controls. Reference `value()`, `estimateHTML()` and
 * `comparisonHTML()` in views/assessment.js, under the pathway summary as
 * main.js composes it. The calculator is live: every valid keystroke in an
 * assumption re-estimates the panel, as the prototype's input handler did.
 */
import { useState } from 'react';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useMission } from '../mission/MissionProvider';
import { processes } from '../mission/domain';
import { estimate, money, number, type Estimate } from '../mission/model';
import type { Assumptions } from '../mission/types';
import { Btn } from '../ui';
import { useFlow } from './flow';
import { PathwaySummary } from './PathwayViews';
import { useAnalysis } from './useAnalysis';

const CONTROLS: ['assist' | 'guarded' | 'extend', string, string][] = [
  ['assist', 'Assist the team', 'Prepare and flag. A person approves each action.'],
  ['guarded', 'Automate within limits', 'Handle eligible cases. Route exceptions to a person.'],
  ['extend', 'Explore wider coverage', 'Requires validated controls, monitoring and a fallback.'],
];
const FIELDS: [keyof Assumptions, string, number, number][] = [
  ['volume', 'Items per month', 1, 10000000], ['minutes', 'Manual minutes per item', 0, 10000], ['rate', 'Loaded cost per hour · ₹', 0, 1000000],
  ['coverage', 'Eligible coverage · %', 0, 100], ['efficiency', 'Effort reduction on eligible work · %', 0, 100],
  ['setup', 'One-time investment · ₹', 0, 1000000000], ['monthly', 'Monthly running cost · ₹', 0, 100000000],
];

export function EstimatePanel({ v }: { v: Estimate }) {
  return (
    <>
      <div className="big-value">{number(v.freed)}<span>hours / month potentially freed</span></div>
      <div className="value-row"><span>Capacity value / month</span><strong>{money(v.value)}</strong></div>
      <div className="value-row"><span>Less running cost</span><strong>{money(v.net)} / mo</strong></div>
      <div className="value-row"><span>Illustrative cost recovery</span><strong>{v.breakeven === null ? 'Not reached' : v.breakeven.toFixed(1) + ' months'}</strong></div>
      <p className="micro">Cost recovery assumes all capacity value is realised. Implementation time, adoption and other costs can delay or prevent it.</p>
    </>
  );
}

export function Comparison({ v }: { v: Estimate }) {
  const { m } = useMission();
  const p = processes[m.process];
  return (
    <section className="scenario-section">
      <div className="eyebrow">THE COST OF EACH CHOICE</div>
      <h2>Three ways forward.</h2>
      <div className="scenario-grid">
        <article className="card"><span className="tag">CONTINUE AS TODAY</span><h3>{number(v.hours)} hours / month</h3><p>Estimated manual effort at your current volume. Waiting time and existing exposure continue unless the process changes.</p><small>Based on your effort assumptions.</small></article>
        <article className="card"><span className="tag">AUTOMATE AS-IS</span><h3>Speed can amplify the gaps.</h3><p>{p.risk}</p><small>No risk-adjusted benefit is claimed without validated controls.</small></article>
        <article className="card recommended"><span className="tag">FIX CONTROLS, THEN AUTOMATE</span><h3>{number(v.freed)} hours of potential capacity</h3><p>Per month once the scenario is realised. Each month of delay defers up to {money(v.value)} of capacity value, before costs.</p><small>Preparation takes effort too. Agree its cost and duration in the review.</small></article>
      </div>
    </section>
  );
}

export function ValueView() {
  const { m, update, go, toast } = useMission();
  const { back } = useFlow();
  const q = useAnalysis();
  const p = processes[m.process];
  const [draft, setDraft] = useState<Assumptions>(m.assumptions);
  const v = estimate(draft);

  const onInput = (key: keyof Assumptions, el: HTMLInputElement) => {
    if (!el.validity.valid) return;
    const next = { ...draft, [key]: +el.value };
    setDraft(next);
    update((x) => { x.assumptions = next; });
  };
  const next = () => {
    const invalid = [...document.querySelectorAll<HTMLInputElement>('[data-assumption]')].find((el) => !el.validity.valid);
    if (invalid) { invalid.reportValidity(); toast('Check the highlighted assumption.'); return; }
    go(11);
  };

  return (
    <>
      <DataBoundary query={q} label="analysis" skeleton={<SkeletonRows rows={3} />}>{(b) => <PathwaySummary d={b.graph} />}</DataBoundary>
      <div className="page-heading"><div className="eyebrow">VALUE &amp; CONTROLS</div><h1>What could a better process be worth?</h1><p>Explore a planning scenario. Change the assumptions and see the implications before making a commitment.</p></div>
      <div className="value-layout">
        <div>
          <div className="card">
            <div className="section-label">CHOOSE YOUR CONTROL LEVEL</div>
            <h2>How much should automation handle?</h2>
            <div className="control-options">
              {CONTROLS.map(([id, title, sub]) => (
                <button key={id} type="button" className={`control ${m.control === id ? 'selected' : ''}`} onClick={() => update((x) => { x.control = id; })} aria-pressed={m.control === id}>
                  <span className="radio">{m.control === id ? '✓' : ''}</span><div><strong>{title}</strong><small>{sub}</small></div>
                </button>
              ))}
            </div>
            <div className="risk-note"><strong>What could get worse?</strong><p>{p.risk}</p><strong>Control to carry forward</strong><p>{p.control}</p></div>
          </div>
          <details className="card assumptions" open>
            <summary>Edit the planning assumptions <span>↗</span></summary>
            <p className="micro">Illustrative starting values, not measured savings or a quote. All amounts in INR.</p>
            <div className="form-grid">
              {FIELDS.map(([key, label, min, max]) => (
                <label key={key} className="field">{label}<input name={key} type="number" defaultValue={m.assumptions[key]} data-assumption={key} min={min} max={max} step="any" required onInput={(ev) => onInput(key, ev.currentTarget)} /></label>
              ))}
            </div>
          </details>
        </div>
        <aside className="value-summary">
          <div className="eyebrow">YOUR PLANNING SCENARIO</div>
          <h2>Capacity you could reclaim.</h2>
          <div id="estimate"><EstimatePanel v={v} /></div>
          <div className="notice dark">Freed capacity is not automatically a cash saving. Waiting-time reductions and cash-flow benefits require separate evidence.</div>
          <p className="micro">Formula: volume × minutes ÷ 60 × eligible coverage × effort reduction.</p>
        </aside>
      </div>
      <div id="comparison"><Comparison v={v} /></div>
      <div className="step-actions"><Btn kind="text" onClick={back}>← Back</Btn><Btn onClick={next}>Build my next move →</Btn></div>
    </>
  );
}
