# Handover — Phase 3 E2E Verification (in progress)

> **Last session:** 2026-05-13
> **Branch:** `claude/verify-definition-of-done-Jq46X` (open as PR #3 → `main`)
> **State:** Phase 1 + 2 complete and merged-ready. Phase 3 E2E partially verified — blocked on local LLM model selection on the dev laptop.

---

## TL;DR — exact next step

1. Merge PR #3 to `main` (no remaining code changes).
2. On the dev laptop, pre-warm `qwen3:8b` with `keep_alive: "24h"` via `/api/generate`.
3. Confirm `.env` has `LLM_PRIMARY_MODEL=qwen3:8b` + `LLM_PRIMARY_TIMEOUT_MS=180000`.
4. Hard-restart server (`npm run dev`) and worker (`npm run worker`).
5. Resume Phase 3 from "TEST 2 — VaNi conversation turns" against tenant `ed9c93c8-26c7-4a8c-a658-a1d8dc5bd61b` / run_id `9` (still at `status='awaiting'`).
6. After 3 turns, call `POST /api/v1/vani/approve`, verify `gt_tenant_profile` is populated.

---

## What's done and merged-ready (PR #3)

### Migration
- `backend/migrations/184_gt_tenant_profile.sql` — `gt_tenant_profile` (typed product / ICP / GTM / vision fields, generated `is_complete`, weighted `completion_score 0-100`) + `gt_tenant_profile_history` (append-only). RLS + `vn_set_updated_at()` trigger on live table.

### profile-skill (`backend/src/skills/profile-skill/`)
- `profile.service.ts` — `getProfile`, `upsertProfile`, pure `calculateCompletionScore` (product 0-40 / icp 0-30 / gtm 0-20 / vision 0-10). Upsert + history snapshot in one transaction.
- `profile.routes.ts` — `GET /`, `PUT /`, `POST /approve`, `GET /history` (mounted at `/api/v1/profile`).
- `queries/get-profile.sql`, `queries/upsert-profile.sql` (COALESCE-on-null semantics), `queries/get-history.sql`.

### VaNi agent extension
- `vani.agent.ts:handleHumanApproved()` — walks `gt_kg_nodes`, maps Product/PainPoint/ICP/Differentiator/Team/UseCase → typed profile fields, calls `upsertProfile`, branches:
  - **complete** → `emitEvent('PROFILE_COMPLETE')` + `setStatus('completed')`
  - **incomplete** → `setStatus('awaiting')` with `missing_fields` payload

### Bug fixes (critical — without these the runtime breaks)
- `db/query.ts` — single-query path now wraps `set_tenant_context + user SQL` in `BEGIN/COMMIT`; `transaction()` moves `set_tenant_context` to after `BEGIN`. **Root cause:** `set_tenant_context()` uses `set_config(..., is_local := true)`, so the GUC only survives until the current transaction ends. Without an explicit BEGIN, each statement is its own autocommit txn → GUC dies before the user query runs → RLS policies casting `current_setting(..., true)::uuid` blow up on the empty-string default. Surfaced as `invalid input syntax for type uuid: ""` on every gt_* INSERT.
- `agent-core/llm.client.ts:108` — `$source_key` → `$source_key::text` inside `jsonb_build_object(...)`. Required because `jsonb_build_object(VARIADIC "any")` can't infer type of a positional param without a cast. Caused `could not determine data type of parameter $2` on every successful LLM call.

### Server wiring
- `server.ts` mounts `createProfileRouter(pool)` at `/api/v1/profile`.

### Diagnostic logs (left in for the next session)
- `auth.routes.ts:91` — `console.log('[Auth] Emitting TENANT_REGISTERED for tenant:', result.tenant.id)`. Useful for confirming the emit path.
- `auth.routes.ts:100` — error log on emit failure was renamed to `[Auth] FAILED to emit TENANT_REGISTERED:`.
- `server.ts` (start of `main()`) — `console.log('[VaNi-GTM] runtime DB_PRIMARY = …')` (password masked). Confirms which DB the running server is connected to.

---

## DB schema reality check (against `vani_gtm_db` on the VPS)

All migrations applied, verified by direct query as superuser:
```
gt_events, gt_kb_sources, gt_kg_edges, gt_kg_nodes, gt_prompts,
gt_tenant_context, gt_tenant_integrations,
gt_tenant_profile, gt_tenant_profile_history   ← all 9 present
```

### Manual DB action taken this session (DO NOT lose this)
- `ALTER TABLE gt_events DISABLE ROW LEVEL SECURITY;` was run on the live DB.
  - **Why:** `gt_events` is cross-tenant by design (the worker polls all tenants). The RLS policy from migration 181 hid all rows from a connection without `app.current_tenant_id` set → worker poll silently returned 0 rows.
  - **Action item:** add a migration `185_gt_events_disable_rls.sql` that does this idempotently so other environments get the same change. **Not done yet.** Snippet:
    ```sql
    ALTER TABLE gt_events DISABLE ROW LEVEL SECURITY;
    -- Application code already filters by tenant_id on writes.
    -- Worker is intentionally cross-tenant.
    ```

---

## What works end-to-end (verified live)

- Register a new tenant → `vn_tenants` + `vn_users` + session rows created. ✅
- `emitEvent('TENANT_REGISTERED', 'system', …)` writes to `gt_events`. ✅ (after `query.ts` fix)
- Worker polls `gt_events`, picks up `pending` rows. ✅ (after RLS disable on `gt_events`)
- Worker dispatches to `VaniAgent.handleTenantRegistered`. ✅
- Agent calls Ollama LLM, generates opening question, persists to `gt_agent_runs.awaiting_input`, sets `status='awaiting'`. ✅ (after `query.ts` fix + `llm.client.ts` $source_key fix)
- **Test 1 PASS evidence** — run #8 created on the qwen3:8b machine had:
  ```
  status='awaiting'
  opening_question="Hello! I'm VaNi, your Vikuna GTM assistant. … could you give me a brief overview of what it does …"
  ```

---

## What's blocked / open

### Blocker: LLM model selection on the dev laptop

The dev laptop is Windows, CPU-only. We tried three Ollama models:

| Model | Speed | Tag emission (`<extract>`) | Verdict |
|---|---|---|---|
| `gemma3:4b` | Fast (~15-30s/turn) | ❌ Paraphrases. `extractedNodes: []`. | Unsuitable — doesn't follow tag instruction. |
| `deepseek-r1:7b` | OK (~30s/turn) | ❌ Reply is empty. `<think>` blocks consume the entire response; `stripTags` only removes `<extract>` and `<profile_ready>`, not `<think>`. | Unsuitable unless we add `<think>` stripping. |
| `qwen3:8b` | Slow (~60-90s/turn) | ✅ Emits `<extract>` tags. Got 1 node (`Differentiator: KI-Prime_AI`) on first try. | Best choice — pin via `keep_alive`. |

**Standing fix:**
- `.env` should have `LLM_PRIMARY_MODEL=qwen3:8b` and `LLM_PRIMARY_TIMEOUT_MS=180000`.
- Before any conversation turn, pre-warm via:
  ```powershell
  curl.exe -X POST http://localhost:11434/api/generate `
    -H "Content-Type: application/json" `
    --data-raw "{\"model\":\"qwen3:8b\",\"prompt\":\"hi\",\"stream\":false,\"keep_alive\":\"24h\"}"
  ```
  This sets `expires_at` 24h out so Ollama won't unload between idle periods.

**Optional follow-up:** add `<think>` block stripping to `vani.agent.ts:stripTags` so deepseek-r1 also becomes viable. One-line regex addition. Defer until needed.

### Phase 3 progress against the original test plan

| Test | Status |
|---|---|
| TEST 1: registration → TENANT_REGISTERED → worker → VaNi opening question | ✅ Verified on tenant 76818757 and 7d70d970 and ed9c93c8 |
| TEST 2: 3 conversation turns → KG nodes accumulate | ⚠️ Turn 1 produced 1 node on qwen3:8b. Turns 2 and 3 not yet run cleanly (model may have unloaded between attempts). |
| TEST 3: /vani/approve → handleHumanApproved → gt_tenant_profile populated → PROFILE_COMPLETE | ⏸ Not yet attempted. |
| TEST 4: final state — events all `done`, runs all `completed`, `is_complete = true` | ⏸ Not yet attempted. |

**Current target tenant:** `ed9c93c8-26c7-4a8c-a658-a1d8dc5bd61b` / run_id `9` (status `awaiting`, opening question stored).

---

## Operational state of the live DB (`vani_gtm_db`)

Multiple test tenants created during debugging. None are harmful, but if you want a clean slate:

```sql
-- Inspect first
SELECT id, slug, status, created_at FROM vn_tenants ORDER BY created_at DESC LIMIT 20;
SELECT email, tenant_id, created_at FROM vn_users WHERE email LIKE 'test-p3%';

-- Selective cleanup (cascades delete tenant + users + sessions + runs + events + profile + KG)
DELETE FROM vn_tenants WHERE slug LIKE 'phase3-test-%';
```

If you don't clean up, just register a fresh tenant with a new email (`test-p3i@vikuna.io`, etc.) — the existing data is benign.

---

## How to resume in 4-5 days (step-by-step)

```powershell
# 1. Pull latest main (which should have PR #3 merged by then)
cd D:\projects\core projects\OpenClaw\VaniGTM
git checkout main
git pull origin main

# 2. Confirm key files exist
type backend\src\skills\profile-skill\profile.service.ts | findstr "calculateCompletionScore"
type backend\migrations\184_gt_tenant_profile.sql | findstr "gt_tenant_profile"

# 3. Confirm RLS on gt_events is still disabled (manual ALTER from last session)
# In psql against vani_gtm_db as superuser:
#   SELECT relname, relrowsecurity FROM pg_class WHERE relname = 'gt_events';
#   Expected: relrowsecurity = false
# If somehow re-enabled, run: ALTER TABLE gt_events DISABLE ROW LEVEL SECURITY;

# 4. Confirm .env settings
type backend\.env | findstr "LLM_PRIMARY"
# Expected:
#   LLM_PRIMARY_URL=http://localhost:11434
#   LLM_PRIMARY_MODEL=qwen3:8b
#   LLM_PRIMARY_TIMEOUT_MS=180000

# 5. Start Ollama + pre-warm qwen3:8b
ollama serve   # if not already running
curl.exe -X POST http://localhost:11434/api/generate `
  -H "Content-Type: application/json" `
  --data-raw "{\"model\":\"qwen3:8b\",\"prompt\":\"hi\",\"stream\":false,\"keep_alive\":\"24h\"}"

# Wait ~60s. Then confirm:
curl.exe http://localhost:11434/api/ps
# Expected: qwen3:8b with expires_at ~24h in future.

# 6. Start server and worker (two terminals)
cd backend
npm run dev      # terminal 1
npm run worker   # terminal 2

# 7. Resume Phase 3 TEST 2
# Either continue tenant ed9c93c8-... / run_id 9, or register a fresh tenant.
# To continue the existing one, log in:
#   POST http://localhost:3002/api/v1/auth/login
#   {"email":"<email-for-that-tenant>","password":"Test1234!"}
# Then POST /api/v1/vani/gather with run_id "9" and the test messages from Phase 3 spec.
# Each turn takes 60-90 seconds.

# 8. After 3 turns:
#   POST /api/v1/vani/approve  (no body)
#
# Then verify (psql as superuser, against vani_gtm_db):
#   SELECT * FROM gt_tenant_profile WHERE tenant_id = '<the tenant>';
#   SELECT * FROM gt_tenant_profile_history WHERE tenant_id = '<the tenant>';
#   SELECT event_type, status FROM gt_events WHERE tenant_id = '<the tenant>' ORDER BY created_at;
```

---

## Known gotchas (for next session)

1. **`.env` changes don't apply without restart.** `tsx watch` reloads on source changes but not on `.env` edits. After changing `LLM_PRIMARY_MODEL` or any env var, `Ctrl+C` and restart both server and worker.

2. **Ollama unloads models after 5 minutes idle by default.** Always pre-warm with `keep_alive: "24h"` before testing. Verify via `/api/ps`. Cold-load of qwen3:8b is ~13s; cold-eval of a long prompt can be ~60-90s.

3. **PowerShell mangles inline JSON.** Use Postman or `curl.exe --data @file.json` for any request body containing quotes or special chars. PowerShell's `curl` is an `Invoke-WebRequest` alias, not real curl — different escaping rules.

4. **The probe.js helper exists at `backend/probe.js`** — useful to verify the app's actual DB connection (which DB, which user, event counts). Run with `node probe.js` from `backend/`.

5. **vanigtm_app role** has `rolsuper=false, rolbypassrls=false`. Don't grant BYPASSRLS to it — would defeat RLS on tenant data tables. Per-table RLS disabling (like we did for `gt_events`) is the right pattern for infrastructure tables.

6. **gt_prompts RLS is not enabled** by design (mig 181 comment) — system prompts must be readable by all tenants. The seed prompt `vani-skill.gather` is correct and demands `<extract>` tags explicitly.

7. **Two tenants in the seed of vn_users may share an email** (we saw `EMAIL_EXISTS` once during re-testing). Use a fresh email each registration or use login on an existing one.

---

## Open follow-ups (parking lot)

- [ ] Migration `185_gt_events_disable_rls.sql` to codify the manual ALTER.
- [ ] Strip `<think>` blocks in `vani.agent.ts:stripTags` so deepseek-r1 becomes viable.
- [ ] Consider a separate `vanigtm_worker` DB role with `BYPASSRLS` for the worker process (defense-in-depth for cross-tenant infra ops). Phase 4 concern.
- [ ] Remove diagnostic logs (`[Auth] Emitting…`, `[VaNi-GTM] runtime DB_PRIMARY`) once Phase 3 is fully signed off.
- [ ] Phase 3 frontend: there's no UI yet for `/api/v1/profile` (GET, PUT, approve, history). Add when frontend resumes.

---

## Reference — commits on this branch

```
0fd2ead  fix(llm): cast $source_key to text in recordTokenUsage
b10d5df  fix(db): wrap single-query path in transaction so set_tenant_context survives
fc13c71  chore(auth): log tenant id before emitting TENANT_REGISTERED
fd77af8  feat(vani): Phase 2 Stage 6 — map KG nodes to gt_tenant_profile on approval
ab943b3  feat(profile): Phase 2 Stage 5 — implement profile.routes.ts
7d49c59  feat(profile): Phase 2 Stage 4 — implement profile.service.ts
90224fc  feat(profile): Phase 2 Stage 3 — SQL queries for profile-skill
d78d8bf  feat(profile): Phase 2 Stage 2 — profile-skill skeleton
2daee80  feat(profile): Phase 2 Stage 1 — gt_tenant_profile migration
```

PR: https://github.com/kamalcharan/VaNiGTM/pull/3
