/**
 * transaction-skill: get_transaction_summary
 * Aggregated stats: total invested, redeemed, net flow, counts.
 * Used for the summary strip on the Transactions page and customer dashboard.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

interface GetTransactionSummaryParams {
  client_id?:  number;
  date_from?:  string;
  date_to?:    string;
}

interface SummaryRow {
  total_invested:  string;
  total_redeemed:  string;
  net_flow:        string;
  total_count:     string;
  client_count:    string;
  scheme_count:    string;
  earliest_date:   string | null;
  latest_date:     string | null;
  duplicate_count: string;
}

interface GetTransactionSummaryResult {
  total_invested:  number;
  total_redeemed:  number;
  net_flow:        number;
  total_count:     number;
  client_count:    number;
  scheme_count:    number;
  earliest_date:   string | null;
  latest_date:     string | null;
  duplicate_count: number;
  recipe:          'stat-row';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/get-transaction-summary.sql'),
  'utf-8'
);

export async function get_transaction_summary(
  params: GetTransactionSummaryParams,
  ctx: SkillContext
): Promise<GetTransactionSummaryResult> {
  const result = await ctx.db.query<SummaryRow>(QUERY, {
    $tenant_id: ctx.tenant_id,
    $is_live:   ctx.is_live,
    $client_id: params.client_id ?? null,
    $date_from: params.date_from ?? null,
    $date_to:   params.date_to   ?? null,
  });

  const row = result.rows[0];
  if (!row) {
    return {
      total_invested:  0, total_redeemed: 0, net_flow: 0,
      total_count:     0, client_count:   0, scheme_count: 0,
      earliest_date:   null, latest_date: null, duplicate_count: 0,
      recipe: 'stat-row',
    };
  }

  return {
    total_invested:  Number(row.total_invested),
    total_redeemed:  Number(row.total_redeemed),
    net_flow:        Number(row.net_flow),
    total_count:     Number(row.total_count),
    client_count:    Number(row.client_count),
    scheme_count:    Number(row.scheme_count),
    earliest_date:   row.earliest_date  ?? null,
    latest_date:     row.latest_date    ?? null,
    duplicate_count: Number(row.duplicate_count),
    recipe:          'stat-row',
  };
}
