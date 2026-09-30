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
| `LLM_CONTEXT_TOKENS` | The server's real window (its `n_ctx`); 0 = unknown |
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

## Still in code — PENDING APPROVAL

These are properties of how the budget and timeouts are computed, not of the
deployment. Each can move to .env if you prefer; none is a model, endpoint or
limit.

| Value | Where | Why it is a constant |
|---|---|---|
| 200 tokens | `llm.gate.ts` `OVERHEAD_TOKENS` | Space inside the window for the chat template and role markers, which are not in our string |
| 64 tokens | `llm.gate.ts` `BUDGET_SLACK_TOKENS` | Kept back for the caller's own wrapper around budgeted text |
| 0.9 | `llm.gate.ts` `noteContextOverflow` | Margin when a server refusal teaches us the ratio |
| 3 samples | `llm.gate.ts` `effective` | A learned ratio is trusted only after three calls |
| 50 tokens | `llm.gate.ts` `noteObservedSpeed` | Shorter answers measure latency, not speed |
| × 4 | `llm.gate.ts` `tokensPerSec` | A measured speed may not exceed four times the guess |
| 10 | `llm.client.ts` `PREFILL_FACTOR` | Reading a prompt is ~10× faster than writing an answer |
| + 15 s | `llm.client.ts` timeout | Connection and queueing slack on the derived timeout |
| 1000 tokens, 0.2 | `llm.client.ts` `callLLM` | Default answer size and temperature when a caller names none |
| window ÷ 8, 800–3,000 | `ingestion-skill/pipeline/extractor.ts` | Answer reserve for extraction, derived from the window |
| 768 | `vani/embed.ts` `EMBED_DIM` | Fixed by the `vector(768)` columns (migration 246) — a schema fact |
| provider catalogue | `llm.provider.ts` | Public base URLs and default models of OpenAI, Anthropic, Groq, Together — offered to BYOK tenants; each tenant can override |

Also noted, outside the LLM: the worker's `WORKER_POLL_MS` (3000),
`WORKER_BATCH_SIZE` (5), `WORKER_HEARTBEAT_MS` (30000), `WORKER_STALE_CLAIM`
(2 minutes) and `WORKER_MAX_ATTEMPTS` (3) still have code defaults. Same
treatment on request.
