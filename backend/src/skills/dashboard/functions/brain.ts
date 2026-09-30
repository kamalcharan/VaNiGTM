import { SkillContext } from '../../../types/skill.types';
import { BRAIN_WEIGHTS } from '../../profile-skill/profile.service';

type BrainKey = keyof typeof BRAIN_WEIGHTS;

/** Why each section matters to the agents — the copy the retired /today carried. */
const SECTIONS: Record<BrainKey, { label: string; why: string }> = {
  icp:         { label: 'Ideal customer',    why: 'Every agent reads this to know who to target.' },
  brand:       { label: 'Brand',             why: 'Nova (digital marketing) is blocked without it; the storyteller writes in this voice.' },
  offers:      { label: 'Offers',            why: 'Research cannot frame a search without knowing what you sell.' },
  competitors: { label: 'Competitors',       why: 'Sharpens what research looks for.' },
  vocabulary:  { label: 'Market vocabulary', why: 'Frames every research search and every match against the pool.' },
  research:    { label: 'Company profile',   why: 'What everything else is built on.' },
};

export async function brain(_params: Record<string, unknown>, ctx: SkillContext) {
  const r = await ctx.db.query<{ completion_score: number; completion_detail: Record<string, number> | null; is_complete: boolean }>(
    `SELECT completion_score, completion_detail, is_complete FROM gt_tenant_profile WHERE tenant_id = $tenant_id`,
    { tenant_id: ctx.tenant_id },
  );
  const row = r.rows[0];
  if (!row) {
    return {
      exists: false, completion_score: 0, is_complete: false, detail: null,
      sections: (Object.keys(SECTIONS) as BrainKey[]).map((key) => ({
        key, label: SECTIONS[key].label, weight: BRAIN_WEIGHTS[key], earned: 0, ratio: 0, why: SECTIONS[key].why,
      })),
      weakest: { key: 'research', label: SECTIONS.research.label, why: 'Nothing is known yet — start with your website.' },
      unlocks: { storytelling: false },
    };
  }
  const detail = row.completion_detail ?? {};
  const sections = (Object.keys(SECTIONS) as BrainKey[]).map((key) => {
    const earned = Number(detail[key] ?? 0);
    const weight = BRAIN_WEIGHTS[key];
    return { key, label: SECTIONS[key].label, weight, earned, ratio: weight ? earned / weight : 0, why: SECTIONS[key].why };
  });
  // Weakest by FRACTION of its own weight — a 0/10 section must not be
  // out-ranked by a half-finished 10/25 one just because 10 > 5.
  const weakest = sections.reduce<typeof sections[number] | null>((w, s) => (w === null || s.ratio < w.ratio ? s : w), null);
  return {
    exists: true,
    completion_score: row.completion_score,
    is_complete: row.is_complete,
    detail,
    sections,
    weakest: weakest && weakest.ratio < 1 ? { key: weakest.key, label: weakest.label, why: weakest.why } : null,
    unlocks: { storytelling: row.completion_score >= 60 },
  };
}
