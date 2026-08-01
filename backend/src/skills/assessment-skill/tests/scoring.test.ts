/**
 * scoring.test.ts — pure logic, no DB. Fixture is deliberately NOT the
 * ai-recovery instrument (twelve questions makes hand-verifying the
 * expected numbers error-prone) — a small two-mode fixture with numbers
 * worked out by hand below.
 */

import { scoreResponse, type AssessmentDefinition } from '../scoring';

const FIXTURE: AssessmentDefinition = {
  scoring: {
    option_scale: [0, 1, 2, 3],
    top_modes_reported: 2,
    bands: [
      { key: 'low', label: 'Low', min: 0, max: 50, color: 'red', verdict: 'v1', next_step: 'n1' },
      { key: 'high', label: 'High', min: 51, max: 100, color: 'green', verdict: 'v2', next_step: 'n2' },
    ],
  },
  modes: [
    { key: 'A', name: 'Mode A', composite_weight: 1.0, symptom: 's', remediation: 'r', route_service: 'x', route_label: 'X', referral_line: 'l' },
    { key: 'B', name: 'Mode B', composite_weight: 1.0, symptom: 's', remediation: 'r', route_service: 'x', route_label: 'X', referral_line: 'l' },
  ],
  questions: [
    {
      id: 'Q1', context_only: true, modes: {},
      framing: 'f', text: 'context question, must not affect score',
      options: [{ label: 'a', score: 0 }, { label: 'b', score: 1 }, { label: 'c', score: 2 }, { label: 'd', score: 3 }],
    },
    {
      id: 'Q2', modes: { A: 1.0 },
      framing: 'f', text: 'scores mode A',
      options: [{ label: 'a', score: 0 }, { label: 'b', score: 1 }, { label: 'c', score: 2 }, { label: 'd', score: 3 }],
    },
    {
      id: 'Q3', modes: { B: 1.0 },
      framing: 'f', text: 'scores mode B',
      options: [{ label: 'a', score: 0 }, { label: 'b', score: 1 }, { label: 'c', score: 2 }, { label: 'd', score: 3 }],
    },
  ],
};

describe('scoreResponse', () => {
  it('computes exposure/health/band from a hand-worked example', () => {
    // Q1 (context_only) answered but must not affect the score.
    // Q2 -> option index 2 -> score 2 -> mode A exposure = 100*2/3 = 66.67
    // Q3 -> option index 0 -> score 0 -> mode B exposure = 0
    // health = round(100 - (66.67 + 0) / 2) = round(66.67) = 67 -> band 'high'
    const result = scoreResponse(FIXTURE, { Q1: 3, Q2: 2, Q3: 0 });

    expect(result.health).toBe(67);
    expect(result.band.key).toBe('high');

    const modeA = result.all_modes.find((m) => m.key === 'A')!;
    const modeB = result.all_modes.find((m) => m.key === 'B')!;
    expect(modeA.exposure_pct).toBe(67);
    expect(modeB.exposure_pct).toBe(0);
  });

  it('ranks top_modes by exposure descending and respects top_modes_reported', () => {
    const result = scoreResponse(FIXTURE, { Q2: 3, Q3: 0 });
    expect(result.top_modes).toHaveLength(2);
    expect(result.top_modes[0].key).toBe('A');
    expect(result.top_modes[0].exposure_pct).toBe(100);
    expect(result.top_modes[1].key).toBe('B');
  });

  it('scores 0 exposure for a mode with no answered question (unanswered, not divide-by-zero)', () => {
    const result = scoreResponse(FIXTURE, { Q2: 1 });
    const modeB = result.all_modes.find((m) => m.key === 'B')!;
    expect(modeB.exposure_pct).toBe(0);
  });

  it('silently skips an out-of-range option index rather than throwing', () => {
    expect(() => scoreResponse(FIXTURE, { Q2: 99, Q3: 0 })).not.toThrow();
    const result = scoreResponse(FIXTURE, { Q2: 99, Q3: 0 });
    const modeA = result.all_modes.find((m) => m.key === 'A')!;
    expect(modeA.exposure_pct).toBe(0);
  });

  it('ignores a tampered client score by only trusting the option index', () => {
    // Same option index (2) must always produce the same score (2), even if
    // a hypothetical caller tried to pass a different "score" alongside —
    // scoreResponse's signature doesn't accept one, by design.
    const a = scoreResponse(FIXTURE, { Q2: 2, Q3: 0 });
    const b = scoreResponse(FIXTURE, { Q2: 2, Q3: 0 });
    expect(a.health).toBe(b.health);
  });
});

describe('scoreResponse tie-break', () => {
  // Three modes, each scored by exactly one question with weight 1.0, all
  // answered to the same score -> identical exposure_pct for all three.
  // A has a higher composite_weight than B/C (which are equal to each
  // other) -> expected order: A (weight wins), then B, then C (key asc).
  const TIE_FIXTURE: AssessmentDefinition = {
    scoring: {
      option_scale: [0, 1, 2],
      top_modes_reported: 3,
      bands: [{ key: 'x', label: 'X', min: 0, max: 100, color: 'grey', verdict: 'v', next_step: 'n' }],
    },
    modes: [
      { key: 'A', name: 'Mode A', composite_weight: 2.0, symptom: 's', remediation: 'r', route_service: 'x', route_label: 'X', referral_line: 'l' },
      { key: 'C', name: 'Mode C', composite_weight: 1.0, symptom: 's', remediation: 'r', route_service: 'x', route_label: 'X', referral_line: 'l' },
      { key: 'B', name: 'Mode B', composite_weight: 1.0, symptom: 's', remediation: 'r', route_service: 'x', route_label: 'X', referral_line: 'l' },
    ],
    questions: [
      { id: 'QA', modes: { A: 1.0 }, framing: 'f', text: 't', options: [{ label: 'a', score: 0 }, { label: 'b', score: 1 }, { label: 'c', score: 2 }] },
      { id: 'QB', modes: { B: 1.0 }, framing: 'f', text: 't', options: [{ label: 'a', score: 0 }, { label: 'b', score: 1 }, { label: 'c', score: 2 }] },
      { id: 'QC', modes: { C: 1.0 }, framing: 'f', text: 't', options: [{ label: 'a', score: 0 }, { label: 'b', score: 1 }, { label: 'c', score: 2 }] },
    ],
  };

  it('breaks an exposure tie by composite_weight descending, then mode key ascending', () => {
    const result = scoreResponse(TIE_FIXTURE, { QA: 2, QB: 2, QC: 2 });
    // All three at the same exposure_pct — order must not be definition.modes'
    // incidental array order (A, C, B), it must be the stated rule.
    expect(result.all_modes.map((m) => m.exposure_pct)).toEqual([100, 100, 100]);
    expect(result.all_modes.map((m) => m.key)).toEqual(['A', 'B', 'C']);
    expect(result.top_modes.map((m) => m.key)).toEqual(['A', 'B', 'C']);
  });

  it('is stable across repeated calls on identical input (same order every time)', () => {
    const runs = Array.from({ length: 5 }, () =>
      scoreResponse(TIE_FIXTURE, { QA: 2, QB: 2, QC: 2 }).all_modes.map((m) => m.key));
    expect(new Set(runs.map((r) => r.join(','))).size).toBe(1);
  });
});
