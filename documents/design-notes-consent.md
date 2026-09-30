# D9 — Consent and suppression: design for approval · 2026-09-30

> **Status: PROPOSED — partly decided (Charan, 2026-09-30, see §6).
> Nothing here is built, and no migration is written.**
> Schema changes need Charan's approval (CLAUDE.md, repo rule). §6 lists the
> decisions; each has a recommended answer. Once they are answered, the build
> is §7.
>
> Sources: `documents/spec/PLATFORM.md` E7 (P-61) and §6; `documents/spec/VARA.md`
> V-05, V-23, V-71, V-92; `documents/spec/GTM.md` G-26, G-49; `documents/design-notes-outreach-and-delivery.md` §5;
> `documents/design-notes-icp-data-structure.md` §2.5; migrations 240, 241, 242.

## 1. The problem in one paragraph

Nothing in the repo can answer "may we contact this person, on this channel,
today?". An unsubscribe has nowhere to live, a hard bounce can be retried
forever, and a spam complaint suppresses nothing. So **nothing sends on any
channel** — GTM's Activate step is locked and says so, and Vara cannot
acknowledge a candidate (E3) or send anything (E8). Vara has half of what is
needed; GTM has none of it.

## 2. What already exists (and is kept as it is)

| Object | Migration | What it is | Used by code? |
|---|---|---|---|
| `vara_consent` | 241 | Per candidate: `consent_version text`, `channel`, `granted_at`, `withdrawn_at`. Delete-protected (`consent_no_delete`); withdrawal is an UPDATE | No |
| `vara_candidate.current_consent_id`, `retention_until` | 241 | Which consent is in force; when the data expires | No |
| `vara_candidate_pii` | 241 | PII split out, so a purge deletes it and keeps the skeleton | No |
| `vara_purge_candidate()` | 242 | DPDP purge: deletes PII, artifacts and extractions, redacts chat, writes `dpdp_purge` to the audit log | No caller |
| `vani_comms_log` | 240 | Every send, with `recipient_ref` (opaque, no PII) and status incl. `opted_out`. Append-only | No |
| `vani_template` | 240 | Message templates per tenant, agent, channel and version, with an approval status | No |
| `vani_audit_log` | 240 | One audit spine, ids only, no PII. Append-only | Yes |

**Proposal: keep `vara_consent` exactly as it is.** It is the right shape for
a candidate who gives their own data to a tenant: versioned, withdrawable,
never deleted. D9 does not replace it; it adds the two things around it that
are missing.

## 3. What is missing

1. **The consent wording itself.** `vara_consent.consent_version` is a text
   field pointing at nothing. V-05 needs the tenant to *set* consent text and
   retention, with versions, and a stored consent to name the version that was
   accepted. There is no table for the text. (`vani_template` cannot hold it:
   its `channel` is limited to email/whatsapp/sms, and consent text is shown
   on the widget, not sent.)
2. **Suppression — "do not contact".** One list, all channels, for both
   agents. Nothing like it exists anywhere.
3. **One gate in code** that every send path must pass. Without a single
   choke point, the second send path someone writes will forget the check.

## 4. Proposed schema (two new tables — for approval)

Both on the platform (`vani_`) spine, because both agents use them, and both
keyed on `vani_tenant.id` (see decision D9-c for the two-tenant-id question).

### 4.1 `vani_consent_text` — what the person agreed to

```sql
create table vani_consent_text (
  id                uuid primary key default gen_random_uuid(),
  tenant_id         uuid not null references vani_tenant(id) on delete cascade,
  agent_id          uuid not null references vani_agent(id),
  version           int  not null,
  body              text not null,          -- the exact words shown
  retention_months  int  not null check (retention_months between 1 and 120),
  published_at      timestamptz not null default now(),
  published_by      uuid,                   -- vani_user
  unique (tenant_id, agent_id, version)
);
-- append-only (vani_forbid_mutation): a new wording is a new version,
-- so "what exactly did this candidate agree to" stays answerable.
```

`vara_consent.consent_version` then holds this row's `id` (as text: no change
to 241). A candidate's `retention_until` = consent date + `retention_months`.

### 4.2 `vani_suppression` — who must not be contacted

```sql
create table vani_suppression (
  id               uuid primary key default gen_random_uuid(),
  tenant_id        uuid references vani_tenant(id) on delete cascade,  -- NULL = platform-wide
  channel          text not null check (channel in
                     ('email','sms','whatsapp','call','linkedin','x','all')),
  identifier_kind  text not null check (identifier_kind in ('email','phone','profile_url','domain')),
  identifier_hash  text not null,     -- HMAC-SHA256 of the normalised address (D9-b)
  action           text not null check (action in ('suppress','lift')),
  reason           text not null check (reason in
                     ('unsubscribed','bounced','complained','manual',
                      'never_contact','consent_withdrawn','erasure','reconsented')),
  source           text not null,     -- 'unsubscribe_link','provider_webhook','stop_reply',
                                      -- 'console','vara_withdrawal','dpdp_purge',…
  actor_type       text not null check (actor_type in ('human','rule','system')),
  actor_id         uuid,
  at               timestamptz not null default now()
);
create index on vani_suppression (identifier_hash, channel);
-- append-only (vani_forbid_mutation). Current state of an address =
-- its LATEST row per (scope, channel); 'lift' exists only for D9-d.
```

Why these choices:

- **Append-only, events not flags.** "Were we allowed to send this, on that
  date?" must stay answerable after the fact. A flag that is flipped back
  cannot answer it; a sequence of events can.
- **A hash, never the address.** The suppression list must *survive* an
  erasure: after a purge we still have to remember not to contact that
  address, but we may no longer hold the address. A keyed hash lets us check
  an address we are about to use without storing it. It also keeps PII out of
  a platform-wide table.
- **`channel = 'all'`** for "never contact me" and for erasure.
- **`tenant_id NULL` = platform-wide** for facts about the address rather
  than about one relationship (D9-a).

### 4.3 RLS

The same pattern migration 235 used for platform rows:

- read: `tenant_id = vani_current_tenant() OR tenant_id IS NULL` — a tenant
  sees its own rows and the platform-wide ones;
- write: `tenant_id = vani_current_tenant()` only — no tenant can create a
  platform-wide row. Platform-wide rows are written by one `SECURITY DEFINER`
  function (provider webhooks, erasure), pinned `search_path`, like 248/259.

`vani_consent_text`: the usual `tenant_isolation` policy.

## 5. The gate, in code (no schema)

One function, the only way anything sends:

```
mayContact(tenantId, channel, identifier, purpose) →
  { allowed: true }
  | { allowed: false, reason: 'suppressed' | 'consent_withdrawn' | 'no_consent'
                               | 'retention_expired' | 'no_basis', detail }
```

It checks, in order:

1. **Suppression** — the latest row for this address on this channel or on
   `all`, at tenant scope or platform-wide. Any `suppress` without a later
   `lift` → refused.
2. **Vara candidates** — a `vara_consent` in force (`withdrawn_at` null) and
   `retention_until` not passed.
3. **GTM prospects** — the lawful basis the channel declares (D9-e). Until
   that is decided, GTM gets `no_basis` and the Activate lock stays.

Rules that come with it:

- **Rule 12 applies.** A refused contact is written to `vani_comms_log` with
  status `opted_out` and the reason, and it shows in the run. It is never
  silently skipped.
- **Assisted channels too.** LinkedIn and X are sent by a person, but the
  draft is prepared by us: the gate runs before a draft is offered, so we
  never prepare a message to someone who opted out.
- **One place, enforced by a test** that fails if any module other than the
  comms service imports a sender.

How rows get written:

| Event | Row |
|---|---|
| Unsubscribe link in an email | `suppress`, tenant scope, `unsubscribed`, that channel |
| "STOP" reply on WhatsApp or SMS | `suppress`, tenant scope, `unsubscribed`, that channel |
| Provider hard bounce | `suppress`, platform-wide, `bounced`, email |
| Provider spam complaint | `suppress`, platform-wide (D9-a), `complained`, email |
| Tenant adds someone by hand | `suppress`, tenant scope, `manual` |
| Candidate withdraws consent | `vara_consent.withdrawn_at` set + `suppress`, tenant scope, `consent_withdrawn`, `all` |
| "Delete my data" (DPDP purge) | `vara_purge_candidate()` + `suppress`, platform-wide (D9-a), `erasure`, `all` — written BEFORE the PII is deleted, because the hash needs the address |

## 6. Decisions for Charan

| # | Question | Recommended answer | Why |
|---|---|---|---|
| **D9-a** | Which suppressions apply across ALL tenants? | **Platform-wide:** hard bounce, spam complaint, erasure. **One tenant only:** unsubscribe, manual, consent withdrawn | A bounce is a fact about the address, and a complaint hurts the sending reputation every tenant shares when sending as the platform. An unsubscribe from one company's emails is not a refusal of every company |
| **D9-b** | How to store addresses | **HMAC-SHA256 with a key from `.env` (`SUPPRESSION_HASH_KEY`, no default)**, after normalising: email lowercased and trimmed, phone as E.164 digits, profile URL canonical | A plain hash of an email address can be reversed by guessing likely addresses; a keyed one cannot. Cost: the key can never change without re-hashing, and a lost key makes the list unreadable — it must be backed up with the other secrets |
| **D9-c** | Which tenant id | **`vani_tenant.id`** (the platform spine). GTM code maps its `vn_tenants.id` by slug, as `vani_current_tenant()` already does | Both agents use the tables; the platform spine is where shared things live |
| **D9-d** | Can a suppression be lifted? | **Only by an explicit new opt-in**, recorded as a `lift` row with reason `reconsented`. Bounces lifted only by a platform operator. Erasure never | An unsubscribe that can be quietly undone is not an unsubscribe |
| **D9-e** | What lawful basis does GTM outreach use? | **Needs legal advice — not decidable in code.** India's DPDP Act 2023 is built largely on consent and does not have GDPR's broad "legitimate interest" ground; a work email is still personal data. Until answered, the design keeps GTM at `no_basis` (Activate stays locked) | This is the question that decides whether cold outreach is allowed at all. The suppression list is needed whatever the answer is, so building it is not wasted |
| **D9-f** | Consent text: new table or not | **New table `vani_consent_text`** (§4.1) | `vani_template` cannot hold it (channel limited to email/whatsapp/sms); `consent_version` today points at nothing |

## 6a. Charan's answers (2026-09-30)

| # | Answer | What it changes |
|---|---|---|
| D9-a | **As recommended**: bounce, complaint and erasure are platform-wide; unsubscribe, manual and consent-withdrawn are one tenant only | — |
| D9-b | **Yes — keyed hash** (`SUPPRESSION_HASH_KEY` in .env, no default, backed up with the other secrets, never rotated casually) | — |
| D9-c | **Product-level tenant id = `vani_tenant.id`** | — |
| D9-d | **Yes — lifted by an admin or by the person themselves** | A `lift` row records who (`actor_type`, `actor_id`) and why. **Open point:** an admin undoing a person's own unsubscribe, complaint or consent withdrawal is what consent rules exist to stop; recommended split: an admin may lift `manual` and `bounced`; `unsubscribed`, `complained` and `consent_withdrawn` are lifted only by the person opting in again. Awaiting confirmation |
| D9-e | **Configurable per tenant.** When the Smart Profile is built, the tenant is shown what the DPDP Act means for outreach and ticks "I agree"; that switches GTM sending on. Settings can switch it off again | §6b |
| D9-f | Not answered yet | — |

## 6c. Suppression is per PERSON, not per company (Charan's question, 2026-09-30)

A prospect company with four people: one unsubscribes, three do not.

- A row blocks **one address on one channel** (or `all` channels for that
  person). The company is not a subject of suppression; the other three stay
  contactable.
- **One person, several addresses.** When someone says "never contact me",
  a row is written for EVERY identifier we hold for them (`gt_contact_channels`:
  work email, personal email, mobile, WhatsApp) — otherwise they would be
  reached again on the address they did not use to opt out.
- **When the company says "nobody here"** (a legal or procurement request), a
  person-level row is not enough. Proposed: one more identifier kind — the
  email **domain** — checked by the gate against every email address at that
  domain. Recorded as `manual`, tenant scope. Part of this approval.
- **Shared mailboxes** (`info@`, `sales@`) are addresses like any other: an
  unsubscribe from `info@` blocks `info@` only.

## 6b. D9-e as decided: the tenant's DPDP acknowledgement

The tenant — not Vikuna — confirms it has a lawful basis to contact the
people it imports, after being shown what DPDP requires. The platform
records that confirmation, and GTM's gate checks it.

**What it needs (schema — part of this approval):** one more append-only
table, same event pattern as suppression, so "was this tenant's
acknowledgement in force when that email went out?" stays answerable:

```sql
create table vani_tenant_acknowledgement (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references vani_tenant(id) on delete cascade,
  kind         text not null check (kind in ('gtm_outreach_dpdp')),
  action       text not null check (action in ('accept','revoke')),
  notice_id    uuid references vani_consent_text(id),  -- the exact notice shown (accept only)
  actor_id     uuid not null,                           -- the user who ticked or unticked
  at           timestamptz not null default now()
);
-- append-only; current state = latest row per (tenant, kind)
```

The notice wording is a `vani_consent_text` row (platform-authored,
versioned). **A new notice version does not silently carry an old "I agree"
forward** — the gate treats an acceptance of an older notice as still valid
only until the tenant is asked again; whether a new version forces
re-acceptance is a product choice to make when the wording first changes.

**Gate change (§5, step 3):** GTM → allowed only if the latest
`gtm_outreach_dpdp` row for the tenant is `accept`. Otherwise `no_basis`,
and the Activate step says why and links to the acknowledgement.

**Where it appears (console, vani-app):** a step at the end of the Smart
Profile onboarding, and a switch under Settings. Switching it off writes
`revoke` and locks sending immediately; nothing already sent is affected.

**Stated plainly, so nobody reads more into it:** the tick box records that
the tenant took responsibility for its lawful basis. It does not make any
particular send lawful, and the notice text should be reviewed by a lawyer
before it is shown to a real tenant. Suppression still applies on top of it
— an acknowledged tenant still cannot contact anyone who opted out.

## 7. Build order once approved

Each step is small and ends in something testable; nothing sends until step 5.

1. **Migration 260** — both tables, append-only guards, RLS (§4.3), the
   `SECURITY DEFINER` writer. Guarded and idempotent. Two-tenant RLS test
   extended to cover them (3-check: own rows / empty / other tenant → 0 rows,
   plus: platform-wide rows visible to all, writable by none).
2. **`comms/may-contact.ts`** — the gate (§5), with tests for every refusal
   reason, and the "only the comms service may send" test.
3. **Vara consent capture (V-05, F2)** — publish consent text; the widget
   shows it and stores a `vara_consent` naming the version; `retention_until`
   set. This is what unblocks candidate intake.
4. **Withdrawal and erasure (V-23)** — "delete my data" in chat calls the
   purge and writes the platform-wide erasure row first.
5. **First send path (E8)** — Vara's acknowledgement email through the gate,
   with an unsubscribe link and its public route (which goes on the public
   list in the nginx config header).
6. **GTM** — the acknowledgement step and Settings switch (§6b), then GTM
   sends pass the same gate.

Console screens (consent text editor, suppression list) are vani-app work and
follow Track H's rule for console work.

## 8. What this design deliberately does not do

- **No generic consent table for everyone.** Vara's candidates give their data
  and consent to it (`vara_consent`). GTM prospects have not; what applies to
  them is suppression plus whatever basis D9-e settles. One table pretending
  both are the same thing would hide the legal difference.
- **No address in the suppression table.** Only the keyed hash.
- **No suppression inside `gt_touch_log`.** Touches consume cadence budget;
  suppression is permission. Mixing the two is the same mistake the
  touches-and-signals note warns about.
- **No automatic lifting**, and no fallback that sends when the gate cannot
  be evaluated: a gate that errors refuses (rule 12).
