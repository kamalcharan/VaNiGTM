'use client';
/** Chapter 2 — People & ownership. Reference `people()` in views-context.js. */
import { useEffect, useRef, type FormEvent } from 'react';
import { useMission } from '../mission/MissionProvider';
import { Intro, Input, Btn, Status } from '../ui';
import { useFlow } from './flow';

const ROLES = ['Process owner', 'Business sponsor', 'Operational contributor', 'Data / systems owner', 'Transformation lead'];

export function PeopleView() {
  const { m, update, toast, openModal, registerCapture, hydrated, go } = useMission();
  const { back } = useFlow();
  const form = useRef<HTMLFormElement>(null);

  const read = () => Object.fromEntries(new FormData(form.current!)) as Record<string, string>;
  useEffect(() => {
    registerCapture(() => { if (form.current) { const d = read(); update((x) => { Object.assign(x.respondent, d); }); } });
    return () => registerCapture(null);
  }, [registerCapture, update]);

  const save = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const d = read();
    update((x) => { Object.assign(x.respondent, d); x.role = d.role; });
    toast('Your perspective is saved.');
  };

  const r = m.respondent;
  return (
    <>
      <Intro step="PEOPLE & OWNERSHIP" title="Bring the right people into the picture." sub="Start with your perspective. Add colleagues who can explain the work, approve decisions or provide records." />
      <div className="compact-columns">
        <form id="respondent" className="card" ref={form} onSubmit={save} key={hydrated ? 'h' : 's'}>
          <h2>Your perspective</h2>
          <div className="form-grid">
            <Input label="Your name" name="name" defaultValue={r.name} required maxLength={100} />
            <Input label="Designation" name="designation" defaultValue={r.designation} required maxLength={100} />
            <label className="field">Role in this assessment
              <select name="role" defaultValue={r.role}>{ROLES.map((v) => <option key={v}>{v}</option>)}</select>
            </label>
            <Input label="Teams or locations you represent" name="scope" defaultValue={r.scope} placeholder="For example, AP across six depots" maxLength={200} />
          </div>
          <div className="dispatch-intro">
            <h3>Where should your strategy arrive?</h3>
            <p>When your strategy is ready, we’ll automatically send it to your email and, if provided, WhatsApp. These details are for report delivery.</p>
            <div className="form-grid">
              <Input label="Email address" name="email" defaultValue={r.email || m.delivery?.email || ''} type="email" required maxLength={200} autoComplete="email" />
              <Input label="WhatsApp number · optional" name="whatsapp" defaultValue={r.whatsapp || m.delivery?.whatsapp || ''} type="tel" maxLength={24} autoComplete="tel" placeholder="Include country code, e.g. +91" pattern="[+0-9 ()-]{8,24}" />
            </div>
            <p className="micro">UX preview: details are recorded locally; no messages are sent.</p>
          </div>
          <button type="submit" className="btn secondary">Save my perspective ✓</button>
          {r.name && <Status>Saved: {r.name}</Status>}
        </form>
        <div className="card">
          <div className="section-heading">
            <div><h2>People involved</h2><p>Adding a person does not send an invitation.</p></div>
            <Btn kind="secondary" onClick={() => openModal('add-actor')}>+ Add a person</Btn>
          </div>
          {m.actors.length ? (
            <div className="actor-list">
              {m.actors.map((a) => (
                <div key={a.id}>
                  <span className="avatar">{a.name.slice(0, 1)}</span>
                  <div><strong>{a.name}</strong><p>{a.designation} · {a.responsibility}</p></div>
                  <Btn kind="text" onClick={() => openModal('assign', { person: a.id })}>Assign a question</Btn>
                </div>
              ))}
            </div>
          ) : <p className="empty-state">Who approves decisions? Who runs the daily work? Who can provide the records?</p>}
        </div>
      </div>
      {m.tasks.length > 0 && (
        <div className="card">
          <h3>Contributions to follow up</h3>
          {m.tasks.map((t) => (
            <div key={t.id} className="task-row">
              <div><strong>{t.topic}</strong><p>{t.assignee} · {t.status}</p></div>
              <Btn kind="secondary" onClick={() => openModal('task', { id: t.id })}>Review</Btn>
            </div>
          ))}
        </div>
      )}
      <div className="step-actions">
        <Btn kind="text" onClick={back}>← Back</Btn>
        <Btn onClick={() => {
          // Reference `next()` at stage 1, against what is typed now — not the last saved state.
          const d = form.current ? read() : m.respondent;
          if (!(d.name || '').trim() || !(d.designation || '').trim()) { toast('Tell us your name and designation before continuing.'); return; }
          if (form.current && !form.current.reportValidity()) return;
          update((x) => { Object.assign(x.respondent, d); x.role = d.role ?? x.role; });
          go(2);
        }}>Continue to process scope →</Btn>
      </div>
    </>
  );
}
