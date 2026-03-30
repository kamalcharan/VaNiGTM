/**
 * KI-29: create_goal — Creates a new financial goal for a client.
 * INSERT with tenant_id from ctx, returns the new goal with computed probability.
 */

import { SkillContext } from '../../../shared/types';
import {
  defaultInflation,
  inflateTarget,
  calcFinalCorpus,
  calcProbability,
  findRequiredSip,
  monthsRemaining,
} from './planning-math';

interface CreateGoalParams {
  name: string;
  type: string;
  target_amount: number;
  target_date: string;
  inflation_rate?: number;
  expected_return?: number;
  linked_schemes?: string[];
}

interface InsertedGoalRow {
  id: number;
}

interface CreateGoalResult {
  goal_id: number;
  name: string;
  target_amount: number;
  monthly_sip_needed: number;
  probability: number;
  recipe: 'goal-dashboard';
}

const INSERT_QUERY = `
  INSERT INTO ki_goals (
    tenant_id, client_id, name, goal_type, target_amount, target_date,
    inflation_rate, expected_return, current_corpus, monthly_sip,
    probability, status, linked_schemes
  ) VALUES (
    $tenant_id, $client_id, $name, $type, $target_amount, $target_date,
    $inflation_rate, $expected_return, 0, $monthly_sip,
    $probability, 'active', $linked_schemes
  )
  RETURNING id
`;

export async function create_goal(
  params: { client_id: number; params: CreateGoalParams },
  ctx: SkillContext
): Promise<CreateGoalResult> {
  const { client_id } = params;
  const gp = params.params;

  const inflationRate = gp.inflation_rate ?? defaultInflation(gp.type);
  const expectedReturn = gp.expected_return ?? 12; // Default equity return

  const months = monthsRemaining(gp.target_date);
  const inflatedTarget = inflateTarget(gp.target_amount, inflationRate, months / 12);

  // Calculate SIP needed to hit 80% probability (reasonable default)
  const targetCorpus80 = inflatedTarget * 0.8;
  const monthlySipNeeded = findRequiredSip(0, expectedReturn, months, targetCorpus80);

  // Calculate probability with that SIP
  const projectedCorpus = calcFinalCorpus(0, monthlySipNeeded, expectedReturn, months);
  const probability = calcProbability(projectedCorpus, inflatedTarget);

  const result = await ctx.db.query<InsertedGoalRow>(INSERT_QUERY, {
    $tenant_id: ctx.tenant_id,
    $client_id: client_id,
    $name: gp.name,
    $type: gp.type,
    $target_amount: gp.target_amount,
    $target_date: gp.target_date,
    $inflation_rate: inflationRate,
    $expected_return: expectedReturn,
    $monthly_sip: monthlySipNeeded,
    $probability: probability,
    $linked_schemes: gp.linked_schemes || [],
  });

  const goal_id = result.rows[0]?.id ?? 0;

  return {
    goal_id,
    name: gp.name,
    target_amount: gp.target_amount,
    monthly_sip_needed: monthlySipNeeded,
    probability,
    recipe: 'goal-dashboard',
  };
}
