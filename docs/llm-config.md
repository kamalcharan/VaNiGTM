# LLM configuration — what comes from .env, and what stays in code

**Ruling (Charan, 2026-09-30):** qwen on Vikuna's own VPS is the platform
model; Haiku is the fallback; **no hardcoding anywhere unless approved —
everything comes from .env.**

## From .env — required, no defaults

Read by `backend/src/agent-core/llm.config.ts` at call time. The API and the
worker refuse to start if any is missing or malformed, and print every
problem at once. The full commented block is in `backend/.env.example`.

| Variable | Meaning |
|---|---|
| `LLM_PRIMARY_URL` | The self-hosted qwen endpoint (OpenAI-compatible `/v1`) |
| `LLM_PRIMARY_MODEL` | Its model name |
| `LLM_PRIMARY_KEY` | Bearer key; empty = no auth (must still be written) |
| `LLM_PRIMARY_TIMEOUT_MS` | Floor for every call's timeout |
| `LLM_PRIMARY_SYSTEM_SUFFIX` | Appended to platform system prompts (`/no_think` for qwen3); empty = none |
| `LLM_CONTEXT_TOKENS` | The server's real window (its `n_ctx`); 0 = unknown. **Vikuna's qwen: 16384** (Charan, 2026-09-30) — true only with the server on one parallel slot |
| `LLM_MAX_CONCURRENT` | Platform calls in flight at once, across every process (C5) |
| `LLM_BYOK_MAX_CONCURRENT` | A tenant endpoint's calls in flight, per process |
| `LLM_CHARS_PER_TOKEN` | Cold-start guess until the server reports counts |
| `LLM_TOKENS_PER_SEC` | Cold-start speed guess until calls are measured |
| `HAIKU_DEFAULT` | `true` fail over automatically · `false` ask a person first |
| `ANTHROPIC_API_KEY` | The fallback's key; empty = no fallback |
| `LLM_FAILOVER_MODEL` | Required when the key is set |
| `EMBED_URL`, `EMBED_MODEL`, `EMBED_TIMEOUT_MS`, `EMBED_KEY` | Embeddings; not checked at start (only free-text intent routing uses them, and it answers "unavailable" with `EMBED_NOT_CONFIGURED`). Provider is decision D6 |

What changed on 2026-09-30: the code used to supply `localhost:11434`,
`qwen2.5`, `8192`, `1`, `4`, `3`, `10`, `60000`, `claude-haiku-4-5`, automatic
failover when `HAIKU_DEFAULT` was unset, and `/no_think` whenever the model
name contained "qwen". All gone.

## Also from .env — moved out of code on Charan's ruling (2026-09-30: "it should move to .env")

All required; the API and worker refuse to start without them.

| Variable | Was in code | Meaning |
|---|---|---|
| `LLM_TEMPLATE_OVERHEAD_TOKENS` | 200 | Tokens inside the window for the chat template and role markers |
| `LLM_BUDGET_SLACK_TOKENS` | 64 | Kept back for a caller's own wrapper around budgeted text |
| `LLM_OVERFLOW_MARGIN` | 0.9 | Safety factor on the ratio learned from a "too large" refusal |
| `LLM_CALIBRATION_MIN_SAMPLES` | 3 | Calls before a learned chars/token ratio is trusted |
| `LLM_SPEED_MIN_SAMPLE_TOKENS` | 50 | Shorter answers measure latency, not speed |
| `LLM_SPEED_MAX_MULTIPLE` | 4 | A measured speed may not exceed this multiple of the guess |
| `LLM_PREFILL_FACTOR` | 10 | How much faster the server reads than it writes |
| `LLM_TIMEOUT_SLACK_MS` | 15000 | Added to every derived timeout |
| `LLM_DEFAULT_MAX_TOKENS` | 1000 | Answer size when a caller names none |
| `LLM_DEFAULT_TEMPERATURE` | 0.2 | Temperature when a caller names none |
| `LLM_EXTRACT_ANSWER_DIVISOR` / `_MIN` / `_MAX` | 8 / 800 / 3000 | Extraction answer reserve = window ÷ divisor, clamped |
| `EMBED_DIM` | 768 | Must match the `vector(768)` columns (migration 246); checked at call time with the other EMBED_* |
| `WORKER_POLL_MS` | 3000 | How often the worker polls |
| `WORKER_BATCH_SIZE` | 5 | Events claimed per poll |
| `WORKER_HEARTBEAT_MS` | 30000 | "Still alive" stamp while a handler runs |
| `WORKER_STALE_CLAIM_SECONDS` | "2 minutes" (was `WORKER_STALE_CLAIM`) | A claim with no heartbeat this long is orphaned. Now a number, passed to SQL as a parameter |
| `WORKER_MAX_ATTEMPTS` | 3 | Claims before an event is failed as poison |

## The model router — from .env, required (release 2, 2026-10-02)

Read by `agent-core/llm.router.config.ts`; the API and the worker refuse to
start with any of these missing or malformed, and list every problem at once.
`.env` says what a provider IS; whether enrichment may USE it is the admin's
switch on Settings → Platform models (`gt_llm_provider_switch`; no row = off).

| Variable | Example | What it does |
|---|---|---|
| `LLM_PROVIDERS` | `groq,openrouter` | Outside providers by code. May be empty. `qwen` and `haiku` are reserved and never listed |
| `LLM_ROUTE_HIGH` | `groq,openrouter,qwen,haiku` | Judgement steps (industry, offers, domain-matches-company), tried in order |
| `LLM_ROUTE_MEDIUM` / `LLM_ROUTE_LOW` | `qwen` | Shorter extraction and normalising |
| `LLM_ROUTER_COOLDOWN_SECONDS` | 60 | A provider that answered 429 without `Retry-After` is skipped this long |
| `LLM_<CODE>_URL` | `https://api.groq.com/openai/v1` | OpenAI-compatible base URL |
| `LLM_<CODE>_KEY` | — | Declared even when empty (an endpoint with no auth). Never logged, never returned |
| `LLM_<CODE>_MODEL` | `openai/gpt-oss-120b` | Read the ids your key may call off the provider's console |
| `LLM_<CODE>_CTX` | 8000 | Window in tokens; 0 = unknown, not judged. A prompt that does not fit is NOT trimmed — that provider is skipped |
| `LLM_<CODE>_RPM` / `_DAILY` | 30 / 1000 | Requests per minute / per UTC day, counted across every process from `gt_llm_calls`; 0 = no limit declared |
| `LLM_<CODE>_TPM` / `_TPD` | 8000 / 200000 | Tokens (prompt + answer) per minute / per UTC day, counted the same way; a call is planned with its own estimate, so a provider is skipped BEFORE it would run out. Free tiers usually bind here first; 0 = no limit declared |
| `LLM_<CODE>_DATA_TERMS` | `no_training` · `may_train` · `unknown` | Read from the provider's current terms. Tenant data goes only to `no_training`; people data never to an outside provider |

`qwen` takes its URL, model, key and window from `LLM_PRIMARY_*` and
`LLM_CONTEXT_TOKENS`; `haiku` takes `ANTHROPIC_API_KEY` and
`LLM_FAILOVER_MODEL`, and a route may name it only when the key is set.

## Common-pool enrichment — from .env, required (release 4, 2026-10-02)

`backend/src/etl/enrich.config.ts`; the API and the worker refuse to start without them.

| Variable | Suggested | What it is |
|---|---|---|
| `ENRICH_POOL_DAILY_RECORDS` | 5000 | Companies the pool may read in a UTC day, across every run (D-Q19 E4). Records, not tokens. |
| `ENRICH_POOL_PAGES` | 3 | Pages read per company besides the home page (About, Contact, Products). |
| `ENRICH_POOL_MIN_CONFIDENCE` | 0.6 | Below this a model's answer for a field is not written; nothing above it = abstained. |
| `ENRICH_POOL_READ_TOKENS` | 2000 | Tokens of site text one company's reading carries (route HIGH). Keep it under the smallest window in `LLM_ROUTE_HIGH`, less the answer. |
| `ENRICH_POOL_HIGH_MAX_TOKENS` | 800 | Answer cap: what it does, industry, type, size, small graph. |
| `ENRICH_POOL_LOW_MAX_TOKENS` | 300 | Answer cap: which contacts are the company's own. |

Pool calls are routed with `meter: 'pool'`: never checked against or recorded
to any tenant's token budget, never sent to a tenant's own key, public company
data only. They are counted in `gt_llm_calls` like every routed call.

## Approved to stay in code

| Value | Where | Ruling |
|---|---|---|
| The BYOK provider **menu** — OpenAI, Anthropic, Groq, Together, Self-hosted, with their public base URLs and suggested models | `agent-core/llm.provider.ts` `BYOK_PROVIDER_MENU` | Charan, 2026-09-30: "put menu back to code". Product content, the same on every deployment. The tenant's own choice, key, model and endpoint are stored per tenant in `vani_llm_provider` (key encrypted) — never in code or .env |

Nothing else LLM- or worker-related remains in code as a value. Outside that
scope, constants still exist elsewhere in the backend (list sizes, crawl
limits, the DB pool size); they are not covered by this change.
