'use client';
/** Chapter 2's dialogs — reference `actorModal`, `assign`, `taskModal` and the switch-process confirm. */
import type { FormEvent } from 'react';
import { useMission } from '../mission/MissionProvider';
import { switchedProcess } from '../mission/store';
import type { ProcessId } from '../mission/types';
import { Input, Area, Btn, Status } from '../ui';

const read = (ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); return Object.fromEntries(new FormData(ev.currentTarget)) as Record<string, string>; };

export function AddActorDialog() {
  const { update, closeModal } = useMission();
  return (
    <form id="actor-form" onSubmit={(ev) => { const d = read(ev); update((x) => { x.actors.push({ id: 'a' + Date.now(), name: d.name, designation: d.designation, responsibility: d.responsibility, email: d.email }); }); closeModal(); }}>
      <Input label="Name" name="name" required maxLength={100} />
      <Input label="Designation" name="designation" required maxLength={100} />
      <Input label="Responsibility in this process" name="responsibility" required placeholder="Approvals, receiving, data export…" maxLength={200} />
      <Input label="Email · optional for an invitation draft" name="email" type="email" />
      <button type="submit" className="btn primary">Add to the process →</button>
      <p className="micro">No message will be sent.</p>
    </form>
  );
}

export function AssignDialog({ topic, person }: { topic?: string; person?: string }) {
  const { m, update, openModal } = useMission();
  if (!m.actors.length) {
    return (
      <>
        <p>Prepare a specific contribution request. The person gets a question and the relevant process context when you share the draft.</p>
        <p>Add a process participant before assigning a contribution.</p>
        <Btn onClick={() => openModal('add-actor')}>Add a person</Btn>
      </>
    );
  }
  return (
    <>
      <p>Prepare a specific contribution request. The person gets a question and the relevant process context when you share the draft.</p>
      <form id="task-form" onSubmit={(ev) => {
        const d = read(ev);
        const who = m.actors.find((a) => a.id === d.person)!;
        const id = 't' + Date.now();
        update((x) => { x.tasks.push({ id, topic: d.topic, context: d.context, assignee: who.name, person: who.id, status: 'Awaiting response' }); });
        openModal('task', { id });
      }}>
        <Input label="Question or evidence needed" name="topic" defaultValue={topic || 'Confirm this part of the process'} required maxLength={500} />
        <label className="field">Assign to
          <select name="person" defaultValue={person}>{m.actors.map((a) => <option key={a.id} value={a.id}>{a.name} · {a.designation}</option>)}</select>
        </label>
        <Area label="Context to include" name="context" hint="Explain what is already known and what needs clarification." />
        <button type="submit" className="btn primary">Prepare contribution request →</button>
        <p className="micro">This creates a local task and downloadable request. Invitations and shared accounts are not connected.</p>
      </form>
    </>
  );
}

export function TaskDialog({ id }: { id: string }) {
  const { m, update, closeModal, download } = useMission();
  const t = m.tasks.find((x) => x.id === id);
  if (!t) return <p>This contribution no longer exists.</p>;
  return (
    <>
      <p><strong>{t.topic}</strong></p>
      <p>{t.context}</p>
      <Status>{t.status}</Status>
      <Btn kind="secondary" onClick={() => download('edge-contribution-request.txt', `Contribution request for ${t.assignee}\n${m.company} / ${m.process.toUpperCase()}\n\nQuestion: ${t.topic}\nContext: ${t.context}\n\nPlease share your answer and its basis with ${m.respondent.name || 'the assessment owner'}.\nThis draft has not been sent. It does not grant access to the assessment.`)}>Download invitation draft ↓</Btn>
      <form id="response-form" onSubmit={(ev) => { const d = read(ev); update((x) => { const row = x.tasks.find((y) => y.id === id)!; Object.assign(row, d, { recordedBy: x.respondent.name }); }); closeModal(); }}>
        <Area label="Record the response when you receive it" name="response" defaultValue={t.response || ''} hint="This records a response locally; it does not impersonate an invited user." />
        <label className="field">Status
          <select name="status" defaultValue={t.status}>{['Awaiting response', 'Needs reconciliation', 'Resolved'].map((v) => <option key={v}>{v}</option>)}</select>
        </label>
        <button type="submit" className="btn primary">Save contribution</button>
      </form>
    </>
  );
}

export function SwitchProcessDialog({ id }: { id: ProcessId }) {
  const { m, replace, closeModal } = useMission();
  return (
    <>
      <p>This starts a new process investigation. Company context and people remain; process answers, board and evidence summaries are reset.</p>
      <Btn onClick={() => { replace(switchedProcess(m, id)); closeModal(); }}>Switch process</Btn>
    </>
  );
}
