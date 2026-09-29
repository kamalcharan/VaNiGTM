'use client';
/** Chapter 9 — Findings & hypotheses. Reference `findings()` in views-intelligence.js, over the engine's findings; the causes register follows. */
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useMission } from '../mission/MissionProvider';
import { hypotheses } from '../mission/discovery';
import { findingItems } from '../mission/reference';
import { Intro, Btn, Status } from '../ui';
import { useFlow } from './flow';
import { HypothesesView } from './FailureViews';
import { useAnalysis } from './useAnalysis';

export function FindingsView() {
  const { m, update, openModal } = useMission();
  const { back, next } = useFlow();
  const q = useAnalysis();
  const hs = hypotheses(m);
  const sample = m.mode === 'sample';
  return (
    <>
      <Intro step="FINDINGS & HYPOTHESES" title="What does the evidence explain—and what doesn’t it?" sub="Challenge the interpretation. Business exceptions and missing records matter as much as the visible pattern." />
      <DataBoundary query={q} label="analysis" skeleton={<SkeletonRows rows={4} />}>
        {(b) => {
          const analysed = !!b.graph;
          const items = findingItems(m, b.analysis);
          return (
            <>
              <div className="card">
                <h2>What we set out to investigate</h2>
                {hs.length ? hs.map((h) => (
                  <div key={h.id} className="hyp-row">
                    <span>{h.id}</span>
                    <div><strong>{h.text}</strong><p>From {m.respondent.name || 'your team'}: {h.answer}</p></div>
                    <Status>{sample ? 'Sample can illustrate; yours untested' : analysed ? 'Test against the findings below' : 'Needs your evidence'}</Status>
                  </div>
                )) : <p>No hypotheses recorded yet. Return to discovery to capture your pain and possible explanations.</p>}
              </div>
              {analysed ? (
                <>
                  <div className="source-banner"><Status>{sample ? 'Sample findings · validate against your own process' : 'Findings from your registers · rulebook 0.1.0'}</Status><span>{sample ? 'Responses below annotate the demonstration. They do not confirm customer findings.' : 'Each finding is computed from the files you attached. Your answers record the business context behind the number.'}</span></div>
                  {items.map((f) => (
                    <details key={f.id} className="card anomaly">
                      <summary className="section-heading"><h2>{f.title}</h2><strong className="finding-number">{f.metric}</strong><span className="micro">Explore evidence &amp; explain this finding</span></summary>
                      <p>{f.text}</p>
                      <details><summary>Evidence and interpretation</summary><p>{m.process === 'p2p' ? (sample ? 'Source: the four sample registers, analysed in this browser.' : 'Source: your AP, PO, GRN and vendor registers, analysed in this browser.') : 'Source: invented O2C demonstration.'} The process explorer provides pathway examples. Your stated rules have not been used to recalculate these observations; the rulebook’s declared thresholds were.</p></details>
                      <h3>{f.question}</h3>
                      <div className="chips">
                        {f.options.map((v) => <Btn key={v} kind={m.resolutions[f.id] === v ? 'selected' : 'secondary'} onClick={() => update((x) => { x.resolutions[f.id] = v; })}>{v}</Btn>)}
                      </div>
                      {m.resolutions[f.id] && (
                        <div className="notice"><strong>Context recorded: {m.resolutions[f.id]}</strong><br />{m.resolutions[f.id] === 'Needs confirmation' ? 'Keep this open and request the appropriate evidence.' : 'Carry this explanation into validation. The measurement remains unchanged.'}</div>
                      )}
                      <Btn kind="text" onClick={() => openModal('assign', { topic: f.question })}>Ask a colleague</Btn>
                    </details>
                  ))}
                </>
              ) : (
                <div className="card">
                  <h2>Your hypotheses remain open.</h2>
                  <p>No register has been analysed. The assessment can identify preparation gaps and organise the investigation, but cannot confirm anomalies without the AP and PO registers confirmed on the evidence workspace.</p>
                  <Btn kind="secondary" onClick={() => openModal('assist', { topic: 'validating evidence' })}>Get help validating the evidence</Btn>
                </div>
              )}
            </>
          );
        }}
      </DataBoundary>
      <div className="step-actions"><Btn kind="text" onClick={back}>← Back</Btn><Btn onClick={() => next()}>Review process readiness →</Btn></div>
      <HypothesesView foot={false} />
    </>
  );
}
