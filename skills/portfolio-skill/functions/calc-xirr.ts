/**
 * KI-25: calc_xirr — Calculates extended IRR using Newton-Raphson method.
 * Reference: KewalInvest pattern. All amounts in INR.
 */

import { SkillContext } from '../../../shared/types';

interface TransactionRow {
  txn_type: string;
  txn_date: string;
  amount: number;
  units: number;
}

interface HoldingRow {
  scheme_code: string;
  units: number;
  current_nav: number;
  total_invested: number;
}

interface CalcXirrResult {
  xirr_pct: number;
  period_days: number;
  invested: number;
  current_value: number;
  recipe: 'returns-card';
}

/** Cash flow entry for XIRR: negative = outflow, positive = inflow */
interface CashFlow {
  date: Date;
  amount: number;
}

/**
 * XIRR calculation using Newton-Raphson method.
 * cashflows: array of { date, amount } where negative = investment, positive = redemption/current value.
 */
export function computeXirr(cashflows: CashFlow[], guess = 0.1): number {
  if (cashflows.length < 2) return 0;

  const d0 = cashflows[0].date.getTime();
  const MS_PER_DAY = 86400000;

  function daysFromStart(d: Date): number {
    return (d.getTime() - d0) / MS_PER_DAY;
  }

  // NPV given rate r
  function npv(r: number): number {
    return cashflows.reduce((sum, cf) => {
      const t = daysFromStart(cf.date) / 365.0;
      return sum + cf.amount / Math.pow(1 + r, t);
    }, 0);
  }

  // Derivative of NPV w.r.t. r
  function dnpv(r: number): number {
    return cashflows.reduce((sum, cf) => {
      const t = daysFromStart(cf.date) / 365.0;
      return sum + (-t * cf.amount) / Math.pow(1 + r, t + 1);
    }, 0);
  }

  const MAX_ITERATIONS = 100;
  const TOLERANCE = 1e-7;
  let rate = guess;

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    const fValue = npv(rate);
    const fDerivative = dnpv(rate);

    if (Math.abs(fDerivative) < 1e-10) break;

    const newRate = rate - fValue / fDerivative;

    if (Math.abs(newRate - rate) < TOLERANCE) {
      return Math.round(newRate * 10000) / 100; // Return as percentage with 2 decimals
    }

    rate = newRate;

    // Guard against divergence
    if (rate < -0.99) rate = -0.99;
    if (rate > 100) rate = 100;
  }

  return Math.round(rate * 10000) / 100;
}

const TRANSACTIONS_QUERY = `
  SELECT txn_type, txn_date, amount, units
  FROM ki_transactions
  WHERE tenant_id = $tenant_id
    AND client_id = $client_id
    {{SCHEME_FILTER}}
  ORDER BY txn_date ASC
`;

const HOLDINGS_QUERY = `
  SELECT h.scheme_code, h.units, h.total_invested,
         COALESCE(ln.nav, h.avg_nav) AS current_nav
  FROM ki_holdings h
  LEFT JOIN LATERAL (
    SELECT nav FROM ki_nav_history nh
    WHERE nh.scheme_code = h.scheme_code
    ORDER BY nh.nav_date DESC LIMIT 1
  ) ln ON true
  WHERE h.tenant_id = $tenant_id
    AND h.client_id = $client_id
    AND h.units > 0
    {{SCHEME_FILTER}}
`;

export async function calc_xirr(
  params: { client_id: number; scheme_code?: string },
  ctx: SkillContext
): Promise<CalcXirrResult> {
  const { client_id, scheme_code } = params;

  const schemeFilter = scheme_code
    ? 'AND scheme_code = $scheme_code'
    : '';

  const queryParams: Record<string, unknown> = {
    $tenant_id: ctx.tenant_id,
    $client_id: client_id,
  };
  if (scheme_code) {
    queryParams.$scheme_code = scheme_code;
  }

  // Fetch transactions and current holdings in parallel
  const [txnResult, holdingsResult] = await Promise.all([
    ctx.db.query<TransactionRow>(
      TRANSACTIONS_QUERY.replace('{{SCHEME_FILTER}}', schemeFilter),
      queryParams
    ),
    ctx.db.query<HoldingRow>(
      HOLDINGS_QUERY.replace('{{SCHEME_FILTER}}', schemeFilter),
      queryParams
    ),
  ]);

  const cashflows: CashFlow[] = [];

  // Build cashflows from transactions
  for (const txn of txnResult.rows) {
    const date = new Date(txn.txn_date);
    const amount = Number(txn.amount);

    if (['purchase', 'switch_in', 'dividend_reinvest'].includes(txn.txn_type)) {
      cashflows.push({ date, amount: -amount }); // outflow
    } else if (['redemption', 'switch_out', 'dividend_payout'].includes(txn.txn_type)) {
      cashflows.push({ date, amount }); // inflow
    }
  }

  // Add current value as final inflow (today)
  const today = new Date();
  let current_value = 0;
  let invested = 0;

  for (const h of holdingsResult.rows) {
    current_value += Number(h.units) * Number(h.current_nav);
    invested += Number(h.total_invested);
  }

  if (current_value > 0) {
    cashflows.push({ date: today, amount: current_value });
  }

  // Calculate period
  let period_days = 0;
  if (cashflows.length >= 2) {
    const firstDate = cashflows[0].date;
    period_days = Math.round(
      (today.getTime() - firstDate.getTime()) / 86400000
    );
  }

  const xirr_pct = computeXirr(cashflows);

  return {
    xirr_pct,
    period_days,
    invested,
    current_value,
    recipe: 'returns-card',
  };
}
