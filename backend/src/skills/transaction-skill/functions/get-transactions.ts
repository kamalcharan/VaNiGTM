/**
 * transaction-skill: get_transactions
 * Paginated, filterable transaction list. Cross-client (global view) or
 * single-client. Supports type filter, date range, full-text search.
 */

import * as fs from 'fs';
import * as path from 'path';
import { SkillContext } from '../../../shared/types';

interface GetTransactionsParams {
  client_id?:         number;
  scheme_code?:       string;
  txn_type?:          string;
  date_from?:         string;
  date_to?:           string;
  search?:            string;
  is_duplicate_only?: boolean;
  limit?:             number;
  offset?:            number;
}

interface TransactionRow {
  id:                   number;
  txn_date:             string;
  txn_type:             string;
  txn_type_code:        string;
  txn_type_label:       string;
  flow_direction:       string;
  amount:               string;
  units:                string | null;
  nav:                  string | null;
  folio_no:             string | null;
  fund_name:            string | null;
  category:             string | null;
  scheme_code:          string;
  stamp_duty:           string | null;
  stt:                  string | null;
  tds:                  string | null;
  euin:                 string | null;
  arn:                  string | null;
  sip_reg_date:         string | null;
  source:               string | null;
  description:          string | null;
  is_potential_duplicate: boolean;
  portfolio_flag:       boolean;
  client_id:            number;
  client_name:          string;
  client_prefix:        string;
  client_no:            string | null;
  ext_ref_id:           string | null;
  total_count:          string;
}

export interface TransactionItem {
  id:               number;
  txn_date:         string;
  txn_type:         string;
  txn_type_label:   string;
  flow_direction:   string;
  amount:           number;
  units:            number | null;
  nav:              number | null;
  folio_no:         string | null;
  fund_name:        string | null;
  category:         string | null;
  scheme_code:      string;
  tds:              number;
  is_potential_duplicate: boolean;
  portfolio_flag:   boolean;
  client_id:        number;
  client_name:      string;
  client_prefix:    string;
  client_no:        string | null;
}

interface GetTransactionsResult {
  transactions: TransactionItem[];
  total:        number;
  recipe:       'data-table';
}

const QUERY = fs.readFileSync(
  path.join(__dirname, '../queries/get-transactions.sql'),
  'utf-8'
);

const PAGE_SIZE_MAX = 200;

export async function get_transactions(
  params: GetTransactionsParams,
  ctx: SkillContext
): Promise<GetTransactionsResult> {
  const limit  = Math.min(params.limit  ?? 50, PAGE_SIZE_MAX);
  const offset = params.offset ?? 0;

  const result = await ctx.db.query<TransactionRow>(QUERY, {
    $tenant_id:          ctx.tenant_id,
    $is_live:            ctx.is_live,
    $client_id:          params.client_id          ?? null,
    $txn_type:           params.txn_type            ?? null,
    $date_from:          params.date_from           ?? null,
    $date_to:            params.date_to             ?? null,
    $search:             params.search              ?? null,
    $is_duplicate_only:  params.is_duplicate_only   ?? null,
    $limit:              limit,
    $offset:             offset,
  });

  const total = result.rows.length > 0 ? Number(result.rows[0].total_count) : 0;

  const transactions: TransactionItem[] = result.rows.map((r) => ({
    id:               r.id,
    txn_date:         r.txn_date,
    txn_type:         r.txn_type_code,
    txn_type_label:   r.txn_type_label,
    flow_direction:   r.flow_direction,
    amount:           Number(r.amount),
    units:            r.units  != null ? Number(r.units)  : null,
    nav:              r.nav    != null ? Number(r.nav)    : null,
    folio_no:         r.folio_no   ?? null,
    fund_name:        r.fund_name  ?? null,
    category:         r.category   ?? null,
    scheme_code:      r.scheme_code,
    tds:              r.tds != null ? Number(r.tds) : 0,
    is_potential_duplicate: r.is_potential_duplicate,
    portfolio_flag:   r.portfolio_flag,
    client_id:        r.client_id,
    client_name:      r.client_name,
    client_prefix:    r.client_prefix,
    client_no:        r.client_no ?? null,
  }));

  return { transactions, total, recipe: 'data-table' };
}
