# Phase 0 — Clear the ground: completion report

**Repo:** `kamalcharan/VaNiGTM` · **Branch:** merged to `main`
**Dates:** 2026-08-10 · **Standing constraint held:** the assessment funnel did
not go down at any point.

---

## Verdict against the work order's completion criteria

| Criterion | Status |
|---|---|
| `docs/db/triggers-and-functions.md`, `ki-disposition.md`, `rls-status.md` committed | ✅ on `main` |
| Orphaned `ki_*` renamed and the two-week clock started | ✅ **not applicable** — production has zero orphans (§2) |
| Application runs on a non-`BYPASSRLS` role, two-tenant test passes | ⚠️ **`DB_PRIMARY` switched; post-switch verification outstanding** (§4) |
| `CLAUDE.md` updated to reflect all three | ✅ on `main` |
| The assessment funnel has not gone down once | ✅ |

Everything deployed ahead of the switch was inert under the old superuser
runtime, so the funnel was never at risk during preparation.

---

## Item 1 · Inventory the hidden logic — complete

`docs/db/triggers-and-functions.md`. Every trigger, function and generated
column extracted from the catalog, described, and classified.

**The headline is that there was far less hidden logic than the brief assumed.**

- **28 of the 29 triggers do nothing but stamp `updated_at`**, using five
  redundant copies of the same three lines. Exactly one trigger has behaviour:
  `ki_set_session_limit` silently floors `vn_subscriptions.max_sessions` at 5
  on INSERT but not on UPDATE — and contradicts `vn_get_max_sessions()`, which
  documents a default of 1.
- **46 of the 75 functions belong to `pgcrypto` and `uuid-ossp`.** Only 29 are
  project-authored, and only four run at runtime: `set_tenant_context`,
  `gt_next_seq`, `vani_ensure_seq_prefixes`, `vani_ensure_tag`.
- **Migration 180 dropped ten MFD-era tables with `CASCADE`**, which does not
  parse plpgsql bodies. Six functions survived pointing at relations that no
  longer exist, and `ki_alias_before_upsert` is a trigger function with no
  trigger. Listed as dead-code candidates; **nothing deleted**.

Two latent bugs found and reproduced:

- `ki_contacts.normalized_name` and `ki_normalize_contact_name()` apply
  `[^A-Z0-9\s]` *before* `upper()`, so lowercase input is deleted rather than
  uppercased — `'Kamal Charan'` becomes `'K C'`. The `gt_` equivalent is
  correct, so VaNi is unaffected, and `ki_contacts` does not exist in
  production.
- `vn_cleanup_expired_sessions()` has no caller and no scheduler entry.
  Confirmed live: **334 refresh tokens, 24 expired but still flagged active.**
  Small, but anything trusting `is_active` without checking `expires_at` reads
  24 dead sessions as live.

---

## Item 2 · Settle the `ki_*` tables — complete, nothing to rename

`docs/db/ki-disposition.md`.

**Production holds nine `ki_*` tables and all nine are live** — the ETL import
pipeline and the pulse cluster. No orphans, no KI-Prime data to export, no
two-week rename clock to start. `233_ki_deprecate_orphans.sql` is written,
tested and ships as a deliberate no-op.

The brief's premise of "41 tables, roughly a third of the schema" describes the
migration files, not the running database:

| | Local rebuild | Production |
|---|---|---|
| `ki_*` | 42 | **9** |
| `gt_*` | 58 | 58 |
| `vn_*` | 14 | 14 |
| Total | 114 | **81** |

`gt_*` and `vn_*` match exactly — the whole divergence is `ki_*`. Production
was evidently bootstrapped from a subset rather than by replaying every
migration, even though `vn_migrations` records the same 125 filenames in both.

**One methodological finding worth passing on.** The brief's fourth signal —
"touched by any trigger or function from Item 1" — does not discriminate.
Applied literally it would have marked thirteen dead tables as live, because
the triggers are `updated_at` stamps and every function touching a `ki_*` table
has zero call sites. This is where Item 1 paid for itself, exactly as the brief
predicted it would.

Also resolved: `vn_tenants.ext_ref_type_code → ki_ext_ref_types(code)` was
identified locally as the only FK from the `gt_*`/`vn_*` side into `ki_*` and
flagged as a blocker for the Phase 1 schema split. **That table does not exist
in production, so the coupling does not either.** The clean cut is available.

---

## Item 3 · Make RLS real — prepared and switched; verification outstanding

`docs/db/rls-status.md`.

### The finding that mattered most

**A table's OWNER is exempt from its own RLS policies unless
`FORCE ROW LEVEL SECURITY` is set. Eighteen tables were owned by `vanigtm_app`
— the very role the cutover points the application at.**

```
gt_activity_feed   gt_agent_runs      gt_campaign_metrics   gt_campaigns
gt_channels        gt_contact_assignments   gt_persona_signals   gt_personas
gt_sequence_steps  gt_sequences       gt_stage_log          gt_step_templates
ki_pulse_config    ki_pulses          ki_pulse_sessions
ki_pulse_session_actions   ki_pulse_session_gaps   ki_pulse_session_observations
```

That is the campaign/sequence/persona cluster and the entire pulse cluster.
Their policies were present, correct and guarded — and completely inert. Had
the switch happened without this, tenant isolation would have *appeared* to be
on while eighteen tables stayed open cross-tenant.

**No amount of reading policy definitions would have surfaced it.** It was
found by running the two-tenant test as the restricted role against production
and watching `gt_campaigns` fail five checks while every policy check passed.
Reproduced deliberately to confirm the mechanism: owned by `vikuna_admin`,
denied; owned by `vanigtm_app`, two rows visible with no tenant context; add
`FORCE`, zero rows.

Migration 236 forces RLS on seventeen. `gt_agent_runs` is handled separately
below.

### What else would have broken at the switch

Seven paths, all now fixed and verified:

| Would have happened | Fixed by |
|---|---|
| 18 tables open cross-tenant | 236 |
| Platform tags vanish; **all 8 `gt_content_kinds` rows** vanish, so the table goes dark for every tenant | 235 |
| Every public deck link 404s | 237 — `SECURITY DEFINER get_shared_deck(token)` |
| Worker stops recording agent runs | 237 |
| ETL imports go silently empty | code — `withTenantClient` |
| Every VaNi report link 404s | code — `getReportByToken` |
| Policies crash on pooled connections | 234 (a no-op in production, see below) |

Two of these fail *silently* rather than loudly — the platform rows and the
ETL — which is why they are the ones worth noting.

### Triage, per the brief's three categories

**Missing or wrong policy → fixed.** 235 splits `gt_tags` and
`gt_content_kinds` into a `FOR SELECT` policy admitting platform rows
(`tenant_id IS NULL`) plus a `FOR ALL` write policy confined to the caller's
tenant. Combining them into one would have used the same expression as the
INSERT check and let any tenant mint a row every other tenant can see — a read
bug turned into privilege escalation.

**Legitimate cross-tenant → named exemptions.** Registered in `rls-status.md`
§9 with justifications: the `vn_*` auth tables (authentication must resolve
which tenant a user belongs to before a context can exist — scoping them is
circular), `gt_events` (the cross-tenant bus), the shared universe pool,
`ki_import_staging` (scoped by `session_id`), reference lookups, and
`gt_agent_runs`.

`gt_agent_runs` deserves a note. Forcing RLS there breaks the worker, which is
genuinely cross-tenant and holds only a `runId` deep inside an agent. Threading
`tenant_id` through some twenty call sites across five agent files is the
"rewriting queries for elegance" the brief puts out of scope. So migration 237
**disables** RLS on it, mirroring `gt_events` — the effect on the running
system is nil, since the owner bypassed the policy anyway, but the exemption is
now visible in `pg_class` and reported by the isolation test instead of hidden
behind table ownership where it was found by accident. The doc records what
removing the exemption would take.

**App bug → flagged loudly.** Four queries that should have been tenant-scoped
and were not: `gt_source_loads` read by id alone, `ki_import_sessions` updated
by id alone (letting one tenant rewrite another's import counters),
`getRun(runId)` fetching an enumerable `BIGSERIAL` on a row carrying `output`
and `error_trace`, and the ETL read path. All closed.

### The two-tenant test

`deploy/vani-main-vps/rls-two-tenant-test.sql`. Thirteen checks, run as the
application role, results as a result grid. **13/13 locally, and verified to
fail when isolation is broken** — with RLS disabled on `gt_lead` it aborts at
check 2 with the leaked row count.

It checks more than the brief asked: that the role running it cannot bypass RLS
at all (otherwise every assertion passes for the wrong reason), that a *known*
foreign row cannot be fetched by primary key (an IDOR is a targeted fetch;
`count()` would hide it), that a cross-tenant write is refused, that
`gt_next_seq` and `vani_ensure_tag` still work under the restricted role, and
that no table lets its owner escape its own policy.

Building it produced three bugs worth recording, because each is the natural
way to write this test wrong:

1. It first gathered its own tenant list through the very RLS it was testing,
   which returned nothing and made every later check an artifact.
2. It attempted a cross-tenant INSERT and recorded a failure if it succeeded —
   but never rolled that INSERT back. A `RLS-TEST-001` row was found committed
   in the test database. Against production with a broken policy it would have
   written a real lead. Now a no-op UPDATE with an unconditional
   sentinel-rollback.
3. Checks 8 and 9 called `gt_next_seq` and `vani_ensure_tag` without rolling
   back. Run against production once, this consumed a sequence number and
   self-seeded a counter row with the wrong prefix. Repaired via
   `deploy/vani-main-vps/realign-vani-sequences.sql`; both checks now roll back.

### Production state

Confirmed by `deploy/vani-main-vps/post-deploy-check.sql`, all seven rows OK:

```
235 platform-row policies                OK
236 ownership bypass closed              OK — no app-owned table escapes its policy
sequence counters vs issued ids          all ok
237 public deck lookup                   OK — get_shared_deck() present and SECURITY DEFINER
237 gt_agent_runs exemption is explicit  OK
ready for cutover?                       YES on the schema side
no duplicate lead_no                     OK
```

`DB_PRIMARY` has since been repointed at `vanigtm_app`.

---

## Outstanding

**Post-switch verification — the last thing standing between this and "done".**
Re-run `rls-two-tenant-test.sql` against production and exercise signup, login,
the assessment flow and the skills executor. Those three auth paths have never
run under the restricted role; every other path has been exercised or converted
deliberately. Rollback is repointing `DB_PRIMARY` at `vikuna_admin` — no
migration reverses.

**Not done, and out of Phase 0's scope:** dropping anything (there is nothing
to drop); the `ki_*` → `gt_*` rename; the database rename and schema split,
which the brief itself moved to Phase 1.

---

## Two things to carry into Phase 1

**A local rebuild is not production.** Every finding here was first derived
from a schema rebuilt from `backend/migrations/*.sql`, and four conclusions
were wrong until checked against the live database: the `ki_*` count (42 vs 9),
the policy cast bug (present locally, already fixed in production), the FK
coupling to `ki_ext_ref_types` (does not exist there), and the claim that
`vikuna_admin` lacks `BYPASSRLS` (it holds that *and* `SUPERUSER` — the brief's
original wording was right and this report's earlier draft was not). The
rebuild was sound for authoring and unsound for concluding.
`deploy/vani-main-vps/verify-phase0-findings.sql` exists so the next phase can
check its assumptions cheaply instead of inheriting them.

**Running the thing beats reading it.** The single highest-value finding of
Phase 0 — eighteen tables with inert policies — came from executing a test as
the restricted role, not from any document. The schema docs all looked correct
while the tables were open. Phase 1 should budget for execution against real
data, not only analysis.
