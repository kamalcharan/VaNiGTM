/**
 * assessment-skill: fallback narrative
 *
 * Fills gt_assessment_def.definition.narrative_prompt.fallback's merge
 * fields from a computed ScoreResult. This is the ONLY narrative path in
 * Task A1 — no LLM call, no Qwen3, per the Agent Topology note's "no
 * prospect-facing path blocks on inference; deterministic result first,
 * enrichment after, template fallback always" (§5/§12) and per this task's
 * explicit scope ("No LLM, no email in this task — those are Phase B").
 *
 * When the LLM narrative path is built (Phase B, per the Topology note's
 * Assessment Agent / ASSESSMENT_COMPLETED event), this fallback stays
 * exactly as-is — it's the permanent fallback, not a placeholder for this
 * task only.
 */

import type { ScoreResult } from './scoring';

export function fillFallbackNarrative(
  fallbackTemplate: string,
  score: ScoreResult,
): string {
  const [m1, m2, m3] = score.top_modes;

  const fields: Record<string, string> = {
    health: String(score.health),
    band: score.band.label,
    band_verdict: score.band.verdict,
    mode1_name: m1?.name ?? '',
    mode1_pct: String(m1?.exposure_pct ?? ''),
    mode2_name: m2?.name ?? '',
    mode2_pct: String(m2?.exposure_pct ?? ''),
    mode3_name: m3?.name ?? '',
    mode3_pct: String(m3?.exposure_pct ?? ''),
  };

  return fallbackTemplate.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return key in fields ? fields[key] : match;
  });
}
