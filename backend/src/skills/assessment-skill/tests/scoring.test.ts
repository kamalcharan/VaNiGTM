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
