'use client';
/**
 * The knowledge graph, drawn: one column per kind, a line per relationship.
 *
 * Moved out of KnowledgeGraphScreen unchanged so the public landing
 * (vani.vikuna.io) can draw a visitor's graph — and Vikuna's snapshot — with
 * the very same picture the console shows. The console screen keeps every
 * control (focus, hops, hiding kinds, search, editing); this piece only
 * draws what it is given and reports hover and pick.
 */
import g from '../knowledge-graph.module.css';
import { KIND_LABELS, RELATION_WORDS, type KgEdge, type KgNode } from '../useKnowledge';

/** What the drawing needs of a node — the landing's graphs carry no source or timestamps. */
export type CanvasNode = Pick<KgNode, 'id' | 'label' | 'name' | 'description' | 'properties'>;
export type CanvasEdge = Pick<KgEdge, 'id' | 'from_node_id' | 'to_node_id' | 'relationship'>;

/** Columns, left to right: what you sell → who → what hurts → why you → proof. */
const COLUMNS: string[][] = [
  ['Product', 'Feature', 'Pricing'],
  ['ICP', 'Industry'],
  ['PainPoint', 'UseCase'],
  ['Differentiator', 'Competitor', 'Team'],
  ['CaseStudy', 'Metric'],
];
export const kind = (l: string) => KIND_LABELS[l] ?? l;
export const verb = (r: string) => RELATION_WORDS[r] ?? r.toLowerCase().replace(/_/g, ' ');

const NODE_H = 36, NODE_GAP = 8, TOP = 64, PAD = 14, MIN_H = 240;

export interface Placed<N extends CanvasNode = CanvasNode> { node: N; x: number; y: number; w: number; }

/** Columns only for kinds that have a visible node; each column as wide as it needs. */
export function layout<N extends CanvasNode>(nodes: N[]): { placed: Placed<N>[]; width: number; height: number; heads: { x: number; labels: string[] }[] } {
  const present = new Set(nodes.map((n) => n.label));
  const known = new Set(COLUMNS.flat());
  const cols = COLUMNS.map((labels) => labels.filter((l) => present.has(l))).filter((c) => c.length);
  const extra = [...present].filter((l) => !known.has(l));
  if (extra.length) cols.push(extra);
  const placed: Placed<N>[] = [];
  const heads: { x: number; labels: string[] }[] = [];
  let x = 0, height = TOP;
  for (const labels of cols) {
    const inCol = nodes.filter((n) => labels.includes(n.label)).sort((a, b) => a.label.localeCompare(b.label) || a.name.localeCompare(b.name));
    const longest = Math.max(...inCol.map((n) => Math.min(n.name.length, 34)), 10);
    const w = Math.max(150, Math.min(300, 30 + longest * 7.2));
    heads.push({ x: x + PAD, labels });
    let y = TOP;
    for (const node of inCol) { placed.push({ node, x: x + PAD, y, w }); y += NODE_H + NODE_GAP; }
    height = Math.max(height, y);
    x += w + PAD * 2 + 26;
  }
  return { placed, width: Math.max(x, 320), height: Math.max(height, MIN_H) + PAD, heads };
}

export interface KgCanvasProps<N extends CanvasNode> {
  /** From `layout()` — the caller lays out, so it can also use `placed` to filter edges. */
  laid: ReturnType<typeof layout<N>>;
  /** Only edges whose both ends are in `laid.placed`. */
  edges: CanvasEdge[];
  fit: boolean;
  picked: string | null;
  /** The node whose relationships are lit: hover, else the pick. */
  focus: string | null;
  lit: Set<string> | null;
  onHover: (id: string | null) => void;
  onPick: (id: string) => void;
  /** Sentence shown when hovering an edge. */
  edgeTitle: (e: CanvasEdge) => string;
}

export function KgCanvas<N extends CanvasNode>({ laid, edges, fit, picked, focus, lit, onHover, onPick, edgeTitle }: KgCanvasProps<N>) {
  const { placed, width, height, heads } = laid;
  const byId = new Map(placed.map((p) => [p.node.id, p]));
  return (
    <svg className={fit ? g.canvasFit : g.canvas} width={fit ? undefined : width} height={fit ? undefined : height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Knowledge graph" preserveAspectRatio="xMinYMin meet">
      <defs>
        <marker id="kg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className={g.arrow} /></marker>
      </defs>
      {heads.map((h, i) => (
        <text key={i} x={h.x} y={20} className={g.colHead}>
          {h.labels.map((l, li) => <tspan key={l} x={h.x} dy={li === 0 ? 0 : 13}>{kind(l)}</tspan>)}
        </text>
      ))}
      {edges.map((e) => {
        const a = byId.get(e.from_node_id)!, b = byId.get(e.to_node_id)!;
        const forward = b.x > a.x, same = a.x === b.x;
        const x1 = same ? a.x + a.w : forward ? a.x + a.w : a.x, x2 = same ? b.x + b.w : forward ? b.x : b.x + b.w;
        const y1 = a.y + NODE_H / 2, y2 = b.y + NODE_H / 2;
        const dx = same ? 36 : Math.max(36, Math.abs(x2 - x1) / 2);
        const dpath = same
          ? `M${x1},${y1} C${x1 + dx},${y1} ${x2 + dx},${y2} ${x2},${y2}`
          : `M${x1},${y1} C${x1 + (forward ? dx : -dx)},${y1} ${x2 - (forward ? dx : -dx)},${y2} ${x2},${y2}`;
        const on = !!lit && (e.from_node_id === focus || e.to_node_id === focus);
        return <path key={e.id} d={dpath} className={`${g.edge} ${on ? g.edgeOn : ''} ${lit && !on ? g.edgeDim : ''}`} markerEnd="url(#kg-arrow)"><title>{edgeTitle(e)}</title></path>;
      })}
      {placed.map(({ node, x, y, w }) => {
        const on = lit?.has(node.id) ?? false;
        const isPicked = picked === node.id;
        const label = node.name.length > 34 ? `${node.name.slice(0, 33)}…` : node.name;
        return (
          <g key={node.id} className={`${g.node} ${g[`k_${node.label}`] ?? ''} ${on ? g.nodeOn : ''} ${lit && !on ? g.nodeDim : ''} ${isPicked ? g.nodePicked : ''}`}
            transform={`translate(${x},${y})`} tabIndex={0} role="button" aria-pressed={isPicked}
            onMouseEnter={() => onHover(node.id)} onMouseLeave={() => onHover(null)}
            onClick={() => onPick(node.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(node.id); } }}>
            <rect width={w} height={NODE_H} rx={8} />
            <text x={10} y={NODE_H / 2 + 4} className={g.nodeText}>{label}</text>
            {(node.properties as Record<string, unknown> | null)?.human_edited === true && <circle cx={w - 10} cy={9} r={3} className={g.editedDot}><title>corrected by a person</title></circle>}
            <title>{node.label} · {node.name}{node.description ? ` — ${node.description}` : ''}</title>
          </g>
        );
      })}
    </svg>
  );
}
