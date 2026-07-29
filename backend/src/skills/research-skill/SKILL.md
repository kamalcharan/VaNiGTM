---
name: research-skill
version: 1.0.0
description: Outward research — competitors from the profile, and per-company account briefs for a prospect cohort
tier: starter
default_recipe: brief-list
---

# research-skill — outward competitive research (GTM pipeline v2, stage 1)

## Why this skill exists
Competitors almost never appear on a tenant's own website. Real competitive
analysis is OUTWARD research framed by the drafted profile/ICP — this skill
does that research and lands the result in the knowledge graph for the human
to rule on in the wizard's confirm-competitors step.

## Agent
`research.agent.ts` — `CompetitorResearchAgent.run(pool, tenantId, payload, runId)`

Registered on the event bus (worker `AGENT_REGISTRY`):

| Event | Emitted by | Handler |
|---|---|---|
| `COMPETITOR_RESEARCH_REQUESTED` | `POST /api/v1/vani/competitors/research` (wizard auto-triggers on entering the competitors step; also re-runnable any time) | `CompetitorResearchAgent.run` |

## Pipeline (every step lands in `gt_agent_runs.steps` → wizard live feed)
1. **load_profile** — `gt_tenant_profile`; fails `PROFILE_NOT_FOUND` if no
   drafted profile (website research must run first).
2. **frame_queries** — LLM turns the profile into ≤4 web-search queries.
3. **web_search** (one step per query) — self-hosted SearXNG via
   `agent-core/search.client.ts` (`SEARXNG_URL`; JSON API must be enabled —
   `docs/searxng-setup.md`). Own domains excluded. Zero total results →
   `SEARCH_EMPTY`, run fails loudly.
4. **shortlist** — LLM extracts actual VENDOR candidates from the results.
   Directories/listicles/review sites are evidence, never candidates.
   Domains only when present in the evidence — never guessed.
5. **verify** (per candidate, cap 6 site reads) — the anti-hallucination
   gate: fetch the candidate's real site (`IngestionAgent.fetchUrlText`,
   static only) and LLM-judge fit. Outcomes:
   - real competitor → accepted with positioning + differentiation angle
   - not a competitor → dropped (visible step)
   - site unreadable / no domain / over cap → KEPT, `verified=false`
     (transparent, human gate decides — NOT a silent fallback)
6. **kg_write** — `Competitor` nodes upserted with properties
   `{source:'research', domain, verified, evidence_url, angle?, confirmed:false}`
   plus a `Company —DIFFERENTIATES_FROM→ Competitor` edge (basis = angle)
   when the tenant's Company node exists.

## Resume-from-failure (migration 191)
Working state is merged into `gt_agent_runs.checkpoint` after every
expensive stage (`queries` → `results` → `candidates` → per-candidate
`assessed`), and each accepted competitor is written to the KG **the
moment it's earned** (incremental node+edge writes, not batched at the
end). On failure (LLM timeout, `TOKEN_BUDGET_EXCEEDED`), the wizard's
failure card offers **Resume from where it stopped** →
`POST /competitors/research {resume:true}` → the route finds the latest
failed run with a checkpoint (≤24h, `findResumableRun`) and passes
`resume_run_id` in the event payload; the new run restores that state
(visible `restore` step) and re-runs only what never completed. The
profile is always reloaded fresh so edits since the failure are honoured.
"Start fresh" / "Research again" ignore checkpoints.

## Human gate
The wizard lists all Competitor nodes (crawl-found + researched);
keep/remove → `POST /api/v1/vani/competitors/confirm` stamps
`properties.confirmed=true` on kept nodes and DELETES removed ones
(edges cascade). Storyteller/campaign agents ground on confirmed nodes.

## Notes
- Does NOT emit `KNOWLEDGE_UPDATED` — competitors don't feed profile
  fields today, so no profile recalc is triggered.
- Token budget enforced per call by `llm.client` as everywhere else.
- Routes live in `vani-skill/vani.routes.ts` (the wizard's `/vani` surface):
  `POST /competitors/research` (dedupes active runs) and
  `GET /competitors/research-status` (latest run: status/steps/output/error).

## Account research (manufacturing pilot)

The same outward-research machinery pointed at a PROSPECT instead of a
competitor. `ACCOUNT_RESEARCH_REQUESTED` → `account.agent.ts` → one brief per
company in `gt_account_briefs` (migration 207).

Six stages per account, each a visible run step:
`fetch_site` → `crawl_pages` → `extract` → `fit_score` → `hook` → `write`.
Prompts are `research-skill.account_extract` / `.account_fit` / `.account_hook`
(migration 208), tenant-overridable like any other.

Event payload: `offer_catalogue` (required, a slug under `config/offers/`),
plus `tag_id` OR `prospect_ids`, optional `limit`, `is_live`, `resume_run_id`.

Three rules this agent will not break:

- **A half-written offer catalogue costs zero crawls.** It is validated before
  the first fetch, because fit scoring against a blank produces a confident
  number that then decides who gets contacted.
- **Every claim carries evidence.** The model must quote the page text it read
  from; an excerpt appearing on no page we fetched is dropped, visibly, in the
  `extract` step. An unreadable site becomes `status='unreadable'` with the
  real reason — never a guessed brief.
- **"No fit" is a first-class outcome.** Every offer is scored, disqualifiers
  are in the prompt, and an offer id absent from the catalogue is discarded as
  invented.

One run covers the whole cohort and checkpoints after every account, so a
crash at 60 of 100 keeps 59 briefs and a resume starts at 60.

### "not stated" where a list belongs

The model's idiom for having nothing to report is the string `"not stated"` —
and it uses it for EVERY field it has nothing for, including the ones declared
as arrays. That produced perfectly valid JSON that the schema rejected:

```
{ "what_they_make": "not stated", …, "certifications": "not stated",
  "named_contacts": "not stated" }
```

Three things were wrong with what happened next:

1. **The error lied.** `callLLMValidated` caught JSON errors and schema errors
   in the same `catch { return null }`, then reported both as *"Could not parse
   valid JSON"*. The JSON parsed fine. And the 200-char slice in the message
   looked exactly like the model truncating, which sent the investigation at a
   token limit that was not the problem. It now says which stage failed, names
   the field and the expected type, and labels how much of the response it cut.
2. **The retry could not work.** It always said "your response was not valid
   JSON" — so a model looking at its own valid JSON returned the same thing.
   The correction is now built from the failure: *"certifications: expected
   array, got string. Fix ONLY those fields."*
3. **The outcome was wrong.** It became `extract_failed`, meaning "our pipeline
   broke, retry me", so the same empty pages would be crawled forever at full
   cost.

`ExtractSchema` now reads the recognised nothing-words in a list field as `[]`
— the same reading `meaningful()` already applies to strings, and NOT a silent
fallback: the model said nothing, and an empty list IS nothing. Deliberately
narrow — `"WHO-GMP and USFDA"` in a list field is real content in the wrong
shape and still fails loudly.

And a site that reads fine but yields no facts at all is now recorded as
`unreadable` with *"read N pages and found nothing to say about them"* — a
finding about the company, skipped unless you ask for a redo, rather than a
pipeline failure retried in perpetuity.

### A failure never deletes what an earlier run earned

Failures used to go through `writeBrief`, whose `ON CONFLICT` sets every
column from `EXCLUDED`. A company with a good brief — facts, evidence, a real
fit score — had all of it overwritten with NULLs the moment ANY later attempt
failed. In the pilot, Venkateshwara Hatcheries was scored 0.72 for AI
Automations; a re-run hit the token cap, the catch block called `writeBrief`,
and the brief became "No fit" with an empty fit map. The research was not
wasted, it was **deleted** — by an error that had nothing to do with that
company.

`writeFailure` records the error and the run id and moves nothing else. A row
that already carries `facts_at` keeps its status too: it is still a real
brief, and a retry falling over does not un-know what we learned. Only a row
that never got anywhere becomes `unreadable` / `extract_failed`.

### The token budget is a resource, not a wall

A company costs about **14,000 tokens** to research (crawl + extract + fit +
hook) and **3,500** to re-score. The framework's old default of 100,000 a day
was therefore about **seven companies**, which is why the first real batch died
at company eight with `TOKEN_BUDGET_EXCEEDED` on everything after it.

**There is no default cap any more** (migration 217). `daily_token_limit` is
NULL for every tenant that was still sitting on that 100,000, and NULL for
every new one. A cap exists only because somebody set one FOR THAT TENANT — a
default applied to everyone is a product-level restriction wearing a
per-tenant column.

**Usage is still metered, always.** Metering and capping are different things
and only one of them was the problem: `daily_token_usage` is how anyone learns
what a batch of a hundred companies costs, and without that number any cap
gets picked by guessing — which is how the 100,000 got there.

When a cap IS set, three rules:

- **Priced before the first crawl.** The agent reads the budget, prices the
  ACTUAL queue (re-scores cost a quarter of a crawl), and writes a `budget`
  step saying how many it can afford. If not even one fits it refuses having
  crawled nothing.
- **A budget stop is a STOP, not a failure.** It breaks the loop, keeps every
  brief already written, records `stopped_for_budget` + `not_attempted`, and
  completes. It does **not** write `extract_failed` per company — that marked
  ninety untouched companies as broken, and a later run would then treat them
  as retryable pipeline failures instead of work never started.
- **It never fails over to Claude.** The approved exception (CLAUDE.md rule 12)
  is for TRANSPORT failures — the VPS down or erroring. `TOKEN_BUDGET_EXCEEDED`
  is a cap we set working as intended, and failing over to a paid API to get
  around our own limit means the limit silently stops being one. Raise it
  deliberately (`set_budget`) or wait for midnight UTC.

### Fit is not the same question as what to open with (migration 212)

The first pilot run scored one offer top on 4 of 5 companies, winning by
0.03–0.04 — inside the noise of the model's own judgement, and always the
offer rendered first in the prompt. Two fixes, both outside the model:

- **Order varies per company.** `catalogueForPrompt(cat, seed)` orders offers
  by `sha256(prospect_id : offer_id)`, so no offer wins on position, and the
  same company re-scored gets the same order — a moved score means the offer
  wording moved, not that the dice landed differently.
- **The smallest sane first ask wins ties.** Each offer carries a
  `commitment` rung — `entry` / `project` / `retainer` — which is **never put
  in the prompt**. The model scores fit blind to it; `chooseOffer()` then
  takes, among the offers within `FIT_MARGIN` (0.15) of the top score, the
  lowest rung. The brief stores `best_fit_offer` (what the model said) beside
  `recommended_offer` (what we act on) and `fit_margin`, and the screen shows
  both — a recommendation nobody can argue with is one nobody should trust.

The rule only ever narrows an existing yes. A "no fit" verdict stays a no; it
picks a smaller ask, it never manufactures one.

### The correction loop (migrations 213–215)

Every fit judgement is scored against three things now: the offers, the
reviewer's recent rulings, and the rules they have ratified.

**`FIT_LESSONS_REQUESTED` → `lesson.agent.ts`.** Reads every decided brief,
proposes at most five RULES with the companies each was inferred from, and
writes them to `gt_fit_lessons` at `status='proposed'`. A proposal citing a
company that was never decided on is dropped as invented — the same evidence
gate the account agent applies to excerpts. Below `MIN_DECISIONS` (6) it
refuses and says so; a rule drawn from four companies is a description.

**A human ratifies.** `decide_lesson` accepts, rewords or rejects. Only
`accepted` rows reach the fit prompt. The agent never ratifies its own
inference — a model that derives rules from its corrected mistakes and then
obeys them, with nobody in between, drifts into a policy nobody chose. A
reworded rule keeps the agent's original in `lesson` so the gap between what
it inferred and what the reviewer meant stays visible. Rejected rules are
KEPT, or the same proposal returns every week.

**`recommended_offer` is never overwritten by a human** (migration 213). It is
the agent's word; `human_offer` is the reviewer's; reads take
`COALESCE(human_offer, recommended_offer)`. The disagreement between the two
is what the loop learns from, and `decide_brief` used to destroy it.

**A decided brief is never re-judged.** Ratifying a lesson stales every
UNDECIDED judgement (they feed `judgementFingerprint` alongside the offers),
so the Research screen offers a re-score — one LLM call each, no crawling. A
ruling stands until the reviewer changes it.

## Functions

### get_offers
What this tenant sells, each with a readiness verdict, plus the exact list of what is still missing.
- Parameters: none
- Returns: { offers: [{ id, name, one_line, who_for, problem, what_we_do, signals, disqualifiers, price_band, proof, is_ready }], problems, ready, recipe: 'offer-list' }

### save_offer
Create or update one offer. A half-written offer is storable — the gate is at research time, not save time.
- Parameters: name (required, string), offer_key (optional, string), one_line (optional, string), who_for (optional, string), problem (optional, string), what_we_do (optional, array), signals (optional, array), disqualifiers (optional, array), price_band (optional, string), proof (optional, string), commitment (optional, string — entry | project | retainer; omitted leaves the stored value alone, anything else is rejected)
- Returns: { offer_key, recipe: 'offer-card' }

### get_briefs
The research output as a queue of decisions. Stats cover the whole batch; rows cover the current filter.
- Parameters: status (optional, string), offer (optional, string), search (optional, string), page (optional, number), limit (optional, number), offset (optional, number)
- Returns: { briefs, total, page, limit, stats, recipe: 'brief-list' }

### decide_brief
A human's ruling on one brief. Ruling a company out requires a reason.
- Parameters: brief_id (required, number), decision (required, string), offer_key (optional, string), note (optional, string)
- Returns: { brief_id, decision, recipe: 'brief-card' }

### start_research
Queue the research batch for the worker. Validates the offers first, and reports the whole split — selected, reachable, already researched, to do — before anything runs. preview answers without queueing.
- Parameters: tag_id (optional, number), segment_id (optional, number — resolved to explicit ids here, so the run is a fixed list a later rule change cannot move), prospect_ids (optional, array), limit (optional, number), refresh (optional, boolean), preview (optional, boolean)
- Returns: { selected, reachable, no_website, already_researched, extraction_failed, no_address_answered, needs_rescore, to_research, queued, event_id, recipe: 'research-queued' }

### get_lessons
The Learning Graph as a review queue: rules the agent inferred from your brief decisions, in every state. `can_propose` says whether there are enough decisions yet, so the screen can explain a disabled button.
- Parameters: none
- Returns: { lessons, proposed, accepted, rejected, decisions, can_propose, min_decisions, recipe: 'lesson-list' }

### propose_lessons
Ask the agent what it has learned from your decisions. Queues `FIT_LESSONS_REQUESTED`; refuses below `MIN_DECISIONS` rulings, because a "rule" drawn from four companies is a description, not a rule.
- Parameters: none
- Returns: { event_id, decisions, recipe: 'lessons-queued' }

### decide_lesson
Ratify, reword or throw out one proposed rule. Only accepted rules reach the fit prompt. Rewording is first-class — the agent's original stays in `lesson`, yours goes in `edited_lesson`. Rejected rules are kept so the same proposal is not made again.
- Parameters: lesson_id (required, number), decision (required, string — accepted | rejected), edited_lesson (optional, string)
- Returns: { lesson_id, decision, lesson, rescore_available, recipe: 'lesson-card' }

### get_budget
Today's token budget, converted into the unit the person pressing the button thinks in: companies. A budget you can only find by crashing into it is a trap.
- Parameters: none
- Returns: { limit, used, remaining, capped, tracked, cost_per_company, cost_per_rescore, affordable_companies, affordable_rescores, recipe: 'budget-card' }

### set_budget
Set or REMOVE the daily token cap for this tenant. `null`/`0`/empty removes it, which is also the default state (migration 217). Deliberately manual — a cap that lifts itself when it binds is not a cap, and one applied by default is not per-tenant.
- Parameters: daily_token_limit (required, number 10,000–100,000,000 — or null/0 for no cap)
- Returns: { daily_token_limit, capped, message, recipe: 'budget-card' }

### delete_briefs
Throw research away so it can be run from scratch. A scope is required (status, tag, or prospect_ids) — there is no "delete everything". Without `confirm` it only counts. Briefs a human has decided are excluded unless `include_decided` is passed.
- Parameters: status (optional, string), tag_id (optional, number), prospect_ids (optional, array), include_decided (optional, boolean), confirm (optional, boolean)
- Returns: { matched, decided_included, deleted, confirmed, message, recipe: 'delete-preview' | 'delete-result' }

### list_targets
The companies you could research, each with what is already known: never researched, our extraction failed, judgement stale against the current offers, or already ruled on. Drives the picker — choosing which companies to research is a decision, and "research 10" cannot express it.
- Parameters: tag_id (optional, number), search (optional, string), state (optional, string — all | new | researched | failed | stale | decided), limit (optional, number), offset (optional, number)
- Returns: { targets, total, limit, offset, recipe: 'target-list' }

### batch_status
Whether the last batch is queued, running, finished — or sitting in a queue nobody is reading because the worker is down.
- Parameters: none
- Returns: { verdict, message, healthy, done_count, requested, run_id, run_status, event_status, event_age_seconds, error, started_at, completed_at, recipe: 'batch-status' }
