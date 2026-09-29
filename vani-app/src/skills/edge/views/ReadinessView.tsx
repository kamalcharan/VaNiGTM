'use client';
/** Chapter 10 — Readiness. Reference `readiness()` in views-intelligence.js, scored by the engine; the corrective-actions register follows. */
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useMission } from '../mission/MissionProvider';
import { packs } from '../mission/domain';
import { blockers } from '../mission/discovery';
import type { ReadinessStep } from '../engine/analyse';
import { Intro, Btn, Agent, Status, Help } from '../ui';
import { useFlow } from './flow';
import { PathwaySummary } from './PathwayViews';
import { useAnalysis, type AnalysisBundle } from './useAnalysis';
import { ActionsView } from './FailureViews';

const DIMS: Record<string, string> = { VOL: 'Volume', STD: 'Standardisation', DAT: 'Data', RUL: 'Rule clarity', CMP: 'Conformance' };

type Row = { name: string; score: number | null; bandName: string; confidence: string; notes: string[]; dimensions?: ReadinessStep['dimensions'] };

function Body({ b }: { b: AnalysisBundle }) {
  const { m, openModal } = useMission();
  const { back, next } = useFlow();
  const sample = m.mode === 'sample', p2p = m.process === 'p2p', scored = !!b.analysis;
  const rows: Row[] = scored ? b.analysis!.readiness.steps
    : packs[m.process].activities.map((name, i) => ({ name, score: null, bandName: b.graph ? (i === 2 ? 'Fix first' : 'Validate for pilot') : 'Evidence needed', confidence: b.graph ? 'Illustrative' : 'Not assessed', notes: [] }));
  return (
    <>
      <PathwaySummary d={b.graph} />
      <Intro step="READINESS" title="Readiness starts with understood pathways." sub="Readiness, potential value and confidence answer different questions. Review each activity before choosing an automation scope." />
      <div className="source-banner">
        <Status>{scored ? (sample ? 'P2P sample scoring' : 'Scored from your registers') : b.graph ? 'Illustrative O2C readiness' : 'Your preparation readiness'}</Status>
        <span>{scored ? (sample ? 'Scores describe the reference scenario, not your organisation.' : `Scores are computed from the registers you attached (${b.analysis!.meta.months} months of invoices). Validate the rulebook’s thresholds before acting on them.`) : 'Customer automation readiness is not scored without analysed evidence.'}</span>
      </div>
      <div className="readiness-layout">
        <div>
          {rows.map((r) => (
            <details key={r.name} className="card ready-row">
              <summary><span>{r.name}</span><strong>{r.score === null ? '—' : r.score + ' / 100'}</strong><Status>{scored ? 'Route review required' : 'Reference only · route review required'}</Status></summary>
              <p>Confidence: {r.confidence || 'Unknown'}</p>
              {r.dimensions && <div className="dimensions">{Object.entries(r.dimensions).map(([k, v]) => <div key={k}><span>{DIMS[k]}</span><strong>{v === null ? 'Unknown' : v}</strong></div>)}</div>}
              <p>{r.notes?.join(' · ') || 'Validate data coverage, rule ownership, integrations and exceptions before deployment.'}</p>
              {scored && p2p && <small>Method: 10% volume, 30% standardisation, 20% data, 10% rule clarity, 30% conformance. Dependencies and gates can cap the result. This scoring method is a prototype, not a validated benchmark.</small>}
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
  const q = useAnalysis();
  return <DataBoundary query={q} label="analysis" skeleton={<SkeletonRows rows={6} />}>{(b) => <Body b={b} />}</DataBoundary>;
}
