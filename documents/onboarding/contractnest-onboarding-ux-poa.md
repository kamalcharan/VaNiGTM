# ContractNest Onboarding — UX Build POA
**Version:** 1.0 | **Date:** 2026-05-09
**Owner:** Claude.ai (build) → Charan (review) → Claude Code (implement)

---

## What Gets Built

10 screen prototypes as interactive HTML files.
Each prototype is self-contained, uses the VaNi design language,
and maps 1:1 to the PRD screen specification.

---

## Screen List

| # | Screen | Persona | Pattern Used | Complexity |
|---|---|---|---|---|
| 0 | Getting Started re-entry | All | State-aware summary | Low |
| 1 | Register | All | Clean form | Low |
| 2 | Business Details | All | Clean form | Low |
| 3 | Persona Selection | All | Card grid + VaNi bubble | Medium |
| 4 | Theme Selection | All | Visual grid (fix existing) | Low |
| 5 | Industry Selection | All | Card grid + VaNi reaction | Medium |
| 6A | VaNi Consent — Seller | Seller/Both | Checklist + dark panel | High |
| 6B | VaNi Consent — Buyer | Buyer/Both | Checklist + dark panel | High |
| 7 | VaNi Working | All | Live progress + counters | High |
| 8A | Pricing Review | Seller/Both | Anchor + rate card + panel | High |
| 8B | Equipment Confirm | Buyer/Both | Checklist + registry panel | Medium |
| 9A | Done — Seller | Seller | Glassmorphic summary | Medium |
| 9B | Done — Buyer | Buyer | Glassmorphic summary | Medium |
| 9C | Done — Both | Both | Combined summary | Medium |

---

## Build Sequence

### Batch 1 — Foundation screens (Low complexity, establish design system)
Screen 1 → Screen 2 → Screen 4
- Establishes typography, spacing, card style, form patterns
- No VaNi yet — clean and focused
- **Review gate:** Design language confirmed before proceeding

### Batch 2 — VaNi introduction screens
Screen 3 → Screen 5
- First VaNi bubble appears
- Card grid pattern locked
- Persona selection interaction
- Industry selection + VaNi reaction animation
- **Review gate:** VaNi tone + card interaction confirmed

### Batch 3 — The agentic centrepiece
Screen 6A → Screen 6B → Screen 7
- The most important screens emotionally
- Checklist + dark panel layout
- Live progress animation (simulated in prototype)
- Action Island behavior
- **Review gate:** The "90 seconds" feeling confirmed

### Batch 4 — Confirmation screens
Screen 8A (both steps) → Screen 8B → Screen 9A/B/C
- Pricing anchor + extrapolation interaction
- Equipment checklist
- Done state variants
- **Review gate:** Full flow walkthrough — all 3 personas

### Batch 5 — Re-entry screen
Screen 0 — Getting Started
- Built last because it summarises all other screens
- State-aware display logic
- Resume + upgrade CTAs

---

## What You Provide Before Build Starts

1. **VaNi UI examples** — ✅ Already provided (6 HTML files)
2. **Any additional theme examples** — if you have screenshots of the 12 themes, share before Batch 1 so Screen 4 is accurate
3. **Company names for prototypes** — using "Sharma Elevators" (seller) and "City General Hospital" (buyer) unless you prefer others
4. **Feedback format** — after each batch review gate, provide:
   - What to change
   - What is approved
   - Any new constraints

---

## What Each Prototype Delivers

Each HTML file will be:
- **Interactive** — clickable flows, not static mockups
- **Annotated** — hover states show component names for Claude Code
- **Responsive to theme** — CSS variables ready for 12 theme skins
- **Self-contained** — no external dependencies except CDN fonts

What it will NOT be:
- Connected to real APIs (prototype only)
- Mobile responsive (desktop first per PRD)
- Final pixel-perfect code (that is Claude Code's job)

---

## Review Process (Step 3 in Your Approach)

After each batch:
1. Open the HTML prototype
2. Walk through as each tenant persona
3. Note: what feels wrong, what feels right, what is missing
4. Send feedback — I revise before next batch starts
5. When batch is approved → locked, Claude Code can use it

**Freeze rule:** Once a batch is frozen, no changes to those screens
unless a later screen reveals a contradiction.

---

## Handoff to Claude Code (Step 4)

When all screens are frozen, Claude Code receives:
- PRD v1.1 (functional spec)
- All 14 HTML prototypes (pixel reference)
- Component inventory (new vs reuse — from PRD §9)
- Data contracts (what each screen writes — from PRD §8)
- Settings regression checklist (from PRD §10.5)
- 4 tenant test scenarios (from PRD §10)

Claude Code's task:
1. Pre-build scan: `business_type_id` breakage check
2. Schema migrations: `m_pricing_benchmarks`, `m_facility_hierarchy_templates`
3. Skill implementation: `seedTenantOnIndustryConfirmed`
4. UI implementation: pixel-perfect match to prototypes
5. Wire Getting Started menu
6. Settings regression fixes
7. Delete old onboarding steps (after tests pass)

---

## Ready to Start

**Batch 1 can begin immediately.**
Screens 1, 2, 4 — foundation forms, design system established.

Confirm:
- Company names for prototypes (or use defaults)
- Any theme screenshots to reference for Screen 4
- Go ahead to start Batch 1?
