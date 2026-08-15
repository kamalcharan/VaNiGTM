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
 *  5. The rail grows to its natural height inside its `position: sticky`
 *     container (owned by VdfPathwayShell) and lets the PAGE scroll —
 *     no internal max-height/overflow, no JS deciding when to auto-scroll.
 *     Two earlier attempts here tried to cap the rail's height and then
 *     paper over the cap with a scrollIntoView effect; every variant of that
 *     was a new way to guess wrong about which container needed to move.
 *     Native sticky positioning already does the right thing for a tall
 *     pinned sidebar with zero custom code — this is that, and only that.
 *
 * Pending steps are not rendered at all: memory holds what happened, and
 * the top rail already says what is coming.
 */

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
  const reached = items.filter((i) => i.state !== 'pending');

  return (
    <nav className={`${s.rail} ${className || ''}`} aria-label={label}>
      <div className={s.scroll}>
        {reached.map((item) => (
          <div key={item.id} className={s.entry}>
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
