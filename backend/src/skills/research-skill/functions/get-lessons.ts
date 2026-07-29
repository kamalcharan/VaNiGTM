/**
 * research-skill: get_lessons
 *
 * The Learning Graph as a review queue: what the agent has inferred from your
 * decisions, what you accepted, and what you threw out.
 *
 * `can_propose` is here so the screen can say WHY the button is disabled —
 * "6 decisions needed, you have 3" is actionable; a greyed-out button is not.
 */

import { SkillContext } from '../../../shared/types';
import { readAllLessons, type Lesson } from '../lessons';
import { MIN_DECISIONS } from '../lesson.agent';

interface GetLessonsResult {
  lessons: Lesson[];
  proposed: number;
  accepted: number;
  rejected: number;
  /** Rulings available to learn from. */
  decisions: number;
  can_propose: boolean;
  min_decisions: number;
  recipe: 'lesson-list';
}

export async function get_lessons(
  _params: Record<string, unknown>,
  ctx: SkillContext,
): Promise<GetLessonsResult> {
  const [lessons, counts] = await Promise.all([
    readAllLessons(ctx.db, ctx.tenant_id, ctx.is_live),
    ctx.db.query<{ decisions: string }>(
      `SELECT count(*)::text AS decisions
         FROM gt_account_briefs
        WHERE tenant_id = $tenant_id AND is_live = $is_live
          AND decided_at IS NOT NULL
          AND status NOT IN ('unreadable','extract_failed')`,
      { tenant_id: ctx.tenant_id, is_live: ctx.is_live },
    ),
  ]);

  const decisions = Number(counts.rows[0]?.decisions ?? 0);
  const by = (s: string) => lessons.filter((l) => l.status === s).length;

  return {
    lessons,
    proposed: by('proposed'),
    accepted: by('accepted'),
    rejected: by('rejected'),
    decisions,
    can_propose: decisions >= MIN_DECISIONS,
    min_decisions: MIN_DECISIONS,
    recipe: 'lesson-list',
  };
}
