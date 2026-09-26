# gtm-imports — integration notes

`/agents/gtm/imports` is the retired `frontend/src/app/(app)/import-dashboard`
ported whole (2026-09-26). Charan: "i tried import — it is missing many things
from retired items … the complete thing is not moved." This file is the audit
that should have been done first: every feature of the retired page, and where
it lives now.

## Retired import dashboard → now

| Retired feature | Now | Backend |
|---|---|---|
| Sidebar: sessions with #seq, ID, filename, time ago, type | `ImportsDashboard` sidebar, same fields; type filter is by **relationship** (contacts / customers / common pool) — the MFD types (scheme, customer, transaction, bookmark) never existed in this product | `GET /etl/sessions` (REAL; now returns `load_id`, `destination`, `relationship`) |
| Header meta: Import #seq · filename | same, plus the **delivery** behind it (label, as-of, tags) | `prospect-skill.get_loads` scope `mine` (REAL, new) joined on `load_id` |
| Stat cards: total, successful (+%), failed, duplicates | same, plus **Need your call** counted from the held rows | `GET /etl/sessions/:id/records?status=conflict` |
| VaNi post-import analysis + Reprocess CTA | same copy family; CTA is **Retry N failed rows** = reprocess (reset to pending) then process | `POST …/reprocess` then `POST …/process` |
| "Some rows need your call" + Apply recommended to all | same | `POST …/conflicts/resolve {accept_recommended}` |
| Filter tabs All / Pending / New / Duplicate / Needs your call / Failed | same, counts on each | `GET …/records?status=&page=&limit=` |
| Sync Stats when counters do not add up | **Recount**, shown on the same condition | `POST …/sync-stats` |
| "Import N staged rows →" for staged / completed_with_errors | **Land the staged rows →**, also offered on `failed` | `POST …/process` |
| Delete Staging behind a VdfModal | in-page confirmation panel with the same two warnings (not landed yet · decisions pending) | `DELETE …/staging` |
| Records table (#, Company, Domain, Location, Industry, People, Status, view) + pagination | same columns (dotted `company.*` / `people[]` paths), First/Prev/Next/Last | — |
| Record drawer: heading, meta, status, diagnostic | same | — |
| Drawer: per-field keep/take on a held row + Apply this decision | same | `POST …/conflicts/resolve {decisions}` |
| Drawer: Edit + Save & Reprocess | same — and it now works for GTM rows (the retired page had no edit fields for the `company` type, so a failed row could never be corrected in place) | `PATCH …/records/:recordId {mapped_data}` |
| Drawer: Mapped Data / Raw Data JSON | same | — |
| Orphan tab, alias status, "Rebuild Holdings", scheme dashboard link | **dropped** — MFD-only (transactions, NAV bookmarks); no such data here | — |

Everything on the API side existed already except `get_loads` and the three
session columns. No schema change.

## Preview

Nothing. Every call this screen makes is in `lib/preview.ts`'s REAL set; a
missing route fails loudly. The nginx location for `/api/v1/etl/` is still
the deploy-side prerequisite (see gtm-audience/INTEGRATION.md).
