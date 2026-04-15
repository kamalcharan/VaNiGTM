---
name: transaction-skill
version: 1.0.0
description: Transaction ledger — query, filter, and analyze mutual fund transactions across all clients
tier: starter
default_recipe: data-table
---

# Transaction Skill

## Purpose
Central transaction ledger for the distributor's book. Provides filtered views of all mutual fund transactions (purchases, redemptions, SIPs, switches, SWPs, STPs, dividends) across clients. Powers the Transactions page and feeds into portfolio calculations.

Ported from kewalinvest: Transactions page (list, filter, detail view).

## Functions

### get_transactions
Returns paginated, filterable transaction list across all clients or for a specific client.
- Parameters: client_id (optional, number), scheme_code (optional, string), txn_type (optional, string: 'purchase' | 'redemption' | 'sip' | 'switch' | 'swp' | 'stp' | 'dividend' | 'all', default 'all'), date_from (optional, string, ISO date), date_to (optional, string, ISO date), page (optional, number, default 1), limit (optional, number, default 50), sort_by (optional, string: 'date' | 'amount' | 'scheme', default 'date'), sort_order (optional, string: 'asc' | 'desc', default 'desc')
- Returns: { transactions: [{ id, client_id, client_name, txn_date, txn_type, scheme_name, scheme_code, folio, amount, units, nav, category }], total, page, pages, summary: { total_invested, total_redeemed, net_flow }, recipe: 'data-table' }

### get_transaction_detail
Returns full detail for a single transaction including linked records (switch pairs, SIP registration).
- Parameters: transaction_id (required, number)
- Returns: { transaction: { id, client_id, client_name, txn_date, txn_type, scheme_name, scheme_code, folio, fund_name, amount, units, nav, category, stamp_duty, stt, tds, euin, arn, sip_reg_date, switch_in_scheme, switch_in_code, source, description, created_at }, recipe: 'detail-card' }

### get_transaction_summary
Aggregated transaction statistics for dashboard cards and reports.
- Parameters: client_id (optional, number), period (optional, string: '1m' | '3m' | '6m' | '1y' | 'ytd' | 'all', default '1y')
- Returns: { period, total_transactions, total_invested, total_redeemed, net_flow, sip_total, by_type: [{ type, count, amount }], by_category: [{ category, invested, redeemed }], monthly_trend: [{ month, invested, redeemed }], recipe: 'stat-row' }

### search_transactions
Full-text search across transaction records (scheme name, client name, folio).
- Parameters: query (required, string), limit (optional, number, default 20)
- Returns: { results: [{ id, client_name, scheme_name, txn_date, txn_type, amount }], total, recipe: 'data-table' }

### import_transactions
Execute the ki_process_txn_import_session() RPC against a staged import session.
Processes all pending ki_import_staging rows: client lookup (ext_ref_id → PAN → name),
txn type resolution, scheme alias lookup, dedup check, ki_holdings UPSERT,
ki_transactions INSERT, ki_alerts for new scheme appearances.
- Parameters: session_id (required, number) — must be a 'staged' session owned by this tenant/environment
- Returns: { session_id, total_processed, successful, failed, duplicates, orphans, processing_time_s, status ('completed'|'completed_with_errors'), recipe: 'stat-row' }
- Throws: session not found, wrong tenant/environment, already processing/completed, not yet staged

## Constraints
- All queries filter by tenant_id from SkillContext. Never cross-tenant.
- Pagination is mandatory for get_transactions — no unbounded result sets.
- import_transactions is the only write path in this skill. All other functions are read-only.
- import_transactions requires migrations 043 + 044 + 045 to be applied.
- XIRR calculations are NOT in this skill — they live in portfolio-skill.calc_xirr.
- Date filters use IST (Indian Standard Time) for date boundary calculations.
