# gtm-audience — integration notes

The fixtures in `mock-data.ts` are the contract. Per screen: the function the
screen calls, what exists on VaNiGTM today, and the delta.

| Call | Screen | Exists today | Delta |
|---|---|---|---|
| `gtm.audience_state` | pathway | nothing — position lives nowhere | new function; can derive from data + a `gt_pathway_state` row or the run feed. **Schema request if a row is wanted.** |
| `gtm.advance` / `gtm.restart` | pathway | — | same as above |
| `prospect-skill.hot_list` | Hot list | `prospect-skill.get_records` (tenant rows), `gt_universe_*` (pool, never fed) | compose: pool rows by vocabulary + ICP **once a connector feeds the pool** (`gt_connectors` does not exist — first backend slice after Sprint 3), plus tenant rows with `also_mine` merge on domain. `why` per row is new. |
| `etl.upload_list` | Hot list | `/api/v1/etl` upload → map → stage → `gt_source_loads` | wrap as a skill fn, or add a PLATFORM_ROUTES entry; return the mapping preview shape |
| `research-skill.start_research` | Find | exists (17 fn) | params: `prospect_ids` |
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
