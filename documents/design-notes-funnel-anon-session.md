# D3 — Crawl before signup (Track E1): design for approval · 2026-09-30

> **Status: PROPOSED. Nothing is built; no migration is written.** Schema
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
| Daily ceiling | The system tenant's existing daily token cap. When it is spent, the landing says so honestly ("VaNi is busy, try later") — no silent degradation |
| Unbound rows | Deleted after `FUNNEL_SESSION_DAYS`; expired sessions are removed whenever a new one is created (there is no scheduler yet — ARCH §6a) |
| Personal data | None collected before signup except the IP, and that only as a keyed hash that expires with the row. Nothing is emailed to a visitor (D9) |

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

## 7. Build order once approved

1. Split the drafter (§4), with a before/after test.
2. Migration 261: the table, the system tenant seed, grants.
3. `funnel` module: submit, status, claim; the funnel agent; rate limits.
   Tests: rate limit, reuse, failure card, claim moves everything in one
   transaction, a claimed token cannot be claimed twice, another tenant
   cannot claim it, expired rows are gone.
4. nginx: the two public routes go on the public list in the config header.
5. E2 (the landing page) — after the location decision.
