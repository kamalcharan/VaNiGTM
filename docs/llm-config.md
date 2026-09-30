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

## Approved to stay in code

| Value | Where | Ruling |
|---|---|---|
| The BYOK provider **menu** — OpenAI, Anthropic, Groq, Together, Self-hosted, with their public base URLs and suggested models | `agent-core/llm.provider.ts` `BYOK_PROVIDER_MENU` | Charan, 2026-09-30: "put menu back to code". Product content, the same on every deployment. The tenant's own choice, key, model and endpoint are stored per tenant in `vani_llm_provider` (key encrypted) — never in code or .env |

Nothing else LLM- or worker-related remains in code as a value. Outside that
scope, constants still exist elsewhere in the backend (list sizes, crawl
limits, the DB pool size); they are not covered by this change.
