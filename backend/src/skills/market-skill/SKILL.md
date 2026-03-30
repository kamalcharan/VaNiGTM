---
name: market-skill
version: 1.0.0
description: NAV data, scheme information, category performance, and scheme comparison
tier: starter
default_recipe: scheme-explorer
---

# Market Skill

## Purpose
Provides mutual fund scheme data, NAV tracking, and market context. Data source: MFAPI (api.mfapi.in) for NAV data, AMFI for scheme master.

## Functions

### get_nav
Returns latest NAV for a scheme.
- Parameters: scheme_code (required, string)
- Returns: { scheme_code, scheme_name, nav, nav_date, amc, category, recipe: 'stat-row' }

### get_nav_history
Returns historical NAV data for charting.
- Parameters: scheme_code (required, string), from_date (required, string, ISO date), to_date (required, string, ISO date)
- Returns: { scheme_code, scheme_name, data: [{ date, nav }], period_return_pct, recipe: 'line-chart' }

### compare_schemes
Side-by-side comparison on selected metrics.
- Parameters: scheme_codes (required, string[]), metric (optional, string: 'returns' | 'risk' | 'expense_ratio' | 'all', default 'all')
- Returns: { schemes: [{ scheme_code, scheme_name, amc, category, nav, returns_1y, returns_3y, returns_5y, expense_ratio, risk_grade, aum }], recipe: 'comparison' }

### get_category_performance
Category-level performance for benchmarking.
- Parameters: category (required, string), period (optional, string: '1m' | '3m' | '6m' | '1y' | '3y' | '5y', default '1y')
- Returns: { category, period, avg_return, top_5: [{ scheme_name, return_pct }], bottom_5: [{ scheme_name, return_pct }], total_schemes, recipe: 'data-table' }

### search_schemes
Fuzzy search across scheme names, AMCs, and categories.
- Parameters: query (required, string), limit (optional, number, default 20)
- Returns: { results: [{ scheme_code, scheme_name, amc, category, nav, nav_date }], total_matches, recipe: 'data-table' }

## Constraints
- NAV data sourced from MFAPI, updated daily by market close + 1 hour
- Scheme master from AMFI, refreshed weekly
- Returns calculated from NAV data (not declared returns from AMC)
- Risk grade derived from standard deviation of monthly returns
