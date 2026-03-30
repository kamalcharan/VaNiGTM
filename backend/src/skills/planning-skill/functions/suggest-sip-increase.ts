/**
 * KI-29: suggest_sip_increase — Calculates required SIP to achieve
 * a target probability of goal success.
 * Uses binary search to find the SIP amount.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';
import {
  inflateTarget,
  calcFinalCorpus,
  calcProbability,
  monthsRemaining,
} from './planning-math';

interface GoalRow {
  id: number;
  name: string;
  target_amount: number;
  target_date: string;
  current_corpus: number;
  monthly_sip: number;
  inflation_rate: number;
  expected_return: number;
}

interface SuggestSipIncreaseResult {
  current_sip: number;
  required_sip: number;
  increase_amount: number;
  increase_pct: number;
  new_probability: number;
  recipe: 'suggestion';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/goal-by-id.sql'),
  'utf-8'
);

export async function suggest_sip_increase(
  params: { client_id: number; goal_id: number; target_probability: number },
  ctx: SkillContext
): Promise<SuggestSipIncreaseResult | null> {
  const { client_id, goal_id, target_probability } = params;

  const result = await ctx.db.query<GoalRow>(QUERY, {
    $tenant_id: ctx.tenant_id,
    $client_id: client_id,
    $goal_id: goal_id,
  });

  if (result.rows.length === 0) return null;

  const g = result.rows[0];
  const months = monthsRemaining(g.target_date);
  const currentCorpus = Number(g.current_corpus);
  const currentSip = Number(g.monthly_sip);
  const expectedReturn = Number(g.expected_return);
  const inflationRate = Number(g.inflation_rate);

  const inflatedTarget = inflateTarget(
    Number(g.target_amount),
    inflationRate,
    months / 12
  );

  // Target corpus = inflatedTarget * target_probability ratio
  // We want: projected_corpus / inflatedTarget >= target_probability
  // So: projected_corpus >= inflatedTarget * target_probability
  const targetCorpus = inflatedTarget * target_probability;

  // Binary search for the SIP that achieves target corpus
  let low = 0;
  let high = Math.max(targetCorpus, currentSip * 10);
  const TOLERANCE = 1;
  let requiredSip = currentSip;

  for (let i = 0; i < 100; i++) {
    const mid = (low + high) / 2;
    const projected = calcFinalCorpus(currentCorpus, mid, expectedReturn, months);
    const prob = calcProbability(projected, inflatedTarget);

    if (Math.abs(prob - target_probability) < 0.001) {
      requiredSip = Math.ceil(mid);
      break;
    }

    if (prob < target_probability) {
      low = mid;
    } else {
      high = mid;
    }
    requiredSip = Math.ceil(mid);
  }

  // Calculate new probability with the found SIP
  const newProjected = calcFinalCorpus(currentCorpus, requiredSip, expectedReturn, months);
  const new_probability = calcProbability(newProjected, inflatedTarget);

  const increase_amount = Math.max(requiredSip - currentSip, 0);
  const increase_pct =
    currentSip > 0
      ? Math.round((increase_amount / currentSip) * 10000) / 100
      : 0;

  return {
    current_sip: currentSip,
    required_sip: requiredSip,
    increase_amount,
    increase_pct,
    new_probability,
    recipe: 'suggestion',
  };
}
