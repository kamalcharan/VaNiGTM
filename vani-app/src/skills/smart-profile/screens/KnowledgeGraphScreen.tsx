'use client';
/**
 * /smart-profile/knowledge-graph — how what VaNi knows connects.
 *
 * The same graph the Knowledge page lists, drawn: every node in a column for
 * its kind, every relationship as a line between two of them. Pick a node and
 * its relationships read as sentences beside it ("Ledgerline SOLVES Missed
 * renewals"), each with the source the ends were read from.
 *
 * It has to stay readable as the graph grows (Charan, 2026-09-26: "very big
 * and not clear … when KG grows its almost impossible"), so:
 *
 *   · FOCUS is the default once the graph is big: the picked node and what
 *     it touches, one or two hops, nothing else. "Whole graph" is a choice.
 *   · Search finds a node by name and focuses it.
 *   · Kinds can be hidden; a column with nothing in it is not drawn.
 *   · Zoom: fit to width, or 1:1 and scroll.
 *
 * Entries can be corrected here (name, description) or removed — a person's
 * wording wins over the next read. The kind is never changed by hand.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import s from '../smart-profile.module.css';
import g from '../knowledge-graph.module.css';
import { NodeEditor } from './NodeEditor';
import { ReadingProgress } from './ReadingProgress';
import { isReading, useKnowledgeGraph, useSourcesRead, RELATION_WORDS, type KgEdge, type Knowledge } from '../useKnowledge';
import { KgCanvas, kind, layout, verb } from './KgCanvas';

/** Above this many visible nodes the whole graph is not the default view. */
const BIG = 24;

export default function KnowledgeGraphScreen() {
  const sources = useSourcesRead();
  const readingSources = (sources.data?.data ?? []).filter(isReading);
  const reading = readingSources.length > 0;
  const q = useKnowledgeGraph(null, reading);
  const data = q.data?.data;
  const all = useMemo(() => data?.nodes ?? [], [data?.nodes]);
  const allEdges = useMemo(() => data?.edges ?? [], [data?.edges]);

  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [mode, setMode] = useState<'focus' | 'whole' | null>(null);   // null = decide from size
  const [hops, setHops] = useState<1 | 2>(1);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [fit, setFit] = useState(true);
  const [editing, setEditing] = useState(false);

  const isBig = all.length > BIG;
  const effectiveMode: 'focus' | 'whole' = mode ?? (isBig ? 'focus' : 'whole');

  // A big graph opens focused on the most connected node, so the first thing
  // on screen is a readable neighbourhood rather than a wall.
  useEffect(() => {
    if (picked && all.some((n) => n.id === picked)) return;
    if (!all.length) return;
    const degree = new Map<string, number>();
    for (const e of allEdges) { degree.set(e.from_node_id, (degree.get(e.from_node_id) ?? 0) + 1); degree.set(e.to_node_id, (degree.get(e.to_node_id) ?? 0) + 1); }
    const top = [...all].sort((a, b) => (degree.get(b.id) ?? 0) - (degree.get(a.id) ?? 0) || (a.label === 'Product' ? -1 : 1))[0];
    setPicked(top.id);
  }, [all, allEdges, picked]);

  // Which nodes are drawn: the focus neighbourhood (1–2 hops) or everything,
  // minus hidden kinds.
  const visible = useMemo(() => {
    let ids: Set<string> | null = null;
    if (effectiveMode === 'focus' && picked) {
      let ring = new Set<string>([picked]);
      for (let h = 0; h < hops; h++) {
        const next = new Set<string>(ring);
        for (const e of allEdges) { if (ring.has(e.from_node_id)) next.add(e.to_node_id); if (ring.has(e.to_node_id)) next.add(e.from_node_id); }
        ring = next;
      }
      ids = ring;
    }
    return all.filter((n) => !hidden.has(n.label) && (!ids || ids.has(n.id)));
  }, [all, allEdges, effectiveMode, picked, hops, hidden]);

  const laid = useMemo(() => layout(visible), [visible]);
  const byId = useMemo(() => new Map(laid.placed.map((p) => [p.node.id, p])), [laid]);
  const edges = useMemo(() => allEdges.filter((e) => byId.has(e.from_node_id) && byId.has(e.to_node_id)), [allEdges, byId]);
  const focus = hover ?? picked;
  const lit = useMemo(() => {
    if (!focus) return null;
    const ids = new Set<string>([focus]);
    for (const e of edges) if (e.from_node_id === focus || e.to_node_id === focus) { ids.add(e.from_node_id); ids.add(e.to_node_id); }
    return ids;
  }, [focus, edges]);

  const pickedNode = picked ? all.find((n) => n.id === picked) ?? null : null;
  const pickedEdges = picked ? allEdges.filter((e) => e.from_node_id === picked || e.to_node_id === picked) : [];
  const nodeOf = (id: string) => all.find((n) => n.id === id);
  const sentence = (e: KgEdge) => { const a = nodeOf(e.from_node_id), b = nodeOf(e.to_node_id); return { a, b, text: `${a?.name ?? '?'} ${verb(e.relationship)} ${b?.name ?? '?'}` }; };
  const matches = search.trim() ? all.filter((n) => n.name.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 8) : [];
  const labels = data?.labels ?? [];

  return (
    <div className={s.page}>
      <header className={s.head}>
        <div>
          <div className={s.eyebrow}>// SMART PROFILE · KNOWLEDGE GRAPH</div>
          <h1 className={s.title}>How it connects</h1>
          <p className={s.lede}>What you sell, who it is for, what hurts them, why you, and the proof — and every relationship VaNi read between them. Pick a node to read its relationships as sentences, and correct or remove an entry there. The list of entries is under <Link href="/smart-profile/knowledge">Knowledge</Link>.</p>
        </div>
      </header>

      {readingSources.map((src) => <ReadingProgress key={src.id} source={src} />)}

      <DataBoundary query={q} label="the graph" skeleton={<SkeletonRows rows={6} lines={2} />}
        isEmpty={(d: Knowledge | undefined) => !d?.nodes?.length}
        empty="Nothing to draw yet. Teach VaNi under Knowledge — point it at your website or paste what you have — and the entries and their relationships appear here.">
        {(d: Knowledge) => (
          <>
            <div className={g.toolbar}>
              <div className={g.search}>
                <input className={s.inviteInput} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder={`Find one of ${d.total} entries`} />
                {matches.length > 0 && (
                  <ul className={g.matches}>
                    {matches.map((n) => <li key={n.id}><button type="button" onClick={() => { setPicked(n.id); setSearch(''); setEditing(false); }}>{n.name}<span>{kind(n.label)}</span></button></li>)}
                  </ul>
                )}
              </div>
              <div className={g.seg} role="group" aria-label="View">
                <button type="button" aria-pressed={effectiveMode === 'focus'} onClick={() => setMode('focus')}>Around the pick</button>
                <button type="button" aria-pressed={effectiveMode === 'whole'} onClick={() => setMode('whole')}>Whole graph{isBig ? ` · ${all.length}` : ''}</button>
              </div>
              {effectiveMode === 'focus' && (
                <div className={g.seg} role="group" aria-label="Hops">
                  <button type="button" aria-pressed={hops === 1} onClick={() => setHops(1)}>1 hop</button>
                  <button type="button" aria-pressed={hops === 2} onClick={() => setHops(2)}>2 hops</button>
                </div>
              )}
              <div className={g.seg} role="group" aria-label="Zoom">
                <button type="button" aria-pressed={fit} onClick={() => setFit(true)}>Fit</button>
                <button type="button" aria-pressed={!fit} onClick={() => setFit(false)}>1:1</button>
              </div>
            </div>
            <div className={g.stats}>
              {labels.map((l) => (
                <button key={l.label} type="button" className={`${u.tag} ${hidden.has(l.label) ? u.tagDim : u.tagOk}`} aria-pressed={!hidden.has(l.label)} title={hidden.has(l.label) ? 'Show this kind' : 'Hide this kind'}
                  onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(l.label)) n.delete(l.label); else n.add(l.label); return n; })}>{kind(l.label)} · {l.count}</button>
              ))}
              <span className={`${u.tag} ${u.tagDim}`}>{visible.length} of {d.total} drawn · {edges.length} of {d.edges.length} relationships</span>
              {d.edges.length === 0 && <span className={`${u.tag} ${u.tagWarn}`}>no relationships recorded yet — the extractor writes one when a page states it</span>}
              {reading && <span className={`${u.tag} ${u.tagWarn}`}>reading — this redraws as entries land</span>}
            </div>

            <div className={g.split}>
              <div className={g.canvasWrap}>
                {visible.length === 0 ? (
                  <div className={g.canvasEmpty}>Every kind is hidden, or the pick has no relationships within {hops} {hops === 1 ? 'hop' : 'hops'}. Show a kind above, or switch to the whole graph.</div>
                ) : (
                  <KgCanvas laid={laid} edges={edges} fit={fit} picked={picked} focus={focus} lit={lit}
                    onHover={setHover} onPick={(id) => { setPicked(id); setEditing(false); }} edgeTitle={(e) => sentence(e as KgEdge).text} />
                )}
              </div>

              <aside className={g.side}>
                {!pickedNode ? (
                  <div className={g.sideEmpty}>
                    <div className={u.cardMeta}>PICK A NODE</div>
                    <p>Hover to see what it connects to; click to read the relationships as sentences, and to correct or remove the entry.</p>
                    <div className={g.legend}>
                      {Object.entries(RELATION_WORDS).map(([kk, v]) => <span key={kk} className={g.legendRow}><code>{kk}</code><span>{v}</span></span>)}
                    </div>
                  </div>
                ) : editing ? (
                  <div>
                    <div className={u.cardMeta}>EDIT · {kind(pickedNode.label)}</div>
                    <NodeEditor key={pickedNode.id} node={pickedNode} onDone={() => setEditing(false)} />
                  </div>
                ) : (
                  <div>
                    <div className={u.cardMeta}>{pickedNode.label} · {kind(pickedNode.label)}</div>
                    <h2 className={g.sideName}>{pickedNode.name}</h2>
                    {pickedNode.description && <p className={g.sideDesc}>{pickedNode.description}</p>}
                    <div className={g.sideMeta}>{pickedNode.source_name ? `read from ${pickedNode.source_name}` : 'from the conversation'}{(pickedNode.properties as Record<string, unknown> | null)?.human_edited === true ? ' · corrected by a person' : ''}</div>
                    <div className={g.sideActions}>
                      <button type="button" className={`${u.tag} ${u.tagOk}`} onClick={() => setEditing(true)}>Edit</button>
                      {effectiveMode === 'whole' && <button type="button" className={`${u.tag} ${u.tagDim}`} onClick={() => setMode('focus')}>Focus here</button>}
                    </div>
                    <div className={u.cardMeta} style={{ marginTop: 14 }}>RELATIONSHIPS · {pickedEdges.length}</div>
                    {pickedEdges.length === 0 ? (
                      <p className={g.sideDesc}>Nothing recorded between this and the rest yet. The extractor writes a relationship only when a page states one.</p>
                    ) : (
                      <ul className={g.rels}>
                        {pickedEdges.map((e) => { const { a, b, text } = sentence(e); const other = a?.id === picked ? b : a; return (
                          <li key={e.id} className={g.rel}>
                            <button type="button" className={g.relBtn} onClick={() => { if (other) { setPicked(other.id); setEditing(false); } }}>{text}</button>
                            {other && <span className={g.relMeta}>{kind(other.label)}{other.source_name ? ` · read from ${other.source_name}` : ''}</span>}
                          </li>
                        ); })}
                      </ul>
                    )}
                  </div>
                )}
              </aside>
            </div>

            <section className={s.section} style={{ marginTop: 18 }}>
              <header className={s.sectionHead}>
                <div className={s.sectionTitles}>
                  <h2 className={s.sectionTitle}>Every relationship, in words</h2>
                  <p className={s.sectionWhat}>All {d.edges.length} edges as sentences, so the graph can be read without the picture. Click one to pick its subject.</p>
                </div>
              </header>
              <div className={s.sectionBody}>
                {d.edges.length === 0 ? <p className={g.sideDesc}>None yet.</p> : (
                  <ul className={g.rels}>
                    {d.edges.map((e) => { const { a, text } = sentence(e); return (
                      <li key={e.id} className={g.rel}><button type="button" className={g.relBtn} onClick={() => { if (a) { setPicked(a.id); setMode('focus'); setEditing(false); } }}>{text}</button></li>
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
