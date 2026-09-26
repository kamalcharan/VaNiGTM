'use client';
/**
 * /smart-profile/knowledge-graph — how what VaNi knows connects.
 *
 * The same graph the Knowledge page lists, drawn: every node in a column for
 * its kind, every relationship as a line between two of them. Pick a node and
 * its relationships light up and read as sentences beside it ("Ledgerline
 * SOLVES Missed renewals"), each with the source the ends were read from.
 *
 * Read-only on purpose. The graph is fed by reading, and corrected by teaching
 * VaNi the right thing; a hand-edited node would be the one fact with no
 * source behind it. No layout library: columns by kind and cubic curves are
 * enough to read a tenant's graph, and stay legible in both themes.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import s from '../smart-profile.module.css';
import g from '../knowledge-graph.module.css';
import { isReading, useKnowledgeGraph, useSourcesRead, KIND_LABELS, RELATION_WORDS, type KgEdge, type KgNode, type Knowledge } from '../useKnowledge';

/** Columns, left to right: what you sell → who → what hurts → why you → proof. */
const COLUMNS: string[][] = [
  ['Product', 'Feature', 'Pricing'],
  ['ICP', 'Industry'],
  ['PainPoint', 'UseCase'],
  ['Differentiator', 'Competitor', 'Team'],
  ['CaseStudy', 'Metric'],
];
const kind = (l: string) => KIND_LABELS[l] ?? l;
const verb = (r: string) => RELATION_WORDS[r] ?? r.toLowerCase().replace(/_/g, ' ');

const W = 1180, COL_W = W / COLUMNS.length, NODE_H = 38, NODE_GAP = 10, TOP = 64, PAD = 14, MIN_H = 280;

interface Placed { node: KgNode; x: number; y: number; w: number; }

function layout(nodes: KgNode[]): { placed: Placed[]; height: number } {
  const placed: Placed[] = [];
  let height = TOP;
  COLUMNS.forEach((labels, ci) => {
    const inCol = nodes.filter((n) => labels.includes(n.label)).sort((a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name));
    let y = TOP;
    for (const node of inCol) { placed.push({ node, x: ci * COL_W + PAD, y, w: COL_W - PAD * 2 }); y += NODE_H + NODE_GAP; }
    height = Math.max(height, y);
  });
  // Kinds outside the five columns land in the last one so nothing is hidden.
  const known = new Set(COLUMNS.flat());
  let y = height;
  for (const node of nodes.filter((n) => !known.has(n.label))) { placed.push({ node, x: (COLUMNS.length - 1) * COL_W + PAD, y, w: COL_W - PAD * 2 }); y += NODE_H + NODE_GAP; }
  return { placed, height: Math.max(y, height, MIN_H) + PAD };
}

export default function KnowledgeGraphScreen() {
  const sources = useSourcesRead();
  const reading = !!sources.data?.data?.some(isReading);
  const q = useKnowledgeGraph(null, reading);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  const data = q.data?.data;
  const { placed, height } = useMemo(() => layout(data?.nodes ?? []), [data?.nodes]);
  const byId = useMemo(() => new Map(placed.map((p) => [p.node.id, p])), [placed]);
  const edges = useMemo(() => (data?.edges ?? []).filter((e) => byId.has(e.from_node_id) && byId.has(e.to_node_id)), [data?.edges, byId]);
  const focus = hover ?? picked;
  const lit = useMemo(() => {
    if (!focus) return null;
    const ids = new Set<string>([focus]);
    for (const e of edges) if (e.from_node_id === focus || e.to_node_id === focus) { ids.add(e.from_node_id); ids.add(e.to_node_id); }
    return ids;
  }, [focus, edges]);
  const pickedNode = picked ? byId.get(picked)?.node ?? null : null;
  const pickedEdges = picked ? edges.filter((e) => e.from_node_id === picked || e.to_node_id === picked) : [];

  const sentence = (e: KgEdge) => {
    const a = byId.get(e.from_node_id)!.node, b = byId.get(e.to_node_id)!.node;
    return { a, b, text: `${a.name} ${verb(e.relationship)} ${b.name}` };
  };

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <div className={s.eyebrow}>// SMART PROFILE · KNOWLEDGE GRAPH</div>
          <h1 className={s.title}>How it connects</h1>
          <p className={s.lede}>What you sell, who it is for, what hurts them, why you, and the proof — and every relationship VaNi read between them. Pick a node to read its relationships as sentences. The list of entries is under <Link href="/smart-profile/knowledge">Knowledge</Link>; to change the graph, teach VaNi there.</p>
        </div>
      </header>

      <DataBoundary query={q} label="the graph" skeleton={<SkeletonRows rows={6} lines={2} />}
        isEmpty={(d: Knowledge | undefined) => !d?.nodes?.length}
        empty="Nothing to draw yet. Teach VaNi under Knowledge — point it at your website or paste what you have — and the entries and their relationships appear here.">
        {(d: Knowledge) => (
          <>
            <div className={g.stats}>
              <span className={`${u.tag} ${u.tagOk}`}>{d.total} entries</span>
              <span className={`${u.tag} ${u.tagOk}`}>{edges.length} relationships</span>
              {d.edges.length > edges.length && <span className={`${u.tag} ${u.tagDim}`}>{d.edges.length - edges.length} not drawn — an end is outside the first {d.nodes.length} entries</span>}
              {edges.length === 0 && <span className={`${u.tag} ${u.tagWarn}`}>no relationships recorded yet — the extractor writes them when a page states one</span>}
              {reading && <span className={`${u.tag} ${u.tagWarn}`}>reading — this redraws as entries land</span>}
            </div>

            <div className={g.split}>
              <div className={g.canvasWrap}>
                <svg className={g.canvas} width={W} height={height} viewBox={`0 0 ${W} ${height}`} role="img" aria-label="Knowledge graph">
                  <defs>
                    <marker id="kg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className={g.arrow} /></marker>
                  </defs>
                  {COLUMNS.map((labels, ci) => (
                    // One kind per line: five columns at 236px do not fit three kinds on one.
                    <text key={ci} x={ci * COL_W + PAD} y={20} className={g.colHead}>
                      {labels.map((l, li) => <tspan key={l} x={ci * COL_W + PAD} dy={li === 0 ? 0 : 13} className={d.nodes.some((n) => n.label === l) ? '' : g.colHeadDim}>{kind(l)}</tspan>)}
                    </text>
                  ))}
                  {edges.map((e) => {
                    const a = byId.get(e.from_node_id)!, b = byId.get(e.to_node_id)!;
                    const forward = b.x >= a.x;
                    const x1 = forward ? a.x + a.w : a.x, x2 = forward ? b.x : b.x + b.w;
                    const y1 = a.y + NODE_H / 2, y2 = b.y + NODE_H / 2;
                    const same = a.x === b.x;
                    const dx = same ? 40 : Math.max(40, Math.abs(x2 - x1) / 2);
                    const d = same
                      ? `M${a.x + a.w},${y1} C${a.x + a.w + dx},${y1} ${b.x + b.w + dx},${y2} ${b.x + b.w},${y2}`
                      : `M${x1},${y1} C${x1 + (forward ? dx : -dx)},${y1} ${x2 - (forward ? dx : -dx)},${y2} ${x2},${y2}`;
                    const on = lit ? lit.has(e.from_node_id) && lit.has(e.to_node_id) && (e.from_node_id === focus || e.to_node_id === focus) : false;
                    const dim = lit ? !on : false;
                    return <path key={e.id} d={d} className={`${g.edge} ${on ? g.edgeOn : ''} ${dim ? g.edgeDim : ''}`} markerEnd="url(#kg-arrow)"><title>{sentence(e).text}</title></path>;
                  })}
                  {placed.map(({ node, x, y, w }) => {
                    const on = lit?.has(node.id) ?? false;
                    const dim = lit ? !on : false;
                    const isPicked = picked === node.id;
                    return (
                      <g key={node.id} className={`${g.node} ${g[`k_${node.label}`] ?? ''} ${on ? g.nodeOn : ''} ${dim ? g.nodeDim : ''} ${isPicked ? g.nodePicked : ''}`}
                        transform={`translate(${x},${y})`} tabIndex={0} role="button" aria-pressed={isPicked}
                        onMouseEnter={() => setHover(node.id)} onMouseLeave={() => setHover(null)}
                        onClick={() => setPicked(isPicked ? null : node.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPicked(isPicked ? null : node.id); } }}>
                        <rect width={w} height={NODE_H} rx={8} />
                        <text x={10} y={NODE_H / 2 + 4} className={g.nodeText}>{node.name.length > 30 ? `${node.name.slice(0, 29)}…` : node.name}</text>
                        <title>{node.label} · {node.name}{node.description ? ` — ${node.description}` : ''}</title>
                      </g>
                    );
                  })}
                </svg>
              </div>

              <aside className={g.side}>
                {!pickedNode ? (
                  <div className={g.sideEmpty}>
                    <div className={u.cardMeta}>PICK A NODE</div>
                    <p>Hover to see what it connects to; click to read the relationships as sentences and where each end was read.</p>
                    <div className={g.legend}>
                      {Object.entries(RELATION_WORDS).map(([k, v]) => <span key={k} className={g.legendRow}><code>{k}</code><span>{v}</span></span>)}
                    </div>
                  </div>
                ) : (
                  <div>
                    <div className={u.cardMeta}>{pickedNode.label} · {kind(pickedNode.label)}</div>
                    <h2 className={g.sideName}>{pickedNode.name}</h2>
                    {pickedNode.description && <p className={g.sideDesc}>{pickedNode.description}</p>}
                    <div className={g.sideMeta}>{pickedNode.source_name ? `read from ${pickedNode.source_name}` : 'from the conversation'}</div>
                    <div className={u.cardMeta} style={{ marginTop: 14 }}>RELATIONSHIPS · {pickedEdges.length}</div>
                    {pickedEdges.length === 0 ? (
                      <p className={g.sideDesc}>Nothing recorded between this and the rest yet. The extractor writes a relationship only when a page states one.</p>
                    ) : (
                      <ul className={g.rels}>
                        {pickedEdges.map((e) => { const { a, b, text } = sentence(e); const other = a.id === picked ? b : a; return (
                          <li key={e.id} className={g.rel}>
                            <button type="button" className={g.relBtn} onClick={() => setPicked(other.id)}>{text}</button>
                            <span className={g.relMeta}>{kind(other.label)}{other.source_name ? ` · read from ${other.source_name}` : ''}</span>
                          </li>
                        ); })}
                      </ul>
                    )}
                    <button type="button" className={`${u.tag} ${u.tagDim}`} style={{ marginTop: 12, cursor: 'pointer', font: 'inherit', fontSize: 11 }} onClick={() => setPicked(null)}>Clear</button>
                  </div>
                )}
              </aside>
            </div>

            <section className={s.section} style={{ marginTop: 18 }}>
              <header className={s.sectionHead}>
                <div className={s.sectionTitles}>
                  <h2 className={s.sectionTitle}>Every relationship, in words</h2>
                  <p className={s.sectionWhat}>The same edges as sentences, so the graph can be read without the picture.</p>
                </div>
              </header>
              <div className={s.sectionBody}>
                {edges.length === 0 ? <p className={g.sideDesc}>None yet.</p> : (
                  <ul className={g.rels}>
                    {edges.map((e) => { const { a, text } = sentence(e); return (
                      <li key={e.id} className={g.rel}><button type="button" className={g.relBtn} onClick={() => setPicked(a.id)}>{text}</button></li>
                    ); })}
                  </ul>
                )}
              </div>
            </section>
          </>
        )}
      </DataBoundary>
    </div>
  );
}
