/**
 * assessment-skill: deterministic scoring
 *
 * Pure function, no I/O, no LLM. Implements exactly the two formulas carried
 * in every gt_assessment_def.definition JSON's `scoring` block:
 *
 *   exposure_m = 100 * SUM(w_qm * score_q) / SUM(w_qm * max_option_score)
 *   health     = round(100 - SUM(mode_weight_m * exposure_m) / SUM(mode_weight_m))
 *
 * Nothing here is hardcoded to the ai-recovery assessment's ten failure
 * modes or twelve questions — a second assessment is one new
 * gt_assessment_def row with a different `definition`, and this function
 * scores it correctly with zero changes, per the vikunawebsite guardrail
 * "config-driven survey engine... second assessment = one DB row, zero
 * code."
 *
 * Originally drafted as a Postgres SQL function (see vikunawebsite repo
 * docs/sql/ws2.3-assessment-flow.sql) under the standalone `vani` schema
 * design. Reimplemented here in TypeScript because that's this codebase's
 * actual convention — business logic in skill functions/services, SQL
 * reserved for queries/ and infra (set_tenant_context, gt_next_seq) — not
 * because "deterministic SQL scoring" (the guardrail) required a literal
 * SQL function. The guardrail's point was "never the LLM"; this still
 * satisfies that exactly, and is unit-tested (tests/scoring.test.ts)
 * without a database, which the SQL version couldn't be.
 *
 * `answers` is {question_id: option_index} — the option's INDEX in that
 * question's options array, never the score value directly. The score is
 * always looked up here from `definition`, so a tampered client answer can
 * only select a different valid option, never inject an arbitrary score.
 * Malformed input (an index the definition doesn't have) is NOT guarded
 * here — this function assumes well-formed input; the caller
 * (assessment.agent.ts's completeAssessment) validates every scored
 * question has an answer before calling this.
 */

export interface AssessmentOption {
  label: string;
  score: number;
}

export interface AssessmentQuestion {
  id: string;
  context_only?: boolean;
  modes: Record<string, number>;   // mode_key -> weight for THIS question
  framing: string;
  text: string;
  options: AssessmentOption[];
}

export interface AssessmentMode {
  key: string;
  name: string;
  composite_weight: number;
  symptom: string;
  remediation: string;
  route_service: string;
  route_label: string;
  referral_line: string;
}

export interface AssessmentBand {
  key: string;
  label: string;
  min: number;
  max: number;
  color: string;
  verdict: string;
  next_step: string;
}

export interface AssessmentDefinition {
  scoring: {
    option_scale: number[];
    top_modes_reported: number;
    bands: AssessmentBand[];
  };
  modes: AssessmentMode[];
  questions: AssessmentQuestion[];
}

export interface ScoredMode {
  key: string;
  name: string;
  exposure_pct: number;
  symptom: string;
  remediation: string;
  route_service: string;
  route_label: string;
  referral_line: string;
}

export interface ScoreResult {
  health: number;
  band: AssessmentBand;
  top_modes: ScoredMode[];
  all_modes: Array<{ key: string; name: string; exposure_pct: number }>;
}

export function scoreResponse(
  definition: AssessmentDefinition,
  answers: Record<string, number>,
): ScoreResult {
  const maxOptionScore = Math.max(...definition.scoring.option_scale);

  // mode_key -> { weightedSum, weightSum }
  const modeAccum = new Map<string, { weightedSum: number; weightSum: number }>();

  for (const q of definition.questions) {
    if (q.context_only) continue;
    const optionIndex = answers[q.id];
    if (optionIndex === undefined || optionIndex === null) continue;

    const option = q.options[optionIndex];
    if (!option) continue;   // out-of-range index — silently skipped, not scored
    const score = option.score;

    for (const [modeKey, weight] of Object.entries(q.modes ?? {})) {
      const acc = modeAccum.get(modeKey) ?? { weightedSum: 0, weightSum: 0 };
      acc.weightedSum += weight * score;
      acc.weightSum += weight * maxOptionScore;
      modeAccum.set(modeKey, acc);
    }
  }

  const scoredModes: ScoredMode[] = definition.modes.map((mode) => {
    const acc = modeAccum.get(mode.key);
    const exposure_pct = acc && acc.weightSum > 0
      ? (100 * acc.weightedSum) / acc.weightSum
      : 0;
    return {
      key: mode.key,
      name: mode.name,
      exposure_pct,
      symptom: mode.symptom,
      remediation: mode.remediation,
      route_service: mode.route_service,
      route_label: mode.route_label,
      referral_line: mode.referral_line,
    };
  });

  const weightSum = definition.modes.reduce((s, m) => s + m.composite_weight, 0);
  const weightedExposureSum = definition.modes.reduce((s, m) => {
    const scored = scoredModes.find((sm) => sm.key === m.key)!;
    return s + m.composite_weight * scored.exposure_pct;
  }, 0);
  const health = weightSum > 0 ? Math.round(100 - weightedExposureSum / weightSum) : 0;

  const band = definition.scoring.bands.find((b) => health >= b.min && health <= b.max)
    ?? definition.scoring.bands[definition.scoring.bands.length - 1];

  // Deterministic tie-break, applied to ONE canonical order that both
  // top_modes and all_modes slice from (previously two separate .sort()
  // calls — both stable, but on exposure_pct alone, so a tie fell back to
  // whatever position the mode happened to occupy in definition.modes. That
  // was reproducible but not a stated rule, and would have silently
  // reordered ties the day someone reordered the modes array. Explicit rule
  // now: exposure_pct desc, then composite_weight desc (the more severe
  // failure mode wins a tie), then mode key ascending as a final,
  // always-available tiebreaker. Note "F10" sorts before "F2" under plain
  // string comparison — intentional (asked for "mode key asc", not
  // numeric-aware), and harmless since ties this exact are rare and the key
  // is never shown to the respondent.
  const weightByKey = new Map(definition.modes.map((m) => [m.key, m.composite_weight]));
  const orderedModes = [...scoredModes].sort((a, b) => {
    if (b.exposure_pct !== a.exposure_pct) return b.exposure_pct - a.exposure_pct;
    const wa = weightByKey.get(a.key) ?? 0;
    const wb = weightByKey.get(b.key) ?? 0;
    if (wb !== wa) return wb - wa;
    return a.key < b.key ? -1 : a.key > b.key ? 1 : 0;
  });

  const topN = definition.scoring.top_modes_reported ?? 3;
  const top_modes = orderedModes
    .slice(0, topN)
    .map((m) => ({ ...m, exposure_pct: Math.round(m.exposure_pct) }));

  const all_modes = orderedModes
    .map((m) => ({ key: m.key, name: m.name, exposure_pct: Math.round(m.exposure_pct) }));

  return { health, band, top_modes, all_modes };
}
