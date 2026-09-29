'use client';
/** The board's dialogs — reference `nodeModal` and `linkModal`. */
import type { FormEvent } from 'react';
import { useMission } from '../mission/MissionProvider';
import { removeNode } from '../mission/store';
import { Input, Btn } from '../ui';

const read = (ev: FormEvent<HTMLFormElement>) => { ev.preventDefault(); return Object.fromEntries(new FormData(ev.currentTarget)) as Record<string, string>; };

export function NodeDialog({ id }: { id?: string }) {
  const { m, update, closeModal } = useMission();
  const n = m.board.find((b) => b.id === id) || { id: 'n' + Date.now(), label: '', actor: '', system: '', type: 'activity', input: '', output: '', rule: '', x: 50, y: Math.max(40, ...m.board.map((b) => b.y)) + 150 };
  return (
    <form id="node-form" onSubmit={(ev) => {
      const d = read(ev);
      const next = { ...n, ...d, id: n.id, x: +d.x, y: +d.y };
      update((x) => { const i = x.board.findIndex((b) => b.id === n.id); if (i >= 0) x.board[i] = next; else x.board.push(next); x.boardConfirmed = false; });
      closeModal();
    }}>
      <Input label="Activity name" name="label" defaultValue={n.label} required maxLength={70} />
      <div className="form-grid">
        <label className="field">Type<select name="type" defaultValue={n.type}><option>activity</option><option>decision</option></select></label>
        <Input label="Person / team responsible" name="actor" defaultValue={n.actor} list="people-list" maxLength={100} />
        <datalist id="people-list">{m.actors.map((a) => <option key={a.id} value={a.name}>{a.designation}</option>)}</datalist>
        <Input label="System or channel" name="system" defaultValue={n.system} placeholder="Tally, email, Excel…" maxLength={100} />
        <Input label="Input" name="input" defaultValue={n.input} maxLength={200} />
        <Input label="Output" name="output" defaultValue={n.output} maxLength={200} />
        <Input label="Decision, rule or exception" name="rule" defaultValue={n.rule} maxLength={300} />
        <Input label="Board position X" name="x" defaultValue={n.x} type="number" min={0} max={2000} required />
        <Input label="Board position Y" name="y" defaultValue={n.y} type="number" min={0} max={3000} required />
      </div>
      <button type="submit" className="btn primary">Save activity</button>
      {id && <Btn kind="text" onClick={() => { update((x) => removeNode(x, id)); closeModal(); }}>Remove activity</Btn>}
    </form>
  );
}

export function LinkDialog() {
  const { m, update, closeModal, toast } = useMission();
  return (
    <form id="link-form" onSubmit={(ev) => {
      const d = read(ev);
      if (d.from === d.to) { toast('Choose two different activities. Use a return route between steps.'); return; }
      update((x) => { x.links.push({ from: d.from, to: d.to, label: d.label, kind: d.kind }); x.boardConfirmed = false; });
      closeModal();
    }}>
      <div className="form-grid">
        {(['from', 'to'] as const).map((k) => (
          <label key={k} className="field">{k === 'from' ? 'From activity' : 'To activity'}
            <select name={k}>{m.board.map((n) => <option key={n.id} value={n.id}>{n.label}</option>)}</select>
          </label>
        ))}
      </div>
      <Input label="What takes this route?" name="label" required placeholder="Approved, missing PO, partial delivery…" maxLength={100} />
      <label className="field">Route type
        <select name="kind"><option value="normal">Ordinary route</option><option value="exception">Exception / return</option><option value="parallel">Parallel route</option></select>
      </label>
      <button type="submit" className="btn primary">Add connection →</button>
    </form>
  );
}
