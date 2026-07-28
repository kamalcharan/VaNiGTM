# Execution Plan — Manufacturing Pilot

> v1.0 · 2026-07-28 · Scoped test of the research-first thesis.
> Supersedes nothing. Sits IN FRONT of `POA-VaNi-GTM.md` and the
> Customer-Journey Agents spec — both stay unamended until this returns a
> result.

---

## Why this exists

The product thesis is one sentence: **push outcomes rather than bombarding.**

Everything designed around it — journey states, knowledge graphs, lesson
corpora, six agents — is machinery for getting *better* at that over time.
None of it is worth building until the underlying claim is tested:

> Researched, well-fit outreach to Telangana manufacturers earns replies.

Two assumptions sit under that claim, and neither has been tested:

1. **Reachability** — can we actually reach these people?
2. **Outcome capture** — will we ever know it worked?

This plan tests both, on the smallest cohort that can produce a signal.

## Pre-registered success criteria

Decided BEFORE the run, so no result can be rationalised afterwards.

| Reply rate on researched sends | Verdict |
|---|---|
| **≥ 8%** | Thesis validated — build the machinery |
| **3 – 8%** | Something is there; offer or channel needs work before automating |
| **< 3%** | Problem is offer-market fit or channel, NOT process — **do not build agents** |

**Qualitative gate (independent of reply rate).** Read the sent messages side
by side. If a researched message says roughly what a template would have said,
the research did no work — that is a failure even at 10% reply.

## Scope — the cohort

- Source: `gt_prospects`, FTCCI import, manufacturing cluster (~200 rows before
  variant normalisation; likely ~370 after)
- Researchable: those with a resolvable domain (~107 known, expect more after
  normalisation)
- Two tenants, two offers: **Vikuna** (CAI Officer, CDO, MVP as a Service, AI
  Transformation) and **ContractNest** (product)

### One person never receives two pitches

Research decides which offer — or none:

```
researched accounts
   ├─ plants + AMC/service arm + vendor SLAs   → ContractNest
   ├─ digital team, automation signals, scale  → Vikuna
   └─ no signal / too small / unreadable       → DO NOT CONTACT
```

**A ~40% contact rate is a good outcome, not a shortfall.** The right to not
send is as much the product as the message. "No fit" is a first-class result
and is recorded with a reason.

---

## Steps

### Step 0 — Prove the import landed  ·  0.5 day  ·  BLOCKER

The `state_code` overflow fix is pushed but the re-import has never been
confirmed. Everything below reads `gt_prospects`.

- Re-run the FTCCI contacts import end to end
- Confirm rows land in `gt_prospects` (not stuck at staging), people attached,
  `domain_normalized` populated
- DoD: row counts reconcile — staged = landed + held, and held rows carry a
  real reason

**Run `scripts/verify-import.sql`** — it answers this with numbers instead of a
screenshot, and reports a true cause rather than the "current transaction is
aborted" message a per-row catch produces after the real error:

```bash
psql "$DB_PRIMARY" -f scripts/verify-import.sql
psql "$DB_PRIMARY" -v tenant="'<uuid>'" -v days=30 -f scripts/verify-import.sql
```

PASS when section 2's verdict is `clean`, section 4 shows a non-zero prospects
count for the load, and section 5 returns no `state_code` longer than 8
characters. A `STOPPED EARLY` verdict means rows are still `pending` — that is
a failure even when the session row says `completed`.

### Step 1 — Normalise the manufacturing variants  ·  0.5 day

**Scope discipline:** the manufacturing cluster ONLY. The full 2,149-value
taxonomy is not in this plan.

- Rules pass over `industry_raw` collapsing `Manufacturers` / `Manufacturer` /
  `Mfg` / `Manufacturing` and near variants onto one canonical value
- Tag the cohort `pilot-manufacturing` using the EXISTING `gt_tags` +
  `gt_prospect_tags`. No new table, no new concept
- DoD: one tag selects the whole cohort in `/prospects`; counts reported —
  total, with domain, without

**Built:** migration **206** (`gt_prospects.industry_canonical` — one nullable
column, `industry_raw` untouched), `etl/industry-normalizer.ts` (the cluster
rules), and `prospect-skill/build_cohort`.

Run it from `backend/` — no JWT, no running server, no PowerShell JSON
mangling (CLAUDE.md lesson 9):

```bash
npx tsx src/cohort.ts --list-tenants                    # find the tenant
# (npm run cohort -- <flags> drops the flags on PowerShell; use npx)
npx tsx src/cohort.ts --tenant-name=ftcci               # DRY RUN (the default)
npx tsx src/cohort.ts --tenant=<uuid> "--tag=Pilot Manufacturing"
npx tsx src/cohort.ts --tenant=<uuid> --live            # live environment
```

Dry run is the default; writing requires `--tag`. Same function as the API
below — one implementation, no second copy of the rules:

```
POST /api/v1/skills/prospect-skill/build_cohort
{ "params": { "cluster": "manufacturing", "dry_run": true } }
```

Always dry-run first. It returns `matched` / `excluded` / `no_rule` /
`no_industry`, the `variants` that collapsed, every `excluded_samples` entry
with the term that excluded it, and `with_domain` — **the number the pilot is
actually sized on**. Then re-run with `tag_label` and the tag selects the
cohort in `/prospects`.

Two rules the function will not break: `industry_raw` is never rewritten, and
a tag is never revoked — rows tagged but no longer matching come back as
`tagged_no_longer_matching` for a human to act on.

### Step 2 — Account research brief  ·  3 days  ·  THE BUILD

The only real build in this plan, and the one piece that is the actual moat.

**Reuses, does not rebuild:** `IngestionAgent.fetchUrlText` (already returns
text + html + a site-health assessment), `renderPageViaN8n` for thin pages,
`agent-core/llm.client`, `prompt.store`, and the checkpoint/resume runner
(migration 191). research-skill already runs this exact shape per competitor
candidate — this points the same machinery at a prospect.

**New:** `backend/src/skills/research-skill/account.agent.ts`, event
`ACCOUNT_RESEARCH_REQUESTED`, migration **207** `gt_account_briefs`.

Per-account pipeline, every stage a visible step, checkpointed between:

| # | Step | Notes |
|---|---|---|
| 1 | `fetch_site` | `fetchUrlText` + health; thin → n8n render |
| 2 | `crawl_pages` | about / products / services / contact |
| 3 | `extract` | LLM → structured brief |
| 4 | `fit_score` | LLM scores against the offer catalogue → recommended offer or `no_fit` |
| 5 | `hook` | ONE specific, verifiable observation about this company |
| 6 | `write` | `gt_account_briefs` |

`gt_account_briefs` columns: `tenant_id`, `prospect_id`, `run_id`, `domain`,
`fetched_at`, `site_health`, `what_they_make`, `scale_signals`,
`service_signals`, `digital_maturity`, `named_contacts` jsonb, `fit` jsonb
(score + reason per offer), `recommended_offer`, `hook`, `raw_evidence` jsonb
(url + excerpt per claim), `status`, `decided_by`, `decided_at`.

**Anti-hallucination — the whole point of the brief.** Every claim carries an
evidence URL and excerpt. A site that cannot be read produces
`status='unreadable'`, never a guessed brief (CLAUDE.md rule 12). An invented
detail in a first touch is worse than no touch.

- DoD: 3-check tests; 10 accounts run manually and read by a human before the
  full batch; zero claims without evidence
- Runtime: ~2–4 min/account on local qwen3:8b → ~5 hours for 107, unattended

### Step 3 — Brief review surface  ·  1.5 days

Agent produces, human confirms. Reuses `RecordsPage` / `RecordTable` /
`VdfModal` — no new patterns.

- List of briefs with recommended offer, fit score, site health
- Detail view: brief + evidence links + the hook
- Actions: **approve** · **reassign offer** · **do not contact (with reason)**
- DoD: every brief in the cohort reaches a decision; no-contact reasons queryable

### Step 4 — Touch log  ·  0.5 day

The smallest thing that answers "did it work". Migration **208**
`gt_touch_log`: `tenant_id`, `prospect_id`, `offer`, `channel`, `touched_at`,
`outcome`, `notes`.

Manual entry only. This is the embryo of the event log, deliberately kept to
six columns — it exists so the result is data rather than a spreadsheet that
gets lost.

### Step 5 — Write and send  ·  MANUAL, NO BUILD

Deliberate. We are testing whether **the brief enables a good message**, not
whether an LLM can write one. If a human writes from the brief, we learn what
a good message looks like — and that becomes the prompt later. Reversing the
order tests the wrong thing.

- Human writes one message per approved account
- Sent from the tenant's own mailbox
- Non-repliers followed up by phone — at this volume a human can call, and a
  call captures outcome far better than an open-pixel
- Every touch and every response logged in `gt_touch_log`

### Step 6 — Read the result  ·  0.5 day

Against the pre-registered criteria above. Both gates — reply rate and the
side-by-side message read.

---

## Timeline

| | |
|---|---|
| Build (steps 0–4) | ~6 working days |
| Research batch | overnight |
| Human review + message writing | 3–4 days |
| Send + response window | 2 weeks |
| **Result** | **~4 weeks** |

## Explicitly NOT in this plan

Listed so scope creep is visible when it happens:

- `gt_person`, `gt_journey`, `gt_event_log`, `gt_story` — no journey tables
- Any agent beyond account research
- Campaign / sequence changes; re-scoping `gt_personas` off `campaign_id`
- Audit lenses (SEO / AEO / website / CRO / journey)
- Universal connector; analytics connections
- The full industry taxonomy — manufacturing variants only
- LLM message generation
- POA rewrite; ruling on the Journey spec's 8 open decisions

## Needed from the user before Step 2

1. **Offer catalogue** — real descriptions of CAI Officer, CDO, MVP as a
   Service, AI Transformation, and ContractNest: who it is for, what problem
   it solves, price band, proof. Fit scoring is only as good as this input; a
   one-line offer produces a worthless score.
2. **Sending identity** — which mailbox, which domain, for each tenant.
3. **Who writes the messages** in Step 5.

## Known risks

| Risk | Why it matters |
|---|---|
| **Channel** | WhatsApp fits this audience but forbids cold outreach; listed emails are often `info@`. Reachability is the least-tested assumption in the whole thesis |
| **Offer-market fit** | A 40-person unit is not buying "AI Transformation". Bad fit produces zero replies and the wrong lesson — that research-first failed. Letting research assign the offer is the mitigation; expect the split to favour ContractNest |
| **Small n** | 45 sends yields a signal, not statistics. Do not A/B message angles at this volume; test one thing |
| **Outcome capture** | Consultative deals close offline over months. Step 4 + phone follow-up are the mitigation, and both depend on human discipline |
