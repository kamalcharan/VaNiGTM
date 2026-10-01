'use client';
/**
 * Chapter 6 — Rules & systems. Reference `rulesView()` in views-board.js,
 * the rulebook review dialog in main.js, and `changeContext()` in
 * failure.js for the failure mission's "what applied at the time".
 */
import { useEffect, useRef, type FormEvent } from 'react';
import { useMission } from '../mission/MissionProvider';
import { packs, systems } from '../mission/domain';
import { Intro, Input, Area, Btn, Choice, Status, Help } from '../ui';
import { Radios } from './controls';
import { useFlow } from './flow';

function readRules(f: HTMLFormElement) {
  return Object.fromEntries(new FormData(f)) as Record<string, string>;
}

export function RulesView() {
  const { m, update, openModal, registerCapture, hydrated } = useMission();
  const { back } = useFlow();
  const form = useRef<HTMLFormElement>(null);
  const p = packs[m.process];

  const apply = (d: Record<string, string>) => update((x) => {
    x.systemNotes = d.systemNotes ?? x.systemNotes;
    packs[x.process].rules.forEach(([id]) => { x.rules[id] = d['rule_' + id] ?? ''; x.ruleStatus[id] = d['status_' + id] ?? ''; });
  });

  useEffect(() => {
    registerCapture(() => { if (form.current) apply(readRules(form.current)); });
    return () => registerCapture(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [registerCapture]);

  const submit = (ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); apply(readRules(ev.currentTarget)); openModal('rules-review'); };

  return (
    <>
      {m.missionType === 'failure' && <ChangeContext />}
      <Intro step="RULES & SYSTEMS" title="What governs the work—and where does it live?" sub="Confirm the rules with the right people. A missing answer is a question to resolve, not a reason to invent a default." />
      <form id="rules" ref={form} onSubmit={submit} key={hydrated ? 'h' : 's'}>
        <div className="card">
          <h2>The systems behind the process</h2>
          <p>Select the systems and channels involved. Individual activities on your board can name the exact tool.</p>
          <Choice values={systems} selected={m.stack} onToggle={(v) => update((x) => { x.stack = x.stack.includes(v) ? x.stack.filter((s) => s !== v) : [...x.stack, v]; })} />
          <Area label="Where do records, decisions and exceptions live?" name="systemNotes" defaultValue={m.systemNotes} hint="For example, Tally holds invoices; approvals are in email; stores maintains receipts in Excel." />
        </div>
        <div className="rules-grid">
          {p.rules.map(([id, q, sub], i) => (
            <details key={id} className="card rule-card">
              <summary><span className="eyebrow">RULE 0{i + 1}</span><strong>{q}</strong><small>{m.rules[id] ? 'Answer recorded' : 'Needs your answer'}</small></summary>
              <p>{sub}</p>
              <Area label="Your rule" name={'rule_' + id} defaultValue={m.rules[id] || ''} hint="State the rule, or explain what needs confirmation." />
              <Radios label="Answer status" name={'status_' + id} values={['Reported practice', 'Confirmed policy', 'Needs confirmation', 'No defined rule']} selected={m.ruleStatus[id]} required={false} />
              <Btn kind="text" onClick={() => openModal('assign', { topic: q })}>Ask the right person</Btn>
            </details>
          ))}
        </div>
        <div className="step-actions">
          <Btn kind="text" onClick={back}>← Back</Btn>
          <button type="submit" className="btn primary">Review my rulebook →</button>
        </div>
      </form>
      <Help topic="rules and systems" onAssist={(t) => openModal('assist', { topic: t })} />
    </>
  );
}

/** Failure mission, chapter 6: the rules and versions in force when it happened. */
function ChangeContext() {
  const { m, update, toast } = useMission();
  const f = m.failure.incident;
  return (
    <form id="failure-changes" className="card" onSubmit={(ev) => { ev.preventDefault(); const d = Object.fromEntries(new FormData(ev.currentTarget)) as Record<string, string>; update((x) => { Object.assign(x.failure.incident, d); }); toast('Incident context saved.'); }}>
      <h2>What applied when the incident happened?</h2>
      <Area label="Recent system, rule or team changes" name="changes" defaultValue={f.changes || ''} />
      <Input label="Process / automation version at the time" name="version" defaultValue={f.version || ''} />
      <Area label="Rules at incident time versus today" name="historicalRules" defaultValue={f.historicalRules || ''} />
      <button type="submit" className="btn secondary">Save incident context</button>
    </form>
  );
}

export function RulebookDialog() {
  const { m, update, closeModal, go } = useMission();
  return (
    <>
      <p>Confirm what is stated and what still needs another person’s answer.</p>
      {packs[m.process].rules.map(([id, q]) => (
        <div key={id} className="notice"><strong>{q}</strong><p>{m.rules[id] || 'Unanswered'}</p><Status>{m.ruleStatus[id]}</Status></div>
      ))}
      <p>Systems: {m.stack.join(' · ') || 'Not identified'}</p>
      <Btn onClick={() => { update((x) => { x.rulesConfirmed = true; }); closeModal(); go(6); }}>Confirm &amp; prepare evidence →</Btn>
    </>
  );
}
