---
name: ingestion-skill
version: 0.1.0
description: Knowledge ingestion pipeline — parses uploaded documents, URLs, and connected Google Drive folders into the tenant knowledge graph.
tier: starter
default_recipe: ingestion-status
---

# ingestion-skill — Knowledge Ingestion

`ingestion-skill` turns any document into knowledge graph nodes. It reads
incoming files (PDF, DOCX, PPTX, TXT, MD) and URLs from `gt_kb_sources`,
parses them through a per-MIME parser, splits the result into chunks, asks
the VPS LLM to extract structured entities, and upserts those entities into
`gt_kg_nodes` (the same graph VaNi's conversation writes to — sources are
source-agnostic). It reads OAuth credentials from `gt_tenant_integrations`
when syncing a Google Drive folder. It emits `KNOWLEDGE_UPDATED` after a
successful ingestion so the profile-completion checker can recalculate the
tenant's profile score, and `FOLDER_CONNECTED` once the OAuth handshake
finishes.

## Functions

These expose the `/api/v1/ingest` operations on the generic skill runner, so a
console reaches them without a second REST surface (the same precedent as
llm-provider-skill). The REST router stays for direct API use.

### list_sources
What VaNi has read, newest first. `raw_text` omitted — it can be large.
- Parameters: limit (optional, number, default 50, max 100), offset (optional, number)
- Returns: { sources: [{ id, source_type, display_name, status, chunk_count, node_count, error_msg, created_at, updated_at }], total, recipe: 'source-list' }

### get_source
One source with its processing status and the agent run's steps.
- Parameters: source_id (required, string)
- Returns: { source: { …list fields, raw_chars, run_status, run_steps, run_error }, recipe: 'source-detail' }

### submit_url
Point VaNi at a page. Re-submitting a URL re-ingests it instead of adding a second row. Emits URL_SUBMITTED.
- Parameters: url (required, string — a bare domain becomes https://)
- Returns: { source_id, url, recipe: 'source-detail' }

### submit_text
Pasted context. At least 40 characters; clipped at 200,000. Emits FILE_UPLOADED.
- Parameters: text (required, string), title (optional, string)
- Returns: { source_id, recipe: 'source-detail' }

### delete_source
Removes the source row only; what was learned (gt_kg_nodes) stays.
- Parameters: source_id (required, string)
- Returns: { deleted: true, source_id, recipe: 'confirmation' }
