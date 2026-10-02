---
name: model-router-skill
version: 1.0.0
description: The admin's view of the model router — which models serve enrichment, by route; switch each on or off; quota, cooldowns and today's calls; test that a provider answers.
tier: starter
default_recipe: model-router
---

# Model Router Skill

## Purpose

POA D-Q13–D-Q17 (release 2, P2-R). Enrichment calls are ROUTED
(`agent-core/llm.router.ts`): each step names how hard it is (high · medium ·
low) and what its prompt carries; the route (.env) lists providers in order.

`.env` declares what a provider IS — URL, model, window, quota, data terms; the
key never leaves the server. Whether enrichment may USE a provider is the
admin's switch, here (gt_llm_provider_switch, append-only — every change kept
with who and when). **No row means off**: a provider newly added to .env is not
used, or paid for, until it is switched on.

Every function is **admin only** (the router is platform-wide; one tenant's
switch would be every tenant's).

Risk classes (AGENTS.md §6a): `overview` reads (R0). `switch_provider` changes
platform behaviour for every tenant's enrichment (R2) — reversible, attributed.
`test_provider` makes one tiny call to a FREE provider (R2); a paid provider
(Haiku) is refused here, because spending is R3 and runs only through a route.

## Functions

### overview
Every model the router knows, its switch, its quota and cooldown now, the three routes as they would run right now for each kind of data, and today's calls by route and provider.
- Risk: R0
- Parameters: none
- Returns: { providers: [{ code, kind, model, host, ctx, rpm, daily, data_terms, paid, enabled, switched_by, switched_at, calls_minute, calls_today, cooldown_until, state }], routes: [{ route, order, plan: { public_company, tenant, people }: { serves, skipped: [{ code, reason }] } }], usage: [{ route, provider_code, calls, ok, moved_on, bad, tokens }], history: [{ provider_code, enabled, note, changed_at, changed_by_name }] }

### switch_provider
Switch one model on or off for enrichment. Applies to the next call; a call already running finishes.
- Risk: R2
- Parameters: provider_code (required, string), enabled (required, boolean), note (optional, string)
- Returns: { provider_code, enabled, changed: boolean }

### test_provider
One tiny call ("reply with the word: ready") to one FREE provider, regardless of its switch, recorded like any call.
- Risk: R2
- Parameters: provider_code (required, string)
- Returns: { ok, model, latency_ms, answer?, error? }
