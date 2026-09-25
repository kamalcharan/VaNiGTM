# gtm-audience — integration notes

The fixtures in `mock-data.ts` are the contract. Per screen: the function the
screen calls, what exists on VaNiGTM today, and the delta.

| Call | Screen | Exists today | Delta |
|---|---|---|---|
| `gtm.audience_state` | pathway | nothing — position lives nowhere | new function; can derive from data + a `gt_pathway_state` row or the run feed. **Schema request if a row is wanted.** |
| `gtm.advance` / `gtm.restart` | pathway | — | same as above |
| `prospect-skill.get_records` (scope `mine`) | Hot list, Find | **REAL — integrated 2026-09-25.** The hot list IS the tenant's prospects; `toHotRow` derives the row's line from quality components, never invents a "why" | pool rows arrive when a connector feeds `gt_universe_*` (`gt_connectors` does not exist — first backend slice) |
| `etl.upload` → `etl.headers` → `etl.create_session` → `etl.process` | Hot list (Add your own list) | **REAL — integrated 2026-09-25.** Multipart upload via `apiRequest`; the three JSON steps via the transport's platform table. Lands in `gt_prospects` (`relationship: dataset`, `destination: prospects`) | nginx must expose `/api/v1/etl/`; conflicts held for review have no console yet (the old import dashboard's job) |
| `research-skill.start_research` | Find | exists (17 fn) | params: `prospect_ids` (real ids now); the screen also sends `prospects[]` identity so the preview can name them — the real function ignores it |
| `research-skill.batch_status` | Qualify | exists | shape: `lines[]` with `at/text/done` from `gt_agent_runs.steps` |
| `research-skill.get_briefs` | Qualify | exists | `fit` keyed by offer id; `open_with`; `evidence[]` with `source` |
| `research-skill.decide_brief` | Qualify | exists | verdict enum `yes / later / no` |
| `contact-skill.list_brief_contacts` | People | exists (16 fn) | add `waterfall[]` (`upload / pool / <provider>` with `hit / miss / not_tried`) and `none` for "nobody found" |
| `contact-skill.promote_from_brief` | People | exists | returns `contact_ref` (`CONT-0001`, `gt_next_seq`) |
| `contact-skill.unpromote` | People | — | new, or `delete_contact` |

Idempotency: every write here sends `Idempotency-Key`; no VaNiGTM endpoint
honours it yet. The server half (store-and-replay, same transaction) lands
with each function above — a write shipped with only the client half is
unfinished (vani-app/CLAUDE.md §2).
