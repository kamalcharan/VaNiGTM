/**
 * KI-29: project_goal — Deterministic projection to target date.
 * Optional scenario parameter for what-if analysis.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';
import {
  inflateTarget,
  projectCorpus,
  calcProbability,
  monthsRemaining,
  Projection,
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

interface Scenario {
  sip_amount?: number;
  expected_return?: number;
  inflation_rate?: number;
  additional_lumpsum?: number;
}

interface ProjectGoalResult {
  projections: Projection[];
  final_corpus: number;
  probability: number;
  target_met: boolean;
  recipe: 'goal-deep-dive';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/goal-by-id.sql'),
  'utf-8'
);

export async function project_goal(
  params: { client_id: number; goal_id: number; scenario?: Scenario },
  ctx: SkillContext
): Promise<ProjectGoalResult | null> {
  const { client_id, goal_id, scenario } = params;

  const result = await ctx.db.query<GoalRow>(QUERY, {
    $tenant_id: ctx.tenant_id,
    $client_id: client_id,
    $goal_id: goal_id,
  });

  if (result.rows.length === 0) return null;

  const g = result.rows[0];
  const months = monthsRemaining(g.target_date);

  // Apply scenario overrides
  const monthlySip = scenario?.sip_amount ?? Number(g.monthly_sip);
  const expectedReturn = scenario?.expected_return ?? Number(g.expected_return);
  const inflationRate = scenario?.inflation_rate ?? Number(g.inflation_rate);
  const lumpsum = scenario?.additional_lumpsum ?? 0;

  const startCorpus = Number(g.current_corpus) + lumpsum;

  const projections = projectCorpus(startCorpus, monthlySip, expectedReturn, months);

  const final_corpus = projections.length > 0
    ? projections[projections.length - 1].corpus
    : startCorpus;

  const inflatedTarget = inflateTarget(
    Number(g.target_amount),
    inflationRate,
    months / 12
  );

  const probability = calcProbability(final_corpus, inflatedTarget);
  const target_met = final_corpus >= inflatedTarget;

  return {
    projections,
    final_corpus,
    probability,
    target_met,
    recipe: 'goal-deep-dive',
  };
}
