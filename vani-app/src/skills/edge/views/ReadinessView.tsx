'use client';
/** Chapter 10 — Readiness. Reference `readiness()` in views-intelligence.js; the corrective-actions register follows on the same chapter. */
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useMission } from '../mission/MissionProvider';
import { packs } from '../mission/domain';
import { blockers } from '../mission/discovery';
import type { ReadinessStep } from '../mission/reference';
import { Intro, Btn, Agent, Status, Help } from '../ui';
import { useFlow } from './flow';
import { PathwaySummary } from './PathwayViews';
import { useReference, dataFor, type ReferenceBundle } from './useReference';
import { ActionsView } from './FailureViews';

const DIMS: Record<string, string> = { VOL: 'Volume', STD: 'Standardisation', DAT: 'Data', RUL: 'Rule clarity', CMP: 'Conformance' };

function Body({ bundle }: { bundle: ReferenceBundle | undefined }) {
  const { m, openModal } = useMission();
  const { back, next } = useFlow();
  const sample = m.mode === 'sample', p2p = m.process === 'p2p';
  const rows: ReadinessStep[] = sample && p2p && bundle ? bundle.results.readiness.steps
    : packs[m.process].activities.map((name, i) => ({ name, score: null, bandName: sample ? (i === 2 ? 'Fix first' : 'Validate for pilot') : 'Evidence needed', confidence: sample ? 'Illustrative' : 'Not assessed', notes: [] }));
  return (
    <>
      <PathwaySummary d={dataFor(m.process, bundle)} />
      <Intro step="READINESS" title="Readiness starts with understood pathways." sub="Readiness, potential value and confidence answer different questions. Review each activity before choosing an automation scope." />
      <div className="source-banner"><Status>{sample ? (p2p ? 'Original P2P sample scoring' : 'Illustrative O2C readiness') : 'Your preparation readiness'}</Status><span>{sample ? 'Scores describe the reference scenario, not your organisation.' : 'Customer automation readiness is not scored without analysed evidence.'}</span></div>
      <div className="readiness-layout">
        <div>
          {rows.map((r) => (
            <details key={r.name} className="card ready-row">
              <summary><span>{r.name}</span><strong>{r.score === null ? '—' : r.score + ' / 100'}</strong><Status>Reference only · route review required</Status></summary>
              <p>Confidence: {r.confidence || 'Unknown'}</p>
              {r.dimensions && <div className="dimensions">{Object.entries(r.dimensions).map(([k, v]) => <div key={k}><span>{DIMS[k]}</span><strong>{v === null ? 'Unknown' : v}</strong></div>)}</div>}
              <p>{r.notes?.join(' · ') || 'Validate data coverage, rule ownership, integrations and exceptions before deployment.'}</p>
              {sample && p2p && <small>Original sample method: 10% volume, 30% standardisation, 20% data, 10% rule clarity, 30% conformance. Dependencies and gates can cap the result. This scoring method is a prototype, not a validated benchmark.</small>}
            </details>
          ))}
        </div>
        <aside className="card readiness-aside">
          <div className="eyebrow">YOUR MISSION CHECKPOINT</div>
          <h2>Before taking it live</h2>
          <ul className="checklist">{blockers(m).length ? blockers(m).map((v) => <li key={v}>{v}</li>) : <li>Validate customer evidence, integration feasibility and operational ownership.</li>}</ul>
          <h3>Additional implementation checks</h3>
          <p>System access · monitoring · exception ownership · recovery route · team adoption</p>
          <Help topic="readiness gaps" onAssist={(t) => openModal('assist', { topic: t })} />
        </aside>
      </div>
      <Agent title="Let’s connect readiness to your goal" text={(m.goal || m.gains.join(' · ') || 'Agree the desired outcome with your process owner.') + ' The next step compares the potential value with the controls and preparation required.'} />
      <div className="step-actions"><Btn kind="text" onClick={back}>← Back</Btn><Btn onClick={() => next()}>Compare value, risk &amp; opportunity cost →</Btn></div>
      <ActionsView foot={false} />
    </>
  );
}

export function ReadinessView() {
  const { m } = useMission();
  const ref = useReference();
  // The reference is only needed for the sample; own evidence renders without a fetch.
  if (m.mode !== 'sample') return <Body bundle={undefined} />;
  return <DataBoundary query={ref} label="reference sample" skeleton={<SkeletonRows rows={6} />}>{(b) => <Body bundle={b} />}</DataBoundary>;
}
