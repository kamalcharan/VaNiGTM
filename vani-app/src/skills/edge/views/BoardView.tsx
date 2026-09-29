'use client';
/**
 * Chapter 5 — Your process board. Reference `boardView()` / `drawBoard()`
 * in views-board.js and the pointer drag in main.js. Dragging moves the card
 * live and commits on release, invalidating the team's confirmation exactly
 * as the prototype does.
 */
import { useRef, useState, type PointerEvent } from 'react';
import { useMission } from '../mission/MissionProvider';
import { Intro, Area, Btn, Agent, Status, Help } from '../ui';
import { useFlow } from './flow';

export function DrawBoard({ readonly = false }: { readonly?: boolean }) {
  const { m, update, openModal } = useMission();
  const [drag, setDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const start = useRef<{ id: string; px: number; py: number; nx: number; ny: number } | null>(null);

  const pos = (id: string) => { const n = m.board.find((b) => b.id === id)!; return drag?.id === id ? drag : { x: n.x, y: n.y }; };

  const down = (ev: PointerEvent<HTMLDivElement>, id: string) => {
    const n = m.board.find((b) => b.id === id)!;
    start.current = { id, px: ev.clientX, py: ev.clientY, nx: n.x, ny: n.y };
    ev.currentTarget.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  };
  const move = (ev: PointerEvent<HTMLDivElement>) => {
    const s = start.current; if (!s) return;
    setDrag({ id: s.id, x: Math.min(2000, Math.max(0, s.nx + ev.clientX - s.px)), y: Math.min(3000, Math.max(0, s.ny + ev.clientY - s.py)) });
  };
  const up = () => {
    const s = start.current; start.current = null;
    if (!s) return;
    const d = drag; setDrag(null);
    update((x) => { const n = x.board.find((b) => b.id === s.id); if (n && d) { n.x = d.x; n.y = d.y; } x.boardConfirmed = false; });
  };

  const width = Math.max(820, ...m.board.map((n) => pos(n.id).x + 240));
  const height = Math.max(400, ...m.board.map((n) => pos(n.id).y + 140));

  return (
    <div className="board-scroll" tabIndex={0} aria-label="Process board; scroll to explore">
      <div className="board-canvas" style={{ width, height }}>
        <svg className="board-lines" width={width} height={height} aria-hidden="true">
          <defs>
            <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#83a083" /></marker>
          </defs>
          {m.links.map((l, i) => {
            const a = m.board.find((n) => n.id === l.from), b = m.board.find((n) => n.id === l.to);
            if (!a || !b) return null;
            const pa = pos(a.id), pb = pos(b.id);
            const x = pa.x + 105, y = pa.y + 102, tx = pb.x + 105, ty = pb.y;
            return (
              <g key={i}>
                <path d={`M${x} ${y} C${x} ${y + 40},${tx} ${ty - 40},${tx} ${ty}`} fill="none" stroke={l.kind === 'exception' ? '#b88a39' : '#88a485'} strokeWidth="2" markerEnd="url(#arrow)" strokeDasharray={l.kind === 'exception' ? '6 4' : undefined} />
                <text x={(x + tx) / 2} y={(y + ty) / 2 - 4} textAnchor="middle" fill="#7d856f" fontSize="10">{l.label}</text>
              </g>
            );
          })}
        </svg>
        {m.board.map((n) => {
          const p = pos(n.id);
          return (
            <div key={n.id} className={`board-node ${n.type === 'decision' ? 'decision' : ''}`} style={{ left: p.x, top: p.y }} data-node={n.id}>
              {!readonly && (
                <div className="drag-handle" title="Drag activity" onPointerDown={(ev) => down(ev, n.id)} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>⠿ <span>{n.type}</span></div>
              )}
              <button type="button" onClick={() => openModal('node', { id: n.id })} disabled={readonly}>
                <strong>{n.label}</strong><small>{n.actor || 'Owner to confirm'} · {n.system || 'System to confirm'}</small>
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BoardView({ title = 'Show me how the work happens.' }: { title?: string }) {
  const { m, update, openModal, toast, go } = useMission();
  const { back } = useFlow();
  const label = (id: string) => m.board.find((n) => n.id === id)?.label;
  return (
    <>
      <Intro step="YOUR PROCESS BOARD" title={title} sub="This is your reported process. Add the ordinary route, decisions, returns and legitimate exceptions before we compare it with records." />
      <div className="board-toolbar">
        <div><Status>{m.boardConfirmed ? 'Confirmed by your team' : 'Working description'}</Status><span className="micro">Drag the handle to move an activity. Select a card to edit it.</span></div>
        <div><Btn kind="secondary" onClick={() => openModal('node')}>+ Activity</Btn><Btn kind="secondary" onClick={() => openModal('link')}>+ Connection</Btn></div>
      </div>
      <DrawBoard />
      <div className="card">
        <h3>Look for what the picture leaves out.</h3>
        <div className="prompt-grid">
          <p>↳ What happens when information is missing?</p><p>↳ Can work happen in parallel?</p>
          <p>↳ Where does rejected work return?</p><p>↳ Who handles an urgent or unusual case?</p>
        </div>
        <Area label="What did this view help you notice?" name="context" defaultValue={m.context} hint="Add a missing pathway, an exception or a question for a colleague." onChange={(ev) => { const v = ev.currentTarget.value; update((x) => { x.context = v; }); }} />
        <details>
          <summary>Review the connections as a list</summary>
          {m.links.map((l, i) => (
            <div key={i} className="task-row">
              <span>{label(l.from)} → {label(l.to)}<small> · {l.label} · {l.kind}</small></span>
              <Btn kind="text" onClick={() => update((x) => { x.links.splice(i, 1); x.boardConfirmed = false; })}>Remove</Btn>
            </div>
          ))}
        </details>
      </div>
      <Agent title="A description we can challenge together" text="The initial activities are a starting template. Your edits describe your process; they do not rewrite observed records. Later we’ll compare both views." />
      <Help topic="the process board" onAssist={(t) => openModal('assist', { topic: t })} />
      <div className="step-actions">
        <Btn kind="text" onClick={back}>← Back</Btn>
        <Btn onClick={() => { if (!m.board.length) { toast('Add at least one activity.'); return; } update((x) => { x.boardConfirmed = true; }); go(5); }}>Confirm this process →</Btn>
      </div>
    </>
  );
}
