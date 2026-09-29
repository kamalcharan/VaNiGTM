'use client';
/** Chapter 3 — Process & scope. Reference `scope()` in views-context.js. */
import { useMission } from '../mission/MissionProvider';
import { processes } from '../mission/domain';
import type { ProcessId } from '../mission/types';
import { switchedProcess } from '../mission/store';
import { Intro, Btn, Status } from '../ui';
import { useFlow } from './flow';

export function ScopeView() {
  const { m, replace, openModal } = useMission();
  const { back, next } = useFlow();

  const select = (id: ProcessId) => {
    if (id === m.process) return;
    if (m.furthest > 2) { openModal('switch-process', { id }); return; }
    replace(switchedProcess(m, id));
  };

  return (
    <>
      <Intro step="PROCESS & SCOPE" title="Which process are we understanding?" sub="Set a useful boundary. We’ll investigate the people, handoffs, rules and exceptions inside it." />
      <div className="choice-grid">
        {(Object.keys(processes) as ProcessId[]).map((id) => {
          const p = processes[id];
          return (
            <button key={id} type="button" className={`choice ${id === m.process ? 'selected' : ''}`} onClick={() => select(id)} aria-pressed={id === m.process}>
              <div className="choice-top"><span className="tile-icon">{id === 'p2p' ? '↙' : '↗'}</span><span className="radio">{id === m.process ? '✓' : ''}</span></div>
              <h2>{p.name}</h2>
              <p>{p.description}</p>
            </button>
          );
        })}
      </div>
      <div className="card">
        <h3>Keep the assessment grounded</h3>
        <p>Your perspective covers <strong>{m.respondent.scope || 'the scope you will confirm with your team'}</strong>. Different entities, locations or transaction types can follow different rules. Capture those differences on the board.</p>
        <Status>Changing process resets process-specific answers</Status>
      </div>
      <div className="step-actions">
        <Btn kind="text" onClick={back}>← Back</Btn>
        <Btn onClick={() => next()}>Explore the pain and desired gains →</Btn>
      </div>
    </>
  );
}
