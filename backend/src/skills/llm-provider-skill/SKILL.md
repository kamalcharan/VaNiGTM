---
name: llm-provider-skill
version: 1.0.0
description: BYOK — a tenant's own LLM provider. Declare, test, and clear the endpoint/model/key every agent uses.
tier: starter
default_recipe: model-provider
---

# LLM Provider Skill (BYOK)

## Purpose

The human-facing half of BYOK. Resolution at call time lives in
`agent-core/llm.provider.ts`; the logic lives in `vani/llm-provider.service.ts`.
These functions are the thin skill surface over it, so the console reaches BYOK
through the generic runner (`POST /api/v1/skills/llm-provider-skill/:fn`)
rather than through another entry in vani-app's platform-routes exception
table — that table is explicitly meant to stay small.

**The key goes in and never comes back.** No function here returns a stored
credential. `get_provider` returns a HINT (`sk-a…7f3c`): enough to recognise
which key is saved, useless to anyone who intercepts it.

## Posture, and what it changes

A tenant with no provider row runs on Vikuna's platform model — Vikuna pays,
and the daily token cap in `gt_tenant_context` applies. A tenant who declares
one pays their provider directly: the cap does not apply, and a transport
failure never fails over to Vikuna's Anthropic key. Both are user rulings
(2026-09-15) enforced in `llm.client.ts`.

## Idempotency

`save_provider` is idempotent BY CONSTRUCTION, not by a stored key: it upserts
on `vani_llm_provider`'s unique `(tenant_id, provider_code)` and returns no
generated id, so replaying an attempt lands on the same row and returns the
same answer. `remove_provider` is a DELETE and equally replay-safe.

This is the same reasoning `onboarding.routes.ts` records for its step
endpoint, and it is NOT a general solution: VaNiGTM does not yet honour the
`Idempotency-Key` header anywhere, so do not describe these writes to a user as
retry-safe on the strength of the header alone.

## Functions

### pending_failovers
Runs stopped because the platform model did not answer and nobody has decided yet. Only ever non-empty with `HAIKU_DEFAULT=false`; with it true escalation is automatic and this is always empty.
- Parameters: none
- Returns: { runs: [{ run_id, agent, asked_at, failover_model, vps_error, question, source, superseded, superseded_detail }], detail: string }
- `vps_error` is the server's own words. "Cannot reach" and "context size exceeded" are different outages and lead to different fixes.
- `source` is `{ id, name, status, updated_at }` when the run's event named a `source_id` (URL_SUBMITTED, FILE_UPLOADED), else null. `superseded` is true when that source reached `complete` AFTER the run parked — a later read did the work, so approving pays to redo it and declining loses nothing. Judged in SQL against the same clock that stamped both rows. `detail` counts them.

### resolve_failover
Answer one. Approving RE-EMITS the original event with `allow_failover: true` rather than resuming the old run — the agents are event-shaped and their claim logic already handles a re-run, and a separate row keeps "this cost money because a person said yes" answerable. Declining fails the run with the real cause and spends nothing.
- Parameters: run_id (required, string), approve (required, boolean)
- Returns: { ok: boolean, approved?: boolean, event_id?: string, reason?: 'NO_RUN' | 'NOT_WAITING', detail: string }

### get_provider
What this workspace has declared, minus the secret. Null when nothing is declared, which is the platform posture and not an error.
- Parameters: none
- Returns: { provider: { providerCode, model, baseUrl, testStatus, lastTestAt, keyHint } | null, posture: 'platform' | 'byok' }

### get_catalogue
The providers a tenant can choose, and whether key storage is configured at all.
- Parameters: none
- Returns: { providers: [{ code, label, defaultModel, keyRequired, needsBaseUrl }], encryptionReady: boolean }

### save_provider
Declare or update the provider. An empty `key` keeps the stored one, so changing only the model does not require re-typing the secret.
- Parameters: provider_code (required, string), key (optional, string), model (optional, string), base_url (optional, string — required for 'custom')
- Returns: { provider: {…}, posture: 'byok' }

### test_provider
Send one real 4-token completion to the declared endpoint and report what happened. Records test_status and last_test_at either way — a known-failing provider is information.
- Parameters: none
- Returns: { ok: boolean, detail: string, model: string, latencyMs: number }

### remove_provider
Drop the provider and return to the platform model.
- Parameters: none
- Returns: { provider: null, posture: 'platform' }
