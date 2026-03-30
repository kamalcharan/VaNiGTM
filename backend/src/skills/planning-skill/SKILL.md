---
name: planning-skill
version: 1.0.0
description: Goal-based financial planning with probability analysis
tier: professional
default_recipe: goal-dashboard
---

# Planning Skill

## Purpose
Goal-based financial planning for mutual fund clients. Handles goal creation, gap analysis, SIP projections, and probability-weighted planning. All projections use deterministic math — no LLM involvement in calculations.

## Functions

### get_goals
Returns all financial goals for a client with current status.
- Parameters: client_id (required, number)
- Returns: { goals: [{ id, name, type, target_amount, target_date, current_corpus, monthly_sip, inflation_rate, expected_return, probability, status }], recipe: 'goal-dashboard' }
- Goal types: retirement, education, house, wedding, emergency, custom

### calc_goal_gap
Shortfall analysis: required SIP vs current SIP, adjusted for inflation.
- Parameters: client_id (required, number), goal_id (required, number)
- Returns: { goal_name, target_amount_inflated, current_corpus, projected_corpus, gap_amount, current_sip, required_sip, sip_deficit, months_remaining, recipe: 'goal-deep-dive' }

### project_goal
Deterministic projection to target date. Optional scenario parameter for what-if analysis.
- Parameters: client_id (required, number), goal_id (required, number), scenario (optional, object: { sip_amount?, expected_return?, inflation_rate?, additional_lumpsum? })
- Returns: { projections: [{ month, corpus, contributions, growth }], final_corpus, probability, target_met, recipe: 'goal-deep-dive' }

### suggest_sip_increase
Calculates required SIP to achieve a target probability of goal success.
- Parameters: client_id (required, number), goal_id (required, number), target_probability (required, number, 0-1)
- Returns: { current_sip, required_sip, increase_amount, increase_pct, new_probability, recipe: 'suggestion' }

### create_goal
Creates a new financial goal for a client.
- Parameters: client_id (required, number), params (required, object: { name, type, target_amount, target_date, inflation_rate, expected_return, linked_schemes?: string[] })
- Returns: { goal_id, name, target_amount, monthly_sip_needed, probability, recipe: 'goal-dashboard' }

## Constraints
- Probability calculation uses deterministic compound growth with inflation adjustment (not Monte Carlo in MVP)
- Returns assume equity return of 12%, debt 7%, gold 8% unless overridden
- Inflation default: 6% for general, 10% for education, 8% for medical
- All amounts in INR, dates in ISO 8601
