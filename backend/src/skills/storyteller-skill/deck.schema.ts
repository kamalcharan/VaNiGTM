/**
 * Deck schema — Storyteller (Phase 4 Stage 2, minimal)
 *
 * Mirrors the output contract of the seeded prompt `vani-skill.generate_slides`
 * (reused as-is; not re-keyed). A generated deck is a JSON array of slides.
 * Validated with callLLMValidated(..., DeckSchema) before persisting to
 * gt_presentations.
 *
 * Minimal on purpose — replace/extend with the full Stage 2 schema when ready.
 */

import { z } from 'zod';

/** The seven slide types, in canonical deck order. */
export const SLIDE_TYPES = [
  'title',
  'problem',
  'solution',
  'icp',
  'differentiators',
  'traction',
  'cta',
] as const;

export const BulletSchema = z.object({
  icon: z.string(),
  head: z.string(),
  body: z.string(),
});

export const SlideSchema = z.object({
  id: z.number().int(),
  type: z.enum([
    'title',
    'problem',
    'solution',
    'icp',
    'differentiators',
    'traction',
    'cta',
  ]),
  title: z.string(),
  subtitle: z.string(),
  bullets: z.array(BulletSchema),
  narration: z.string(),
});

/** A full deck is an ordered array of slides. */
export const DeckSchema = z.array(SlideSchema);

export type Bullet = z.infer<typeof BulletSchema>;
export type Slide = z.infer<typeof SlideSchema>;
export type Deck = z.infer<typeof DeckSchema>;
