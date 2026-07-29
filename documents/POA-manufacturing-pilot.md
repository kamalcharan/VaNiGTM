# Execution Plan — Manufacturing Pilot

> v1.3 · 2026-07-29 · Scoped test of the research-first thesis.
> **The build is done — every step, including the touch log.** And the scope
> narrowed: the user researched 12 companies and shortlisted **4**. That is
> the pilot going forward, and it changes what this run can prove. Read
> "What 4 sends can and cannot test" before anything else.
> Supersedes nothing. Sits IN FRONT of `POA-VaNi-GTM.md` and the
> Customer-Journey Agents spec — both stay unamended until this returns a
> result.
>
> **Companion:** `documents/design-notes-research.md` — Research became a
> platform capability while this pilot was being built. That note holds the
> standing rulings (pool boundary, segments, sources, the dossier page) and
> the NOW / NEXT / LATER split. This plan stays the record for the PILOT;
> that note is the record for the CAPABILITY. Read both.

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

> ⚠️ **2026-07-29: the first run is 4 sends, so the table above cannot be
> read.** The thresholds are UNCHANGED and remain the standard — they are
> simply deferred to a cohort large enough to carry them. `verdictFor()` in
> `touches.ts` was written from this table and refuses a verdict below 20
> concluded sends. **Editing those numbers to fit a smaller n voids the
> pre-registration** and turns the pilot into an exploration.

## What 4 sends can and cannot test

The cohort was sized at ~101 reachable companies and ~45 sends. The user ran
12 and shortlisted **4**. That is a legitimate scope decision and it does not
weaken the pilot — but it changes which of the two pre-registered gates this
run can answer, and pretending otherwise would void the pre-registration.

| Gate | At n=4 |
|---|---|
| **Reply rate** ≥8% / 3–8% / <3% | ❌ **Cannot be read.** One reply is 25%, zero is 0%. Neither is a signal. `pilot_result` returns `too_early` below 20 concluded sends and will refuse a verdict — that is the system working |
| **Qualitative** — does a researched message say anything a template would not? | ✅ **Fully testable.** The plan states this gate is independent of reply rate and can fail the pilot on its own. At n=4 it is the only live gate, and it is the one that matters most |

**So this run is a qualitative test and a dress rehearsal.** The reply-rate
test is DEFERRED to a larger cohort — explicitly, in writing, rather than
quietly redefined at 25% when one of four people answers.

Three questions this run CAN answer, none of which needs a rate:

1. Did any brief contain something the writer could not have known otherwise?
2. Did any brief contain something **wrong**? One fabricated detail in a first
   message is the failure the whole evidence system exists to prevent, and
   four messages is enough to catch it.
3. Was the recommended offer right, or was it overridden? Already recorded
   per company.

**A control is required for gate 2 to mean anything.** Before re-reading each
brief, write the message you WOULD have sent knowing only the company name and
industry. Keep it. Comparing afterwards without a control is judging your own
work retrospectively, which is not a test. Nothing in the product enforces
this — it is a discipline, and it is the single most important thing in this
run.

## Where this actually stands  ·  2026-07-29

### ✅ DONE — all of it

| Step | State |
|---|---|
| 0 · Prove the import landed | 2,882 rows, reconciled with `scripts/verify-import.sql` |
| 1 · Normalise the variants | 144 pharma, 101 reachable. The CLI is no longer the only route — cluster and segment are filters on `/prospects`, and a filter can be saved as a named segment |
| 2 · Account research brief | Built, then rebuilt four times against real failures — see "What Step 2 became" |
| 3 · The Research screen | Offers, cohort, briefs, the Learning Graph, and every stat card a filter |
| 4 · Touch log | Migration 221 + `pilot_result`, which computes the pre-registered criteria and withholds a verdict below 20 concluded sends |
| 6 · Read the result | "Did it work" on `/research`. Built; reading it is what remains |

**Sixteen migrations (206–221).** Beyond the plan's `gt_account_briefs`:
`gt_offers`, `gt_fit_lessons`, `gt_segments`, `gt_touch_log`,
`industry_canonical` + `industry_sub`, and four prompt revisions.

### ⬜ LINED UP — the run itself, no code

| # | What | Who |
|---|---|---|
| 1 | **Rule out the other 8 with reasons.** 4 decisions is below the Learning Graph's floor of 6; 12 clears it. The 8 rejections carry more information than the 4 approvals — they are where human judgement disagreed with the agent | user |
| 2 | **Write the 4 control messages first** (see above) | user |
| 3 | **Resolve a PERSON per company.** Research targets companies; sending needs a human. The dossier gives imported FTCCI contacts and site-found names, kept visually apart because one is verified and one is not. Fine by hand at 4; impossible at 45 | user |
| 4 | Write and send the 4 real messages | user |
| 5 | Log each touch on the dossier as it goes | user |
| 6 | Two weeks, then mark outcomes. `not_interested` counts as a REPLY | user |
| 7 | Read "Did it work" — expect `too_early`, and read the qualitative gate properly | both |

### 🔶 BLOCKING, and neither is code

1. **Offer wording.** `caio-as-a-service` scored 0.12–0.15 on every company
   because all its signals were news, press and hiring — which nothing read
   until migration 220. Rewriting them will now change scores.
   `cdo-as-a-service` has the opposite problem: its signals describe the
   SEGMENT ("multi-site pharma with exports"), so they fire on the whole
   cohort and carry no information. **At n=4 this may not be visible** — if
   all four came back on the same offer, that is the symptom, not a finding
   about those companies.
2. **Sending identity** — which mailbox, which domain.

### ⏸️ ON HOLD — decided, not scheduled

| Item | Why it is held |
|---|---|
| **Reply-rate gate** | Needs ~20+ concluded sends. Deferred to a larger cohort, NOT abandoned and NOT re-scored at a lower n |
| **The 43 pharma companies with no website** | Since migration 220 search alone could brief them, and the agent's `domain_normalized IS NOT NULL` rule is a leftover from when the website was the only source. Held deliberately: adding ~43 probably-weak targets to a run measuring message quality would muddy it. Fix after the pilot |
| **`gt_sources` — per-segment source repository** (R6) | Pharma's useful sources have nothing to do with textiles. Needs the pilot to prove the motion first |
| **Uploaded documents as a research source** | The ingestion pipeline already exists; only segment-scoping is new |
| **Industry rules as editable data** | They are a TS file. Changing one silently moves segment membership — `rules_version` makes that visible, which is enough for now |
| **LinkedIn via a paid provider** | Only if the pilot proves the motion. Scraping is not on the table |
| **Persona at job-title level** (R2) | Deferred by ruling. The UX reserves the space |
| **KG loader while a batch runs** | The navbar indicator shipped; the graph animation did not |
| **Segment-defined brief fields** | Brief fields are manufacturing-flavoured (`what_they_make`, `certifications`). Fine for one segment |
| **Source tiering beyond two levels** | `website` vs `search` is enough while there are two sources |

### ❓ UNDECIDED — needs a ruling

| Question | Where it bites |
|---|---|
| **When the industry rules move, should a segment be re-countable in place, or re-approved?** | Today `rules_moved` is shown and `recount` is a manual click. That is deliberate but it is not a policy |
| **Does a company with no website belong in a cohort at all, now that search can brief it?** | Blocks the "include search-only companies" option. Recommendation: offer it as a checkbox, off by default |
| **What is the real cost per company?** | 14,000 tokens is my estimate. `tokens_used` after the next full batch gives the true number, and a cap set before knowing it would be a guess |
| **Do accepted lessons decay?** | A rule accepted in month one still applies in month six even if every decision since contradicts it |
| **Should a sandbox lesson carry to live?** | Answered "no" by construction; never actually decided |

## Scope — the cohort

**As run (2026-07-29): 12 researched, 4 shortlisted.** The numbers below are
the cohort the plan was sized on and remain the target for the deferred
reply-rate test.

- Source: `gt_prospects`, FTCCI import, manufacturing cluster (~200 rows before
  variant normalisation; likely ~370 after)
- Researchable: those with a resolvable domain (144 pharma matched, **101
  reachable** — measured, not estimated)
- **Segment: pharma** (user ruling, 2026-07-28). Hyderabad is India's
  bulk-drug capital, so it is the largest segment in the file, those companies
  have real websites to research, and the ACV justifies per-account research.
- **One tenant: Vikuna.** Offers grew from three to five during the build —
  **CDO as a Service**, **CAIO as a Service**, **AI Automations**, plus
  **AI for Business Leaders (workshop)** and **Digital Systems Audit**, both
  added because the first three were all large asks and a stranger needs
  something small to say yes to (this is what migration 212's `commitment`
  rung exists to use). ContractNest is pulled from the pilot; its
  fit with pharma manufacturers was not convincing and testing an unconvincing
  offer would produce a failure that says nothing about the method.

### Research decides which offer — or none

```
researched accounts
   ├─ multi-plant, exports, certifications, no data lead  → CDO as a Service
   ├─ digital/AI mandate, no AI leadership, budget        → CAIO as a Service
   ├─ heavy document load, wide catalogue, exports        → AI Automations
   ├─ fits a big offer but has never heard of us          → the workshop or
   │                                                        the audit — same
   │                                                        fit band, smaller
   │                                                        first ask (212)
   └─ no signal / too small / unreadable                  → DO NOT CONTACT
```

One tenant and one segment means nobody can receive two pitches by
construction — the earlier cross-tenant collision cannot occur.

**A ~40% contact rate is a good outcome, not a shortfall.** The right to not
send is as much the product as the message. "No fit" is a first-class result
and is recorded with a reason.

---

## Steps

### Step 0 — Prove the import landed  ·  0.5 day  ·  ✅ DONE

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

### Step 1 — Normalise the manufacturing variants  ·  0.5 day  ·  ✅ DONE

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
npx tsx src/cohort.ts --tenant=<uuid> --live            # DRY RUN, whole cluster
npx tsx src/cohort.ts --tenant=<uuid> --live --sub=pharma
npx tsx src/cohort.ts --tenant=<uuid> --live --sub=pharma "--tag=Pilot Pharma"
```

**The cluster is too wide to be a cohort.** FTCCI's `industry_raw` is not a
category, it is a product description — "Manufacturing of Bulk Drugs and Drug
Intermediates", "Manufacturing of Plastic Chairs". That is why 2,149 distinct
values appear across 2,882 rows. A bulk-drug maker and a plastic chair maker
share nothing but the word "manufacturing", so one message cannot address
both, and a 700-account cohort would force exactly the generic copy this
pilot exists to detect.

So the dry run prints a **segment table** — pharma, food, plastics,
electrical, engineering, chemicals, textiles, construction — with rows and
reachable rows for each, and `--sub=` narrows the cohort to one. The
breakdown always describes the WHOLE cluster, so a single run is enough to
choose. Rows in the cluster that no sub-rule claims are counted as
`unsegmented` rather than forced into a segment.

`industry_canonical` is written for the whole cluster regardless of `--sub`
— it is derived truth about the row, and a plastics maker is still
manufacturing on a run that only tags pharma. The tag is the cohort; the
column is not.

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

### Step 2 — Account research brief  ·  ✅ DONE  ·  THE BUILD

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
| 0 | `budget` | What today's tokens can pay for, priced over the actual queue, BEFORE the first crawl |
| 1 | `fetch_site` | `fetchUrlText` across four address variants; thin → n8n render |
| 2 | `web_search` | SearXNG, for EVERY company — a source that appears only on failure is a fallback |
| 3 | `crawl_pages` | about / products / quality / careers / news / contact |
| 4 | `extract` | Both sources → structured facts, each carrying its own URL and excerpt |
| 5 | `fit_score` | Every offer scored; offers ordered per company so none wins on position; the smallest-sane-ask rule applied afterwards in code |
| 6 | `hook` | ONE specific, verifiable observation about this company |
| 7 | `write` | `gt_account_briefs` |

### What Step 2 became

The plan said three days and one build. It took the day, and then four
rebuilds — each one prompted by a real failure in a real batch, and each one
worth recording because the failure mode is more instructive than the fix.

| Migration | What it fixed |
|---|---|
| **211** | **Facts and judgement are separate halves.** Editing one word of one offer used to re-crawl every company. Now a re-score is ONE call and zero crawling, because `offers_fingerprint` says which offer set a judgement was made against |
| **212** | **A 0.03 gap is not a decision.** One offer won 4 of 5 companies by margins inside the model's own noise — and it was always the offer rendered first. Offers are now ordered per company, and `commitment` (entry/project/retainer) picks the smallest sane first ask among offers that fit equally well |
| **213–215** | **The Learning Graph.** `decide_brief` was overwriting the agent's recommendation with the human's, destroying the disagreement — the most useful thing this pilot produces. Now both are kept, the last rulings go into the fit prompt as worked examples, and the agent PROPOSES rules from your decision history that you ratify, reword or throw out |
| **217** | **No tenant gets a token cap it did not choose.** The framework default of 100k/day was sized for chat agents; at ~14k tokens per company it silently meant seven, and the first real batch died at company eight |
| **218–219** | **Segments on screen.** The cohort came out of a CLI script — the clearest way this product failed its user |
| **220** | **The web as a second source, with evidence tiering.** Several offer signals were unreachable from a website alone, and a dead domain ended a company outright |

Two defects found in that period are worth naming separately, because both
were silent:

- **A failed attempt was DELETING the brief an earlier run earned.** Failures
  went through the same upsert as successes, so any later error blanked the
  facts, the evidence and the fit. Venkateshwara Hatcheries was scored 0.72
  for AI Automations and came back as "No fit" — not re-judged, erased.
- **The validation error was lying.** JSON-parse failures and schema-type
  failures were caught identically and both reported as "Could not parse valid
  JSON", and the message truncated the response at 200 chars — which looked
  exactly like the model running out of tokens. Two investigations went to the
  wrong place.

`gt_account_briefs` as built: `tenant_id`, `is_live`, `prospect_id`, `run_id`,
`domain`, `fetched_at`, `pages_read`, `site_health`, `what_they_make`,
`scale_signals`, `service_signals`, `digital_maturity`, `certifications`,
`named_contacts` jsonb, `fit` jsonb, `recommended_offer` (the agent's),
`best_fit_offer` (pre-ladder), `human_offer` (the reviewer's), `fit_margin`,
`fit_reason`, `hook`, `raw_evidence` jsonb (url + excerpt + **source tier**
per claim), `error`, `status`, `facts_at`, `judged_at`, `offers_fingerprint`,
`decided_by`, `decided_at`, `decision_note`.

**Anti-hallucination — the whole point of the brief.** Every claim carries an
evidence URL and excerpt, verified against the text actually fetched; a claim
whose excerpt appears nowhere is dropped, visibly. A site that cannot be read
produces `status='unreadable'`, never a guessed brief (CLAUDE.md rule 12). An
invented detail in a first touch is worse than no touch.

- DoD: 3-check tests; 10 accounts run and read by a human before the full
  batch; zero claims without evidence ✅
- Runtime: ~2–4 min/account on local qwen3:8b → ~5 hours for 101, unattended

### Step 3 — The Research screen  ·  ✅ DONE

`/research` — everything the pilot needs, in the order it happens:

1. **What you sell** — offers edited in the app (`gt_offers`, migration 209),
   each with a readiness verdict and a checklist of what is still missing.
   This replaced `config/offers/*.json`: asking a human to hand-edit JSON on
   a server to describe their own business is not a product.
2. **Research a cohort** — pick the tag, pick how many, start. The button is
   DISABLED until every offer is complete, and says why.
3. **The briefs** — read them, approve, reassign the offer, or rule the
   company out. Ruling out REQUIRES a reason; those reasons are the pilot's
   most useful output after the reply rate. Every number on the stats row is
   a filter, because a count you cannot click is a question you answer with a
   spreadsheet.
4. **What it has learned from you** — the Learning Graph. Ask it what it has
   noticed in your decisions and it proposes rules, each carrying the
   companies it was inferred from. Nothing it proposes changes a score until
   you accept it.

Plus, outside `/research`:

- **`/prospects/<ref>`** — the dossier. A full page per company, addressable,
  ordered facts → judgement → evidence → decision, because leading with the
  recommendation makes everything after it read as justification.
- **`/prospects`** — cluster, segment and research-state filters, and
  **Save as segment**.
- **The nav bar** — a running batch and today's token spend, on every page. A
  batch takes hours and nobody watches the Research screen while it runs.

Every brief shows its evidence — claim, source URL, and the excerpt from the
page it was found on. A brief whose claims could not be verified is flagged
`No evidence` in the list and in the stats, because that is the one failure
that would put an invented detail into a first email.

### Step 3b — Original spec (kept for reference)  ·  1.5 days

Agent produces, human confirms. Reuses `RecordsPage` / `RecordTable` /
`VdfModal` — no new patterns.

- List of briefs with recommended offer, fit score, site health
- Detail view: brief + evidence links + the hook
- Actions: **approve** · **reassign offer** · **do not contact (with reason)**
- DoD: every brief in the cohort reaches a decision; no-contact reasons queryable

### Step 4 — Touch log  ·  ✅ DONE

The smallest thing that answers "did it work". Migration **221**
`gt_touch_log`: `tenant_id`, `is_live`, `prospect_id`, `offer`, `channel`,
`touched_at`, `outcome`, `notes`.

> ⚠️ The number moved. This said migration 208, which was taken by the
> research prompts while the pilot was being built.

Manual entry only. This is the embryo of the event log, deliberately kept to
seven columns — it exists so the result is data rather than a spreadsheet that
gets lost.

It hangs off `prospect_id`, so a touch and its brief are already joined: "what
did we send the companies we approved for the audit, and what came back" is
one query rather than a reconciliation.

### Step 5 — Write and send  ·  ⬜ MANUAL, NO BUILD

Deliberate. We are testing whether **the brief enables a good message**, not
whether an LLM can write one. If a human writes from the brief, we learn what
a good message looks like — and that becomes the prompt later. Reversing the
order tests the wrong thing.

- Human writes one message per approved account
- Sent from the tenant's own mailbox
- Non-repliers followed up by phone — at this volume a human can call, and a
  call captures outcome far better than an open-pixel
- Every touch and every response logged in `gt_touch_log`

### Step 6 — Read the result  ·  ✅ BUILT, ⬜ NOT YET READ

Against the pre-registered criteria above. Both gates — reply rate and the
side-by-side message read.

`pilot_result` computes the first gate and **refuses to compute the second**,
which is returned as an open question. Three rules, all of which make the
number less flattering than the alternatives:

- **A send inside the 14-day window is neither a reply nor a non-reply.**
  Counting pending sends as non-replies depresses the rate early; dropping
  them from the denominator inflates it. Both are wrong, so they are excluded
  from the rate and reported separately.
- **Silence past the window IS an answer.** Otherwise the rate measures only
  the touches somebody remembered to close.
- **Below 20 concluded sends there is no verdict.** At fifteen, one reply
  moves the rate seven points and can cross a criterion boundary alone.

`not_interested` counts as a REPLY — the thesis is that research earns a
response, not that it wins deals, and counting a clear no as silence would
flatter the channel while hiding an offer problem. `bounced` is neither: it
never reached them, and reachability is the least-tested assumption here.

**`verdictFor()` in `touches.ts` was written from this plan, not from the
data. Editing those thresholds voids the pre-registration** and makes the run
exploratory rather than a test.

---

## Timeline

**This run (4 sends — qualitative gate only):**

| | |
|---|---|
| ~~Build (steps 0–4, 6)~~ | ✅ done |
| Rule out the other 8, write 4 controls, resolve 4 people | ~half a day |
| Write and send 4 | ~half a day |
| Response window | 2 weeks |
| **Qualitative read** | **~2.5 weeks** |

**The deferred reply-rate test**, once the offer wording is fixed:

| | |
|---|---|
| Research the rest of the 101 | overnight, ~5 hours |
| Review + write ~45 messages | 3–4 days |
| Send + response window | 2 weeks |
| **Verdict against the pre-registered table** | **~4 weeks** |

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

**What landed anyway, listed because this section exists to make it visible
(2026-07-29):** the Learning Graph (`gt_fit_lessons`), saved segments
(`gt_segments`), the dossier page, and web search as a second source. None was
in this plan. Each came from a failure in a real batch rather than from a
roadmap, and each is argued for in `design-notes-research.md` — but they are
scope growth, and calling them anything else would be exactly the
self-deception this list guards against.

## Needed from the user

1. ~~**Offer catalogue — `backend/config/offers/vikuna.json`**~~ ✅ **Done,
   and the file is gone.** Offers live in `gt_offers` (migration 209) and are
   edited on the Research screen: asking a human to hand-edit JSON on a server
   to describe their own business is not a product. The gate is unchanged —
   `loadOfferCatalogue` throws and names every gap before a single company is
   crawled, because a blank scores as a confident number and that number
   decides who gets contacted.
2. **Offer WORDING still needs work, and it is now the main blocker.** See
   "Where this actually stands". Two specific rewrites: `caio-as-a-service`
   needs observable signals rather than news ones, and `cdo-as-a-service`
   needs signals that discriminate inside pharma rather than describing it.
3. **Sending identity** — which mailbox, which domain.
4. **Who writes the messages** in Step 5.

## Known risks

| Risk | Why it matters |
|---|---|
| **Channel** | WhatsApp fits this audience but forbids cold outreach; listed emails are often `info@`. Reachability is the least-tested assumption in the whole thesis |
| **Offer-market fit** | A 40-person unit is not buying a fractional CDO. Bad fit produces zero replies and the wrong lesson — that research-first failed. Two mitigations: pharma was chosen because the ACV supports these offers, and each offer carries `disqualifiers` so "no fit" is reachable rather than the model always finding a reason to pitch |
| **Small n** | 45 sends yields a signal, not statistics. Do not A/B message angles at this volume; test one thing |
| **n=4 is not a rate at all** (2026-07-29) | The first run cannot touch the reply-rate gate, and the danger is not the small number — it is the temptation to read one out of it. One reply reads as 25% and would look like a triumph. `pilot_result` refuses a verdict below 20 concluded sends, which is the mitigation; the other is that this is written down here, before the result exists |
| **No control message** | The qualitative gate is the only live gate at n=4, and it is unanswerable if the "what a template would have said" version is written after seeing the brief. Nothing in the product enforces writing it first — this is discipline, and it is the weakest link in the run |
| **Outcome capture** | Consultative deals close offline over months. Step 4 + phone follow-up are the mitigation, and both depend on human discipline |
