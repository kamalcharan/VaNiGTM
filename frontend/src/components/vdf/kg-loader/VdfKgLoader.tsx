'use client';

import { useEffect, useState } from 'react';
import s from './VdfKgLoader.module.css';

export interface VdfKgLoaderProps {
  /** Status line under the constellation */
  message?: string;
  /** Secondary hint */
  hint?: string;
  /**
   * Who the work is for — rendered prominently ("Building knowledge for
   * vikuna.io"). Agent work is slow; naming the subject makes the wait feel
   * like watching YOUR thing get built rather than a spinner.
   */
  subject?: string;
  /**
   * Lines cycled every ~4s beneath the message. Real agent phases can sit
   * silent for a minute at a time; rotating copy keeps the surface alive
   * without ever claiming progress that hasn't happened.
   */
  rotating?: string[];
  /** Seconds after which a "this one is deep" reassurance appears. 0 = off. */
  patienceAfter?: number;
  className?: string;
}

const ROTATE_MS = 4200;

// A small fixed constellation — nodes pulse awake in sequence, edges draw
// between them. Deterministic layout (no randomness) so SSR/CSR match.
const NODES: { cx: number; cy: number; r: number; delay: number }[] = [
  { cx: 60,  cy: 44,  r: 7, delay: 0.0 },
  { cx: 132, cy: 22,  r: 5, delay: 0.4 },
  { cx: 196, cy: 58,  r: 6, delay: 0.8 },
  { cx: 96,  cy: 96,  r: 5, delay: 1.2 },
  { cx: 170, cy: 112, r: 7, delay: 1.6 },
  { cx: 32,  cy: 104, r: 4, delay: 2.0 },
  { cx: 232, cy: 104, r: 4, delay: 2.4 },
];

const EDGES: { from: number; to: number; delay: number }[] = [
  { from: 0, to: 1, delay: 0.3 },
  { from: 1, to: 2, delay: 0.7 },
  { from: 0, to: 3, delay: 1.1 },
  { from: 3, to: 4, delay: 1.5 },
  { from: 2, to: 4, delay: 1.9 },
  { from: 3, to: 5, delay: 2.3 },
  { from: 4, to: 6, delay: 2.7 },
];

/**
 * VdfKgLoader — "VaNi is working the knowledge graph" wait state.
 * An animated node-edge constellation for agent phases that read/write
 * the tenant's graph (deck building, enrichment). Tells the truth about
 * what's happening instead of a generic spinner.
 */
export function VdfKgLoader({
  message = 'Reading your knowledge graph',
  hint,
  subject,
  rotating,
  patienceAfter = 45,
  className,
}: VdfKgLoaderProps) {
  const [rotIndex, setRotIndex] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!rotating || rotating.length < 2) return;
    const id = setInterval(() => setRotIndex((i) => (i + 1) % rotating.length), ROTATE_MS);
    return () => clearInterval(id);
  }, [rotating]);

  useEffect(() => {
    if (!patienceAfter) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [patienceAfter]);

  const patient = patienceAfter > 0 && elapsed >= patienceAfter;

  return (
    <div className={`${s.wrap} ${className || ''}`} role="status" aria-label={message}>
      <svg className={s.graph} viewBox="0 0 264 136" aria-hidden>
        {EDGES.map((e, i) => {
          const a = NODES[e.from];
          const b = NODES[e.to];
          return (
            <line
              key={i}
              x1={a.cx} y1={a.cy} x2={b.cx} y2={b.cy}
              className={s.edge}
              style={{ animationDelay: `${e.delay}s` }}
            />
          );
        })}
        {NODES.map((n, i) => (
          <circle
            key={i}
            cx={n.cx} cy={n.cy} r={n.r}
            className={s.node}
            style={{ animationDelay: `${n.delay}s` }}
          />
        ))}
      </svg>
      {subject && (
        <div className={s.subject}>
          <span className={s.subjectLead}>Building knowledge for</span>
          <span className={s.subjectName}>{subject}</span>
        </div>
      )}

      <div className={s.message}>
        {message}
        <span className={s.dots} aria-hidden />
      </div>

      {rotating && rotating.length > 0 && (
        <div key={rotIndex} className={s.rotating}>{rotating[rotIndex]}</div>
      )}

      {hint && <div className={s.hint}>{hint}</div>}

      {patient && (
        <div className={s.patience}>
          This one runs deep — a few minutes is normal. Everything found so far is
          already saved, so nothing is lost if you step away.
        </div>
      )}
    </div>
  );
}

export default VdfKgLoader;
