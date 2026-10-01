# Vara — readiness review

**Date:** 2026-08-17 · **Reviewer:** Claude Code session
**Read:** `vara-specification.html` (v0.2), `vara-data-model-v1.0.html`,
`vara-ux-prototype.html`, `vara-ux-prototype-1.html`, `sql/001–003`

Purpose: say what Vara needs before P3 starts, and separate what is *verified*
from what is *asserted*. The specification and data model are not summarised
here — Charan wrote them. This records only what review added.

---

## 1. The headline: `001_vani_platform.sql` is one unlock for two problems

The data model states it plainly (Section 1):

> "Nothing in VaNiGTM provides the platform dependencies today. The spec
> described the `vani_` layer as if it existed; **it does not.** Migration 001
> is therefore the platform-creation step."

That independently confirms what this session found by rebuilding `vani_gtm_db`
from VaNiGTM's own migrations: **133 migrations apply clean and produce zero
`vani_` tables.**

The consequence reframes an open decision. `HANDOVER-2026-08-17.md` §4 framed
Smart Profile steps 6 (Domain) and 8 (Model/BYOK) as a choice — apply the spine
by hand, *or* drop Domain and let `business_profile.website` carry it. **The
second option is no longer neutral.** The three tables those steps need —
`vani_tenant_domain`, `vani_membership`, `vani_llm_provider` — are created by
001, and Vara requires the same file as its foundation.

So 001 is not a workaround for a stuck onboarding step. It is Vara's
prerequisite, and it happens to unblock steps 6 and 8 on the way. One migration,
two problems. Dropping Domain now means building it again when Vara lands.

## 2. The "two tenant models" fear is already designed away

The handover worried that writing to the `vani_` spine would need "an invented
mapping between two tenant models". The data model answers this directly:

- **`vani_user.auth_ref`** — a nullable uuid pointing at the existing auth
  provider's user id. Platform identity lives in `vani_user`; authentication
  stays where it is.
- **No migration of legacy users is required to start** — they link on first
  login.
- **Legacy `VN_` / GTM tables coexist untouched** — "let history be history".
  New work reads and writes the `vani_`/`vara_` layer only.

There is no mapping to invent. There is a bridge column, and a deliberate
decision not to migrate anything.

## 3. Verified, not taken on trust

The data model claims "Validated — runs clean on PostgreSQL 16". Re-run here
against a fresh PostgreSQL 16 database:

| Claim | Result |
|---|---|
| Three migrations apply in order | **PASS** — clean, no errors |
| 31 tables · 27 RLS policies · 11 triggers · 1 view | **PASS** — exact match (16 `vani_`, 15 `vara_`) |
| Seeds agent registry + Vikuna as tenant #1 | **PASS** — `vara` 1.0 active; `vikuna` tenant with `careers.vikuna.io` and its embed origins |

Custom functions: 6, not the documented 5 — `vani_current_tenant`,
`vani_forbid_delete`, `vani_forbid_mutation`, `vara_emit_metering`,
`vara_purge_candidate`, `vara_transition`. A miscount in the doc, nothing more.

Then the guarantees, each exercised rather than read — **9 of 9 hold**:

| Guarantee | Result |
|---|---|
| Legal lifecycle `applied → scored → closing → held → handover` | PASS |
| `"model"` is not a legal actor | PASS — *"illegal actor_type model"* |
| `timer` confined to `closing → closed` | PASS — rejected from `handover` |
| Metering fires 1:1 on snapshot insert | PASS — trigger wrote the row |
| Score snapshots immutable | PASS — append-only guard rejected UPDATE |
| Every transition audited, none by a model | PASS — 4 transitions, 4 audit rows, 0 model |
| Second attempt allowed, duplicate blocked | PASS |
| `vara_candidate_history` is a computed view | PASS — returned both attempts |
| DPDP purge: PII deleted, skeleton + audit survive | PASS |
| RLS cross-tenant blindness (as a non-owner role) | PASS — 0 rows under another tenant |

This is a genuinely solid model. It is the most rigorous artifact in the
project, and it is ready to build on.

## 4. One real gap — the core invariant is not structurally enforced

Everything above is enforced by the database: triggers, policies, an actor check
inside `vara_transition()`. **One invariant is not**, and it is the one carrying
the product's central promise.

The data model names it as a code-review item (Section 3):

> "② `vara_application.state` changes only through `vara_transition()` — grant no
> direct UPDATE on the state column to the app role."

Tested with the grant a careless setup would actually write
(`GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES`), as a non-superuser,
non-owner role:

```sql
set app.tenant_id = '<vikuna>';
update vara_application set state='hired';   -- UPDATE 2
```

It succeeded. No edge validation, no audit row, no actor check. "Rules reject,
models rank, humans decide" — the principle the whole spec is built on — was
bypassed by an ordinary UPDATE.

Nothing is wrong with the DDL; it does what it documents. The problem is that
*"enforce in code review"* is the weakest available enforcement for the
strongest claim in the product. Every other invariant here is structural. This
one should be too:

```sql
-- Column-level, so the app role can update timers/holds but never state:
REVOKE UPDATE (state) ON vara_application FROM <app_role>;
```

Better still, add a `BEFORE UPDATE` trigger that rejects a `state` change unless
a session flag set inside `vara_transition()` is present — that survives a
future grant being widened by accident, which a REVOKE does not.

**Recommendation:** make this part of 002/003 rather than a checklist item. It
costs three lines and removes the one way the audit spine can be silently
defeated.

## 5. What Vara depends on that does not exist yet

Beyond 001, from the spec's own dependency list:

| Dependency | State |
|---|---|
| `vani_` spine (001) | **Not applied anywhere.** The gate for everything |
| MSG91 comms adapter | Exists and is proven **in ContractNest**, not in VaNiGTM. Needs porting; six templates (ACK-01, INV-01, REJ-01/02, POOL-01/02) instantiate into `vani_template` |
| Domain packs | `vani_domain_pack` table exists in 001; no pack content authored. v1 ships a nursing pack as the domain-independence test |
| Embed token + origin allowlist | `vani_tenant_domain.embed_origins` exists; the token issuer and edge rejection do not |
| BYO LLM per tenant | `vani_llm_provider.credentials_enc` exists; **nothing implements the encryption** — same gap already blocking Smart Profile step 8 |
| Ingestion adapters | Spec reuses the existing ETL spine; docx/pdf/LinkedIn/GitHub/URL/CSV adapters to be written |

The BYO-LLM encryption gap is worth noting twice: it blocks Smart Profile step 8
*and* Vara's chat/extraction, so it is one piece of work serving two roadmap
items.

## 6. UI

Two prototypes. **`vara-ux-prototype-1.html` is the later one** and is what the
spec means by "UX prototype v2 (approved direction)" — it adds a full candidate
profile view and the History / Audit trail / Data rights surfaces the earlier
file lacks. Seven views, mapping cleanly onto the epics:

`view-jd` (JD Studio) · `view-cand` (chat apply) · `view-map` (probability map)
· `view-profile` (Overview / Resume / Signals / Conversation / History) ·
`view-hm` (HM card queue) · `view-cal` (Calibration) · `view-pulse` (loop health)

Both are static single-file prototypes — no build step, no data layer. They are
direction, not code to port.

## 7. Scope, honestly

11 epics, ~40 numbered stories (V-01…V-97), 5 personas. Explicitly out of scope
for v1: interview scheduling, offer management, employee onboarding, job-board
posting, multilingual chat, cross-tenant marketplace, true self-learning.

This is materially larger than anything shipped in `vani-app` so far. The
onboarding lane — 5 steps, 2 enabled — is the whole of P2. Vara is a product.
Sequencing it as "P3, after Smart Profile" is right, but it should be planned as
several phases, not one.

Open questions from the spec, with Charan's leanings recorded: window expiry on
business days (tenant calendar) · metering price points (**commercial call,
outside the spec — still open**) · cross-tenant benchmarks (not in v1) ·
candidate chat inside WhatsApp (strong v2 candidate).

---

## Suggested first slice

1. **Apply 001** to `vani_gtm_db`. Unblocks Smart Profile 6 and 8 immediately
   and is Vara's foundation. Note it lands **outside** VaNiGTM's migration
   runner unless it is copied in as a numbered migration — and the `⚠ modified`
   checksum drift already on record argues for copying it in rather than running
   it by hand.
2. **Harden the state invariant** (§4) before any Vara code writes to
   `vara_application`.
3. **Finish Smart Profile 6 and 8** on the newly present spine — small, already
   designed, and it proves the spine in production before Vara depends on it.
4. **Port the MSG91 adapter** from ContractNest into VaNiGTM. It gates Vara's
   comms, and comms gate the readiness checklist.
5. Then JD Studio (E2) as Vara's first real surface.

Steps 1–4 are all VaNiGTM or database work. **VaNiGTM needs to be in session
scope with a designated branch before any of it can be done as code rather than
as patches.**
