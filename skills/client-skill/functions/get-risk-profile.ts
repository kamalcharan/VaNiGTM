/**
 * KI-27: get_risk_profile — Detailed risk assessment.
 * Risk levels: conservative, moderate-conservative, moderate, moderate-aggressive, aggressive
 */

import { SkillContext } from '../../../shared/types';

interface ClientRiskRow {
  name: string;
  risk_capacity: string | null;
  risk_tolerance: string | null;
  risk_required: string | null;
  risk_overall: string | null;
  annual_income: number | null;
  dob: string | null;
  occupation: string | null;
  total_invested: number;
  current_value: number;
  goals_count: number;
  avg_goal_years: number | null;
  updated_at: string;
}

interface RiskFactor {
  factor: string;
  value: string;
  impact: string;
}

interface RiskDimension {
  score: string;
  factors: RiskFactor[];
}

interface GetRiskProfileResult {
  client_name: string;
  risk_capacity: RiskDimension;
  risk_tolerance: RiskDimension;
  risk_required: RiskDimension;
  overall_risk: string;
  recommendation: string;
  last_assessed: string | null;
  recipe: 'detail-sidebar';
}

const RISK_QUERY = `
  SELECT
    c.name,
    c.risk_capacity,
    c.risk_tolerance,
    c.risk_required,
    c.risk_overall,
    c.annual_income,
    c.dob,
    c.occupation,
    c.updated_at,
    COALESCE(ps.total_invested, 0) AS total_invested,
    COALESCE(ps.current_value, 0) AS current_value,
    COALESCE(gs.goals_count, 0) AS goals_count,
    gs.avg_goal_years
  FROM ki_clients c
  LEFT JOIN LATERAL (
    SELECT
      SUM(h.total_invested) AS total_invested,
      SUM(h.units * COALESCE(ln.nav, h.avg_nav)) AS current_value
    FROM ki_holdings h
    LEFT JOIN LATERAL (
      SELECT nav FROM ki_nav_history nh
      WHERE nh.scheme_code = h.scheme_code
      ORDER BY nh.nav_date DESC LIMIT 1
    ) ln ON true
    WHERE h.tenant_id = $tenant_id AND h.client_id = c.id AND h.units > 0
  ) ps ON true
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS goals_count,
      AVG(EXTRACT(YEAR FROM g.target_date) - EXTRACT(YEAR FROM now())) AS avg_goal_years
    FROM ki_goals g
    WHERE g.tenant_id = $tenant_id AND g.client_id = c.id AND g.status = 'active'
  ) gs ON true
  WHERE c.tenant_id = $tenant_id
    AND c.id = $client_id
`;

const RISK_RECOMMENDATIONS: Record<string, string> = {
  'conservative':
    'Focus on debt funds, liquid funds, and short-duration instruments. Limit equity exposure to 20-30% via large-cap index funds.',
  'moderate-conservative':
    'Balanced approach with 40-50% equity (large/multi-cap) and 50-60% debt. Consider hybrid funds for simplicity.',
  'moderate':
    'Balanced 60:40 equity-debt split. Diversify across large, mid, and flexi-cap categories. Systematic investment recommended.',
  'moderate-aggressive':
    'Higher equity allocation (70-80%). Include mid-cap and small-cap exposure. Maintain 3-6 month emergency fund in liquid.',
  'aggressive':
    'Equity-heavy portfolio (80%+). Can include sectoral/thematic exposure. Long time horizon essential. SIP preferred over lump sum.',
};

function calculateAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

function buildCapacityFactors(row: ClientRiskRow): RiskFactor[] {
  const factors: RiskFactor[] = [];
  const age = calculateAge(row.dob);

  if (age !== null) {
    factors.push({
      factor: 'Age',
      value: `${age} years`,
      impact: age < 35 ? 'positive' : age < 50 ? 'neutral' : 'negative',
    });
  }

  if (row.annual_income) {
    factors.push({
      factor: 'Annual Income',
      value: `₹${Number(row.annual_income).toLocaleString('en-IN')}`,
      impact: row.annual_income > 1500000 ? 'positive' : 'neutral',
    });
  }

  if (row.current_value > 0) {
    factors.push({
      factor: 'Portfolio Size',
      value: `₹${Number(row.current_value).toLocaleString('en-IN')}`,
      impact: 'neutral',
    });
  }

  return factors;
}

function buildToleranceFactors(row: ClientRiskRow): RiskFactor[] {
  return [
    {
      factor: 'Self-assessed tolerance',
      value: row.risk_tolerance || 'not assessed',
      impact: 'neutral',
    },
  ];
}

function buildRequiredFactors(row: ClientRiskRow): RiskFactor[] {
  const factors: RiskFactor[] = [];

  if (row.goals_count > 0) {
    factors.push({
      factor: 'Active Goals',
      value: String(row.goals_count),
      impact: 'neutral',
    });
  }

  if (row.avg_goal_years !== null) {
    factors.push({
      factor: 'Avg Goal Horizon',
      value: `${Math.round(row.avg_goal_years)} years`,
      impact: row.avg_goal_years > 7 ? 'positive' : row.avg_goal_years > 3 ? 'neutral' : 'negative',
    });
  }

  return factors;
}

export async function get_risk_profile(
  params: { client_id: number },
  ctx: SkillContext
): Promise<GetRiskProfileResult | null> {
  const { client_id } = params;

  const result = await ctx.db.query<ClientRiskRow>(RISK_QUERY, {
    $tenant_id: ctx.tenant_id,
    $client_id: client_id,
  });

  if (result.rows.length === 0) return null;

  const row = result.rows[0];
  const overall = row.risk_overall || 'moderate';

  return {
    client_name: row.name,
    risk_capacity: {
      score: row.risk_capacity || 'not assessed',
      factors: buildCapacityFactors(row),
    },
    risk_tolerance: {
      score: row.risk_tolerance || 'not assessed',
      factors: buildToleranceFactors(row),
    },
    risk_required: {
      score: row.risk_required || 'not assessed',
      factors: buildRequiredFactors(row),
    },
    overall_risk: overall,
    recommendation: RISK_RECOMMENDATIONS[overall] || RISK_RECOMMENDATIONS['moderate'],
    last_assessed: row.updated_at || null,
    recipe: 'detail-sidebar',
  };
}
