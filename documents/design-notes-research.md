# Design Note — Research as a platform capability

> v1.0 · 2026-07-29 · Rulings and direction from the session that built
> Research. Extends `POA-manufacturing-pilot.md`, which stays the plan of
> record for the pilot itself.
>
> **Why this exists:** Research was built as a pilot for one tenant and one
> segment. Over one working session it became clear it is a core product
> capability, and a dozen decisions were made in conversation that would
> otherwise be lost. This is the record, so none of it is re-litigated.

---

## 1. What Research is

Reading a company's own evidence before writing to them — and deciding who is
not worth writing to at all.

It sits **upstream of campaigns, not inside them**:

```
segment          who we are looking at
    ↓
RESEARCH         one brief per COMPANY — reusable, never re-derived per campaign
    ↓
journey          state per person
    ↓
campaign         delivery: sender, channel, budget, attribution
```

**Why not inside a campaign** (user question, answered 2026-07-29): a brief is
about the company. What Aurobindo makes, its plants and its certifications are
the same facts whichever offer you pitch and whichever quarter you pitch it
in. Research inside a campaign means re-researching the same company for every
campaign ever run.

## 2. Standing rulings — do not relitigate

**R1 · Research output NEVER enters the common pool.** (user, 2026-07-29)

The schema already enforces it: `gt_account_briefs.prospect_id` is a FK to
`gt_prospects`, which is tenant-scoped. A brief cannot attach to a pool row
even when a tenant adopts a pool company — it lands on their copy.

The reasons run deeper than privacy:
- Half a brief is **judgement against that tenant's offers** — fit scores,
  recommended offer, hook. Meaningless to another tenant.
- Two tenants selling into the same segment would see each other's targeting
  and conclusions. Commercially fatal.
- Even the FACTUAL half must not pool: the pool's quality model is built on
  delivered sources (`source_tier × freshness × completeness × validity`,
  traceable to a load and a supplier). Agent-derived facts have a different
  reliability profile and would quietly corrupt it. And rich detail appearing
  in the pool for exactly the companies one tenant researched IS that tenant's
  targeting, visible to everyone.

**The pool holds what was delivered to it. Research holds what a tenant
learned. Never the reverse.** No code path does this today; nothing prevents
one being added, so it is also a rule in CLAUDE.md.

**R2 · Research targets COMPANIES; personas target PEOPLE.** (user, 2026-07-29)

Persona at the narrow (job title, seniority, function) level is **deferred**,
but the UX reserves the space so it slots in without a redesign. Today a
"persona" is either an industry segment (pharma manufacturing, bulk drugs) or
a tag (custom segmentation).

This is why persona re-scoping does NOT block Research: a persona narrows who
you talk to, not which companies you study.

**R3 · A company can belong to many segments.** (user, 2026-07-29)

Which settles segment-as-definition over segment-as-frozen-list: membership is
computed, so multi-membership is automatic with nothing to join.

**R4 · Segments are built on `/prospects`, not on a new page.** (user,
2026-07-29)

The filtering UI already exists there with a live count. It gains a **Save as
segment** button. One place to maintain filters, and you see what you are
saving before you save it.

**R5 · The prospect view is a full page, not a modal.** (user, 2026-07-29)

A decision that leads to contacting a real company deserves a URL. A modal
cannot be scanned, linked, kept open beside their website, or opened twice.

**R6 · Sources are per SEGMENT, not global.** (user, 2026-07-29)

Pharma's useful sources (PharmaCompass, Pharmabiz, DGFT, USFDA warning
letters) have nothing to do with a textile or plastics segment. Hence a source
repository rather than a hardcoded list.

## 3. The four objects

The same four questions for every tenant, whatever they sell:

| Question | Table | State |
|---|---|---|
| What do you sell? | `gt_offers` (209) | ✅ built, editable on screen |
| Who are you targeting? | `gt_segments` | ← next |
| Where do you look? | `gt_sources` | ← later |
| What did you learn? | `gt_account_briefs` (207) | ✅ built, tenant-only, never pooled |

## 4. Data sources — what is actually read today

**One source: the company's own website.**

- home page (static; one headless render via n8n if under 200 chars)
- up to 4 sub-pages from a fixed hint list (about · company · products ·
  services · quality · certifications · contact)
- 2,500 chars per page, 8,000 total
- plus `gt_prospects.industry_raw`, passed to fit scoring as "industry as
  filed"

**Available and unused:** SearXNG (`agent-core/search.client`, already running
and already used by competitor research) · `gt_prospects.raw` (the complete
original imported row) · `gt_contacts` linked by `prospect_id` (the agent
scrapes contacts off the website instead of reading the ones already imported)
· `linkedin_url` · the knowledge graph (nothing written, nothing read — every
brief is produced in isolation).

**Known defect (2026-07-29):** several fit signals in the seeded offers are
UNREACHABLE from the website alone — "recent funding, expansion or a new
plant", "press coverage", "awards or conference talks", "careers page hiring
IT/QA roles" (careers is not even in the hint list). Those are news and hiring
signals and we search neither, so they silently contribute nothing while the
scores still look reasonable.

**Source repository, agreed direction (§R6):**

| Source | Verdict |
|---|---|
| Company website | Built; hint list needs widening (careers, news, press, media, investors) |
| SearXNG | **Highest value, lowest cost.** Already deployed; the agent just never calls it. Fixes the unreachable signals above |
| Uploaded documents | Second cheapest — the whole ingestion pipeline (PDF/DOCX/PPTX → chunk → extract → KG) already exists; only segment-scoping is new |
| Industry blogs / journals | Start as site-restricted search (`site:pharmabiz.com "<company>"`) — a text field on the segment. Feed ingestion is a much larger content pipeline; not first |
| LinkedIn | **Do not scrape.** Against ToS, actively blocked, litigated. Legitimate routes: paid provider (Proxycurl/Coresignal), their gated API, search snippets, or `linkedin_url` as a link for a human. Pilot: the link |
| Reddit / communities | Wrong source for Indian pharma B2B — no community discusses a bulk-drug maker's data governance. Would be excellent for a dev-tools segment, which is the argument FOR per-segment sources |

**Two things to build in from the start when sources land:**

1. Evidence already carries `{claim, url, excerpt}`, so multi-source needs no
   redesign — a claim from a journal and one from a homepage are both
   evidenced and distinguishable.
2. **Evidence needs a source TIER.** "We are a leading manufacturer" on their
   own homepage is marketing; a DGFT export record is fact. Without tiering,
   more sources make briefs longer without making them truer.
3. **Cost is per company per source.** Sources should be tiered by WHEN they
   run — cheap for everyone, expensive only for companies that clear an
   initial fit bar. Same research funnel as the original design: spend follows
   qualification.

## 5. The dossier page (§R5)

`/prospects/<ref>` — ONE page per company, linked from both `/prospects` and
`/research`. Replaces both existing modals, which is a net reduction in code.

- **Narrative down the middle** — the hook first (it is what you are judging),
  then what they make, scale, service, digital maturity, as prose
- **Fit in full** — every offer with score and reason. The rejections are half
  the information: *"CAIO 0.15 — no digital signal anywhere on the site"*
- **Evidence INLINE, on the claim it supports** — not a section at the bottom
  nobody scrolls to. A claim with no excerpt behind it shows that on the claim
- **Right rail** — domain, location, industry (raw + canonical + sub),
  segments, tags, quality components, which import it came from
- **People** — `gt_contacts` for this prospect, currently invisible everywhere
- **The original row** — collapsed; occasionally the only place a detail
  survived
- **The decision** — approve / reassign / do-not-contact with a reason, at the
  end of reading

**The counterweight:** nobody opens 101 pages. The LIST stays fast to triage —
hook, recommended offer, no-evidence flag — and the page is where judgement
happens. If the list gets too rich it becomes a worse page; if the page is the
only way to see anything, 101 companies is unbearable.

**Later** this page becomes the journey view (dossier + timeline of every
touch and response + state), per the campaign-as-delivery ruling. Reserve the
column now.

## 6. Platform vs pilot — what was built pilot-shaped

1. **Brief fields are manufacturing-flavoured.** `what_they_make`,
   `scale_signals`, `service_signals`, `digital_maturity` — wrong for a
   hospital, a school group or a SaaS company. Direction: keep a small
   universal core, put segment-specific facts in JSONB. NOT fully dynamic —
   that makes the review screen generic and unreadable, and reading the brief
   is the product.
2. **Industry cluster rules are a hardcoded TS file** (`industry-normalizer.ts`
   — `manufacturing` + 8 sub-clusters, written from FTCCI data). Honest for a
   pilot, wrong for a platform: a tenant targeting hotels cannot add their own
   without a deploy. Needs to become seeded, editable data.
3. **Sub-cluster is not stored.** `industry_canonical` says `manufacturing`
   for all 1,255 rows; "pharma" exists only as tag membership. This is why
   "where are the pharma numbers in the DB" had no good answer, and why the
   segment cannot be recreated without re-running a script. **Storing
   `industry_sub` is the fix that unlocks segments.**

---

## 7. What we are doing NOW vs LATER

### NOW — ✅ DONE 2026-07-29

| # | Item | Outcome |
|---|---|---|
| 1 | Offer form loses focus every keystroke | ✅ Two bugs, not one: `Area` was defined inside `OfferForm` (new component type every render → React remounts the textarea), AND every keystroke lifted state to the page. `Area` moved to module scope; the form owns its draft and reports it once, on save |
| 2 | Offer form → landscape | ✅ Two columns — "what it is" and "how it gets matched" — with a live list of what is still missing in the footer |
| 3 | Do not re-research an existing brief | ✅ Skipped by default, `refresh` to redo. The screen previews the whole split BEFORE the button: selected · no website · already researched · to research, with a "redo existing briefs" toggle that only appears when it applies |
| 4 | Widen website paths | ✅ careers · career · jobs · news · press · media · investors added; MAX_SUBPAGES 4 → 6. Careers was missing entirely, which meant "hiring IT/QA but no data lead" could never be evidenced |

**Then: run the ten, read them.** That gate decides everything below.

### NEXT — after the ten read well, before scaling to 101

| # | Item | Why then |
|---|---|---|
| 5 | ~~Split facts from judgement~~ | ✅ **DONE 2026-07-29.** Migration 211. `facts_at` / `judged_at` / `offers_fingerprint` (hash of key + updated_at per active offer). Editing an offer stales every judgement and nothing else, so a re-score is ONE call per company and zero crawling. Also fixed a silent data loss: `certifications` were extracted, fed to the fit prompt, and never stored — for a pharma company those ARE the scale signal |
| 5b | ~~Fit scores bunched — one offer won everything by 0.03~~ | ✅ **DONE 2026-07-29.** Migration 212. See §9 |
| 5c | ~~Correction loop / Learning Graph~~ | ✅ **DONE 2026-07-29.** Migrations 213–215. The agent derives rules from your brief decisions; you ratify, reword or throw out each one; only ratified rules score anything. See §10 |
| 6 | SearXNG as a second source | Fixes the unreachable fit signals. Deliberately after the first ten: if the briefs are already specific enough to write from, this is refinement not necessity |
| 7 | ~~Prospect dossier page~~ | ✅ **DONE 2026-07-29.** `/prospects/<ref>` — a full page, addressable, `ref` not the PK. Facts → judgement → evidence → decision, in that order, because putting the recommendation first makes everything after it read as justification |
| 8 | ~~`industry_sub` stored + filterable~~ | ✅ **DONE 2026-07-29.** Migration 218. Computed since 206 and thrown away for want of a column — which is why every segment question needed the CLI. Cluster + segment are now facets on `/prospects` |
| 9 | ~~`gt_segments`~~ | ✅ **DONE 2026-07-29.** Migration 219. Stores the DEFINITION, not a member list. Built on `/prospects` (R4). Shows the saved count beside the live one, and flags `rules_moved` when the classification itself changed |
| 10 | ~~Research status on `/prospects`~~ | ✅ **DONE 2026-07-29.** A derived column and a filter (not researched / researched / failed / decided), NOT a tag — a tag is a human assertion, this is a fact about what we did |
| 11 | ~~Select specific companies to research~~ | ✅ **DONE 2026-07-29.** `list_targets` + a searchable picker showing each company's state |
| 12 | Running indicator in the navbar | ✅ **DONE 2026-07-29** (`VdfAgentActivity`, with the token meter). The KG loader itself is still open |

### LATER — platform

- `gt_sources` repository, per segment (§4)
- Uploaded documents as a research source
- Industry cluster rules as editable data, not a TS file
- Segment-defined brief fields (universal core + JSONB extras)
- Source tiering on evidence
- LinkedIn via a paid provider — only if the pilot proves the motion
- Journey timeline on the dossier

---

## 8. Still open

**Blocking the pilot run:**
- `price_band` and `proof` on all three offers — facts about the business that
  cannot be invented, and they reach a real prospect. If nothing can be stood
  behind in writing, that is a finding about the offer, not a form-filling
  problem.
- A fourth offer — **AI for Business Leaders workshop** — approved in
  principle (user, 2026-07-29) as the easiest cold-open of the four. Content
  drafted from the CV; needs adding.

**Answered by building it (2026-07-29):**
- `industry_sub` is its own dropdown, alongside the cluster and beside the raw
  industry — three, not one. The raw list has a 2,000-value long tail and is
  kept only because search cannot replace an exact match; the two derived ones
  are what anyone actually filters on.
- The dossier URL carries `ref` (`PROS-0042`). Raw PKs are never exposed.
- `/research` keeps its own list. It is a work queue over briefs; `/prospects`
  is the record surface. Rows on both now reach the same dossier.

**Still needing a ruling:**
- A segment stores its definition, so membership moves when the industry rules
  move. `rules_version` makes that VISIBLE (`rules_moved` on the card) but
  nothing acts on it. Should a segment be re-countable in place, or does a
  moved rule warrant re-approving the segment?

**A caveat to build in:** the sub-cluster rules are mine, derived from FTCCI
data. Once segments are built on them, changing a rule silently changes who is
in a segment. A segment should record which rules produced it and say so when
they have moved — same no-silent-change posture as everything else.

---

## 9. Fit is not the same question as what to open with

*(Migration 212, 2026-07-29. Written after the first five briefs.)*

### What the data said

```
Biological E              cdo 0.72 · ai-auto 0.68 · workshop 0.65 · audit 0.58 · caio 0.15
Biophore                  cdo 0.81 · ai-auto 0.78 · workshop 0.72 · audit 0.68 · caio 0.15
Sri Krishna               cdo 0.75 · ai-auto 0.72 · audit 0.68 · workshop 0.35 · caio 0.15
Venkateshwara Hatcheries  ai-auto 0.72 · workshop 0.65 · audit 0.45 · cdo 0.15
Chemiloids                everything 0.12-0.18 → no fit
```

Two rows are genuinely discriminating — Hatcheries drops CDO to 0.15,
Chemiloids fits nothing. The rest are not. The top gaps are 0.03–0.04, which
is inside the noise of the model's own judgement, and the winner was the offer
rendered **first in the prompt** every single time (`ORDER BY sort_order`).

### Three causes, three fixes

| Cause | Fix | Where |
|---|---|---|
| CDO was always first in the prompt | Offers ordered per company by `sha256(prospect_id : offer_id)` — deterministic, so a re-score of the same company gets the same order and a moved score means the *wording* moved | `catalogueForPrompt(cat, seed)` |
| Fit and "right-sized first ask" were one number | `gt_offers.commitment` — `entry` / `project` / `retainer`. **Never in the prompt.** Among offers within `FIT_MARGIN` (0.15) of the top score, take the lowest rung | `chooseOffer()` |
| A 0.03 win read as a decision | `fit_margin` stored; under the margin the brief says "treat them as tied, not ranked" | migration 212 + `/research` |

### Why the Digital Systems Audit could never win on fit

Its signals are a **subset** of CDO's — everything that makes the audit fit
makes CDO fit at least as well, so it ties at best and never wins. That is not
a bug in the offer; it is what "an audit is the first step of the engagement"
means. Fit scoring answers *"which offer best matches what this company is"*.
It cannot answer *"which offer is the right-sized ask for a company that has
never heard of us"* — and the second question is the one that decides the
first message. `commitment` is that second axis, kept deliberately out of the
model's hands so the two judgements stay separable and inspectable.

### What is deliberately NOT automated

`caio-as-a-service` sat at 0.12–0.15 on every company because all its signals
are news, press and hiring — sources we do not read (§4). The honest fix is
the tenant's, not the code's: rewrite those signals as things visible on a
website, or wait for SearXNG (NEXT item 6). Nothing here papers over it.

Same for CDO's signals, which describe the *segment* ("multi-site pharma with
exports") rather than the *offer* — which is why every pharma manufacturer
scores high on it. A signal that fires on the whole cohort carries no
information, and no amount of post-processing recovers what the signal never
distinguished.

### The batch numbers that tell you it is working

`gt_agent_runs.output` now carries `smaller_first_ask` and `fit_unclear`, and
the same two appear as stat cards. **`fit_unclear` on more than about half the
batch is a verdict on the offers, not on the companies** — it means the offers
do not discriminate, and rewriting signals will do more than any further
scoring work.

---

## 10. The correction loop — the Learning Graph

*(Migrations 213–215, 2026-07-29.)*

### What was being thrown away

`decide_brief` did `recommended_offer = COALESCE($offer_key, recommended_offer)`.
The moment a reviewer approved a company under a different offer than the agent
proposed, **the agent's proposal was gone**. The single most useful thing the
pilot produces — the disagreement, and the reviewer's reason for it — was being
overwritten by the correction itself.

Migration 213 splits them. `recommended_offer` is the agent's word and is never
rewritten by a human; `human_offer` is the reviewer's; reads take
`COALESCE(human_offer, recommended_offer)`. Same posture as best-fit vs
recommended: **a judgement is a record, not a mutable field.**

### Three layers, and why it is not just a prompt trick

| Layer | What it is | Where |
|---|---|---|
| **Rulings** | The last 8 disagreements + 4 confirmations, verbatim, in the fit prompt | `corrections.ts` |
| **Lessons** | Rules the agent DERIVES from the full decision history, that a human ratifies | `lesson.agent.ts` → `gt_fit_lessons` |
| **Staleness** | Both feed `judgementFingerprint` beside the offers, so ratifying a rule offers a re-score | `corrections.ts` |

Rulings alone are **recency, not memory**: the eleventh ruling pushes out the
first, and what the reviewer taught us in week one is gone. A lesson is the
generalisation — it survives its own evidence scrolling away, and unlike an
example it can be edited, argued with, or thrown out.

### The agent proposes; it never ratifies

`FIT_LESSONS_REQUESTED` → the agent reads every decided brief, proposes at most
five rules, each carrying the companies it was inferred from, at
`status='proposed'`. **Only `accepted` rows reach the fit prompt.**

A model that derives a rule from its own corrected mistakes and then obeys it,
with nobody in between, is how a system drifts into a policy nobody chose — and
it does so confidently and invisibly. This is the same agent-produces /
human-confirms model as onboarding (CLAUDE.md rule 9).

Four gates on a proposal:

1. **Evidence is mandatory.** A rule must cite companies from the decision
   history; one citing a company nobody decided on is dropped as invented, and
   the drop is visible in the run feed. An unfalsifiable rule does not get to
   decide who is contacted.
2. **A floor of 6 decisions.** Below that a "rule" is a description of a
   handful of companies. It refuses and says so rather than inventing a policy
   out of a Tuesday afternoon.
3. **Rewording is first-class.** The inference is usually close and rarely
   exactly right — "they reject small companies" wants to be "reject
   single-plant companies with no stated exports". The agent's original stays
   in `lesson`, the reviewer's in `edited_lesson`, and the gap between them is
   the most honest measure of how good the inference was.
4. **Rejected rules are kept.** Delete them and the same proposal returns next
   week, forever.

### Decided briefs are never re-judged

Ratifying a lesson stales every **undecided** judgement, so the Research screen
offers to re-score them — one LLM call each, no crawling (migration 211). A
brief a human has ruled on is skipped: re-scoring it would move the offer out
from under a decision that named a different one. That skip is also a bug fix —
before this, editing an offer silently overwrote a reviewer's reassignment.

### What this is not

Not training, not fine-tuning, not statistics. At a hundred companies ten
examples are a demonstration of how one reviewer thinks, and the prompt says so
in those words — a model shown eight rejections with no framing will infer
"reject things". Disagreements and confirmations are capped **separately** for
the same reason: take the ten most recent rulings outright and one bad
afternoon becomes the model's entire picture of what the reviewer wants.

### Still open

- No `fit_unclear` → lesson path yet. When the top two offers tie repeatedly on
  the same pair, that is itself a lesson ("these two are not distinguishable on
  a website — always lead with the audit"), and the agent does not look for it.
- Lessons are per tenant and per environment. Whether a sandbox lesson should
  carry to live is a real question and is deliberately answered "no" for now.
- Nothing decays. A rule accepted in month one still applies in month six even
  if every decision since has contradicted it. A confidence that erodes when
  new rulings disagree is the obvious next step and is not built.
