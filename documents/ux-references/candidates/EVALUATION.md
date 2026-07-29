# Evaluation — Runway vs Constellation

**2026-07-29.** Both candidates driven in a headless browser, not read.
No JS errors in either; every interaction lands.

---

## Verdict first

**They are not competitors. Build both, constellation first.**

- **Constellation** = *what is true and who is involved.* Space. It is the
  successor to `journey-opportunity.html`.
- **Runway** = *what happens next and when.* Time. It is what replaces
  "campaign" and "sequence" entirely.

The authorship already says so: the constellation's crumb reads
*"← the journey field"*, the runway's reads *"← the constellation"*. Three
levels, already nested: **field → account (constellation) → opportunity
plan (runway)**.

The agenda I built (`journey-cycle.html`) survives as the constellation's
`Today · 3` rail. That is a better home for it — the debts arrive with the
account around them instead of as a decontextualised queue, which is exactly
the objection raised against the agenda in the first place.

---

## What both add that my design got wrong

These are corrections, not embellishments.

### 1. Multiple opportunities per account — my model was wrong

Both show `Digital Infra Audit · considering` **and** `AMC renewal ·
expanding` **and** a proposed `ContractNest ?` on one account. Migration 222
enforces `UNIQUE (tenant_id, is_live, prospect_id)` — one journey per
company. That is wrong, and the Agents Spec §4.4 already said so: a journey
instance is *person × tenant × funnel*, several may run simultaneously, and
`SPAWNED_FROM` records the cross-sell lineage.

**Schema consequence:** `gt_journeys` needs a `funnel` / `opportunity` axis
and the unique constraint has to move. Stage is per opportunity, not per
account — the constellation's ribbon says this outright.

### 2. The cadence governor — nobody had this

*"≤2 touches per contact per week, across **all** opportunities."*

The moment one person carries two opportunities, something must arbitrate,
or the AMC nudge and the audit calculator land on R. Menon in the same week
and the account decides we are spammers. Both prototypes not only enforce it,
they **show the move**: the AMC WhatsApp was auto-shifted +2d and says so, on
the contact's own cadence strip.

This is account-level, contact-scoped, cross-opportunity. It exists in
neither my design nor the Agents Spec. It is the most important missing
mechanic in either.

### 3. Ghosts and veto windows

*"VaNi sends Thu 10:00 · veto open 41h."* Agents Spec §5.2 defines autonomy
tiers (`auto | propose | forbidden`); neither of my prototypes rendered the
`auto` tier at all — everything waited for a human. The ghost with a
countdown is what `auto` actually looks like, and it changes the product from
*propose everything* to *act within guardrails, reversibly*.

### 4. Provenance on everything

- Stage: `score 0.68 · auto` **vs** `moved by Charan`
- Date: `31-Jul · set by reply-gap rule · governor ok · quiet-hours ok`

This is rule 12 (no silent fallbacks) applied to scheduling. Every number on
screen says where it came from and who put it there.

### 5. Time travel

Constellation: a scrubber that replays the account — nodes that did not exist
yet disappear, and freshness is recomputed *as of then* (`effAge = age - T`),
so you see how fresh a fact was at the time, not now. Runway: a simulate
button that re-plans the future from a hypothetical response.

---

## Runway — the distinctive idea

> *"A drip campaign is a sequence pretending to know the future — this one
> listens."*

**The horizon rule is the strongest single idea in either file**, because it
is a *policy*, not a visualisation:

| Window | Status |
|---|---|
| Next 7 days | committed, dated, veto open |
| Day 8–20 | **branched** — exists only as gate outcomes |
| Day 20–40 | **shaped, not scheduled** |

*"A classic drip says 'day 12: email 4.' Here day 12 doesn't exist yet."*

This resolves a question the campaign-cycle design has been circling since
the start. My POA said the second touch is "a new story a human decided to
write" and left `gt_sequences` dormant — correct, but negative. The horizon
rule is the positive form: the system may commit a week ahead, branch three
weeks ahead, and shape a month ahead, and it may never promise beyond what
behaviour has earned. **Gates, not steps.**

### Weaknesses

- **Dense, and fragile below ~1200px.** The 72-day axis crushes.
- **Scales badly in gates.** Two branches read; three gates becomes a subway
  map.
- **It is one opportunity.** The AMC touch appears in an audit timeline as a
  foreign object — necessary for the governor to be visible, but conceptually
  odd.
- The day-30–40 "shaped" block is a label, not yet an interaction.

---

## Constellation — the distinctive idea

It holds the **whole account**: two opportunities, both contacts, a
cross-sell proposal, and — the subtle one — **account-level knowledge that
belongs to no opportunity**. "Third unit at Pashamylaram" is attached to the
account hub with the note *"feeds every opportunity, belongs to none."* That
is a real modelling insight my node design missed: some evidence is about the
company, not about an argument.

The `ContractNest ?` ghost hub — VaNi proposing an entirely new opportunity
from uptime praise + ₹18cr capex + expansion signals — is the most
strategically interesting element in either file. It is Agents Spec §4.4's
Expansion fork, rendered.

### Weaknesses

- **"Recency pulls inward" is not implemented.** Measured against the source:
  correlation between node age and distance-from-hub is **0.05** — no
  relationship. `gmp` at 210 days sits 272px out while `terms` at 32 days
  sits 149px in. Positions are hand-authored literals. Freshness is carried
  by colour only, and the caption promises a spatial rule the artifact does
  not keep.
- **Layout is the real engineering risk.** Hand-placed x/y works for a mockup.
  A live account with 4 opportunities and 15 nodes needs a layout algorithm,
  and keeping force-directed graphs readable is genuinely hard. This is the
  biggest build risk in either candidate.
- **`slice(0,18)` truncates mid-word** — "QA-HIRE → BATCH-R" reads as a
  rendering bug rather than a summary.
- **The ContractNest proposal is the smallest thing on the canvas**, tucked
  bottom-left. The most valuable element has the least visual weight.
- **No time axis**, so "when" is invisible until you open a panel. Which is
  precisely what the runway is for.

---

## One concern about both

Both lean hard on **intent score** (`0.68`), and the constellation moves
stages by it (`score 0.68 · auto`).

The pilot has four sends. An intent score derived from that is noise wearing
a decimal point — the same objection that made `pilot_result` withhold a
verdict below twenty concluded sends. Showing the number is fine. Letting it
**move a stage automatically** is not, until there is evidence it means
anything.

The constellation already has the right mechanism to hold this honestly: the
`score · auto` vs `moved by Charan` badge. Recommendation: **start with
`propose`, not `auto`, for stage moves** — the badge stays, the number is
visible, and the transition waits for a human until the score has earned the
autonomy. Same ladder the lesson corpus uses (`candidate → approved`).

---

## Recommended build order

1. **Constellation as the account page** — replaces `journey-opportunity.html`.
   Fix the layout to actually encode recency, or drop the claim.
2. **`Today · N` rail** absorbs the agenda.
3. **Runway as the opportunity's plan tab** — one click in from a hub.
4. **The governor** — build it early. It is a data rule (cadence per contact
   across opportunities), not a UI feature, and everything above assumes it.

### Schema work these imply, before any of it

- `gt_journeys`: add the opportunity/funnel axis; move the unique constraint;
  `spawned_from` for cross-sell lineage.
- New: cadence policy + touch reservations per contact, account-scoped.
- New: autonomy tier per (opportunity × channel), with the veto window.
- Node evidence needs `belongs_to: account | opportunity`.
