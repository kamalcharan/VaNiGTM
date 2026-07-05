# storyteller-skill

The **Storyteller** agent turns an approved tenant profile into a shareable
pitch deck, then serves it (and live audience Q&A).

## What it does
- **Triggers:** `PROFILE_COMPLETE` event (wired in the worker at Stage 6) and a
  manual `POST /build` route.
- **Reads:** `gt_tenant_profile` (typed profile) + `gt_kg_nodes` (knowledge graph).
- **Generates:** a deck via the **seeded** prompt key `vani-skill.generate_slides`
  — note the namespace: it lives under `vani-skill.*` and is reused **as-is**,
  not re-keyed to `storyteller-skill.*`.
- **Validates:** the LLM output against `DeckSchema` (`deck.schema.ts`) before it
  is trusted.
- **Persists:** the validated slide array to `gt_presentations` at
  `status = 'awaiting'` (pending human approval). Approval mints a `share_token`
  and flips the row to `approved`.
- **Q&A:** answers audience questions grounded in the deck + KG, logged to
  `gt_qa_log`.

## Write-path rule (RLS)
- `buildDeck`, `approveDeck`, and `answerQuestion` writes go through
  **`createTenantDb`** (sets tenant context so RLS on `gt_presentations` /
  `gt_qa_log` passes).
- The **public share route** (`GET /share/:token`) uses the **raw pool** with
  **no tenant context** — it is intentionally cross-tenant, scoped instead by a
  unique `share_token` AND `status = 'approved'`.

## Surface (routes — mounted at Stage 6)
| Method | Path | Auth | Agent method |
|--------|------|------|--------------|
| POST  | `/build`        | JWT    | `buildDeck` |
| GET   | `/:id`          | JWT    | (fetch deck for tenant) |
| PATCH | `/:id/approve`  | JWT    | `approveDeck` |
| POST  | `/:id/qa`       | JWT    | `answerQuestion` |
| GET   | `/share/:token` | public | (fetch approved deck by token) |

## Files
- `deck.schema.ts` — Zod `DeckSchema` / `SlideSchema` (deck output contract).
- `storyteller.agent.ts` — `StorytellerAgent` (buildDeck / approveDeck / answerQuestion).
- `storyteller.routes.ts` — `createStorytellerRouter(pool)`.
