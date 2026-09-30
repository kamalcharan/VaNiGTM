# D3 — Crawl before signup (Track E1): design for approval · 2026-09-30

> **Status: APPROVED as recommended (Charan, 2026-09-30: D3-a…h, reuse window 30 days). Being built — see §7.** Schema
> changes need Charan's approval. §6 lists the decisions, each with a
> recommendation.
>
> Sources: `documents/spec/PLATFORM.md` F0, P-01, P-02, §6.5;
> `documents/POA-2026-09-30-platform.md` §7 (Track E); the assessment funnel
> (`skills/assessment-skill`, anonymous token → result → capture) as the
> precedent; `ingestion-skill/ingestion.agent.ts` and
> `profile-skill/profile.drafter.ts` as the pieces reused.

## 1. What the visitor experiences

```
landing: "enter your website"  ──►  a few seconds: "VaNi is reading acme.com…"
                                     │
                                     ├─ read   → teaser card: product name, one line, category
                                     │           "Sign up to keep this and let VaNi finish learning"
                                     └─ failed → "We could not read acme.com: <real reason>"
                                                 (rule 12 — never a sample card)
signup ──► the card becomes the new tenant's first knowledge; the Mission
           Wizard opens with step 1 done; the full site crawl continues in
           the background as a normal run
```

## 2. The problem

Everything the crawl touches today belongs to a tenant, and a visitor is not
one yet:

| Needs a tenant today | Why |
|---|---|
| `gt_events` (the queue) | `tenant_id NOT NULL`, FK to `vn_tenants` |
| `gt_agent_runs` (the run and its steps) | `tenant_id NOT NULL` |
| `callLLM` (the model client) | provider choice, the **daily token cap**, and usage records are per tenant |
| `gt_kb_sources`, `gt_kg_nodes`, `gt_tenant_profile` | where a crawl's results live |

## 3. Proposed design

**One new table holds the visitor's data. Bookkeeping goes to one system
tenant. Nothing a visitor produces enters a tenant's tables until they sign
up.**

### 3.1 A system tenant for bookkeeping only

One seeded `vn_tenants` row, slug `vikuna-funnel`, status active, never
logged into. It owns only:

- the queue row (`gt_events`) and run row (`gt_agent_runs`) of each
  pre-signup crawl, so the job engine, retries and the Runs screen work
  unchanged;
- the **model spend**: pre-signup calls count against this tenant's existing
  daily token cap. That cap becomes the hard ceiling on what anonymous
  visitors can cost Vikuna in a day, with no new mechanism.

The visitor's **data** (page text, drafted card) never goes into this
tenant's knowledge tables; it stays in the session row (§3.2). This avoids
the placeholder-tenant objection in PLATFORM §6.5, which was about putting
every visitor's DATA under one tenant id.

### 3.2 `vani_anon_session` — the visitor's crawl, until they sign up

```sql
create table vani_anon_session (
  id               uuid primary key default gen_random_uuid(),
  token_hash       text not null unique,        -- sha256 of the browser's token; the token itself is never stored
  website_url      text not null,               -- as entered, normalised
  website_host     text not null,               -- for same-site reuse (§3.4)
  status           text not null default 'queued'
                   check (status in ('queued','reading','read','failed','bound','expired')),
  failure          text,                        -- the real reason when failed (rule 12)
  page_text        text,                        -- what was read, kept so the bound source is exactly what the card came from
  draft            jsonb,                       -- the drafted profile card, validated by the drafter's own schema
  run_id           bigint,                      -- the run under the system tenant
  ip_hash          text not null,               -- HMAC of the visitor IP, for rate limiting only
  bound_tenant_id  uuid references vn_tenants(id) on delete set null,
  bound_at         timestamptz,
  created_at       timestamptz not null default now(),
  expires_at       timestamptz not null
);
create index on vani_anon_session (website_host, created_at desc);
create index on vani_anon_session (ip_hash, created_at desc);
create index on vani_anon_session (expires_at) where status <> 'bound';
```

`draft` is JSONB on purpose, and this is part of the approval: it is exactly
the object the profile drafter already produces and validates (about 20
fields). Spreading it into columns would duplicate `gt_tenant_profile` for
rows that live a few days and are copied into that table at signup.

### 3.3 The flow

1. **`POST /api/v1/funnel/site`** (public) — takes a URL; checks rate limits
   (§3.4); creates the session; returns a random token (once) to the browser;
   emits `FUNNEL_SITE_SUBMITTED` on the system tenant.
2. **The funnel agent** (worker) — fetches the homepage with the same fetcher
   ingestion uses (including the headless escalation for JS-only sites), and
   makes **one** drafter call. Only the cheap part runs before signup; the
   full site crawl and knowledge-graph extraction run after signup as the
   normal ingestion. Writes `page_text`, `draft`, status `read` or `failed`.
3. **`GET /api/v1/funnel/site/:token`** (public) — status and teaser card.
   Only the token holder can read it.
4. **Signup**, then **`POST /api/v1/funnel/claim`** (authenticated, with the
   token) — in ONE transaction: create the tenant's `gt_kb_sources` row for
   the URL with the page text; write the draft into the profile (the normal
   upsert, source `vani`, so every field stays editable and replaceable);
   mark the session `bound`; emit `URL_SUBMITTED` for the new tenant so the
   full crawl continues as a normal run. `register()` itself is not changed.
5. **Wizard step 1** reads the profile and shows it as done (E4).

### 3.4 Abuse and cost (public endpoint, Vikuna's money)

All values from `.env`, no defaults (the configuration rule):

| Guard | Proposal |
|---|---|
| Per visitor | At most `FUNNEL_MAX_PER_IP_PER_HOUR` submissions per IP (by `ip_hash`) |
| Same site | A site read successfully in the last `FUNNEL_REUSE_HOURS` returns that card instead of a new model call. A company website is public, and so is a card drafted from it |
| Already reading | A second submission of a site that is being read right now waits for that read instead of starting another |
| Daily ceiling | The system tenant's existing daily token cap. When it is spent, the landing says so honestly ("VaNi is busy, try later") — no silent degradation |
| Unbound rows | Deleted after `FUNNEL_SESSION_DAYS`; expired sessions are removed whenever a new one is created (there is no scheduler yet — ARCH §6a) |
| Personal data | None collected before signup except the IP, and that only as a keyed hash that expires with the row. Nothing is emailed to a visitor (D9) |

### 3.4a Revisits never pay twice (Charan, 2026-09-30)

"Capture the IP so a revisit starts from the previous session rather than
running again" — agreed in intent, and done in three layers, because an IP
alone is the wrong key: many people share one (an office, a college, a
mobile carrier), and one person's changes often.

| Layer | Recognises | Model calls |
|---|---|---|
| **Browser token** — kept in the visitor's browser after the first visit | the same person, same browser: they land straight on their card | 0 |
| **Same website, any visitor** — a site read within `FUNNEL_REUSE_HOURS` | the same person on another device or network, or a colleague entering the same site | 0 |
| **Read in progress** | a refresh or double submit while reading | 0 extra |
| **IP, as a keyed hash** | rate limiting, and a "welcome back" hint only — never used alone to hand one visitor another visitor's session | — |

What makes the second layer safe: **the read result for a website and a
visitor's session are separate things.** Each visitor gets their own session
and token pointing at a shared read result; reusing the card never shares a
token, so nobody can claim someone else's session. In the schema, the page
text, draft, status and failure move to a `site read` record keyed by
`website_host` (one per read), and `vani_anon_session` keeps only the visitor
side (token, IP hash, the read it points at, binding). That is one more
small table than §3.2 showed; it is decided with D3-h.

**What counts as the same website** (Charan: "if contractnest.com repeats,
show the existing one"): the key is the normalised host — scheme, `www.`,
case, path and trailing slash dropped — so `http://contractnest.com`,
`https://www.contractnest.com/`, `contractnest.com/about` and
`CONTRACTNEST.COM` are one site. A card is reused for
`FUNNEL_REUSE_HOURS` (proposed 30 days = 720): sites change, and the full
crawl after signup refreshes everything anyway.

**Only earlier funnel reads are reused — never a tenant's Brain.** If the
site already belongs to a signed-up tenant, that tenant's Smart Profile is
private; a visitor entering the same site gets a card from the funnel's own
read of the public page, never from the tenant's data (the same line rule 13
draws for research).

IP is stored only as `ip_hash` (HMAC, the same keyed approach as D9-b), not
the raw address: it matches revisits exactly as well, and a hash is not
personal data we have to protect or disclose.

### 3.5 RLS

This table has no tenant until it is bound, and it is reached by token, which
row-level security cannot express. **Proposed: RLS disabled by design, like
`gt_events`**, with every access going through one module that always filters
by `token_hash` (or by the caller's own tenant once bound). The data is
minimal and short-lived. Documented as a named exemption in the RLS test, the
way 237 named `gt_agent_runs`.

## 4. One code change to an existing path (behaviour kept identical)

`profile.drafter.ts` today drafts AND saves in one function. It splits into
`draftFromText` (the model call, returns the draft) and the existing
`draftProfileFromText`, which calls it and saves exactly as now. The
existing onboarding path is tested to produce the same result before and
after the split (the rule from 2026-09-30: conversions do not change what an
agent does).

## 5. What is deliberately NOT in this slice

- The landing page itself (E2) — separate decision: website repo now, or
  after Track H.
- The agent catalog and entitlement (E3 / D4).
- A captcha — added only if the rate limits prove insufficient.
- Pre-filling the Domain step from the website URL — possible later, not
  needed for the funnel.

## 6. Decisions for Charan

| # | Question | Recommendation |
|---|---|---|
| D3-a | Who owns the job and pays for the model call before signup? | **A seeded system tenant `vikuna-funnel`**, bookkeeping and spend only; visitors' data stays out of it. Alternative: make the queue and run tables accept "no tenant", which touches every reader |
| D3-b | How much runs before signup? | **Homepage + one drafter call** for the teaser; the full crawl and extraction after signup |
| D3-c | Abuse limits | Per-IP hourly limit, same-site reuse, the system tenant's daily cap — **values in `.env`** |
| D3-d | How long an unclaimed crawl lives | **A few days (`FUNNEL_SESSION_DAYS`), then deleted.** IP stored only as a keyed hash |
| D3-e | RLS on the new table | **Disabled by design**, token-hash access through one module, named in the RLS test |
| D3-f | When the crawl attaches to the new tenant | **A separate claim call right after signup**, one transaction; `register()` untouched |
| D3-g | `draft` as JSONB | **Yes** — it is the drafter's own validated object, short-lived, copied into the typed profile at claim |
| D3-h | Revisits (Charan's ask) | **Three layers — browser token, same-website reuse, read-in-progress join — plus IP as a keyed hash for limits and a hint.** Needs the read result split from the visitor session (one extra small table, `vani_anon_site_read`) |

## 7. Build order — status 2026-09-30

1. ✅ **Drafter split** — `draftFromText` (model call only) split out of
   `profile.drafter.ts`; `profile-drafter-split.test.ts` runs the old drafter
   (verbatim from 5579b2d) beside the new one: same call, same write.
2. ✅ **Migration 261** — written and tested locally, **NOT applied**. Adds
   `started_read` on the session (the rate limit counts only new reads).
3. ✅ **`src/funnel`** — `POST /api/v1/funnel/site`, `GET /site/:token`
   (public), `POST /claim` (JWT); the `FUNNEL_SITE_SUBMITTED` job; the three
   reuse layers; per-IP limit; the funnel tenant's cap row set from .env
   before each new read. 45 tests (34 guard/normalise, 11 end-to-end on the
   real schema as the restricted role); making reused cards count against the
   limit fails one.
   - **Found while building: SSRF.** A public endpoint makes the server fetch
     any URL, and the existing fetcher (`IngestionAgent.fetchUrlText`) has no
     guard and follows redirects. The funnel uses its own guarded fetch
     (`site.ts`): http(s), ports 80/443, no IP-literal hosts, every resolved
     address public, redirects followed by hand with the same checks.
     Residual: DNS rebinding. **Tenant paths guarded too (same day):** the
     guard moved to `lib/public-fetch.ts` and `IngestionAgent.fetchUrlText`
     (ingestion, site crawl, brand, competitor and account research), the
     brand stylesheet fetch and `renderPageViaN8n` all go through it; a
     refusal is `URL_NOT_PUBLIC` with the reason. Still unguarded, on
     purpose for now: the BYOK "test connection" call to a tenant-supplied
     model URL (`vani/llm-provider.service.ts`) — a self-hosted model may
     legitimately be private; it needs its own decision.
   - **Deviation from §3.3, stated:** the claim (session locked, knowledge
     source created, full crawl queued, session bound) is ONE transaction; the
     card is then written through the normal profile upsert, which has its
     own transaction. If that write fails the claim stands, the full crawl
     drafts the profile anyway, and the response says `profile_applied: false`
     with the reason.
4. ✅ nginx: the two public routes are on the list in the config header.
5. E2 (the landing page) — waits on the location decision.

**To go live:** merge; set the six `FUNNEL_*` values in `.env`; apply 261;
deploy (the worker must restart — it registers the new job type). Until the
values are set, the routes answer 503 and nothing else changes.
