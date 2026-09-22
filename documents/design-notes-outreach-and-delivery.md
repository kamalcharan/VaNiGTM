# Design notes — outreach, channels and who delivers

**Date:** 2026-09-22 · **Status:** decisions recorded, nothing built yet.
**Decided by:** Charan, in conversation. Everything marked *(ruling)* is his;
everything else is the reasoning or the evidence it rests on.

Read with: `design-notes-prospect-universe.md` (the data pipeline this feeds),
`design-notes-journey-campaign.md`, and the cadence governor's own header
comment in `migrations/223_gt_cadence_governor.sql`, which is the best
explanation of the idea that exists.

---

## 0. This supersedes a standing ruling

`CLAUDE.md` → **Deliberately not being built** lists *"email sending ·
Storytelling / Campaigns / Follow-ups agents"*, and **Sending is gated**
says it happens only once the brain is good enough.

**Both are now superseded** *(ruling, 2026-09-22)*: a storytelling agent that
composes per offer and per segment, and sends across email, SMS, WhatsApp,
LinkedIn and X, is the product's differentiator and is being built.

The GATE itself survives and is strengthened, not dropped — §5 below replaces
"ICP + brand + one offer" with a harder precondition, because the original gate
was about *quality* and the new one is also about *consent*. Do not read this
section as "sending is now ungated".

---

## 1. What already exists — read this before designing anything

Four pieces are built and none of them have a console. This kept being
rediscovered, which is why it is listed first.

| Table / skill | Migration | What it already does |
|---|---|---|
| `gt_channels` | 161 | Tenant-scoped channel connections. Types `email / whatsapp / linkedin`. `config` JSONB holds the TENANT's own `smtp_host`, `from_email`, `api_key_ref`, `access_token_ref` |
| `gt_cadence_policy`, `gt_touch_reservations` | 223 | The cadence governor. `cadence-skill` has 5 functions |
| `gt_journey_stories`, `gt_content_kinds` | 225 | The story library. `story-skill` has 5 functions |
| `gt_touch_log` | 221 | One row per touch: channel, offer, outcome, `created_by` |

**The cadence governor is the strongest thing in this repo and nobody can see
it.** Its design, from the migration header:

- **Rolling window, not calendar.** *"A calendar week permits Fri, Fri, Mon,
  Mon — four touches in four days, every one of them 'two per week'."*
- **Prospective, not retrospective.** *"A governor that only reads history can
  tell you afterwards that you over-touched somebody, which is useless."* A
  planned touch RESERVES a slot; the reservation is what the next planner
  collides with.
- **Sent touches and held reservations both consume the window.** Counting only
  one of them lets either a manual send or a second agent slip past the cap.
- **Fatigue belongs to a person, not a company** — hence `gt_touch_log.contact_id`.
- Per-contact and per-account scopes, per-channel overrides, quiet days, quiet
  hours with a timezone on the policy.

`gt_content_kinds.scope` carries the other good idea: **ASSET** (not about the
recipient, reused) vs **MOVE** (about the recipient, not reused). That is
exactly the ContractNest→hospitals shape — the hospital-offer story is an
asset; the message referencing *this* hospital is a move. It is also the line
between nurture and personalised spam, and it is already in the schema.

**Nobody should design a "sequencer" or a "content calendar" without reading
these four tables first.**

---

## 2. Data: three postures, and the third is new *(ruling)*

Extends `design-notes-prospect-universe.md` §1.1, which is still correct.

| Posture | Whose contract | Where results may land | State |
|---|---|---|---|
| `upload` | nobody's — the tenant's own file | `gt_prospects` (tenant) | **Built.** `gt_source_loads`, and the ETL `501` is gone |
| `platform` connector | Vikuna's (Apollo, Clay, …) | the pool, entitlement-gated | Schema only. `gt_universe_*` exists; `gt_connectors` **does not exist** |
| `byok` connector | **the tenant's own Apollo / Clay / anything** *(ruling)* | `gt_prospects` ONLY, never the pool | Not built |

**A BYOK pull can never enter the common pool.** Two independent reasons, and
either alone is sufficient: most provider terms forbid redistribution, so data
pulled on a tenant's key is not ours to share; and rule 13 already says
research output never enters the pool. Enforce it in the schema, the way
`gt_account_briefs.prospect_id` already enforces its half — a FK to a
tenant-scoped table cannot attach to a pool row.

**The precedent to copy is `vani_llm_provider`**, not a new invention: posture
`platform | byok`, credentials encrypted per tenant via `agent-core/
secret.crypto.ts` (HKDF-derived key per tenant, AES-256-GCM, no default key),
resolved at call time. The same three rulings carry over — the platform's cap
does not apply to BYOK, usage is still recorded, and **BYOK never fails over to
Vikuna's contract**.

**Numbering drift to be aware of:** the universe design note assigns
`gt_connectors` to migration 198, but 198 is `gt_contacts_provenance`. The
table was never written. Do not trust the migration numbers in that note.

---

## 3. Identity and delivery *(ruling)*

> **The platform owns orchestration, story, cadence, consent and evidence.
> The tenant owns identity and delivery.**

One flag on the tenant decides it — not a per-channel judgement, which is what
would erode:

- **First-party tenants** — Vikuna's own products and services, which are
  tenants of the platform like any other — may send under the platform's
  identity.
- **Every other tenant: always their own identity. No exception.**

`gt_channels.config` already assumes this; the schema was right before the
question was asked.

### Why, beyond the ruling

- **Deliverability is shared fate.** On shared sending infrastructure one
  tenant's bad list burns every other tenant's reputation. The blast radius of
  one careless customer is everyone, and no amount of care on our side fixes it.
- **WhatsApp structurally forbids it.** Business-initiated messages need a
  verified WABA and per-template approval, tied to the sending business.
- **SMS registration is per-business** — DLT header and template in India,
  10DLC in the US.
- **Commercially it is the better position.** We are the brain; they keep their
  reputation. The alternative is becoming an ESP: a commodity business carrying
  someone else's compliance burden.

---

## 4. The sandbox, and where the friction actually belongs

*(ruling)* A sandbox of **10–15 sends** on a Vikuna subdomain.

Charan's objection is right and worth keeping in front of whoever builds this:
*"it will also create onboarding friction - because users rush for results."*

**The friction is in the wrong place, not the wrong amount.** Sending to
yourself needs no reputation at all. So the ladder is:

1. **Day zero, no setup.** The tenant watches the whole engine run — story
   drafted from their offer, governor reserving the slot, message rendered for
   a named prospect, the email actually arriving — **with their own inbox as
   the only recipient**. There is no deliverability risk in mailing an address
   that already consented. This is the "result" the rushing user wants: proof
   it works.
2. **The 10–15 sandbox** buys the second thing — a handful of real strangers,
   before committing to anything.
3. **Domain / WABA / DLT** sits behind the third: *now send to people who did
   not ask for it*. At that point an afternoon of DNS is obviously worth it.

Two constraints or the sandbox becomes a product:

- **Lifetime per tenant, not per day.**
- **Flagged in `gt_touch_log`**, so nobody later reads sandbox sends as real
  performance.

---

## 5. THE BLOCKER: there is no consent or suppression model

Grepped every migration and all of `backend/src`: **nothing** for opt-out,
unsubscribe, suppression, bounce or complaint.

So today an unsubscribe has nowhere to live, a hard bounce can be retried
forever, a spam complaint suppresses nothing, and no lawful basis for any send
can be demonstrated.

**The asymmetry is the tell: Vara HAS this.** `vara_consent` (migration 241) is
versioned and withdrawable, with `vara_candidate_pii` split out so a DPDP purge
drops PII and leaves scores and audit intact. GTM has no equivalent for
prospects, and GTM is the side that sends unsolicited messages.

**Nothing sends on any channel until this exists.** This replaces the old
"ICP + brand + one offer" gate; that one was about quality, this one is about
whether we are allowed to.

**Schema change request — needs Charan's approval before anything is written:**
one suppression record, all channels, append-only, carrying the address or
handle, the channel, the reason (`unsubscribed / bounced / complained /
manual / never_contact`), the source, and when. Append-only for the same reason
the audit spine is: "were we allowed to send this, on that date" must stay
answerable after the fact.

---

## 6. Automation is not one thing — it is per channel

| Channel | Delivery | Why |
|---|---|---|
| **Email** | `api` — full automation | The only channel where automated sending is unambiguously legitimate. The constraint is consent, suppression and reputation, not the protocol |
| **WhatsApp** | `api`, gated | Business-initiated messages must use a Meta-approved template on the tenant's own WABA. A reply opens a 24h session window where free-form is allowed. "Automation" = template selection + session-window awareness, not free composition |
| **SMS** | `api`, gated | Pre-cleared creative, automated send. DLT (India) / 10DLC (US), registered per business |
| **LinkedIn** | `assisted` | No public API for 1:1 personal messaging. Conversations API is partner-restricted; Sales Navigator's is enterprise-restricted. Legitimate automated surfaces are company-page posting and Message Ads (paid broadcast through the ads platform) — not sequenced 1:1 outreach |
| **X** | `assisted` | API v2 has DM and post endpoints on paid tiers, but X's automation rules prohibit bulk unsolicited DMs and the tier economics make it a poor sequencing channel. Posting and listening are the sane uses |

**Assisted means:** the agent does everything except the final click. It drafts
the move with full context, queues it, and gives a deep link to the native
compose window; a person sends from their own account.

### Browser automation is not on the table

Headless login and Puppeteer against linkedin.com violates the User Agreement's
explicit prohibition on bots and automated access, detection is active, and
**the penalty lands on the tenant's personal account** — restricted or banned —
not on Vikuna. That is a product whose downside is borne by the customer and
invisible until it is not. It also contradicts the posture Vara already ships:
rules reject, models rank, humans decide.

### The consequence that is easy to miss

**Assisted touches MUST consume cadence slots.** A rep sends a LinkedIn message
by hand, nobody logs it, the governor believes that contact is untouched and
schedules an email the same afternoon. That is a governor with one eye closed,
and over-touching is the exact thing it exists to prevent.

`gt_touch_log.created_by` already supports a human-logged touch. What is missing
is that **"mark as sent" is a required step in the assisted flow**, not a
courtesy — and that a queued move **expires and releases its reservation** if
nobody confirms, so a forgotten draft does not hold a slot forever.

### What each channel must therefore declare

`gt_channels` needs four things it does not have, plus two new types:

- `delivery` — `api | assisted`
- `identity_owner` — `tenant | platform`
- `requires_template_approval` — WhatsApp yes, SMS-India yes
- `consent_basis` — what makes it lawful to send on this channel
- and `channel_type` extended with `sms` and `x`

Also a schema change, also needs approval.

---

## 7. Sequence

1. **Consent + suppression** (§5). Before any send code exists.
2. **Channel taxonomy** (§6) — extend `gt_channels`, add `sms` and `x`.
3. **Surface the story library** — `gt_journey_stories` is built and invisible.
4. **Surface the cadence governor** — built, invisible, and the differentiator.
5. **Send, one channel, tenant-owned: email.** The only one where automated
   sending is unambiguously legitimate, so it is where the machinery gets
   proven.
6. **Assisted queue** — LinkedIn first, with the mandatory confirm and the
   expiring reservation.
7. **WhatsApp and SMS** — both need the template-approval surface, which is a
   feature in itself.

BYOK data connectors (§2) are independent of this ladder and can run in
parallel; they feed it rather than depend on it.

---

## 9. Touches and signals are two different spines

*(Charan, 2026-09-22: "touches are important — because we will ultimately try
to touch the customer-journey — we will connect with google analytics,
ad-analytics etc in future.")*

Right, and that makes `gt_touch_log` the spine of the journey rather than an
outreach log. It also means the obvious move — pour analytics events into it —
is the wrong one, for a reason that is functional and not aesthetic.

### The cadence inversion — the reason this is written down

`cadence.service.ts::claimedTouches` counts **every** `gt_touch_log` row for a
contact inside the window, and says so deliberately:

> *"Deliberately NOT filtered by opportunity or channel — the fatigue is the
> person's, and an opportunity must not be able to skip the queue by being a
> different opportunity."*

That is correct for outbound. Put a Google Analytics pageview in the same
table and **every page view consumes a cadence slot**. A prospect who reads the
pricing page three times in a week registers as three touches, and the governor
refuses to let anyone write to them.

**The most engaged prospect would be the one we go silent on.** Exactly
inverted, and it would look like the governor working.

### The distinction that holds

| | `gt_touch_log` — what WE did | signals — what THEY did / was observed |
|---|---|---|
| Direction | outbound, deliberate | inbound or third-party |
| Identity | a known person. `prospect_id NOT NULL` is RIGHT here | arrives unresolved — a GA `client_id`, a cookie, a UTM, a click id |
| Fatigue | **consumes** a cadence slot | **never** consumes one |
| Re-delivery | a send happens once | connectors re-sync; must be idempotent |
| Role | the act | the trigger and the evidence |

So: **signals inform touches; touches consume budget; both belong to the
journey.** A sequencer that fires on a timer is what every GTM tool does. One
governed by fatigue AND triggered by observed intent is the thing being built —
and it needs both tables to be that.

### Three grains, and conflating them is the trap

Assume everything is person-grain and the model breaks at connect time:

1. **Person-grain** — touches, replies, form fills, clicks on a link *we*
   minted. Attributable to a contact.
2. **Pseudonymous-grain** — GA4 events keyed to a pseudonymous id. The Data API
   returns AGGREGATED reports; event-level rows come via the BigQuery export
   and are pseudonymous by design. Google's own policy prohibits sending PII
   into Analytics, so a GA event does not arrive carrying a name.
3. **Aggregate-grain** — ad platform performance, by campaign or segment. Not
   per person, and increasingly not obtainable per person. It informs the
   STORY and the segment, never the individual's journey.

*(These are the platforms' terms as understood in 2026-09; re-verify before
building against them, not after.)*

**The reliable bridge is the link we minted ourselves.** A unique click id in
our own email makes click → visit → form-fill resolvable without touching
Google's identity model at all. Instrument the touch, not the visitor. GA then
adds shape and volume; it is not the identity source, and a design that assumes
it is will connect and return nothing useful.

### Shape, when it is built

Copy the pattern the universe already proved (§3–§6 of
`design-notes-prospect-universe.md`) rather than inventing one:

- **Immutable source rows**, keyed by the source and the source's OWN event id
  — *"sources without a stable id get a hash of the normalised row. This is
  what makes re-ingest idempotent."* Connectors re-deliver; without this every
  re-sync double-counts the journey.
- **Resolution is a SEPARATE, revisable link**, carrying method and confidence.
  Resolving at write time and overwriting the raw row is the merge-on-write
  mistake §3 already rejects: the losing value is gone and the only recovery is
  re-ingesting everything. Identity improves as you learn more — the link must
  be allowed to change while the event does not.
- **Tenant-scoped, never the pool.** It is the tenant's site, the tenant's GA
  property, the tenant's visitors. Same rule as a BYOK data pull (§2), and the
  pool is companies-only for the same DPDP/GDPR reason.
- **The governor reads touches only.** Signals feed the PLANNER — what to send
  and when — never the budget.

### What this implies for `gt_touch_log` before any of that

`contact_id` is nullable because *"every existing row predates the question and
backfilling a guess would be worse than admitting the gap"* — which is right,
and it means fatigue is only countable for rows that have it. Worth knowing
before anyone reads a cadence number as complete.

Nothing needs changing in `gt_touch_log` today. What needs NOT to happen is a
connector writing into it.

---

## 8. Still open

- **Story quality is a fabrication risk.** Rule 9d ("never fabricate brand or
  profile content") must extend to stories: a nurture story that invents a
  customer outcome is worse than a generic one, and harder to notice. What the
  storyteller may assert, and from what evidence, is not yet decided.
- **Sandbox sends and the pool.** A sandbox send is real outreach from a
  Vikuna-owned address. Whether its bounces and complaints feed our own
  reputation monitoring, and who watches it, is undecided.
- **Per-tenant vs per-agent channels.** `gt_channels` is tenant-scoped. If two
  agents both send, do they share a channel and a cadence budget? The governor
  arbitrates on the CONTACT, so the answer is probably yes and that is the
  right default — but it has not been stated.
