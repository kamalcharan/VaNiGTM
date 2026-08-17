'use client';

/**
 * useMissionHandoff — the agent-to-agent handoff animation.
 *
 * ux-references pattern 2: a completed step doesn't just disappear, it
 * COLLAPSES INTO THE MISSION-MEMORY RAIL. Seeing the card travel is the
 * whole visual grammar of "this agent finished, the next one is taking
 * over" — a fade reads as "the card vanished" and loses the meaning.
 *
 * It's a measured FLIP: we read the stage card's rect and the destination
 * rail slot's rect (`[data-mission-step="<id>"]`, tagged by VdfMissionRail)
 * and animate translate+scale between them. The distance depends on runtime
 * layout, so this cannot be expressed in CSS.
 *
 * Shared by the live wizard (/onboarding) and the design wizard
 * (/design/wizard) so the motion can never drift between the product and
 * the surface used to review and record it.
 */

import { useCallback, useRef, useState } from 'react';

/** Flight duration (ms). Single source of truth for the motion. */
export const HANDOFF_MS = 620;

export function useMissionHandoff<T extends HTMLElement = HTMLElement>() {
  const stageRef = useRef<T>(null);
  const [handingOff, setHandingOff] = useState(false);

  /**
   * Fly the current stage card into `stepId`'s rail slot, then run `commit`.
   * `commit` ALWAYS runs — reduced motion, a missing element, no Web
   * Animations API or an interrupted animation all fall through to it.
   * The flow must never strand the user mid-handoff.
   */
  const handoff = useCallback((stepId: string, commit: () => void) => {
    const finishNow = () => { setHandingOff(false); commit(); };

    const reduced = typeof window === 'undefined'
      || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    const stage = stageRef.current;
    const target = typeof document !== 'undefined'
      ? document.querySelector<HTMLElement>(`[data-mission-step="${stepId}"]`)
      : null;

    if (reduced || !stage || !target || typeof stage.animate !== 'function') {
      finishNow();
      return;
    }

    const from = stage.getBoundingClientRect();
    const to = target.getBoundingClientRect();
    const dx = to.left - from.left;
    const dy = to.top - from.top;
    const scale = Math.max(0.12, Math.min(1, to.width / Math.max(from.width, 1)));

    setHandingOff(true);
    const flight = stage.animate(
      [
        { transform: 'translate(0px, 0px) scale(1)', opacity: 1 },
        { transform: `translate(${dx}px, ${dy}px) scale(${scale})`, opacity: 0 },
      ],
      { duration: HANDOFF_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
    );

    let done = false;
    const land = () => {
      if (done) return;
      done = true;
      // Make the arrival legible instead of a silent appearance.
      target.classList.add('mission-step-landed');
      window.setTimeout(() => target.classList.remove('mission-step-landed'), 900);
      finishNow();
    };
    flight.addEventListener('finish', land);
    window.setTimeout(land, HANDOFF_MS + 200); // safety net
  }, []);

  return { stageRef, handingOff, handoff };
}
