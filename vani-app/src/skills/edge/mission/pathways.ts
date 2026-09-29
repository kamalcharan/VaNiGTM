/** Pathway decision coverage — reference `src/mission/pathways.js` (`coverage`, `treatments`). Views arrive with chapter 8. */
import type { Mission } from './types';

export const treatments = ['Investigate first', 'Automate', 'Automate with conditions', 'Keep human handling'];

export interface Variant { id: string; label: string; seq: string[]; share: number; cases: number; days: number }

export interface Coverage { automate: number; conditional: number; human: number; unresolved: number }

export function coverage(m: Mission, variants: Variant[]): Coverage {
  const c: Coverage = { automate: 0, conditional: 0, human: 0, unresolved: 100 };
  if (m.mode !== 'sample') return c;
  for (const v of variants) {
    const r = m.pathReviews?.[v.id];
    if (r?.question?.trim() || !r?.explanation?.trim() || !r?.owner?.trim() || !r?.fallback?.trim() || r.classification === 'Unknown' || !r.classification) continue;
    const key = ({ 'Automate': 'automate', 'Automate with conditions': 'conditional', 'Keep human handling': 'human' } as Record<string, keyof Coverage>)[r.treatment || ''];
    if (key && (key !== 'conditional' || r.conditions?.trim())) c[key] += v.share;
  }
  c.unresolved = Math.max(0, 100 - c.automate - c.conditional - c.human);
  return c;
}
