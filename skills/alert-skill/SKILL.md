---
name: alert-skill
version: 1.0.0
description: Proactive JTBD-based alerts, rebalance detection, SIP health, tax harvesting, daily briefing
tier: professional
default_recipe: daily-briefing
---

# Alert Skill

## Purpose
Proactive intelligence layer. Scans across the distributor's entire client base to surface actionable insights, risks, and opportunities. Powers the VaNi Command Center home screen.

## Functions

### get_alerts
Returns active alerts ranked by urgency and potential impact.
- Parameters: priority (optional, string: 'high' | 'medium' | 'low' | 'all', default 'all'), limit (optional, number, default 20)
- Returns: { alerts: [{ id, type, priority, title, body, client_id, client_name, action: { label, skill, params }, created_at }], total, recipe: 'briefing-panel' }
- Alert types: rebalance_needed, sip_at_risk, goal_behind, tax_harvest_opportunity, review_due, large_redemption, new_nfo_match

### check_rebalance_needed
Drift analysis against target allocation for a specific client.
- Parameters: client_id (required, number)
- Returns: { client_name, target_allocation: [{ category, target_pct }], current_allocation: [{ category, current_pct, drift_pct }], needs_rebalance: boolean, max_drift_pct, suggested_actions: [{ action, scheme_name, amount }], recipe: 'comparison' }
- Rebalance triggered when any category drifts > 5% from target

### check_sip_health
SIPs at risk: bounced, underperforming category, or misaligned with goals.
- Parameters: client_id (required, number)
- Returns: { sips: [{ scheme_name, scheme_code, sip_amount, status, issue?, category_performance_1y }], healthy_count, at_risk_count, total_monthly, recipe: 'data-table' }
- SIP status: active, paused, bounced, underperforming, misaligned

### check_tax_harvest
LTCG/STCG harvesting opportunities before financial year end.
- Parameters: client_id (required, number), financial_year (optional, string, default current FY)
- Returns: { ltcg_available: number, ltcg_exemption_remaining: number, stcg_amount: number, harvest_opportunities: [{ scheme_name, gain_type, gain_amount, tax_saved_if_harvested }], recipe: 'data-table' }

### generate_daily_briefing
Morning digest: clients needing attention, market events, upcoming renewals.
- Parameters: none (uses tenant context for distributor scope)
- Returns: { date, greeting, insights: [InsightCardData], quick_actions: [{ label, skill, params }], market_pulse: { nifty_change_pct, top_category, bottom_category }, stats: { total_aum, aum_change_pct, active_clients, alerts_count }, recipe: 'daily-briefing' }

## Constraints
- generate_daily_briefing scans ALL clients for the tenant — can be slow for large books (>500 clients). Use BullMQ for async generation.
- Tax harvesting assumes Indian tax rules: LTCG >₹1.25L taxed at 12.5%, STCG at 20%
- Alert generation is a background job (BullMQ), not real-time. Alerts refresh daily at 7 AM IST.
