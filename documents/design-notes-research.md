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

### NOW — unblocks reading the first ten briefs

| # | Item | Why now |
|---|---|---|
| 1 | **Offer form loses focus every keystroke** | My bug: `Area` is defined inside `OfferForm`, so React remounts the textarea on every render. Offers are currently unfillable except by paste |
| 2 | Offer form → landscape / two-column | Same screen, same sitting |
| 3 | **Do not re-research a company that already has a brief** | A second run re-crawls all ten from scratch. Show "10 selected · 7 already researched · 3 to do" BEFORE the button |
| 4 | Widen website paths — careers, news, press, media, investors | One line; careers is where hiring signals live and it is not even in the list |

**Then: run the ten, read them.** That gate decides everything below.

### NEXT — after the ten read well, before scaling to 101

| # | Item | Why then |
|---|---|---|
| 5 | **Split facts from judgement** in the brief | Adding an offer currently redoes crawl + extract + fit + hook. Split, and it costs ONE call per company. Across 101 that is minutes vs hours — and offer wording is the thing that will be iterated constantly. Cheapest before 101 briefs exist |
| 6 | SearXNG as a second source | Fixes the unreachable fit signals. Deliberately after the first ten: if the briefs are already specific enough to write from, this is refinement not necessity |
| 7 | Prospect dossier page | Replaces both modals |
| 8 | `industry_sub` stored + filterable on `/prospects` | Enables segments |
| 9 | `gt_segments` — saved definitions, Save-as-segment on `/prospects` | Removes the CLI from the path permanently |
| 10 | Research status + brief visible on `/prospects` | Derived column, NOT a tag — tags are human assertions |
| 11 | Select specific companies to research | API already supports `prospect_ids`; only the UI is missing |
| 12 | KG loader while running · running indicator in the navbar | Cheap, and the batch already survives navigation |

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

**Needing a ruling:**
- Is `industry_sub` its own dropdown on `/prospects`, alongside industry? (Two
  dropdowns where there is now one.)
- Does `/research` keep its own list, reframed as a work queue ("12 briefs
  need a decision") with every row linking to the dossier? Recommended: yes.
- `ref` (`PROS-0042`) in the dossier URL rather than the raw PK. Recommended:
  ref — raw PKs are never exposed (CLAUDE.md).

**A caveat to build in:** the sub-cluster rules are mine, derived from FTCCI
data. Once segments are built on them, changing a rule silently changes who is
in a segment. A segment should record which rules produced it and say so when
they have moved — same no-silent-change posture as everything else.
