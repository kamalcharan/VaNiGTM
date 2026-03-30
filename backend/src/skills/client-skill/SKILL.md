---
name: client-skill
version: 1.0.0
description: Client CRM, risk profiling, and family group management
tier: starter
default_recipe: client-list
---

# Client Skill

## Purpose
Manages the distributor's client database — contact information, risk profiles, family groups, and client-level aggregates. This is the CRM layer of KI-Prime.

## Functions

### get_clients
Returns client list with key metrics. Supports filtering and search.
- Parameters: filters (optional, object: { search?: string, tag?: string, min_aum?: number, max_aum?: number, risk_profile?: string, sort_by?: 'name' | 'aum' | 'last_interaction' | 'sip_count', sort_order?: 'asc' | 'desc', limit?: number, offset?: number })
- Returns: { clients: [{ id, name, email, phone, aum, sip_count, active_sips_total, goals_count, risk_profile, last_interaction_date, tags }], total, recipe: 'client-list' }

### get_client_profile
Complete client profile with demographics, portfolio summary, goals summary, risk score.
- Parameters: client_id (required, number)
- Returns: { id, name, email, phone, pan, dob, address, occupation, annual_income, portfolio_summary: { total_value, total_invested, return_pct, scheme_count }, goals_summary: { total_goals, on_track, at_risk, behind }, risk_profile: { capacity, tolerance, required, overall }, family_group_id, tags, notes, created_at, last_interaction, recipe: 'client-360' }

### get_risk_profile
Detailed risk assessment: capacity (financial ability), tolerance (emotional comfort), required (goal-driven need).
- Parameters: client_id (required, number)
- Returns: { client_name, risk_capacity: { score, factors }, risk_tolerance: { score, factors }, risk_required: { score, factors }, overall_risk: string, recommendation, last_assessed, recipe: 'detail-sidebar' }
- Risk levels: conservative, moderate-conservative, moderate, moderate-aggressive, aggressive

### update_client
Update profile fields. Requires distributor confirmation via approval-card recipe.
- Parameters: client_id (required, number), fields (required, object: partial client fields)
- Returns: { updated_fields, previous_values, recipe: 'approval-card' }

### get_family_group
Returns linked family members with combined AUM and shared goals.
- Parameters: client_id (required, number)
- Returns: { group_id, members: [{ id, name, relationship, aum, goals_count }], combined_aum, shared_goals: [{ name, combined_corpus }], recipe: 'data-table' }

## Constraints
- PAN is stored encrypted, displayed masked (XXXXX1234X)
- Client creation/deletion is via direct API, not through VaNi (safety)
- update_client always returns an approval-card — distributor must confirm before write
- Risk profile recalculation triggered on significant AUM change or annually
