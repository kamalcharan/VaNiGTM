'use client';

import { useState } from 'react';
import s from './VdfMissionRail.module.css';

export interface VdfMissionRailItem {
  id: string;
  /** 1-based step number shown in the marker */
  step: number;
  title: string;
  /** One-line collapsed digest shown when the step is done */
  digest?: string;
  /** Full inspectable content revealed when a done step is expanded */
  summary?: React.ReactNode;
  state: 'done' | 'active' | 'pending';
}

export interface VdfMissionRailProps {
  items: VdfMissionRailItem[];
  /** Mono eyebrow above the rail */
  label?: string;
  className?: string;
}

/**
 * VdfMissionRail — the accumulating left rail of the agent-led wizard
 * (ux-references pattern 2: "mission memory"). Each completed step
 * collapses into the rail with a one-line digest and stays inspectable:
 * clicking a done step expands the agent's full output for that step.
 * The rail is the audit trail of what the agent did.
 */
export function VdfMissionRail({ items, label = 'Mission memory', className }: VdfMissionRailProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <nav className={`${s.rail} ${className || ''}`} aria-label={label}>
      <div className={s.railLabel}>{label}</div>

      <ol className={s.list}>
        {items.map((item) => {
          const isExpanded = expandedId === item.id;
          const inspectable = item.state === 'done' && !!item.summary;

          return (
            <li
              key={item.id}
              className={`${s.item} ${s[item.state]}`}
              /* Landing target for the wizard's handoff animation: the
                 finished card physically flies into this slot. */
              data-mission-step={item.id}
            >
              <span className={s.marker} aria-hidden>
                {item.state === 'done' ? (
                  <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                    <polyline points="2.5 6 5 8.5 9.5 3.5" />
                  </svg>
                ) : (
                  <span className={s.markerNum}>{item.step}</span>
                )}
                {item.state === 'active' && <span className={s.markerPulse} />}
              </span>

              <div className={s.itemBody}>
                {inspectable ? (
                  <button
                    type="button"
                    className={s.itemHead}
                    onClick={() => setExpandedId(isExpanded ? null : item.id)}
                    aria-expanded={isExpanded}
                  >
                    <span className={s.itemTitle}>{item.title}</span>
                    <svg
                      className={`${s.chevron} ${isExpanded ? s.chevronOpen : ''}`}
                      viewBox="0 0 12 12" fill="none" stroke="currentColor"
                      strokeWidth="1.5" strokeLinecap="round" aria-hidden
                    >
                      <polyline points="3 4.5 6 7.5 9 4.5" />
                    </svg>
                  </button>
                ) : (
                  <span className={`${s.itemHead} ${s.itemHeadStatic}`}>
                    <span className={s.itemTitle}>{item.title}</span>
                  </span>
                )}

                {item.state === 'done' && item.digest && !isExpanded && (
                  <span className={s.digest}>{item.digest}</span>
                )}

                {inspectable && isExpanded && (
                  <div className={s.summary}>{item.summary}</div>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export default VdfMissionRail;
