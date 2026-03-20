/**
 * KI-29: get_goals — Returns all financial goals for a client with current status.
 */

import { SkillContext } from '../../../shared/types';
import * as fs from 'fs';
import * as path from 'path';

interface GoalRow {
  id: number;
  name: string;
  type: string;
  target_amount: number;
  target_date: string;
  current_corpus: number;
  monthly_sip: number;
  inflation_rate: number;
  expected_return: number;
  probability: number | null;
  status: string;
}

interface GoalItem {
  id: number;
  name: string;
  type: string;
  target_amount: number;
  target_date: string;
  current_corpus: number;
  monthly_sip: number;
  inflation_rate: number;
  expected_return: number;
  probability: number | null;
  status: string;
}

interface GetGoalsResult {
  goals: GoalItem[];
  recipe: 'goal-dashboard';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/goals-by-client.sql'),
  'utf-8'
);

export async function get_goals(
  params: { client_id: number },
  ctx: SkillContext
): Promise<GetGoalsResult> {
  const result = await ctx.db.query<GoalRow>(QUERY, {
    $tenant_id: ctx.tenant_id,
    $client_id: params.client_id,
  });

  const goals: GoalItem[] = result.rows.map((r) => ({
    id: r.id,
    name: r.name,
    type: r.type,
    target_amount: Number(r.target_amount),
    target_date: r.target_date,
    current_corpus: Number(r.current_corpus),
    monthly_sip: Number(r.monthly_sip),
    inflation_rate: Number(r.inflation_rate),
    expected_return: Number(r.expected_return),
    probability: r.probability !== null ? Number(r.probability) : null,
    status: r.status,
  }));

  return { goals, recipe: 'goal-dashboard' };
}
