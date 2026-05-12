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
