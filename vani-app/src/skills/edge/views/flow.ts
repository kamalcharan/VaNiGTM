'use client';
/** `next()` / `back()` — reference `main.js`. The per-chapter guards live here, not in the buttons. */
import { useMission } from '../mission/MissionProvider';
import { packs } from '../mission/domain';
import { seedBoard } from '../mission/store';

export function useFlow() {
  const { m, stage, go, toast, update } = useMission();
  return {
    back: () => go(Math.max(0, stage - 1)),
    next: (form?: HTMLFormElement | null) => {
      if (stage === 0) { toast('Confirm your inherited context first.'); return; }
      if (stage === 1) {
        if (!m.respondent.name.trim() || !m.respondent.designation.trim()) { toast('Tell us your name and designation before continuing.'); return; }
        if (form && !form.reportValidity()) return;
      }
      if (stage === 2) { update((d) => seedBoard(d, packs[d.process].activities)); go(3); return; }
      if (stage === 10 && form) {
        const invalid = [...form.querySelectorAll<HTMLInputElement>('[data-assumption]')].find((el) => !el.validity.valid);
        if (invalid) { invalid.reportValidity(); return; }
      }
      go(Math.min(11, stage + 1));
    },
  };
}
