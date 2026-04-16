---
name: portfolio-skill
version: 1.0.0
description: Portfolio holdings, valuation, asset allocation, and returns calculation
tier: starter
default_recipe: portfolio-view
---

# Portfolio Skill

## Purpose
Provides portfolio-level data and calculations for a distributor's clients. All monetary values are in INR. NAV data may be up to 1 business day old.

## Functions

### get_holdings
Returns current holdings for a client with NAV, value, and gain/loss.
- Parameters: client_id (required, number)
- Returns: { holdings: [{ scheme_name, scheme_code, category, amc, units, nav, value, invested, gain_loss, gain_pct }], summary: { total_value, total_invested, overall_gain_pct, scheme_count }, recipe: 'portfolio-view' }
- Example: get_holdings(client_id=2847)

### get_allocation
Returns asset allocation breakdown by category.
- Parameters: client_id (required, number)
- Returns: { allocation: [{ category, value, percentage, scheme_count }], total_value, recipe: 'allocation-ring' }

### calc_xirr
Calculates extended IRR for portfolio or specific scheme.
- Parameters: client_id (required, number), scheme_code (optional, string)
- Returns: { xirr_pct, period_days, invested, current_value, recipe: 'returns-card' }

### get_portfolio_summary
Aggregated portfolio overview: total invested, current value, returns, top/bottom performers.
- Parameters: client_id (required, number)
- Returns: { total_invested, current_value, overall_return_pct, xirr_pct, top_performers: [{ scheme_name, gain_pct }], bottom_performers: [{ scheme_name, gain_pct }], sip_count, sip_total_monthly, recipe: 'portfolio-view' }

### compare_holdings
Side-by-side portfolio comparison for family members or model matching.
- Parameters: client_id_1 (required, number), client_id_2 (required, number)
- Returns: { client_1: { name, summary }, client_2: { name, summary }, common_schemes: [], unique_to_1: [], unique_to_2: [], recipe: 'comparison' }

### get_family_portfolio
Returns aggregated holdings for all active members of a family, consolidated by scheme with per-member attribution.
- Parameters: family_id (required, string)
- Returns: { family_id, holdings: [{ scheme_code, scheme_name, category, amc, units, avg_nav, nav, nav_date, value, invested, gain_loss, gain_pct, members: [{ client_id, name, prefix, units, invested }] }], summary: { total_value, total_invested, overall_gain_pct, scheme_count, member_count }, recipe: 'portfolio-view' }

### get_asset_assignments
Returns all asset assignments for a client (MF auto-created on import + non-MF manually added by advisor). Results are grouped by asset category.
- Parameters: client_id (required, number)
- Returns: { assignments: [{ assignment_id, asset_type_code, asset_type_name, category, scheme_code, scheme_name, amc, fund_category, units, current_nav, nav_date, mf_invested, principal_amount, estimated_current_value, gain_loss, gain_pct, investment_type, effective_rate, start_date }], by_category: [{ category, label, total_value, total_invested, assignments: [] }], summary: { total_value, total_invested, asset_count, mf_count, non_mf_count }, recipe: 'asset-assignments' }

### get_asset_types
Returns all active asset types (global, not tenant-scoped) for use in the Add Investment form dropdown.
- Parameters: none
- Returns: { asset_types: [{ id, asset_type_code, asset_type_name, category, default_assumption_rate, display_order, description }], recipe: 'asset-types' }

### create_asset_assignment
Creates a new manual investment plan for a client (non-MF or MF). Wrapped in a transaction.
- Parameters: client_id (required, number), asset_type_id (required, number), investment_type (required, one_time|sip|recurring), principal_amount (required, number), scheme_code (optional, string), start_date (optional, ISO date), duration_months (optional, number), recurring_amount (optional, number), investment_frequency (optional, monthly|quarterly|yearly), custom_assumption_rate (optional, number), notes (optional, string)
- Returns: { assignment_id, created_at, recipe: 'asset-assignment-created' }

### update_asset_assignment
Partial update of an existing asset assignment. Only supplied non-null fields are changed. Wrapped in a transaction.
- Parameters: assignment_id (required, number), client_id (required, number), investment_type (optional), principal_amount (optional), start_date (optional), duration_months (optional), recurring_amount (optional), investment_frequency (optional), custom_assumption_rate (optional), notes (optional)
- Returns: { assignment_id, updated_at, recipe: 'asset-assignment-updated' }

### delete_asset_assignment
Soft-deletes an asset assignment (sets is_active = false). Record is retained for historical tracking.
- Parameters: assignment_id (required, number), client_id (required, number)
- Returns: { assignment_id, recipe: 'asset-assignment-deleted' }

## Constraints
- get_holdings, get_allocation, calc_xirr, get_portfolio_summary, compare_holdings, get_family_portfolio, get_asset_assignments, get_asset_types are read-only
- create_asset_assignment, update_asset_assignment, delete_asset_assignment are write operations — all wrapped in transactions
- Returns are in INR
- NAV data may be up to 1 business day old
- XIRR calculation uses the Newton-Raphson method, same as existing KewalInvest MVP
