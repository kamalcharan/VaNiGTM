/**
 * KI-29: Shared planning math utilities.
 * Deterministic compound growth with inflation — NOT Monte Carlo for MVP.
 *
 * Default returns: equity 12%, debt 7%, gold 8%.
 * Default inflation: 6% general, 10% education, 8% medical.
 */

/** Inflate a target amount to future value */
export function inflateTarget(
  presentValue: number,
  inflationRate: number,
  years: number
): number {
  return presentValue * Math.pow(1 + inflationRate / 100, years);
}

/** Monthly return rate from annual percentage */
export function monthlyRate(annualPct: number): number {
  return Math.pow(1 + annualPct / 100, 1 / 12) - 1;
}

/**
 * Project corpus over N months with a given SIP and expected return.
 * Returns array of monthly projections.
 */
export interface Projection {
  month: number;
  corpus: number;
  contributions: number;
  growth: number;
}

export function projectCorpus(
  currentCorpus: number,
  monthlySip: number,
  annualReturnPct: number,
  months: number
): Projection[] {
  const mr = monthlyRate(annualReturnPct);
  const projections: Projection[] = [];

  let corpus = currentCorpus;
  let totalContributions = currentCorpus;
  let totalGrowth = 0;

  for (let m = 0; m <= months; m++) {
    if (m === 0) {
      projections.push({
        month: 0,
        corpus: Math.round(corpus * 100) / 100,
        contributions: Math.round(totalContributions * 100) / 100,
        growth: 0,
      });
      continue;
    }

    // Growth on existing corpus
    const monthGrowth = corpus * mr;
    totalGrowth += monthGrowth;

    // Add SIP contribution
    corpus = corpus + monthGrowth + monthlySip;
    totalContributions += monthlySip;

    projections.push({
      month: m,
      corpus: Math.round(corpus * 100) / 100,
      contributions: Math.round(totalContributions * 100) / 100,
      growth: Math.round(totalGrowth * 100) / 100,
    });
  }

  return projections;
}

/**
 * Calculate final corpus at target date given current state.
 */
export function calcFinalCorpus(
  currentCorpus: number,
  monthlySip: number,
  annualReturnPct: number,
  months: number
): number {
  const mr = monthlyRate(annualReturnPct);
  let corpus = currentCorpus;

  for (let m = 0; m < months; m++) {
    corpus = corpus * (1 + mr) + monthlySip;
  }

  return Math.round(corpus * 100) / 100;
}

/**
 * Calculate probability as ratio of projected corpus to inflated target.
 * Capped at 1.0.
 */
export function calcProbability(
  projectedCorpus: number,
  inflatedTarget: number
): number {
  if (inflatedTarget <= 0) return 1.0;
  const prob = projectedCorpus / inflatedTarget;
  return Math.min(Math.round(prob * 10000) / 10000, 1.0);
}

/**
 * Calculate months remaining from today to target date.
 */
export function monthsRemaining(targetDate: string): number {
  const target = new Date(targetDate);
  const now = new Date();
  const months =
    (target.getFullYear() - now.getFullYear()) * 12 +
    (target.getMonth() - now.getMonth());
  return Math.max(months, 0);
}

/**
 * Get default inflation rate by goal type.
 */
export function defaultInflation(goalType: string): number {
  switch (goalType) {
    case 'education':
      return 10;
    case 'retirement':
    case 'house':
    case 'wedding':
    case 'vehicle':
    case 'travel':
    case 'custom':
    default:
      return 6;
  }
}

/**
 * Find SIP needed to hit a target corpus using binary search.
 */
export function findRequiredSip(
  currentCorpus: number,
  annualReturnPct: number,
  months: number,
  targetCorpus: number
): number {
  if (months <= 0) return 0;

  // Check if current corpus already meets target
  const corpusWithNoSip = calcFinalCorpus(currentCorpus, 0, annualReturnPct, months);
  if (corpusWithNoSip >= targetCorpus) return 0;

  // Binary search for SIP amount
  let low = 0;
  let high = targetCorpus; // Upper bound: entire target as monthly SIP
  const TOLERANCE = 1; // ₹1 tolerance

  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const projected = calcFinalCorpus(currentCorpus, mid, annualReturnPct, months);

    if (Math.abs(projected - targetCorpus) < TOLERANCE) {
      return Math.ceil(mid);
    }

    if (projected < targetCorpus) {
      low = mid;
    } else {
      high = mid;
    }
  }

  return Math.ceil((low + high) / 2);
}
