/**
 * research-skill: decide_lesson
 *
 * Ratify, reword or throw out one proposed rule.
 *
 * This is the gate the whole Learning Graph rests on. Until a human presses
 * accept, a proposal is a sentence in a table; after it, that sentence is in
 * every fit prompt and is changing which companies get contacted. So the
 * function does exactly three things and nothing implicit.
 *
 * Rewording is first-class, not an edge case. The agent's inference is usually
 * close and rarely exactly right — "they reject small companies" wants to be
 * "reject single-plant companies with no stated exports". The original stays
 * in `lesson`; the reviewer's version goes in `edited_lesson`, and the gap
 * between them is the most honest measure of how good the inference was.
 *
 * A rejected rule is KEPT. Deleting it means proposing the same thing again
 * next week and asking the reviewer to re-read and re-reject it forever.
 */

import { SkillContext } from '../../../shared/types';
import { lessonKey } from '../lessons';

interface DecideLessonParams {
  lesson_id: number;
  decision: 'accepted' | 'rejected';
  /** The reviewer's own wording, when they corrected the agent's. */
  edited_lesson?: string;
}

const DECISIONS = new Set(['accepted', 'rejected']);

export async function decide_lesson(params: DecideLessonParams, ctx: SkillContext) {
  const id = Number(params.lesson_id);
  if (!Number.isFinite(id)) throw new Error('lesson_id is required');
  if (!DECISIONS.has(params.decision)) {
    throw new Error(`decision must be one of: ${[...DECISIONS].join(', ')}`);
  }

  const edited = String(params.edited_lesson ?? '').trim();
  if (edited && edited.length < 20) {
    throw new Error(
      'That is too short to apply to a company. A rule has to be testable '
      + 'against a brief — "too small" cannot be, "single plant with no stated '
      + 'exports" can.',
    );
  }

  return ctx.db.transaction(async (tx) => {
    // tenant_id and is_live in the WHERE clause ARE the authorisation.
    const res = await tx.query<{ id: number; lesson: string; status: string }>(
      `UPDATE gt_fit_lessons
          SET status        = $decision,
              edited_lesson = COALESCE(NULLIF($edited, ''), edited_lesson),
              -- Reworded rules re-key on the reviewer's wording, so the agent
              -- does not propose its own original phrasing back next week as
              -- though it were new.
              lesson_key    = COALESCE($new_key, lesson_key),
              decided_by    = $user_id,
              decided_at    = now(),
              updated_at    = now()
        WHERE id = $id AND tenant_id = $tenant_id AND is_live = $is_live
        RETURNING id, COALESCE(edited_lesson, lesson) AS lesson, status`,
      {
        id, decision: params.decision, edited,
        new_key: edited ? lessonKey(edited) : null,
        user_id: ctx.user_id, tenant_id: ctx.tenant_id, is_live: ctx.is_live,
      },
    );
    if (res.rows.length === 0) throw new Error('No such lesson.');

    return {
      lesson_id: id,
      decision: params.decision,
      lesson: res.rows[0].lesson,
      // Accepting or rewording changes what every future judgement is scored
      // against, so briefs judged before now are stale. Said here so the
      // screen can offer the re-score rather than leaving it to be noticed.
      rescore_available: params.decision === 'accepted',
      recipe: 'lesson-card' as const,
    };
  });
}
