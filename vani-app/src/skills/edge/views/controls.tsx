'use client';
/** Radio cards and the discovery guidance aside — reference `discovery-controls.js`. */
import { useMission } from '../mission/MissionProvider';
import type { Question } from '../mission/discovery';
import { Btn } from '../ui';

export function Radios({ label, name, values, selected = '', required = true }: { label: string; name: string; values: string[]; selected?: string; required?: boolean }) {
  return (
    <fieldset className="answer-options">
      <legend>{label} <small>Select one</small></legend>
      <div className="radio-cards">
        {values.map((v) => (
          <label key={v} className="radio-card">
            <input type="radio" name={name} value={v} defaultChecked={v === selected} required={required} />
            <span>{v}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function Guidance({ q, phase }: { q: Question | null; phase: 'pain' | 'gains' | 'review' | 'question' }) {
  const { m, setChatOpen, openModal } = useMission();
  const pain = q?.pain || m.priority || m.pains.join(', ');
  let why: string, next: string;
  if (q) {
    why = `You identified “${pain}”. Understanding “${q.title}” helps us separate the suspected cause from the symptom. Your answer and its basis tell us what to verify in records or with a colleague.`;
    next = 'We’ll carry this explanation into the process map and test it against evidence. An uncertain answer stays open.';
  } else if (phase === 'gains') {
    why = 'A clear outcome gives us a reason to choose one improvement over another. The baseline and target will guide the value discussion.';
    next = 'Review the summary, then map the activities and exceptions that could affect this outcome.';
  } else if (phase === 'review') {
    why = 'This checkpoint lets you correct our understanding before it shapes the process investigation.';
    next = 'Turn this shared understanding into a process board, including returns and exceptions.';
  } else {
    why = 'A recent example reveals where the pain occurs, who is involved and what it costs your team. Select all the areas that apply.';
    next = 'We’ll ask about each selected area, then agree what a good outcome looks like.';
  }
  return (
    <aside className="card discovery-guide" aria-label="Edge guidance">
      <div className="eyebrow">EDGE / WITH YOU THROUGH THIS</div>
      <h2>Let’s connect the dots.</h2>
      <h3>Your goal</h3>
      <p>{m.goal || m.gains.join(' · ') || 'We’ll define the improvement you want after understanding the pain.'}</p>
      {pain && <><h3>Our current focus</h3><p>{pain}</p></>}
      <h3>Why I’m asking</h3>
      <p>{why}</p>
      <h3>What happens next</h3>
      <p>{next}</p>
      <Btn kind="secondary" onClick={() => setChatOpen(true)}>Ask Edge about this step</Btn>
      {q && <Btn kind="text" onClick={() => openModal('assign', { topic: q.title })}>Ask a colleague</Btn>}
      <p className="micro">Your explanation is a starting hypothesis. Evidence is needed to confirm it.</p>
    </aside>
  );
}
