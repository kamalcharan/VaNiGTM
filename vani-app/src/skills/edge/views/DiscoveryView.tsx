'use client';
/**
 * Chapter 4 — Pain & desired gains. Reference `discovery()` in
 * views-discovery.js: pain chips and a recent example → one follow-up per
 * selected pain → gains and a target → the "here's what I understood"
 * checkpoint. Confirming the checkpoint opens the failure intake (IncidentView)
 * on this same chapter, as the reference does.
 */
import { useEffect, useRef, type FormEvent } from 'react';
import { useMission } from '../mission/MissionProvider';
import { packs } from '../mission/domain';
import { questions, hypotheses } from '../mission/discovery';
import { Intro, Input, Area, Btn, Choice, Status } from '../ui';
import { Radios, Guidance } from './controls';
import { IncidentView } from './IncidentView';

export function DiscoveryView() {
  const { m, update, toast, openModal, registerCapture, go, hydrated } = useMission();
  const form = useRef<HTMLFormElement>(null);
  const pack = packs[m.process], qs = questions(m);
  const quiz = m.quiz;

  // Leaving mid-form keeps what was typed (reference `capture()` for pain-story / answer / gains).
  useEffect(() => {
    registerCapture(() => {
      const f = form.current; if (!f) return;
      const d = Object.fromEntries(new FormData(f)) as Record<string, string>;
      if (f.id === 'pain-story' || f.id === 'gains') update((x) => { Object.assign(x, d); });
      if (f.id === 'answer') update((x) => { x.answers[f.dataset.id!] = { ...(d as { answer: string }), by: x.respondent.name }; });
    });
    return () => registerCapture(null);
  }, [registerCapture, update]);

  if (m.failureIntake) return <IncidentView />;

  const toggle = (arr: string[], v: string) => arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];
  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = ev.currentTarget;
    const d = Object.fromEntries(new FormData(f)) as Record<string, string>;
    if (f.id === 'pain-story') {
      if (!m.pains.length && !(d.painStory || '').trim()) { update((x) => { Object.assign(x, d); }); toast('Describe the pain or choose an area.'); return; }
      update((x) => { Object.assign(x, d); x.quiz = 1; });
    } else if (f.id === 'answer') {
      update((x) => { x.answers[f.dataset.id!] = { ...(d as { answer: string }), by: x.respondent.name }; x.quiz++; });
    } else if (f.id === 'gains') {
      if (!(d.goal || '').trim() && !m.gains.length) { update((x) => { Object.assign(x, d); }); toast('Tell us what a good outcome would look like.'); return; }
      update((x) => { Object.assign(x, d); x.quiz = questions(x).length + 2; });
    }
  };

  let body: React.JSX.Element;
  let q: ReturnType<typeof questions>[number] | null = null;
  let phase: 'pain' | 'gains' | 'review' | 'question' = 'pain';

  if (quiz === 0) {
    body = (
      <div className="card">
        <h2>Where does the process hurt most today?</h2>
        <p>Select all that apply. We’ll follow up on each area you select, at your pace.</p>
        <Choice values={pack.pains} selected={m.pains} onToggle={(v) => update((x) => { x.pains = toggle(x.pains, v); })} />
        <form id="pain-story" ref={form} onSubmit={submit} key={'p' + (hydrated ? 1 : 0)}>
          <Area label="Tell us about a recent example" name="painStory" defaultValue={m.painStory} hint="What happened, who became involved, and what was the consequence?" />
          <div className="form-grid">
            <Input label="How often does this happen?" name="frequency" defaultValue={m.frequency} placeholder="Daily, at month-end, some locations…" />
            <Input label="What does it affect?" name="impact" defaultValue={m.impact} placeholder="Close date, effort, suppliers, customers…" />
          </div>
          <button type="submit" className="btn primary">Save &amp; explore the causes →</button>
        </form>
      </div>
    );
  } else if (quiz <= qs.length) {
    q = qs[quiz - 1]; phase = 'question';
    const a = m.answers[q.id] || {};
    body = (
      <div className="card">
        <div className="eyebrow">FOLLOW-UP {quiz} OF {qs.length} / {q.pain}</div>
        <h2>{q.title}</h2>
        <p>Your explanation will become something to test against the evidence, not a finding yet.</p>
        <form id="answer" data-id={q.id} ref={form} onSubmit={submit} key={'a' + q.id}>
          <Radios label="Your answer" name="answer" values={[...q.options, 'Something else']} selected={a.answer} />
          <Area label="Add the detail that matters" name="detail" defaultValue={a.detail || ''} hint="People, locations, exceptions or a concrete example" />
          <Radios label="How do you know?" name="basis" values={['First-hand experience', 'Documented policy', 'Estimate', 'Needs colleague confirmation']} selected={a.basis} />
          <div className="step-actions">
            <Btn kind="text" onClick={() => update((x) => { x.quiz = Math.max(0, x.quiz - 1); })}>← Previous question</Btn>
            <button type="submit" className="btn primary">Save answer &amp; continue →</button>
          </div>
        </form>
        <Btn kind="text" onClick={() => openModal('assign', { topic: q!.title })}>Ask a colleague about this</Btn>
        <Btn kind="text" onClick={() => update((x) => { x.answers[q!.id] = { answer: 'Not sure', basis: 'Needs colleague confirmation', by: x.respondent.name }; x.quiz++; })}>I’m not sure; keep this open</Btn>
      </div>
    );
  } else if (quiz === qs.length + 1) {
    phase = 'gains';
    body = (
      <div className="card">
        <h2>What would a good outcome look like?</h2>
        <Choice values={pack.gains} selected={m.gains} onToggle={(v) => update((x) => { x.gains = toggle(x.gains, v); })} />
        <form id="gains" ref={form} onSubmit={submit} key={'g' + (hydrated ? 1 : 0)}>
          {m.pains.length > 0 && m.pains.length <= 4
            ? <Radios label="The pain to prioritise" name="priority" values={m.pains} selected={m.priority} required={false} />
            : <label className="field">The pain to prioritise<select name="priority" defaultValue={m.priority}><option value="">Choose a priority</option>{m.pains.map((v) => <option key={v}>{v}</option>)}</select></label>}
          <Area label="Your most important outcome" name="goal" defaultValue={m.goal} hint="Describe the change you want your team to experience." />
          <div className="form-grid">
            <Input label="Today’s baseline · if known" name="current" defaultValue={m.current} placeholder="For example, 9" />
            <Input label="Desired target · if known" name="target" defaultValue={m.target} placeholder="For example, 5" />
            <Input label="Unit / measure" name="unit" defaultValue={m.unit} placeholder="Working days, hours per invoice…" />
            <Input label="When would you like to achieve it?" name="deadline" defaultValue={m.deadline} placeholder="For example, next quarter" />
          </div>
          <p className="micro">A target is an ambition, not a forecast. Unknown baselines remain open until evidence supports them.</p>
          <button type="submit" className="btn primary">Review what we’ve understood →</button>
        </form>
      </div>
    );
  } else {
    phase = 'review';
    body = (
      <div className="card">
        <div className="eyebrow">CHECKPOINT / BEFORE WE DRAW THE PROCESS</div>
        <h2>Here’s what I understood.</h2>
        <div className="summary-columns">
          <div>
            <h3>What hurts</h3>
            <p>{m.pains.join(' · ') || m.painStory}</p>
            <p>{m.painStory}</p>
            <small>Frequency: {m.frequency || 'Unconfirmed'}<br />Impact: {m.impact || 'Unconfirmed'}</small>
          </div>
          <div>
            <h3>What good looks like</h3>
            <p>{m.goal || m.gains.join(' · ') || 'Outcome still to confirm'}</p>
            <p>{m.current || '?'} → {m.target || '?'} {m.unit}<br />{m.deadline}</p>
          </div>
        </div>
        <h3>What we’ll investigate</h3>
        {hypotheses(m).map((h) => (
          <div key={h.id} className="hyp-row">
            <span>{h.id}</span>
            <div><strong>{h.text}</strong><p>{h.answer} · {m.answers[h.pain]?.basis || 'Unconfirmed'}</p></div>
            <Status>Suspected</Status>
          </div>
        ))}
        <div className="step-actions">
          <Btn kind="secondary" onClick={() => update((x) => { x.quiz = 0; })}>Review my answers</Btn>
          <Btn onClick={() => update((x) => { x.discoveryConfirmed = true; x.failureIntake = true; })}>This reflects our situation →</Btn>
        </div>
      </div>
    );
  }

  return (
    <>
      <Intro step="PAIN & DESIRED GAINS" title="Let’s understand what needs to change." sub="Your experience sets the direction. Evidence will help us test the explanations." />
      <div className="question-progress">
        <span>{quiz > qs.length + 1 ? 'Review checkpoint' : quiz === 0 ? 'Start with your experience' : 'Discovery in progress'}</span>
        <span>{m.respondent.name || 'Respondent not yet confirmed'} · {m.respondent.designation}</span>
      </div>
      <div className="discovery-layout">
        <div className="discovery-task">
          {body}
          {quiz === 0 && <Btn kind="text" onClick={() => go(2)}>← Back to process scope</Btn>}
        </div>
        <Guidance q={q} phase={phase} />
      </div>
    </>
  );
}
