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

## Constraints
- All functions are read-only (no mutations)
- Returns are in INR
- NAV data may be up to 1 business day old
- XIRR calculation uses the Newton-Raphson method, same as existing KewalInvest MVP
