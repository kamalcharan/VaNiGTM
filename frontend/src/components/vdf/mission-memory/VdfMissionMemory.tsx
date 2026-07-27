'use client';

/**
 * VdfMissionMemory — the accumulating left rail of the agent-led wizard.
 *
 * Rebuilt from `documents/ux-references/agent-wizard-flow.pdf` (pages 1–8,
 * read directly). The rail is NOT a table of contents — three earlier
 * attempts built one and the pattern never read right. What the reference
 * actually does:
 *
 *  1. A finished step files its REAL ARTIFACT into the rail — the same
 *     content that was centre-stage, re-laid narrow. Not a digest line.
 *  2. Step labels are hairline mono separators (`√ step 1 · Research your
 *     company`) — a rule between artifacts, not a heading over one.
 *  3. Only the DEFINITIONAL steps file an artifact. Operational steps
 *     (prospect tables, people, emails) file their separator and nothing
 *     else — their data lives on the stage, not in memory. An item with no
 *     `artifact` renders exactly that way.
 *  4. The active step's separator is drawn BEFORE its artifact exists, with
 *     an empty slot beneath it. That pre-announced slot is what the handoff
 *     animation measures and flies into — which is why the motion reads as
 *     filing rather than appearing.
 *  5. The rail scrolls and follows its tail as the mission grows.
 *
 * Pending steps are not rendered at all: memory holds what happened, and
 * the top rail already says what is coming.
 */

import { useEffect, useRef } from 'react';
import s from './VdfMissionMemory.module.css';

export interface VdfMissionMemoryItem {
  id: string;
  /** 1-based step number, shown in the separator */
  step: number;
  title: string;
  state: 'done' | 'active' | 'pending';
  /**
   * The durable artifact this step files into memory, rendered narrow.
   * Omit for operational steps — they file a separator only.
   */
  artifact?: React.ReactNode;
  /**
   * Whether this step files an artifact AT ALL. Distinguishes "its artifact
   * hasn't arrived yet" (draw the landing slot) from "this step never files
   * one" (draw nothing) — without it, operational steps advertise a landing
   * zone that stays empty forever.
   */
  expectsArtifact?: boolean;
}

export interface VdfMissionMemoryProps {
  items: VdfMissionMemoryItem[];
  /** Accessible name for the rail */
  label?: string;
  className?: string;
}

export function VdfMissionMemory({
  items,
  label = 'Mission memory',
  className,
}: VdfMissionMemoryProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);

  // Memory grows downward past the fold — keep the newest entry in view the
  // way the reference does. Only when the tail actually changes, so a user
  // reading back through the rail isn't yanked to the bottom.
  const reached = items.filter((i) => i.state !== 'pending');
  const tailId = reached[reached.length - 1]?.id;

  useEffect(() => {
    const el = tailRef.current;
    const box = scrollRef.current;
    if (!el || !box) return;
    if (box.scrollHeight <= box.clientHeight) return;

    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'end' });
  }, [tailId]);

  return (
    <nav className={`${s.rail} ${className || ''}`} aria-label={label}>
      <div className={s.scroll} ref={scrollRef}>
        {reached.map((item, i) => (
          <div
            key={item.id}
            className={s.entry}
            ref={i === reached.length - 1 ? tailRef : undefined}
          >
            <div className={`${s.separator} ${item.state === 'active' ? s.separatorActive : ''}`}>
              <span className={s.sepMark} aria-hidden>√</span>
              <span className={s.sepText}>
                step {item.step} · {item.title}
              </span>
            </div>

            {/* Landing target for the handoff flight. Rendered even while
                empty so the slot exists to be measured — see the hook. It is
                only DRAWN as a waiting slot when something is actually coming. */}
            <div
              className={`${s.slot} ${
                !item.artifact && item.state === 'active' && item.expectsArtifact
                  ? s.slotEmpty
                  : ''
              }`}
              data-mission-step={item.id}
            >
              {item.artifact}
            </div>
          </div>
        ))}
      </div>
    </nav>
  );
}

export default VdfMissionMemory;
