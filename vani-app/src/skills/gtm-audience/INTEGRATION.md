# gtm-audience — integration notes

The fixtures in `mock-data.ts` are the contract. Per screen: the function the
screen calls, what exists on VaNiGTM today, and the delta.

| Call | Screen | Exists today | Delta |
|---|---|---|---|
| `gtm.audience_state` | pathway | nothing — position lives nowhere | new function; can derive from data + a `gt_pathway_state` row or the run feed. **Schema request if a row is wanted.** |
| `gtm.advance` / `gtm.restart` | pathway | — | same as above |
| `prospect-skill.get_records` (scope `mine`) | Hot list, Find | **REAL — integrated 2026-09-25.** The hot list IS the tenant's prospects; `toHotRow` derives the row's line from quality components, never invents a "why" | pool rows arrive when a connector feeds `gt_universe_*` (`gt_connectors` does not exist — first backend slice) |
| `etl.upload` → `etl.headers` → `etl.tags` / `etl.create_tag` → `etl.create_session` → `etl.process` | `ImportWizard` — station 1 of G1 and `/agents/gtm/import` | **REAL — the full retired wizard since 2026-09-26.** The first port (2026-09-25) was a reduced upload → mapping → land box that sent `relationship: dataset` for every tenant upload (wrong: that is the pool's relationship) and dropped the relationship choice, the pool option, the detection findings, the delivery date, tags, preview, results and the staged-only case. Now: what the data is to you (contacts / customers / common pool for admins), drop zone, what VaNi found with reasons, unresolved columns, delivery as-of + tags (+ region and publisher for the pool), mapping with 17 company targets and 5 person slots, preview, processing, results with VaNi's reading, and "staged, not landed" when landing fails after staging | nginx must expose `/api/v1/etl/` |
| `etl.sessions` · `etl.status` · `etl.records` (paged, by state) · `etl.reprocess` · `etl.patch_record` · `etl.sync_stats` · `etl.delete_staging` · `prospect-skill.get_loads` | `/agents/gtm/imports` (gtm-imports) | **REAL — 2026-09-26.** See `gtm-imports/INTEGRATION.md` for the retired-feature audit | same nginx location |
| `etl.sessions` · `etl.records?status=conflict|failed` · `etl.resolve_conflicts` | Hot list · Past imports · `/agents/gtm/import` | **REAL — integrated 2026-09-25.** The old import dashboard's surviving job: rows held because they would change a record you hold, per-field diff with the quality model's recommendation, take/keep per field or accept all; campaign-locked rows never swept by the bulk accept | same nginx location |
| `research-skill.get_budget` | Find | **REAL — integrated 2026-09-25.** `affordable_companies` decides whether the button is enabled; `tracked:false` (BYOK) reads as metered, no cap | — |
| `research-skill.start_research` | Find | **REAL — integrated 2026-09-25.** `prospect_ids` (real ids), `refresh` to re-read companies that have a brief. The server validates the offers first and returns the split (`selected / reachable / no_website / already_researched / queued`), which is the toast | — |
| `research-skill.batch_status` | Qualify | **REAL — integrated 2026-09-25.** `verdict` (`never_run / queued / running / worker_down / failed / completed`), `message`, `healthy`, `done_count / requested`. Polled every 4s only while `queued` or `running`; `worker_down` is shown, not polled | — |
| `research-skill.get_briefs` | Qualify · People · pathway rail | **REAL — integrated 2026-09-25.** Rows verbatim from `get-briefs.sql`: `fit` keyed by offer_key → `{score 0–1, reason}`, `recommended / best_fit / human / effective_offer`, `hook`, `raw_evidence[{claim,url,excerpt}]`, `unevidenced`, `status`, `error`, `decision_note`. Undecided first | — |
| `research-skill.get_offers` | Qualify | **REAL** | names the offer_keys the fit map is keyed by |
| `research-skill.decide_brief` | Qualify | **REAL — integrated 2026-09-25.** `decision` is the server's enum — `approved / rejected / no_contact` — and a reason (≥3 chars) is REQUIRED for anything but approved, so the two "no" buttons open a reason field. The old `yes / later / no` was a fixture invention; `later` has no server meaning and is gone | — |
| `contact-skill.list_brief_contacts` (`brief_id`) | People | **REAL — integrated 2026-09-25.** One query per approved brief: `entries[{named_index, name, title, email, phone, source_url, has_channel, addressable, promoted_contact_id}]`, `empty_reason` when the brief named nobody. The fixture's provider waterfall (`upload / pool / apollo`) was ahead of the product — there is no provider to try yet, so the row shows the one source there is: the page the name was read on | a waterfall returns when a data provider exists (Settings → Data) |
| `contact-skill.promote_from_brief` (`brief_id`, `named_index`, `confirm_addressed`) | People | **REAL — integrated 2026-09-25.** Idempotent on (brief, index). `confirm_addressed` is sent only when the entry carries a channel — the server refuses it otherwise — so a name with no address joins as a draft and the row says so | — |
| ~~`contact-skill.unpromote`~~ | — | dropped: no such function; removal is `delete_contact` from People, not a pathway step | — |

**Still preview (lib/preview.ts):** `gtm.audience_state` / `advance` /
`restart` — the pathway's position. Nothing on the API holds "where is this
tenant in G1". Everything the rail shows is real; only the stepper's current
index is a fixture, and it resets on reload. A `gt_pathway_state` row (or the
run feed) is the schema question still open with Charan.

Idempotency: every write here sends `Idempotency-Key`; no VaNiGTM endpoint
honours it yet. The server half (store-and-replay, same transaction) lands
with each function above — a write shipped with only the client half is
unfinished (vani-app/CLAUDE.md §2).
