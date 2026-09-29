'use client';
/** Chapter 8 — Process explorer. Reference `explorer()`, `processSVG()` and `timeline()` in views-intelligence.js. */
import type { KeyboardEvent, MouseEvent } from 'react';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useMission } from '../mission/MissionProvider';
import { processSVG } from '../mission/svg';
import type { ReferenceData } from '../mission/reference';
import { Intro, Btn, Agent, Status } from '../ui';
import { useFlow } from './flow';
import { CoverageView, RouteReview } from './PathwayViews';
import { useReference, dataFor } from './useReference';

function Graph({ d }: { d: ReferenceData }) {
  const { m, update } = useMission();
  const inspect = (target: EventTarget) => {
    const g = (target as Element).closest?.('[data-action="inspect-node"]') as HTMLElement | null;
    if (g) update((x) => { x.selectedNode = g.dataset.id || ''; });
  };
  const onKey = (ev: KeyboardEvent) => { if ((ev.key === 'Enter' || ev.key === ' ') && (ev.target as Element).closest('.graph-node')) { ev.preventDefault(); inspect(ev.target); } };
  return <div onClick={(ev: MouseEvent) => inspect(ev.target)} onKeyDown={onKey} dangerouslySetInnerHTML={{ __html: processSVG(d, m) }} />;
}

function Timeline({ d, id }: { d: ReferenceData; id: string }) {
  const c = d.cases[id];
  if (!c) return null;
  return (
    <div className="card">
      <div className="eyebrow">CASE TIMELINE / SAMPLE</div>
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

export function ExplorerView() {
  const { m, update, go, openModal } = useMission();
  const { back, next } = useFlow();
  const ref = useReference();

  if (m.mode !== 'sample') {
    return (
      <>
        <Intro step="PROCESS EXPLORER" title="Your process description is ready for evidence." sub="Your board describes the work. Observed pathways need validated records and event mappings." />
        <div className="card">
          <h2>What is established</h2>
          <p>{m.board.length} activities · {m.links.length} connections · {m.files.length} attached file summaries</p>
          <p>{m.mapping.note || 'No mapping clarifications recorded.'}</p>
          <div className="notice">Customer-data mining is not connected in this UX preview. No discovered paths or waiting-time claims have been created from your files.</div>
          <Btn kind="secondary" onClick={() => go(4)}>Return to my process board</Btn>
          <Btn kind="text" onClick={() => openModal('sample-evidence')}>Explore labelled sample evidence</Btn>
        </div>
        <Agent title="Keep the distinction clear" text="A reported process can be discussed now. An observed process requires evidence. You can continue to review gaps and readiness without invented measurements." />
        <div className="step-actions"><Btn kind="text" onClick={back}>← Back</Btn><Btn onClick={() => next()}>Review hypotheses &amp; evidence gaps →</Btn></div>
      </>
    );
  }

  return (
    <DataBoundary query={ref} label="reference sample" skeleton={<SkeletonRows rows={6} />}>
      {(bundle) => {
        const d = dataFor(m.process, bundle)!;
        const variant = d.variants.find((v) => v.id === m.variant);
        return (
          <>
            <Intro step="PROCESS EXPLORER" title="Understand every route before choosing what to automate." sub="Start with the whole network. Select each pathway, explain why it exists, and agree its handling. Unresolved routes remain visible in readiness." />
            <div className="source-banner"><Status>{m.process === 'p2p' ? 'P2P reference sample' : 'O2C illustrative scenario'}</Status><span>{m.process === 'p2p' ? '12,640 invoices · 47 variants · 13 activities' : '1,800 illustrative invoices · 2 designed variants'}</span></div>
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
                  <p className="micro">{m.process === 'p2p' ? 'The sample’s expected route is green; alternate sample paths are amber. This does not compare against your edited board. Paths with fewer than 400 cases are omitted from this overview.' : 'Invented pathways demonstrate the explorer. They are not findings about your business.'}</p>
                  <Graph d={d} />
                  <div className="map-key"><span>● Expected sample route</span><span>● Alternate path</span><span>Dashed: terms / lead time</span></div>
                  {m.selectedNode && (
                    <div className="notice"><strong>{d.nodes[m.selectedNode]?.label || 'Activity'}</strong><br />{(d.nodes[m.selectedNode]?.n || 0).toLocaleString('en-IN')} recorded occurrences in the {m.process === 'p2p' ? 'sample' : 'illustration'}. Counts can include repeated activities and need not equal unique invoice counts.</div>
                  )}
                </div>
              </div>
              <aside>
                <div className="card">
                  <div className="eyebrow">PATHWAYS</div>
                  <h2>{m.process === 'p2p' ? '38% follow the sample’s expected route.' : 'Some invoices enter a dispute route.'}</h2>
                  <p>Choose a route to isolate its connections and see a case timeline.</p>
                  {d.variants.map((v) => (
                    <button key={v.id} type="button" className={`variant-card ${m.variant === v.id ? 'selected' : ''}`} onClick={() => update((x) => { x.variant = v.id; })}>
                      <strong>{v.label}</strong><span>{v.share}% · {v.cases.toLocaleString('en-IN')} cases</span><small>{v.days} days · invoice → {m.process === 'p2p' ? 'paid' : 'cash applied'}</small>
                    </button>
                  ))}
                  {m.process === 'p2p' && <p className="micro">42 other paths account for 16%. This preview exposes the original mission’s top five.</p>}
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
