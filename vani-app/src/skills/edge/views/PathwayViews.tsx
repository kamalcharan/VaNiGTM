'use client';
/** Coverage strip, route review and decision ledger — reference `pathways.js` and `story.js` `routeConclusion`. */
import type { FormEvent } from 'react';
import { useMission } from '../mission/MissionProvider';
import { coverage, treatments, type Variant } from '../mission/pathways';
import type { Graph as ReferenceData } from '../engine/analyse';
import type { PathReview } from '../mission/types';
import { Btn } from '../ui';
import { Radios } from './controls';

export function CoverageView({ variants }: { variants: Variant[] }) {
  const { m } = useMission();
  const c = coverage(m, variants);
  return (
    <section className="card pathway-coverage">
      <div className="eyebrow">PATHWAY DECISION COVERAGE · {variants.length ? (m.mode === 'sample' ? 'SAMPLE CASE SHARE' : 'YOUR CASE SHARE') : 'AWAITING EVIDENCE'}</div>
      <h2>How much of the process have we accounted for?</h2>
      <div className="coverage-grid">
        {([['automate', 'Proposed automation'], ['conditional', 'With conditions'], ['human', 'Human handling'], ['unresolved', 'Unresolved / unreviewed']] as const).map(([k, l]) => (
          <div key={k}><strong>{variants.length ? c[k] + '%' : '—'}</strong><span>{l}</span></div>
        ))}
      </div>
      <p>Coverage counts a route only when its explanation, classification, owner and fallback are recorded. Conditional automation also needs explicit conditions. Open questions keep a route unresolved. These are proposed decisions, subject to validation; they are not deployment approval.</p>
      {c.unresolved > 0 && <div className="notice">Unresolved routes remain outside the proposed automation scope. A human fallback must be agreed before a pilot.</div>}
    </section>
  );
}

function RouteConclusion({ r }: { r?: PathReview }) {
  if (!r) return null;
  return (
    <div className="story-thread">
      <h3>What this review changes</h3>
      <p><strong>Your explanation:</strong> {r.explanation || 'Still needed'}</p>
      <p><strong>Proposed handling:</strong> {r.treatment || 'Investigate first'}</p>
      <p><strong>Still to resolve:</strong> {r.question || (!r.owner ? 'Name the responsible person or team.' : !r.fallback ? 'Agree the human fallback.' : r.treatment === 'Automate with conditions' && !r.conditions ? 'Define the conditions.' : 'Validate this explanation and handling against customer evidence.')}</p>
      <p>Next, review another pathway. This explanation does not establish the cause of delay across all cases.</p>
    </div>
  );
}

export function RouteReview({ d }: { d: ReferenceData }) {
  const { m, update, toast, openModal } = useMission();
  const v = d.variants.find((x) => x.id === m.variant);
  if (!v) return <div className="card"><h2>Select a pathway to understand its handling.</h2><p>Review the ordinary route, returns, bypasses and exceptions. Each route needs a decision before it contributes to coverage.</p></div>;
  const r = m.pathReviews?.[v.id] || {};
  const field = (label: string, name: keyof PathReview) => <label className="field">{label}<textarea name={name} rows={2} defaultValue={r[name] || ''} /></label>;
  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const dd = Object.fromEntries(new FormData(ev.currentTarget)) as PathReview;
    update((x) => { x.pathReviews ??= {}; x.pathReviews[v.id] = { ...dd, by: x.respondent.name }; });
    toast('Pathway decision saved. Coverage updated.');
  };
  return (
    <section className="card route-review">
      <div className="eyebrow">EXPLAIN → AGREE HANDLING</div>
      <h2>{v.label}</h2>
      <p>{v.share}% of {m.mode === 'sample' ? 'sample ' : ''}cases · {v.cases.toLocaleString('en-IN')} cases · {v.days} days</p>
      <p className="route-sequence">{v.seq.map((id) => d.nodes[id].label).join(' → ')}</p>
      <RouteConclusion r={m.pathReviews?.[v.id]} />
      <form id="path-review" key={v.id} onSubmit={submit}>
        <Radios label="How does this relate to your declared process?" name="relationship" values={['Not compared yet', 'Expected route', 'Known exception', 'Unexpected route', 'Missing evidence']} selected={r.relationship} required={false} />
        <Radios label="What explains this route?" name="classification" values={['Unknown', 'Normal practice', 'Legitimate exception', 'Workaround', 'Control gap', 'Recording gap']} selected={r.classification} required={false} />
        {field('Explanation and supporting evidence', 'explanation')}
        <Radios label="Proposed handling" name="treatment" values={treatments} selected={r.treatment} required={false} />
        {field('Conditions and controls required', 'conditions')}
        {field('Responsible person or team', 'owner')}
        {field('Human fallback / recovery route', 'fallback')}
        {field('Unresolved question', 'question')}
        <button type="submit" className="btn primary">Save pathway decision</button>
      </form>
      <Btn kind="text" onClick={() => openModal('assign', { topic: `${v.label}: ${r.question || 'Confirm the explanation, controls and fallback'}` })}>Ask someone about this pathway</Btn>
      <p className="micro">{m.mode === 'sample' ? 'Comparison is your interpretation of a labelled sample. Your board has not been algorithmically matched to customer events.' : 'Comparison is your interpretation of the reconstructed pathways. Your board has not been algorithmically matched to them.'}</p>
    </section>
  );
}

export function DecisionLedger({ variants }: { variants: Variant[] }) {
  const { m, update, go } = useMission();
  return (
    <div className="card">
      <h2>Pathways define the pilot scope.</h2>
      {variants.map((v) => {
        const r = m.pathReviews?.[v.id] || {};
        return (
          <div key={v.id} className="hyp-row">
            <strong>{v.label} · {v.share}%</strong>
            <div><p>{r.treatment || 'Investigate first'} · {r.owner || 'Owner unconfirmed'}</p><p>{r.question || r.explanation || 'Explanation and handling still needed'}</p></div>
            <Btn kind="secondary" onClick={() => { update((x) => { x.variant = v.id; }); go(7); }}>Review route</Btn>
          </div>
        );
      })}
      <p>Any remaining pathways are unreviewed. Activity scores cannot override an unresolved route.</p>
    </div>
  );
}

/** Coverage + ledger, as chapters 10 and 11 open — reference `pathwaySummary()`. */
export function PathwaySummary({ d }: { d: ReferenceData | null }) {
  const { m } = useMission();
  return <><CoverageView variants={d?.variants || []} />{d && <DecisionLedger variants={d.variants} />}</>;
}
