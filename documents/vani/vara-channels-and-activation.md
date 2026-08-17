# Vara — onboarding, activation, and the tenant-environment channels

**Date:** 2026-08-17 · companion to `vara-readiness-review.md`
**Covers:** (1) the onboarding review, (2) how Vara is activated for a tenant,
(3) the web + chat channel build, (4) how this works when tenants host their
sites on platforms we do not control — Wix, WordPress, Shopify, anything.

Everything marked **verified** below was exercised against a running stack —
migrated database, live backend, real Chromium — not read off a spec.

---

## 1. Vara onboarding, reviewed against what exists

The spec (v0.2 §4, Flow D1) defines **two lanes**: the VaNi platform lane
(once per tenant, serves every agent) and the Vara activation lane (per agent,
ends in a readiness gate).

| Flow D1 step | Lane | State in the build |
|---|---|---|
| 1 Tenant provisioned | VaNi | **Works, lazily** — the vn→vani slug bridge provisions `vani_tenant` on the Domain step's first write. Vikuna is seeded by migration 242 as tenant #1 |
| 2 Org profile & pack binding | VaNi | Org profile: the `business_profile` step (live). Pack binding: `vani_domain_pack` / `vani_tenant_pack_binding` tables exist, **no pack content authored, nothing writes the binding** |
| 3 Users, roles, families | VaNi | Users/invites work on the vn_ spine. `vani_agent_role` is seeded with Vara's three roles; **`vani_user_agent_role` assignment has no surface**. Role families: table exists, nothing writes it |
| 4 LLM provider (BYO) | VaNi | **Not built** — `credentials_enc` has no encryption path (the known gap shared with Smart Profile step 8) |
| 5 Subscribe to Vara | Vara | **Built this session** — `POST /api/v1/vara/activate` (below) |
| 6 Comms activation (MSG91) | Vara | **Not built** — the adapter lives in ContractNest, unported. `vani_template` / `vani_comms_log` tables ready |
| 7 Compliance + talent overlays | Vara | **Not built** — consent text, retention, `vara_family_profile` have tables but no surfaces |
| 8 Readiness gate | Vara | **Built, honestly partial** — see below |

The platform lane is therefore roughly half real (identity, domain, people)
and half tables-awaiting-features (packs, roles-per-agent, BYOK). That is the
correct order — the missing half belongs to the features that need it.

## 2. How Vara is activated for a tenant — as built and verified

Before this session, activation existed **only as a seed row**: Vikuna sat at
`provisioned` in `vani_tenant_agent` and no code path wrote that table at all.
Now:

```
POST /api/v1/vara/activate        (workspace session, admin/owner only)
```

1. Resolves the tenant across the slug bridge; refuses with
   `TENANT_NOT_PROVISIONED` if the Domain step never ran.
2. Runs the **readiness checklist** and refuses with `NOT_READY` + the
   checklist if it fails.
3. Upserts `vani_tenant_agent` → `status='live'`, stamps `activated_at`
   (idempotent — re-activating answers the same state), and writes a
   `vani_audit_log` row (actor: human).

**The checklist is deliberately only what the system can verify today**: a
candidate-purpose domain exists, and it has at least one allowlisted embed
origin. The spec's full gate — approved WhatsApp template, consent text,
a `vara_family_profile`, a named calibration approver, an LLM test — would
make activation impossible right now (none of those are buildable yet) or
would have to be silently skipped, which is worse. Each missing check is named
here and **joins the checklist when its feature lands; the checklist grows,
never shrinks.**

**Verified:** activation flipped the seeded `provisioned` row to `live` with
the checklist passing, and `embed/boot` refuses with `AGENT_NOT_LIVE` for a
tenant that has not activated.

## 3. The channels — what was built

Candidate-facing Vara has one channel architecture with two faces: **web**
(the chat surface as a page in the tenant's environment) and **chat embed**
(the same surface as a floating widget inside any page). Both are the same
iframe document; only the container differs.

Three pieces, all shipped and verified this session:

**`GET /api/v1/vara/embed`** (workspace) — mints the tenant's embed token
(JWT: `{tid, scope:'vara-embed'}`, 365d) and returns the paste-ready snippet,
the current subscription state, the checklist, and the allowlisted origins —
everything a console "Install Vara" screen needs to render setup honestly.

**`public/embed/vara.js`** (served by the console app) — the one file a
tenant adds to their site:

```html
<script src="https://vani.vikuna.io/embed/vara.js"
        data-vara-token="…" defer></script>
```

Zero dependencies, no globals, no style leakage. Draws a gold launcher
button; on click, opens an iframe to `/embed/chat` on the platform origin,
passing the token and `window.location.origin`. The host page's only job is
carrying the script tag.

**`/embed/chat`** (console app route, outside the console/onboarding groups —
no session, ever) — boots via `POST /api/v1/vara/embed/boot` (public), then
renders the tenant-branded chat shell: greeting, published roles from
`vara_jd` (honest "no open roles yet" until JD Studio ships), and a disabled
composer stating that chat-apply arrives with the first open role. **The
conversation engine is the intake slice's job; this page is its address, not
its promise.**

`embed/boot` enforces, in order: token signature and scope → **parent origin
∈ `vani_tenant_domain.embed_origins`** (checked on every boot, so removing an
origin takes effect immediately — that is also the revocation story, no token
hunt needed) → **subscription is `live`**. It returns only what the tenant's
own page could already tell its visitors — tenant name, published roles —
plus a 30-minute candidate-session JWT for the calls that come after.

## 4. The Wix question — tenants hosted on platforms we do not control

This was the design question, and the answer is: **the host platform is
irrelevant by construction.** The integration surface is one script tag, and
every platform that lets a tenant edit their site lets them add one:

| Platform | Where the snippet goes |
|---|---|
| Wix | Settings → Custom Code (site-wide), or an Embed HTML element |
| WordPress | theme footer, or any header/footer-scripts plugin |
| Shopify | `theme.liquid` before `</body>` |
| Framer / Webflow / Squarespace | their custom-code setting |
| Hand-written site | paste it |

Everything real lives on **our** origin: the widget script, the iframe
document, the API. The tenant's site contributes exactly two things — a place
to stand, and its `window.location.origin`, which we verify against the
allowlist the tenant declared on their candidate domain. Consequences worth
stating:

- **Updates never touch the tenant's site.** We deploy; every embedded widget
  is new on next load. No version skew across tenants.
- **The tenant cannot break it and it cannot break the tenant** — the iframe
  boundary isolates styles, scripts and storage both ways.
- **Onboarding a new platform costs nothing.** There is no "Wix integration"
  to build, ever. If a platform can carry a script tag, it is supported; if
  it cannot (some locked-down builders), the fallback is linking to the chat
  page directly — same document, top-level.
- **Same-machine story for the marketing site:** vikuna.io itself embeds Vara
  with the same snippet — tenant #1, no special case, exactly as the spec
  demands.

### Threat model, stated honestly

`parent_origin` is self-reported (browsers do not expose ancestor origins
cross-site), so a non-browser caller can claim an allowlisted origin. What
that earns is what boot returns: the tenant's public name and published role
titles — content the tenant's careers page is already showing the world.
Nothing candidate- or tenant-private rides on boot. The tiers above it:

1. **Now:** candidate-session JWTs are short-lived (30m) and origin-stamped;
   the allowlist is re-checked on every boot.
2. **With intake (next slice):** submissions get server-side rate limiting and
   the session's origin binding checked on every write.
3. **Production hardening (nginx, deliberate, not yet done):** serve
   `/embed/chat` with a `Content-Security-Policy: frame-ancestors` built from
   the tenant's allowlist — then the *browser* refuses to render the widget
   on an unlisted site, closing the self-report gap for real embeds. Tracked
   for the VPS nginx config alongside the api.vikuna.io CORS map.

### Verified end to end

A fake "Wix" page (plain HTML on `localhost:9000`, a foreign origin we treat
as untouchable except for one script tag) with the widget embedded:

- **Allowlisted origin:** launcher renders → iframe boots (200) → "Hello — I'm
  Vara, Vikuna Technologies' talent agent" → honest "no open roles right now".
- **Same page on a NON-allowlisted origin (`localhost:9001`):** boot 403 →
  the widget itself says "Not available on this site". No data crossed.
- **Activation gate:** before `/vara/activate`, boot refused with
  `AGENT_NOT_LIVE`.

### Found and fixed on the way: the font that froze the widget

The embed sat at "Connecting…" forever inside the iframe while working
perfectly top-level. Cause: the root layout loaded Google Fonts as a
**parser-blocking stylesheet**; where that CDN hangs, the document never
finishes parsing, Next's bootstrap scripts never execute, the app never
hydrates, and the boot call never fires. Top-level it "worked" only because
the CDN request happened to fail fast there.

This was a production bug for any visitor on a network where
fonts.googleapis.com is slow or filtered — corporate proxies, some regions,
bad mobile. Fixed by injecting the stylesheet after mount (`app/fonts.tsx`):
first paint and hydration run on system fonts, the brand faces swap in when
the CDN answers — which is what `display=swap` was already promising. Rule
worth keeping: **an embedded surface may never parser-block on a third-party
host.**

---

## 5. What this sets up — the path to actual Vara functionality

With channels standing, the remaining Vara slices land in this order, each
lighting up something visible in the widget:

1. **JD Studio (form-first)** — `vara_jd`/`vara_jd_version` CRUD + console
   screen. The moment a JD is published, every embedded widget starts listing
   it. Conversational composition (V-10) layers on later; the LLM path is the
   stack's shakiest part and nothing here should wait on it.
2. **Intake** — the conversation: questions generated from the JD's
   must-haves and knockouts, consent (versioned), `vara_application` +
   `vara_chat_turn` writes, artifact upload. The composer in the widget goes
   live here. Needs MSG91 ported first for the ack message (ACK-01), or ships
   with acks queued.
3. **Screening** — knockouts (deterministic) → score snapshots → the
   probability map in the console. `vara_transition` already polices the
   lifecycle; metering already fires on snapshot insert.
4. **Closing window + handover** — timers, rescue/hold/close-now, HM queue.

Standing prerequisites unchanged: MSG91 port (gates candidate comms),
`credentials_enc` encryption (gates BYOK and LLM-backed chat), domain pack
content (gates domain independence).
