/**
 * Ask Edge — the scripted guide, reference `src/mission/main.js` `ask()`.
 * Keyword-matched, no model. Wiring it to a live LLM is a later decision and
 * is not this pass; the panel says "Scripted UX preview · No live LLM".
 */
import { packs, type Chapter } from './domain';
import type { Mission } from './types';

export function answer(m: Mission, chapters: Chapter[], stage: number, q: string): string {
  if (/attach|file|evidence/i.test(q)) return 'Start with ' + packs[m.process].files[0][1] + '. The evidence workspace names each file, its source, useful fields and what it can establish. Images and PDFs add context; event timestamps are needed to reconstruct pathways.';
  if (/who|help|colleague/i.test(q)) return 'Add the person’s name, designation and process responsibility in People & ownership. “Ask your team” prepares an assigned contribution request. Invitation sending and shared access are not connected in this preview.';
  if (/token|top.?up|allowance/i.test(q)) return 'Activation is outside this mission. Agent allowance shows available, low and exhausted states. A top-up resumes work from the saved checkpoint; this preview does not process payments.';
  if (/why|asking/i.test(q)) return 'This chapter helps establish ' + (chapters[stage]?.[1].toLowerCase() || 'your process context') + '. Your answer remains distinguishable from recorded evidence. Unknowns can be assigned to a colleague.';
  return 'Your question has been kept in this mission. This scripted preview explains evidence, contributors and allowance. Use the process board or “Ask your team” to capture details that should enter the assessment. A live LLM can provide broader guidance later.';
}
