# vani.vikuna.io — the landing page (spec for review, 2026-09-30)

Status: **BUILT on `claude/wizardly-darwin-778r2w` (2026-09-30)** — page in vikunawebsite, backend B1–B7 here. Waits on migration 262 + two .env settings to deploy. Builds on the funnel
(`design-notes-funnel-anon-session.md`, migration 261, deployed).

## Rulings this spec is built on (Charan, 2026-09-30)

| # | Ruling |
|---|---|
| R1 | The story is **building a knowledge graph of your business**. Vara is not mentioned. Nova is not mentioned ("nova is actually GTM, we will tackle that later"). |
| R2 | The digital audit that runs during onboarding is shown. |
| R3 | GTM is explained with an animation built in code, in the console's own design, labelled as an illustration. |
| R4 | Closed beta: the call to action is **Request access**, and the request becomes a lead in the owner's tenant (connect@vikuna.io's workspace). |
| R5 | Audience: Indian SMBs. |
| R6 | Lives at vani.vikuna.io, the `(site)` page of vani-app. `frontend/` is retired and nothing is taken from it. |
| R7 | Before a visitor tries it, a **snapshot of connect@vikuna.io's graph** is shown with "you can see yours when you trigger it at the top". After they try it, **their own graph** is shown below the card, headed "this is your data". |
| R8 | The graph uses the console's column layout (`KnowledgeGraphScreen`), not a node-and-line canvas. |
| R9 | Migration 262 is approved. |
| R10 | Access requests get a simple view in the console. |
| R11 | Kept after cleanup: `charans-workspace-e619cv` (charan@c.com, testing) and `vikuna-funnel`. connect@vikuna.io is the main account, and signs up first. Everything else is deleted once the landing is done. |

Not on the page: pricing, testimonials, customer logos, agent counts, "autopilot".
The old `frontend/` landing had all of them and none were true.

## The page, top to bottom

### 1. Hero: the try-it box

- Headline (draft): **"VaNi learns your business from your website."**
- Sub (draft): "Type your website. In about a minute VaNi reads it and shows you what it learned: what you sell, who you sell to, the problems you solve, and how you are found online."
- Input: website address, with a **Read my website** button. A "Closed beta" chip sits next to it.
- Small print under the box: "We read only your public homepage. Nothing is saved to an account until you sign up."

### 2. The result, appearing in place under the hero

This is the existing funnel. `POST /funnel/site` starts the read and `GET /funnel/site/:token` is polled.

| State | What shows |
|---|---|
| reading | Progress in plain steps: "Opening your homepage", "Reading it", "Working out what you do". A real `InlineLoader`, no fake percentage. |
| read | Three blocks in order: **(a) card**, **(b) audit**, **(c) your graph**. Then Request access, with the company name taken from the card. |
| reused | Same as read, plus one line: "Read on 12-Sep-2026. We reuse a recent read instead of reading it again." (the 30-day reuse rule, stated honestly). |
| failed | The real reason in plain words: not reachable, not a public site, not a web page, or "we could not work out what this site does". Then "Try another address" and Request access. Nothing made up is shown (rule 12). |
| limited | Per-IP limit or daily spend cap reached: "Too many reads right now, try again in an hour." It says which limit was hit. |

**(a) Card.** Already built: company, what they do, who for.

**(b) Digital audit.** Five checks, and **no LLM cost**. `extractFromHtml` already returns them on the fetch the funnel makes today.

| Check | Shown as |
|---|---|
| title | "Your page has a title" / "Your page has no title, so search results show a guess" |
| meta_description | "Search engines have a summary of you" / "no summary" |
| og_tags | "Links to your site show a preview on WhatsApp and LinkedIn" / "no preview" |
| json_ld | "AI assistants can read who you are" / "they have to guess" |
| body_text | "Your homepage has readable text" / "Your homepage is mostly images or scripts; crawlers see almost nothing" |

Each missing item shows a one-line fix. The WhatsApp preview line is what an Indian SMB will feel first.

**(c) "This is your data" graph.** The nodes and relations extracted from their homepage, in the console's column layout: What you sell · Who you sell to · Problems you solve … with the relation sentences underneath. Heading: "This is your data. It becomes yours when you sign up." A homepage gives a small graph, and the page says so: "From one page. VaNi reads your whole site, documents and conversations once you're in."

### 3. The sample graph (before a visitor tries it)

- A snapshot of connect@vikuna.io's graph, drawn by the same component.
- Label: "Vikuna's own graph, built by VaNi. You can see yours when you enter your website at the top."
- Once the visitor's own graph arrives, this section collapses under it: "Compare with Vikuna's graph".

### 4. Why a knowledge graph (the pain)

Localised for Indian SMBs, written as situations, **with no statistics** (we have none that we can source):

- What your business knows lives in the founder's head and in WhatsApp chats.
- Every new salesperson, agency or freelancer starts from zero and asks the same questions.
- Your website says one thing, the brochure another, the sales pitch a third.
- Heading (draft): "Your business, written down once, and used everywhere."

### 5. How GTM works: the animation

Built in code, using the console's tokens and components. A corner label reads **"Illustration"**. Three stages loop:

1. **Build the audience.** Companies that match the graph's "who you sell to" drop into a list and get qualified.
2. **Put them in motion.** A journey is laid out and VaNi drafts the messages. **Each draft waits for your approval**, shown as an explicit approve tick.
3. **Work the queue.** Today's list: who has gone quiet, ranked.

The example data is invented and is labelled as an example. It uses a fictional company, never a real one. It is CSS/React only, with no video and no library. It respects `prefers-reduced-motion`, which shows the three frames still.

### 6. Trust

Four lines, each backed by something already built:

- **Your data is yours.** Every workspace is isolated at the database level.
- **Nothing goes out without you.** Every message is a draft until you approve it.
- **India's DPDP Act.** You accept the outreach notice before VaNi contacts anyone, you can switch outreach off in Settings, and opt-outs are honoured across every channel.
- **Bring your own AI model** if you prefer.

### 7. Request access

The form has:

- name
- work email
- your role
- country code + mobile, as separate fields
- company, prefilled from the card and editable
- website, prefilled and hidden when present
- consent line (draft): "Vikuna may contact me about VaNi access. I can ask to be removed at any time."

Outcomes:

- On submit: "Thanks, we'll be in touch." Idempotent per token and email, so a double-click doesn't create two requests.
- Errors show the real reason.
- The form works without a site read too, so someone who never tried the box can still ask.

## Backend changes

| # | Change | Notes |
|---|---|---|
| B1 | **Migration 262** (approved). `vani_anon_site_read` gains `audit jsonb` and `graph jsonb`. | Idempotent: `ADD COLUMN IF NOT EXISTS`. |
| B2 | The funnel job keeps `extractFromHtml`'s health as `audit`, and runs `extractFromChunks` over the homepage text, with **no `onChunk` writer**, so nothing reaches any tenant's KG. It stores `{nodes, edges}` in `graph`. | More Haiku per read: a homepage is 1–3 chunks, all under the existing `FUNNEL_DAILY_TOKEN_LIMIT` cap. If extraction fails, the card and audit still show, and the graph block names the failure. It is not hidden. |
| B3 | `GET /funnel/site/:token` returns `audit` and `graph`. | Nodes are sent as `{kind, name, description}` only. The visitor gets back what their own public page says, nothing more. |
| B4 | **Claim** also writes the graph into the new tenant's KG: the existing upsert on (tenant, label, name), plus edges, attached to the source row the claim already creates. | One transaction, as the claim is today. The first real ingestion then deepens it, and the upsert merges duplicates. |
| B5 | `POST /funnel/access-request` (public, IP-limited by the existing per-IP rule). It writes `gt_lead` into the tenant named by **`FUNNEL_LEADS_TENANT_SLUG`** (.env, no default; missing gives a 503). | Uses `withTenantClient` on the owner tenant. `lead_no` comes from `gt_next_seq`. |
| B6 | `assessment-skill`-style read for the console: `access-skill.list_requests`, which returns the owner tenant's access requests. | Read-only in v1, per "simple". |
| B7 | nginx conf header: add `/funnel/access-request` to the public-routes list. `.env.example`: add `FUNNEL_LEADS_TENANT_SLUG`. | Docs only, no routing change (the catch-all already proxies it). |

### ⚠️ One schema question before B5: where the request's site and consent go

`gt_lead` (228) fits a request badly in two places:

- `role_title` is NOT NULL. This is fine: the form asks "your role".
- It has **no column for the site, the funnel token or the consent text**. The timeline table meant to carry that, `gt_lead_event`, has `assessment_response_id NOT NULL`, so a lead that did not come from an assessment **cannot have an event at all**.

Options:

- **(a) Recommended.** In migration 262, also drop NOT NULL on `gt_lead_event.assessment_response_id`. The request then writes one `access_requested` event whose payload is `{site, anon_token_hash, consent_text, consent_at}`. That is one relaxed constraint, and no new table or column. Existing assessment rows are unaffected.
- (b) Write `gt_lead` only. We lose which site the person read, and our record of what they agreed to. That second one is the part that matters under DPDP.
- (c) A fake assessment response to satisfy the FK. **No.** It is fabricated data.

This is a schema change, so it needs your yes. 262 was approved as "graph jsonb", not this.

## vani-app changes

| # | Change |
|---|---|
| F1 | Extract the column layout from `KnowledgeGraphScreen.tsx` into a shared read-only `KnowledgeColumns` component, props `{nodes, edges}`. The console screen uses it with **no visible change**, checked side by side before and after. |
| F2 | Rewrite `(site)/page.tsx` as sections 1–7 above. Every state from the table in §2 is implemented, and the five-states rule from vani-app/CLAUDE.md applies. |
| F3 | The GTM animation component (§5). |
| F4 | `src/skills/access-requests/`: one screen listing name, company, role, email, mobile, site, date and status, plus one line in `src/skills/index.ts`. It is visible to the owner tenant, since other tenants have no rows. It has empty, error and loading states, and the empty state says "Requests from vani.vikuna.io appear here." |
| F5 | The snapshot is a static JSON file in vani-app (`public/` or `src/skills/(site)/data/`), made once by a read-only script from connect@vikuna.io's KG. It is **not** a live query: the landing page is public and must never read a tenant's data at runtime. |

## Order of work

1. **You:** connect@vikuna.io signs up → note the workspace slug it gets → set `FUNNEL_LEADS_TENANT_SLUG=<that slug>` in the VPS `.env`. The slug is kept as generated, not renamed.
2. **Me:** B1–B4, with tests (the funnel db test extended; claim writes the graph; extraction failure keeps card + audit). Then B5–B7, depending on your answer on (a).
3. **Me:** F1 first, alone, proven unchanged. Then F2, F3 and F4.
4. **You:** connect@vikuna.io runs onboarding on vikuna.io. It is a Vite SPA, so the n8n headless render is the path that reads it, and that must be working.
5. **Me:** export its graph into F5. Until then the sample section shows nothing, and does not use placeholder data.
6. Merge + deploy. You apply 262 through the runner (`docker exec vani-backend node dist/migrate.js`).
7. **Cleanup** (after the landing is live): a dry-run, transactional script that keeps `charans-workspace-e619cv`, `vikuna-funnel` and connect@'s workspace. Before it deletes `vikuna-consulting`, check `VANI_TENANT_SLUG`, because it may be the assessment tenant. You review the dry-run output before the real run.

## Questions for you

1. Schema option **(a)** for access-request events: yes or no?
2. Headline "VaNi learns your business from your website.": keep it, or do you have your own line?
3. Should the audit show a score ("3 of 5") or only the lines? I recommend the lines only: a score invites comparison we can't back.

## Addendum — after the preview, push to signup through the beta gate (Charan, 2026-09-30)

> "when the first smart-profile is built -- we need push users for signup --
> (we are currently in beta - so we will have gate with password …) if users
> do not have the password -- capture their details for lead, otherwise they
> enter the gate and complete the signup"

The gate already exists in vani-app (`lib/gate.ts`, `/gate`); its stored
digest is that phrase, so nothing about the phrase changes. What is added:

- The result's call to action is **Sign up with your access phrase** (→ `/gate`
  → `/signup`), with **No access phrase? Request access** beside it. The gate
  screen links to Request access too.
- **Signup claims the preview.** The funnel token stays in the browser; right
  after `register` returns a session, the console calls `POST /funnel/claim`,
  so the card and graph become the new workspace's first Smart Profile and the
  full crawl is queued. A claim that fails never blocks signup — the person is
  told the preview did not carry over, and why (rule 12).
- The gate is a front door, not a lock (lib/gate.ts says so); `register` is
  open on the API. A server-issued invite code is the real fix and stays
  logged, not faked.

## Decisions made while building (for review)

- **Graph failure lives inside `graph`** — `{ status: 'failed', failure }` —
  rather than a third column: 262 was approved as audit + graph.
- **`FUNNEL_GRAPH_MAX_CHUNKS`** (new .env, required by the preview) caps the
  extraction calls per new read; the graph says when it came from only the
  first part of the page. Suggested 3.
- **Access request replay key** = SHA-256(Idempotency-Key + email). The
  client's keys are a counter plus a timestamp, so two visitors can mint the
  same one; scoping by email stops one person's replay swallowing another's
  request (tested).
- **Same email again** → a new `access_requested` event on the existing lead,
  not a second lead. `phone` holds the mobile only; the country code stays a
  separate field in the event (lesson 11).
- **Claimed graph entries** carry `properties.from = 'website preview'` and no
  source run: the knowledge screen shows them unlinked until the full crawl
  (queued by the same claim) re-reads the page and links each one it finds.
