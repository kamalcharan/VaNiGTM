---
name: vani-skill
version: 1.0.0
description: VaNi Profile Agent — gathers tenant product/ICP/GTM knowledge through conversation and extracts a knowledge graph.
tier: starter
default_recipe: vani-conversation
---

# vani-skill — Profile Agent

The first agent in the Vikuna GTM platform. VaNi has a structured
conversation with a new tenant and extracts knowledge into `gt_kg_nodes`.

## Triggers

| Event | Handler | Effect |
|---|---|---|
| `TENANT_REGISTERED` | `handleTenantRegistered` | Creates `gt_tenant_context`, generates an opening question, sets run to `awaiting` |
| `HUMAN_APPROVED` (context: profile_approval) | `handleHumanApproved` | Builds profile summary, emits `PROFILE_COMPLETE` |

## REST surface

| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/v1/vani/status` | Current tenant context + latest run |
| GET  | `/api/v1/vani/runs`   | List all agent runs for the tenant |
| POST | `/api/v1/vani/gather` | Tenant sends a conversation message |
| POST | `/api/v1/vani/approve`| Tenant approves the gathered profile |
| GET  | `/api/v1/vani/graph`  | Tenant's knowledge graph (nodes + edges) |

## Reads / Writes

- Reads: `gt_prompts` (`vani-skill.gather`), `gt_tenant_context.knowledge`
- Writes: `gt_tenant_context`, `gt_kg_nodes`, `gt_agent_runs`
- Emits: `PROFILE_COMPLETE`

## LLM contract

System prompt key: `vani-skill.gather` (seeded by migration 181).

Each turn returns:
- 2–3 sentences + a question
- Zero or more `<extract>{...}</extract>` JSON tags
- Optional `<profile_ready/>` when conversation is rich enough for approval

Extracted JSON shape:
```json
{
  "label": "Product|Feature|ICP|UseCase|PainPoint|Differentiator|Team",
  "name": "short unique name",
  "description": "one clear sentence",
  "properties": {}
}
```

Nodes are upserted by `(tenant_id, label, name)` — re-stating the same
fact in a later turn updates the description and merges properties.
