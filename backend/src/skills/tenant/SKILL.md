---
name: tenant
version: 1.0.0
description: The tenant context (who this workspace is — status, tokens, agents, model, scoring, brand, industry, consent, domains) and its token budget and top-ups.
tier: starter
default_recipe: tenant
---

# Tenant Skill

## Purpose

D-Q10 and D-Q12 (Charan, 2026-10-02), release 3. `context` is the one read
every agent and screen uses to know who it works for; each fact stays in the
table that owns it (`src/tenant/context.ts`). `tokens` is this workspace's
budget: a daily and a monthly base (`TENANT_DAILY_TOKEN_LIMIT`,
`TENANT_MONTHLY_TOKEN_LIMIT`, or the tenant's own lower limit), then the top-up
balance, which is spent after the base. Top-ups are added by an admin until
billing exists (S18, `gt_token_topups`).

Risk classes: reads are R0. `add_topup` lets a tenant spend more of Vikuna's
money on models — admin only (R2), attributed, append-only.

## Functions

### context
This workspace's context in one read. A part that cannot be read carries `error` instead of a guess.
- Risk: R0
- Parameters: none
- Returns: { tenant, commercial, tokens, agents, model, scoring, brand, industry, consent, domains, smart_profile }

### tokens
This workspace's token budget now, the last 30 days of use, and its top-up ledger.
- Risk: R0
- Parameters: none
- Returns: { budget: { capped, daily_limit, used_today, monthly_limit, used_this_month, topup_balance, remaining, daily_source, monthly_source }, days: [{ day, tokens }], ledger: [{ tokens, reason, created_at, by_name }] }

### topups
Every tenant's top-up balance (admin only).
- Risk: R0
- Parameters: none
- Returns: { tenants: [{ tenant_id, name, slug, added, drawn, balance, last_topup_at }] }

### add_topup
Add tokens to one tenant's top-up balance (admin only). Spent only after that tenant's daily or monthly base is used.
- Risk: R2
- Parameters: tenant_id (required, string), tokens (required, number), reason (optional, string)
- Returns: { tenant_id, balance }
