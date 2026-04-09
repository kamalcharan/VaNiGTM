/**
 * client-skill: get_risk_profile
 * Detailed risk profile with computed capacity factors and allocation recommendation.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

const GET_RISK_PROFILE_SQL = fs.readFileSync(
  path.join(__dirname, '../queries/get-risk-profile.sql'), 'utf-8'
);

interface GetRiskProfileParams {
  client_id: number;
}

interface RiskFactor {
  factor: string;
  value: string;
  impact: 'positive' | 'neutral' | 'negative';
  note: string;
}

interface RiskDimension {
  score: string;
  factors: RiskFactor[];
}

interface RiskProfileResult {
  recipe: 'detail-sidebar';
  client_name: string;
  overall_risk: string;
  risk_capacity: RiskDimension;
  risk_tolerance: { score: string };
  risk_required: { score: string };
  recommendation: string;
  updated_at: string | null;
}

const ALLOCATIONS: Record<string, { equity: number; debt: number; label: string }> = {
  'conservative':          { equity: 20,  debt: 80, label: '20:80' },
  'moderate-conservative': { equity: 40,  debt: 60, label: '40:60' },
  'moderate':              { equity: 60,  debt: 40, label: '60:40' },
  'moderate-aggressive':   { equity: 70,  debt: 30, label: '70:30' },
  'aggressive':            { equity: 80,  debt: 20, label: '80:20' },
};

const ALLOC_DESCRIPTIONS: Record<string, string> = {
  'conservative':          'Suggested allocation: 20:80 (equity:debt) — capital preservation priority',
  'moderate-conservative': 'Suggested allocation: 40:60 (equity:debt) — steady growth with downside protection',
  'moderate':              'Suggested allocation: 60:40 (equity:debt) — balanced growth',
  'moderate-aggressive':   'Suggested allocation: 70:30 (equity:debt) — growth-oriented with moderate buffer',
  'aggressive':            'Suggested allocation: 80:20 (equity:debt) — maximum growth potential',
};

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) age--;
  return age;
}

function computeCapacityFactors(row: Record<string, unknown>): RiskFactor[] {
  const factors: RiskFactor[] = [];

  // Age factor
  const age = calcAge((row.dob as string) ?? null);
  if (age !== null) {
    let impact: RiskFactor['impact'];
    let note: string;
    if (age < 35) {
      impact = 'positive'; note = 'Long investment horizon ahead';
    } else if (age < 45) {
      impact = 'positive'; note = 'Good years of earning ahead';
    } else if (age < 55) {
      impact = 'neutral'; note = 'Mid-career phase';
    } else if (age < 65) {
      impact = 'negative'; note = 'Approaching retirement — reduce volatility';
    } else {
      impact = 'negative'; note = 'Post-retirement — capital preservation important';
    }
    factors.push({ factor: 'Age', value: `${age} years`, impact, note });
  }

  // Income factor
  const income = Number(row.annual_income ?? 0);
  if (income > 0) {
    let impact: RiskFactor['impact'];
    let note: string;
    if (income >= 2000000) {
      impact = 'positive'; note = 'High income supports higher risk';
    } else if (income >= 800000) {
      impact = 'neutral'; note = 'Moderate income — balanced approach';
    } else {
      impact = 'negative'; note = 'Lower income limits risk capacity';
    }
    factors.push({
      factor: 'Income',
      value: `₹${(income / 100000).toFixed(1)}L/yr`,
      impact,
      note,
    });
  }

  // Investment horizon factor
  const avgYears = Number(row.avg_goal_years ?? 0);
  if (avgYears > 0) {
    let impact: RiskFactor['impact'];
    let note: string;
    if (avgYears > 10) {
      impact = 'positive'; note = 'Long horizon allows recovery from market dips';
    } else if (avgYears >= 5) {
      impact = 'neutral'; note = 'Medium horizon — balanced allocation suitable';
    } else {
      impact = 'negative'; note = 'Short horizon — limit volatility exposure';
    }
    factors.push({
      factor: 'Investment Horizon',
      value: `${avgYears.toFixed(1)} years avg`,
      impact,
      note,
    });
  }

  // Occupation factor
  const occupation = ((row.occupation as string) ?? '').toLowerCase();
  if (occupation) {
    let impact: RiskFactor['impact'];
    let note: string;
    if (/salaried|employee|government/.test(occupation)) {
      impact = 'positive'; note = 'Stable income supports consistent investing';
    } else if (/business|entrepreneur|self-employed|professional/.test(occupation)) {
      impact = 'neutral'; note = 'Variable income — maintain liquidity buffer';
    } else {
      impact = 'negative'; note = 'Income stability uncertain';
    }
    factors.push({
      factor: 'Occupation',
      value: (row.occupation as string),
      impact,
      note,
    });
  }

  return factors;
}

export async function get_risk_profile(
  params: GetRiskProfileParams,
  ctx: SkillContext
): Promise<RiskProfileResult | null> {
  const res = await ctx.db.query(GET_RISK_PROFILE_SQL, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $client_id: params.client_id,
  });

  const row = res.rows[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  const overallRisk = (row.risk_overall as string) ?? 'moderate';
  const recommendation = ALLOC_DESCRIPTIONS[overallRisk]
    ?? `Suggested allocation: ${ALLOCATIONS[overallRisk]?.label ?? '60:40'} (equity:debt)`;

  return {
    recipe:       'detail-sidebar',
    client_name:  String(row.name ?? ''),
    overall_risk: overallRisk,
    risk_capacity: {
      score:   (row.risk_capacity as string) ?? 'moderate',
      factors: computeCapacityFactors(row),
    },
    risk_tolerance: {
      score: (row.risk_tolerance as string) ?? 'moderate',
    },
    risk_required: {
      score: (row.risk_required as string) ?? 'moderate',
    },
    recommendation,
    updated_at: (row.updated_at as string) ?? null,
  };
}
