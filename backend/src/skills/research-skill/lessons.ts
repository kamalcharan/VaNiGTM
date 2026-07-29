/**
 * VaNi GTM — fit lessons (the Learning Graph, read side)
 *
 * Rules the agent derived from a reviewer's decisions and the reviewer then
 * ratified. Only `accepted` rows are here — a proposal the human has not
 * looked at has no business influencing who gets contacted.
 *
 * The proposal side lives in `lesson.agent.ts`.
 *
 * ── WHY LESSONS AND NOT JUST EXAMPLES ─────────────────────────────────
 *
 * corrections.ts shows the fit prompt the last handful of rulings. That is
 * recency, not memory: the eleventh ruling pushes out the first, and what the
 * reviewer taught us in week one is gone. A lesson is the generalisation —
 * it survives its own evidence scrolling away, and unlike an example it can
 * be argued with, edited, or thrown out.
 */

import { createHash } from 'crypto';
import type { SkillDb } from '../../types/skill.types';

export const LESSON_KINDS = ['disqualifier', 'sizing', 'preference', 'signal'] as const;
export type LessonKind = (typeof LESSON_KINDS)[number];

export const isLessonKind = (v: unknown): v is LessonKind =>
  typeof v === 'string' && (LESSON_KINDS as readonly string[]).includes(v);

export interface LessonEvidence {
  company?: string;
  decision?: string;
  note?: string;
  offer?: string;
}

export interface Lesson {
  id: number;
  lesson: string;
  edited_lesson: string | null;
  kind: LessonKind;
  applies_to: string | null;
  evidence: LessonEvidence[];
  status: 'proposed' | 'accepted' | 'rejected';
  proposed_at: string;
  decided_at: string | null;
}

/** What the reviewer actually stands behind: their edit if they made one. */
export const lessonText = (l: Pick<Lesson, 'lesson' | 'edited_lesson'>): string =>
  (l.edited_lesson ?? l.lesson).trim();

/**
 * Stable identity for a lesson, so the same proposal arriving on a later run
 * updates the evidence instead of filling the screen with near-duplicates.
 *
 * Normalised hard — case, punctuation and whitespace all collapse. Two
 * wordings that differ only in a comma are the same rule, and treating them
 * as different is how a review queue becomes unreadable.
 */
export function lessonKey(text: string): string {
  const norm = text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
  return createHash('sha256').update(norm).digest('hex').slice(0, 64);
}

interface LessonRow extends Omit<Lesson, 'proposed_at' | 'decided_at'> {
  proposed_at: Date | string;
  decided_at: Date | string | null;
}

const toLesson = (r: LessonRow): Lesson => ({
  id: Number(r.id),
  lesson: r.lesson,
  edited_lesson: r.edited_lesson,
  kind: r.kind,
  applies_to: r.applies_to,
  evidence: Array.isArray(r.evidence) ? r.evidence : [],
  status: r.status,
  proposed_at: new Date(r.proposed_at).toISOString(),
  decided_at: r.decided_at ? new Date(r.decided_at).toISOString() : null,
});

/** Ratified lessons only — what the fit prompt is allowed to see. */
export async function readLessons(
  db: SkillDb,
  tenantId: string,
  isLive: boolean,
): Promise<Lesson[]> {
  const res = await db.query<LessonRow>(
    `SELECT id, lesson, edited_lesson, kind, applies_to, evidence, status,
            proposed_at, decided_at
       FROM gt_fit_lessons
      WHERE tenant_id = $tenant_id AND is_live = $is_live
        AND status = 'accepted'
      ORDER BY kind, decided_at DESC NULLS LAST, id`,
    { tenant_id: tenantId, is_live: isLive },
  );
  return res.rows.map(toLesson);
}

/** Every lesson in every state — the review queue on the Research screen. */
export async function readAllLessons(
  db: SkillDb,
  tenantId: string,
  isLive: boolean,
): Promise<Lesson[]> {
  const res = await db.query<LessonRow>(
    `SELECT id, lesson, edited_lesson, kind, applies_to, evidence, status,
            proposed_at, decided_at
       FROM gt_fit_lessons
      WHERE tenant_id = $tenant_id AND is_live = $is_live
      -- Proposals first: this is a queue of decisions, not an archive.
      ORDER BY (status <> 'proposed'), proposed_at DESC, id DESC`,
    { tenant_id: tenantId, is_live: isLive },
  );
  return res.rows.map(toLesson);
}

const KIND_HEADING: Record<LessonKind, string> = {
  disqualifier: 'Reasons to score an offer DOWN',
  sizing: 'How big or small a company has to be',
  preference: 'Which offer to lead with when several fit',
  signal: 'What counts as evidence of a real problem',
};

/**
 * Accepted lessons as the fit prompt sees them.
 *
 * These are stated as rules because a human ratified them as rules — unlike
 * the raw examples in corrections.ts, which are hedged hard. The distinction
 * is the whole point of making a human press accept.
 */
export function lessonsForPrompt(lessons: Lesson[]): string {
  if (lessons.length === 0) return '';

  const byKind = new Map<LessonKind, string[]>();
  for (const l of lessons) {
    const line = lessonText(l) + (l.applies_to ? `  [${l.applies_to}]` : '');
    byKind.set(l.kind, [...(byKind.get(l.kind) ?? []), line]);
  }

  const parts = [
    'RULES THIS REVIEWER HAS CONFIRMED:',
    '',
    'A human read each of these and agreed to it. Apply them. Where one '
    + 'conflicts with an offer\'s own wording, the rule wins — it was written '
    + 'after seeing real companies.',
  ];
  for (const kind of LESSON_KINDS) {
    const lines = byKind.get(kind);
    if (!lines?.length) continue;
    parts.push('', `${KIND_HEADING[kind]}:`, ...lines.map((l) => `- ${l}`));
  }
  return parts.join('\n');
}
