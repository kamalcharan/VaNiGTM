# SmartProfile → VaNi GTM port notes (Phase 2 input)

> Distilled 2026-07-27 from two ContractNest artifacts the user shared:
> the SmartProfile technical spec (UI/data model/port checklist) and the
> live n8n workflow JSON (`smartprofile-generate` / `smartprofile-search`).
> This is the design input for Phase 2 data modelling + the Lead Finder
> matching engine. The source artifacts are NOT in this repo (internal to
> ContractNest); this note carries everything VaNi GTM needs.

## What ContractNest proved (and what it didn't)

Working there: the two-table data model, the suggest→approve UX, the
n8n generate/search pipelines' *shape*. NOT working there: website
scrape (stub), and the UI page never actually called /generate — zero
embeddings in their live DB. We port the design, not the wiring gaps.

## 1. Adopt in gt_tenant_profile (Phase 2 migration)

**`suggested_*` vs `approved_*` field provenance.** Agent writes
suggestions; human ratification promotes to approved; re-runs freely
overwrite suggestions and NEVER touch approved values. Replaces the
current fill-only-empty compromise in `profile.drafter.ts` (which
cannot improve an already-filled field). Acceptance rate becomes a
model-quality metric.

## 2. New tables (Phase 2 migration — discuss before applying)

```sql
-- Mirrors t_semantic_clusters with the spec's own fixes applied:
CREATE TABLE gt_semantic_clusters (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         UUID NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,
  is_live           BOOLEAN NOT NULL DEFAULT true,
  primary_term      VARCHAR(200) NOT NULL,
  related_terms     TEXT[] NOT NULL,
  category          VARCHAR(50),          -- fixed enum, UI dropdown depends on it
  confidence_score  FLOAT8,
  cluster_embedding vector(768),          -- PINNED dimension (nomic-embed-text)
  is_active         BOOLEAN NOT NULL DEFAULT true,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ON gt_semantic_clusters USING hnsw (cluster_embedding vector_cosine_ops);
-- + embedding vector(768) column on gt_tenant_profile, same index treatment.
```

Fixes vs ContractNest applied: single tenant scope (no dual
tenant/membership nullable columns → no num_nonnulls ambiguity),
pinned vector dimension, HNSW index from day one, `is_live` per house
rules. Prereq: verify `vector` extension on vani_gtm_db (ContractNest
had it installed; ours unverified).

## 3. The AI jobs — worker skills, not n8n

ContractNest ran these as unauthenticated n8n webhooks (their spec
flags the auth hole). VaNi GTM's event bus is the corrected version:
same jobs, but version-controlled, tenant-budgeted, step-logged in
gt_agent_runs, no HTTP attack surface.

| n8n node (theirs) | VaNi GTM home |
|---|---|
| ada-002 embedding call | `llm.client.ts` — add `embed()` against Ollama `/v1/embeddings` (`LLM_EMBED_MODEL=nomic-embed-text`, 768 dims). VPS-first, zero external cost; escalation hook stays stubbed. |
| gpt-4o-mini cluster generation | profile-skill function on the worker; prompt seeded into `gt_prompts` as `profile-skill.semantic_clusters` |
| Supabase RPC `upsert_tenant_smartprofile` | plain `ctx.db.transaction()` — profile + embedding + clusters atomically |
| Supabase RPC `smartprofile_unified_search` | SQL function for Lead Finder matching (see §5) |

Retry discipline worth copying: model calls got 3 tries / 2s backoff;
every step had a failure branch returning
`{status, errorCode, message, details, suggestion, recoverable}` —
superset of our `{error:{code,message}}`; adopt `suggestion` +
`recoverable` for agent-facing errors.

## 4. The cluster prompt (port nearly verbatim)

Their production prompt, generalized (keep the India-aware parts —
target market matches):

- 3–5 clusters from profile text + keywords
- each: `primary_term` (lowercase), `related_terms` 10–15 lowercase
  (synonyms, misspellings, Hindi transliterations, customer phrases,
  industry jargon), `category` from a FIXED 12-value enum
  (Technology, Healthcare, Services, Manufacturing, Trading,
  Education, Finance, Real Estate, Retail, Hospitality, Consulting,
  Other), `confidence_score` 0–1
- JSON-object response format; clamp confidence server-side
  (`min(1, max(0, x))`), lowercase/trim everything — their Code node
  did this and it matters with small models.

## 5. Unified search = Lead Finder's matching engine

Their search RPC returns `similarity`, `similarity_original`,
`boost_applied: 'cluster_match'`, `from_cache` — i.e. **hybrid
ranking: vector similarity, then exact-term boost when the query hits
a cluster's related_terms, with a query cache**. This is the ICP →
prospect matching design: embed the prospect/company text, rank
against tenant profile embedding, boost on cluster term hits, cache
repeated queries. Build as a SQL function in Phase 3 (Lead Finder),
schema support in Phase 2.

## 6. Explicitly not ported

- The 4-layer UI→service→API→edge chain (we're already 2-layer)
- n8n as the AI backend (worker bus supersedes; their spec's own
  checklist demanded webhook auth we get for free)
- delete-then-insert cluster saves → diff on save if concurrent
  editors ever matter
- OpenAI dependency — embeddings via VPS Ollama; escalation stays a
  deliberate stub per agent-core policy
