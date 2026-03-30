/**
 * KI-29: calc_goal_gap — Shortfall analysis.
 * Inflates target, compares projected corpus vs target, computes deficit.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';
import {
  inflateTarget,
  calcFinalCorpus,
  findRequiredSip,
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

interface CalcGoalGapResult {
  goal_name: string;
  target_amount_inflated: number;
  current_corpus: number;
  projected_corpus: number;
  gap_amount: number;
  current_sip: number;
  required_sip: number;
  sip_deficit: number;
  months_remaining: number;
  recipe: 'goal-deep-dive';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/goal-by-id.sql'),
  'utf-8'
);

export async function calc_goal_gap(
  params: { client_id: number; goal_id: number },
  ctx: SkillContext
): Promise<CalcGoalGapResult | null> {
  const { client_id, goal_id } = params;

  const result = await ctx.db.query<GoalRow>(QUERY, {
    $tenant_id: ctx.tenant_id,
    $client_id: client_id,
    $goal_id: goal_id,
  });

  if (result.rows.length === 0) return null;

  const g = result.rows[0];
  const months = monthsRemaining(g.target_date);
  const years = months / 12;

  const target_amount_inflated = Math.round(
    inflateTarget(Number(g.target_amount), Number(g.inflation_rate), years)
  );

  const current_corpus = Number(g.current_corpus);
  const monthly_sip = Number(g.monthly_sip);
  const expected_return = Number(g.expected_return);

  const projected_corpus = calcFinalCorpus(
    current_corpus,
    monthly_sip,
    expected_return,
    months
  );

  const gap_amount = Math.max(
    Math.round(target_amount_inflated - projected_corpus),
    0
  );

  const required_sip = findRequiredSip(
    current_corpus,
    expected_return,
    months,
    target_amount_inflated
  );

  const sip_deficit = Math.max(required_sip - monthly_sip, 0);

  return {
    goal_name: g.name,
    target_amount_inflated,
    current_corpus,
    projected_corpus,
    gap_amount,
    current_sip: monthly_sip,
    required_sip,
    sip_deficit,
    months_remaining: months,
    recipe: 'goal-deep-dive',
  };
}
