'use client';
/**
 * A graph on the public page — the visitor's own ("this is your data") or
 * Vikuna's snapshot. The console's picture (KgCanvas), read-only: hover or
 * pick a node to light what it touches, and every relationship is also
 * written out as a sentence so the graph reads without the drawing.
 */
import { useMemo, useState } from 'react';
import g from '@/skills/smart-profile/knowledge-graph.module.css';
import { KgCanvas, kind, layout, verb, type CanvasEdge } from '@/skills/smart-profile/screens/KgCanvas';
import type { SiteGraph } from './funnel';
import s from './landing.module.css';

/** Sentences shown before "show all". */
const SENTENCES_SHOWN = 8;

export function GraphPreview({ graph }: { graph: SiteGraph }) {
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [allSentences, setAllSentences] = useState(false);

  const laid = useMemo(() => layout(graph.nodes), [graph.nodes]);
  const ids = useMemo(() => new Set(graph.nodes.map((n) => n.id)), [graph.nodes]);
  const edges = useMemo(() => graph.edges.filter((e) => ids.has(e.from_node_id) && ids.has(e.to_node_id)), [graph.edges, ids]);
  const focus = hover ?? picked;
  const lit = useMemo(() => {
    if (!focus) return null;
    const on = new Set<string>([focus]);
    for (const e of edges) if (e.from_node_id === focus || e.to_node_id === focus) { on.add(e.from_node_id); on.add(e.to_node_id); }
    return on;
  }, [focus, edges]);

  const nameOf = (id: string) => graph.nodes.find((n) => n.id === id)?.name ?? '?';
  const sentence = (e: CanvasEdge) => `${nameOf(e.from_node_id)} ${verb(e.relationship)} ${nameOf(e.to_node_id)}`;
  const kinds = [...new Set(graph.nodes.map((n) => n.label))];
  const pickedNode = picked ? graph.nodes.find((n) => n.id === picked) ?? null : null;
  const shown = allSentences ? edges : edges.slice(0, SENTENCES_SHOWN);

  return (
    <div className={s.graph}>
      <div className={s.graphStats}>
        {graph.nodes.length} {graph.nodes.length === 1 ? 'entry' : 'entries'} · {edges.length} {edges.length === 1 ? 'relationship' : 'relationships'} · {kinds.map(kind).join(' · ')}
      </div>
      <div className={g.canvasWrap}>
        <KgCanvas laid={laid} edges={edges} fit picked={picked} focus={focus} lit={lit}
          onHover={setHover} onPick={(id) => setPicked((p) => (p === id ? null : id))} edgeTitle={sentence} />
      </div>
      {pickedNode && (
        <div className={s.graphPick}>
          <span className={s.graphPickKind}>{kind(pickedNode.label)}</span>
          <strong>{pickedNode.name}</strong>
          {pickedNode.description && <span> — {pickedNode.description}</span>}
        </div>
      )}
      {edges.length > 0 && (
        <ul className={`${g.rels} ${s.graphRels}`}>
          {shown.map((e) => (
            <li key={e.id} className={g.rel}>
              <button type="button" className={g.relBtn} onClick={() => setPicked(e.from_node_id)}>{sentence(e)}</button>
            </li>
          ))}
          {edges.length > SENTENCES_SHOWN && (
            <li><button type="button" className={s.linkBtn} onClick={() => setAllSentences((v) => !v)}>
              {allSentences ? 'Show fewer' : `Show all ${edges.length} relationships`}
            </button></li>
          )}
        </ul>
      )}
    </div>
  );
}
