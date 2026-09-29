'use client';
/**
 * Chapter 8 — Process explorer. Reference `explorer()`, `processSVG()` and
 * `timeline()` in views-intelligence.js, drawing the network the engine
 * reconstructed from the registers (sample or the tenant's own).
 */
import type { KeyboardEvent, MouseEvent } from 'react';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useMission } from '../mission/MissionProvider';
import { processSVG } from '../mission/svg';
import type { Graph } from '../engine/analyse';
import { Intro, Btn, Agent, Status } from '../ui';
import { useFlow } from './flow';
import { CoverageView, RouteReview } from './PathwayViews';
import { useAnalysis } from './useAnalysis';

function Graph({ d }: { d: Graph }) {
  const { m, update } = useMission();
  const inspect = (target: EventTarget) => {
    const g = (target as Element).closest?.('[data-action="inspect-node"]') as HTMLElement | null;
    if (g) update((x) => { x.selectedNode = g.dataset.id || ''; });
  };
  const onKey = (ev: KeyboardEvent) => { if ((ev.key === 'Enter' || ev.key === ' ') && (ev.target as Element).closest('.graph-node')) { ev.preventDefault(); inspect(ev.target); } };
  return <div onClick={(ev: MouseEvent) => inspect(ev.target)} onKeyDown={onKey} dangerouslySetInnerHTML={{ __html: processSVG(d, m) }} />;
}

function Timeline({ d, id }: { d: Graph; id: string }) {
  const { m } = useMission();
  const c = d.cases[id];
  if (!c) return null;
  return (
    <div className="card">
      <div className="eyebrow">CASE TIMELINE / {m.mode === 'sample' ? 'SAMPLE' : 'YOUR REGISTERS'}</div>
      <h2>{c.inv}</h2>
      <p>{c.vendor}</p>
      <div className="case-timeline">
        {c.ev.map(([code, date, gap]) => (
          <div key={code + date}><span className="timeline-dot" /><strong>{d.nodes[code].label}</strong><span>{date}</span>{gap !== undefined && <small>+ {gap} days since previous event</small>}</div>
        ))}
      </div>
      <p className="micro">A case illustrates its path. It does not establish the cause of delay for every case.</p>
    </div>
  );
}

function NotAnalysed() {
  const { m, go, openModal } = useMission();
  const { back, next } = useFlow();
  return (
    <>
      <Intro step="PROCESS EXPLORER" title="Your process description is ready for evidence." sub="Your board describes the work. Observed pathways need validated records and event mappings." />
      <div className="card">
        <h2>What is established</h2>
        <p>{m.board.length} activities · {m.links.length} connections · {m.files.length} attached file summaries</p>
        <p>{m.mapping.note || 'No mapping clarifications recorded.'}</p>
        <div className="notice">{m.process === 'o2c' ? 'The O2C registers are not analysed yet — the engine covers Procure to Pay today.' : 'Your registers have not been analysed. Attach the AP and PO registers on the evidence workspace and confirm the evidence boundary; the pathways are reconstructed from them in this browser.'} No discovered paths or waiting-time claims have been created from your files.</div>
        <Btn kind="secondary" onClick={() => go(6)}>Return to the evidence workspace</Btn>
        <Btn kind="text" onClick={() => go(4)}>My process board</Btn>
        <Btn kind="text" onClick={() => openModal('sample-evidence')}>Explore labelled sample evidence</Btn>
      </div>
      <Agent title="Keep the distinction clear" text="A reported process can be discussed now. An observed process requires evidence. You can continue to review gaps and readiness without invented measurements." />
      <div className="step-actions"><Btn kind="text" onClick={back}>← Back</Btn><Btn onClick={() => next()}>Review hypotheses &amp; evidence gaps →</Btn></div>
    </>
  );
}

export function ExplorerView() {
  const { m, update, go } = useMission();
  const { back, next } = useFlow();
  const q = useAnalysis();
  const sample = m.mode === 'sample';

  return (
    <DataBoundary query={q} label="analysis" skeleton={<SkeletonRows rows={6} />}>
      {(b) => {
        const d = b.graph;
        if (!d) return <NotAnalysed />;
        const variant = d.variants.find((v) => v.id === m.variant);
        const happy = d.variants.find((v) => v.label === 'Happy path') ?? d.variants[0];
        const shown = d.variants.reduce((a, v) => a + v.share, 0);
        const p2p = m.process === 'p2p';
        return (
          <>
            <Intro step="PROCESS EXPLORER" title="Understand every route before choosing what to automate." sub="Start with the whole network. Select each pathway, explain why it exists, and agree its handling. Unresolved routes remain visible in readiness." />
            <div className="source-banner">
              <Status>{p2p ? (sample ? 'P2P reference sample' : 'Your P2P registers') : 'O2C illustrative scenario'}</Status>
              <span>{p2p ? `${d.invoices.toLocaleString('en-IN')} invoices · ${d.distinctVariants} variants · ${d.activities} activities` : '1,800 illustrative invoices · 2 designed variants'}</span>
            </div>
            <CoverageView variants={d.variants} />
            <div className="intelligence-layout pathway-workspace">
              <div>
                <div className="card explorer-card">
                  <div className="section-heading">
                    <div className="segmented">
                      <Btn kind={m.lens === 'frequency' ? 'selected' : ''} onClick={() => update((x) => { x.lens = 'frequency'; })}>Case frequency</Btn>
                      <Btn kind={m.lens === 'waiting' ? 'selected' : ''} onClick={() => update((x) => { x.lens = 'waiting'; })}>Waiting time</Btn>
                    </div>
                    <Btn kind="text" onClick={() => go(4)}>My reported board ↗</Btn>
                  </div>
                  <p className="micro">{p2p ? `The ${sample ? 'sample’s ' : ''}expected route is green; alternate paths are amber. This does not compare against your edited board. Paths with fewer than 400 cases are omitted from this overview.` : 'Invented pathways demonstrate the explorer. They are not findings about your business.'}</p>
                  <Graph d={d} />
                  <div className="map-key"><span>● Expected {sample ? 'sample ' : ''}route</span><span>● Alternate path</span><span>Dashed: terms / lead time</span></div>
                  {m.selectedNode && (
                    <div className="notice"><strong>{d.nodes[m.selectedNode]?.label || 'Activity'}</strong><br />{(d.nodes[m.selectedNode]?.n || 0).toLocaleString('en-IN')} recorded occurrences in {sample ? 'the sample' : p2p ? 'your registers' : 'the illustration'}. Counts can include repeated activities and need not equal unique invoice counts.</div>
                  )}
                </div>
              </div>
              <aside>
                <div className="card">
                  <div className="eyebrow">PATHWAYS</div>
                  <h2>{p2p ? `${happy?.share ?? 0}% follow the ${sample ? 'sample’s ' : ''}expected route.` : 'Some invoices enter a dispute route.'}</h2>
                  <p>Choose a route to isolate its connections and see a case timeline.</p>
                  {d.variants.map((v) => (
                    <button key={v.id} type="button" className={`variant-card ${m.variant === v.id ? 'selected' : ''}`} onClick={() => update((x) => { x.variant = v.id; })}>
                      <strong>{v.label}</strong><span>{v.share}% · {v.cases.toLocaleString('en-IN')} cases</span><small>{v.days} days · invoice → {p2p ? 'paid' : 'cash applied'}</small>
                    </button>
                  ))}
                  {p2p && d.distinctVariants > d.variants.length && <p className="micro">{d.distinctVariants - d.variants.length} other paths account for {Math.max(0, 100 - shown)}%. This view exposes the top five.</p>}
                  {m.variant && <Btn kind="text" onClick={() => update((x) => { x.variant = ''; })}>Show all paths</Btn>}
                </div>
                <RouteReview d={d} />
              </aside>
            </div>
            {variant && <Timeline d={d} id={variant.id} />}
            <Agent title="Does this reflect the way your team works?" text="Explain legitimate exceptions and recording gaps in the findings review. The records and your interpretation stay distinguishable." />
            <div className="step-actions"><Btn kind="text" onClick={back}>← Back</Btn><Btn onClick={() => next()}>Review findings &amp; hypotheses →</Btn></div>
          </>
        );
      }}
    </DataBoundary>
  );
}
