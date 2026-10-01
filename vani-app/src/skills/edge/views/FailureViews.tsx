'use client';
/**
 * The failure-review chapters — reference failure.js: case comparison,
 * possible causes (hypotheses register), corrective actions, and their two
 * dialogs. On the readiness mission the two registers ride at the foot of
 * chapters 9 and 10 without their own Back/Continue bar.
 */
import type { FormEvent } from 'react';
import { useMission } from '../mission/MissionProvider';
import type { CorrectiveAction, FailureHypothesis } from '../mission/types';
import { Intro, Input, Area, Btn } from '../ui';
import { Radios } from './controls';
import { DrawBoard } from './BoardView';
import { useFlow } from './flow';

const read = (ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); return Object.fromEntries(new FormData(ev.currentTarget)) as Record<string, string>; };

export function ComparisonView() {
  const { m, update, go } = useMission();
  const c = m.failure.comparison;
  return (
    <>
      <Intro step="CASE COMPARISON" title="Follow the failure—and a successful case." sub="Record the timeline and its gaps. This prototype does not reconstruct customer logs automatically." />
      <details className="card"><summary>Keep the declared process in view</summary><DrawBoard readonly /></details>
      <div className="comparison-pair">
        {(['failed', 'successful'] as const).map((k) => (
          <div key={k} className="card"><div className="eyebrow">{k === 'failed' ? 'AFFECTED CASE' : 'COMPARISON CASE'}</div><h2>{c[k + 'Id'] || 'Case not identified'}</h2><p className="timeline-note">{c[k + 'Timeline'] || 'No timeline recorded yet.'}</p></div>
        ))}
      </div>
      <form id="failure-comparison" className="card" onSubmit={(ev) => { const d = read(ev); update((x) => { Object.assign(x.failure.comparison, d); }); go(8); }}>
        <div className="comparison-pair">
          {(['failed', 'successful'] as const).map((k) => (
            <div key={k}>
              <Input label={k === 'failed' ? 'Affected case ID' : 'Successful case ID'} name={k + 'Id'} defaultValue={c[k + 'Id'] || ''} />
              <Area label="Timestamped events and source references" name={k + 'Timeline'} defaultValue={c[k + 'Timeline'] || ''} hint="One event per line: time, activity, outcome, source" />
            </div>
          ))}
        </div>
        <Area label="Where do the paths differ?" name="difference" defaultValue={c.difference || ''} />
        <Area label="Are the cases comparable? What differs in scope or version?" name="comparability" defaultValue={c.comparability || ''} />
        <Area label="Missing logs, uncertain ordering or conflicting accounts" name="gaps" defaultValue={c.gaps || ''} />
        <button type="submit" className="btn primary">Save comparison &amp; examine causes →</button>
      </form>
      <Btn kind="secondary" onClick={() => go(4)}>View / edit declared process</Btn>
      <p className="micro">These are user-recorded timelines. Sequence alone is not proof of causation.</p>
      <Btn kind="text" onClick={() => go(6)}>← Back</Btn>
    </>
  );
}

export function HypothesesView({ foot = true }: { foot?: boolean }) {
  const { m, openModal } = useMission();
  const { back, next } = useFlow();
  const f = m.failure;
  return (
    <>
      <Intro step="POSSIBLE CAUSES" title="Test explanations before choosing a fix." sub="Keep observations, supported causes and unresolved hypotheses distinguishable." />
      <div className="card">
        <h2>Investigation register</h2>
        <Btn onClick={() => openModal('failure-hypothesis')}>+ Add possible cause</Btn>
        {f.hypotheses.length ? f.hypotheses.map((h) => (
          <article key={h.id} className="hyp-row">
            <div><strong>{h.statement}</strong><p>{h.status} · {h.reviewer || 'Reviewer unassigned'}</p><p>Evidence: {h.support || 'Missing'}</p><p>Still needed: {h.missing || 'No further question recorded; validate sufficiency'}</p></div>
            <div><Btn kind="secondary" onClick={() => openModal('failure-hypothesis', { id: h.id })}>Review</Btn><Btn kind="secondary" onClick={() => openModal('failure-action', { hypothesis: h.id })}>Create corrective action</Btn></div>
          </article>
        )) : <p>No cause has been established. Add explanations and the evidence needed to test them.</p>}
      </div>
      {foot && <div className="step-actions"><Btn kind="text" onClick={back}>← Back</Btn><Btn onClick={() => next()}>Plan corrections →</Btn></div>}
    </>
  );
}

export function ActionsView({ foot = true }: { foot?: boolean }) {
  const { m, openModal } = useMission();
  const { back, next } = useFlow();
  const f = m.failure;
  return (
    <>
      <Intro step="CORRECTIVE ACTIONS" title="Turn findings into owned, testable actions." sub="Contain the impact, correct affected cases and prevent recurrence. Implementation is not proof of effectiveness." />
      <div className="card">
        <Btn onClick={() => openModal('failure-action')}>+ Add corrective action</Btn>
        {f.actions.length ? f.actions.map((a) => (
          <article key={a.id} className="hyp-row">
            <div><strong>{a.title}</strong><p>{a.category} · {a.status} · {a.owner} · {a.due || 'Date to agree'}</p><p>Acceptance: {a.criterion || 'Not defined'}</p></div>
            <Btn kind="secondary" onClick={() => openModal('failure-action', { id: a.id })}>Review action</Btn>
          </article>
        )) : <p>No corrective actions recorded. Add containment or investigation actions even when the cause is still unknown.</p>}
      </div>
      {foot && <div className="step-actions"><Btn kind="text" onClick={back}>← Back</Btn><Btn onClick={() => next()}>Define verification &amp; restart conditions →</Btn></div>}
    </>
  );
}

export function HypothesisDialog({ id }: { id?: string }) {
  const { m, update, closeModal, toast } = useMission();
  const h: Partial<FailureHypothesis> = m.failure.hypotheses.find((x) => x.id === id) || {};
  return (
    <form id="failure-hypothesis" onSubmit={(ev) => {
      const d = read(ev);
      if (d.status === 'Supported' && (!d.support.trim() || !d.reviewer.trim())) { toast('Add supporting evidence and a reviewer before marking supported.'); return; }
      update((x) => { const old = x.failure.hypotheses.find((y) => y.id === id); if (old) Object.assign(old, d); else x.failure.hypotheses.push({ ...(d as unknown as FailureHypothesis), id: 'h' + Date.now() }); });
      closeModal();
    }}>
      <Input label="Possible explanation" name="statement" defaultValue={h.statement || ''} required />
      <Area label="Observed facts and source references" name="support" defaultValue={h.support || ''} />
      <Area label="Contradicting evidence / alternative explanation" name="counter" defaultValue={h.counter || ''} />
      <Area label="What evidence or test is still needed?" name="missing" defaultValue={h.missing || ''} />
      <Radios label="Investigation status" name="status" values={['Proposed', 'Under investigation', 'Supported', 'Contradicted', 'Unresolved']} selected={h.status || 'Proposed'} />
      <Input label="Reviewer" name="reviewer" defaultValue={h.reviewer || ''} />
      <button type="submit" className="btn primary">Save hypothesis</button>
      <p className="micro">Supported requires evidence and a named reviewer. Edge does not infer a confirmed cause.</p>
    </form>
  );
}

export function ActionDialog({ id, hypothesis }: { id?: string; hypothesis?: string }) {
  const { m, update, closeModal, toast } = useMission();
  const a: Partial<CorrectiveAction> = m.failure.actions.find((x) => x.id === id) || { hypothesis: hypothesis || '' };
  const hs = m.failure.hypotheses;
  return (
    <form id="failure-action" onSubmit={(ev) => {
      const d = read(ev);
      if (d.status === 'Effective' && ['test', 'criterion', 'evidence', 'reviewer', 'window'].some((k) => !d[k]?.trim())) { toast('Effective requires tests, acceptance criteria, evidence, reviewer and observation window.'); return; }
      update((x) => { const old = x.failure.actions.find((y) => y.id === id); if (old) Object.assign(old, d); else x.failure.actions.push({ ...(d as unknown as CorrectiveAction), id: 'a' + Date.now() }); });
      closeModal();
    }}>
      <Input label="Action" name="title" defaultValue={a.title || ''} required />
      <label className="field">Linked hypothesis
        <select name="hypothesis" defaultValue={a.hypothesis || ''}><option value="">Incident-level action / cause not established</option>{hs.map((h) => <option key={h.id} value={h.id}>{h.statement}</option>)}</select>
      </label>
      <Radios label="Action type" name="category" values={['Containment', 'Correction', 'Prevention', 'Improvement']} selected={a.category || 'Correction'} />
      <Input label="Owner" name="owner" defaultValue={a.owner || ''} required />
      <Input label="Due date" name="due" defaultValue={a.due || ''} type="date" />
      <Area label="Dependencies, effort and residual risk" name="dependencies" defaultValue={a.dependencies || ''} />
      <Area label="Verification / regression tests" name="test" defaultValue={a.test || ''} />
      <Area label="Acceptance criterion" name="criterion" defaultValue={a.criterion || ''} />
      <Area label="Recovery / fallback plan" name="recovery" defaultValue={a.recovery || ''} />
      <label className="field">Status
        <select name="status" defaultValue={a.status || 'Proposed'}>{['Proposed', 'Approved', 'In progress', 'Implemented', 'Verification pending', 'Effective', 'Ineffective'].map((x) => <option key={x}>{x}</option>)}</select>
      </label>
      <Area label="Verification result and evidence reference" name="evidence" defaultValue={a.evidence || ''} />
      <Input label="Verification reviewer" name="reviewer" defaultValue={a.reviewer || ''} />
      <Input label="Observation window / recurrence checks" name="window" defaultValue={a.window || ''} />
      <button type="submit" className="btn primary">Save corrective action</button>
    </form>
  );
}
