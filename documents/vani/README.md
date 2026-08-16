# VaNi Platform & Vara — specifications and schema

Source documents for the VaNi platform layer and its first agent, Vara.
Deposited 2026-08-16. These are records, not build outputs — the code they
describe lives in `kamalcharan/VaNiGTM`, not in this repo.

## Reading order

| # | File | What it is |
|---|------|-----------|
| 1 | `vani-platform-specification-v0.1.html` | VaNi Platform spec v0.1 (draft for review). Positioning and invariants, four personas, the agent integration contract, shared services, flows F1–F3, epics VN-01…VN-43, NFRs. |
| 2 | `vara-specification.html` | Vara — Product Specification & Schema v0.2. Positioning, personas, multi-tenancy, onboarding, application lifecycle, ingestion, calibration loop, comms & compliance. |
| 3 | `vara-data-model-v1.0.html` | Vara — Data Model v1.0. Single source of truth for schema structure; the migrations below are its DDL. |
| 4 | `sql/001_vani_platform.sql` | Platform spine. 16 `vani_` tables: identity & tenancy, agent fabric, org context & packs, shared services. RLS + append-only guards. Net-new; coexists with legacy `VN_`/GTM tables. |
| 5 | `sql/002_vara_agent.sql` | Vara's own `vara_` tables. Depends on 001. Metering fires from the score-snapshot trigger. |
| 6 | `sql/003_vara_learning_functions_seed.sql` | Calibration tables, `vara_candidate_history` view, the guarded `vara_transition()` state machine, the DPDP purge function, and seed (agent registry, role catalog, Vikuna as tenant #1). Depends on 001 + 002. |

Two UX prototypes are included, both titled "Vara — the chosen one · Talent
agent by VaNi" with the same screens (shortlist, probability map, calibration,
candidate view):

- `vara-ux-prototype.html` — 77 KB
- `vara-ux-prototype-1.html` — 100 KB, the later upload

Which supersedes which was not stated when they were deposited; both are kept
until that is confirmed.

## Load-bearing rules (from the specs, worth knowing before touching anything)

- **Agents extend, never modify.** `vani_` tables never grow agent-specific
  columns. An agent ships as its own prefixed tables plus declarations into the
  platform registries. Nova's activation should require zero platform DDL —
  that is the stated test of the integration contract.
- **`model` is never a legal audit actor.** `actor_type` is
  `human | rule | timer | system`, enforced in the database. Rules may only
  close on knockouts; timers may only expire closing windows; system may route
  but never decide.
- **One declaration, N projections.** A tenant states a fact once at the
  platform; agents receive a delegation and never re-ask.
- **Vikuna is tenant #1** — a real row through the same gates as any
  subscriber. Behaviour that only works for the home tenant is a bug.
- **Append-only** for audit, comms log, metering and pack versions. The DPDP
  purge function is the single sanctioned bypass, and audits itself.
- **Audit payloads reference ids, never raw PII** — which is what lets a DPDP
  purge leave the audit spine intact.

## Open items noted in the specs

- Naming for the layer (VaNi Core v0.1 vs VaNiBase v3.0) is still open; the
  spec calls it simply "VaNi Platform" and is compatible with either.
- Out of scope for v1: platform-level orchestration engine, cross-agent
  knowledge graph / UNS, self-serve tenant signup, billing execution.
