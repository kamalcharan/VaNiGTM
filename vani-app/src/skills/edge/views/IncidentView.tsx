'use client';
/**
 * What went wrong — reference `incidentView()` in failure.js. Reached two
 * ways: on the readiness mission it follows the discovery checkpoint (still
 * chapter 4); on the failure-review mission it IS chapter 4.
 */
import { useEffect, useRef, type FormEvent } from 'react';
import { useMission } from '../mission/MissionProvider';
import { packs } from '../mission/domain';
import { seedBoard } from '../mission/store';
import { Intro, Input, Area, Btn } from '../ui';
import { Radios } from './controls';

export function IncidentView() {
  const { m, update, go, openModal, registerCapture } = useMission();
  const form = useRef<HTMLFormElement>(null);
  const f = m.failure.incident;

  useEffect(() => {
    registerCapture(() => { if (form.current) { const d = Object.fromEntries(new FormData(form.current)) as Record<string, string>; update((x) => { Object.assign(x.failure.incident, d); }); } });
    return () => registerCapture(null);
  }, [registerCapture, update]);

  const submit = (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const d = Object.fromEntries(new FormData(ev.currentTarget)) as Record<string, string>;
    update((x) => { Object.assign(x.failure.incident, d); x.failureIntake = false; seedBoard(x, packs[x.process].activities); });
    go(4);
  };

  return (
    <>
      <Intro step="WHAT WENT WRONG" title="What breaks today—and what have you tried?" sub="Failures, near misses and workarounds matter whether the process is manual or automated. If none are known, record that explicitly." />
      <div className="discovery-layout">
        <form id="failure-incident" className="card" ref={form} onSubmit={submit}>
          <Radios label="How does this process run today?" name="automation" values={['Manual', 'Partly automated', 'Mostly automated', 'Unknown']} selected={f.automation} />
          <Radios label="What problems have you seen?" name="history" values={['Known failures or recurring exceptions', 'Near misses or workarounds', 'No known failures', 'Not sure']} selected={f.history} />
          <Input label="Failure / concern summary · if applicable" name="title" defaultValue={f.title || ''} maxLength={150} />
          <Area label="What should have happened?" name="expected" defaultValue={f.expected || ''} />
          <Area label="What actually happened?" name="actual" defaultValue={f.actual || ''} />
          <div className="form-grid">
            <Input label="When did this occur?" name="period" defaultValue={f.period || ''} placeholder="Date range / first and last occurrence" />
            <Input label="Affected cases / locations" name="affected" defaultValue={f.affected || ''} />
            <Input label="Incident owner" name="owner" defaultValue={f.owner || ''} />
            <Input label="Estimated business impact" name="impact" defaultValue={f.impact || ''} />
          </div>
          <Radios label="Is the problem still happening?" name="ongoing" values={['Yes', 'No', 'Unknown', 'Not applicable']} selected={f.ongoing} required={false} />
          <Area label="What corrections or workarounds have been tried?" name="containment" defaultValue={f.containment || ''} />
          <Area label="Did those changes work? What evidence supports that?" name="effectiveness" defaultValue={f.effectiveness || ''} />
          <Area label="What do you suspect causes the problem?" name="suspected" defaultValue={f.suspected || ''} />
          <Input label="Earlier assessment / report reference · optional" name="prior" defaultValue={f.prior || ''} />
          <button type="submit" className="btn primary">Save failure context &amp; map the process →</button>
        </form>
        <aside className="card discovery-guide">
          <h2>Why I’m asking</h2>
          <p>Expected versus actual behaviour establishes the investigation boundary. Estimated exposure is not confirmed loss.</p>
          <h3>If the incident is active</h3>
          <p>Involve your operational incident owner. Preserve logs and relevant versions before changes overwrite evidence.</p>
          <p>Edge organises the review. It does not stop services, reverse payments or restart production.</p>
          <Btn kind="secondary" onClick={() => openModal('assign', { topic: 'Confirm the incident scope, impact and containment' })}>Ask a colleague</Btn>
        </aside>
      </div>
      <Btn kind="text" onClick={() => go(Math.max(0, 3 - 1))}>← Back</Btn>
    </>
  );
}
