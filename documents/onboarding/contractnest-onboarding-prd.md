# ContractNest — Onboarding Redesign PRD
**Version:** 1.3
**Date:** 2026-05-09
**Status:** Draft — Pending Review
**Scope:** Onboarding flow only. Contract management is out of scope.

---

## 1. Overview

### Problem Statement
The current ContractNest onboarding is a traditional 11-step configuration wizard. It treats the new tenant as someone who needs to configure software rather than someone entering their industry domain. The result: tenants complete onboarding but arrive at an empty product — empty catalog, empty asset registry, empty facility hierarchy.

The deeper problem: the data layer, KT coverage, industry mapping, and ServiceCatalogSection.tsx already work correctly. The product was built inside-out — everything was put into settings pages as read-only browse, with a "coming soon" banner where the action should be. This PRD moves the action to the right moment.

### The Goal
A tenant completes onboarding and is **immediately productive** — catalog pre-seeded, assets configured, pricing set — in under 15 minutes. VaNi acts as a visible, working agent throughout. The human confirms decisions, never fills blank forms.

After onboarding the tenant lands in **TEST environment** with sample contacts already seeded, ready to create their first practice contract immediately.

### The Mental Model Shift
```
BEFORE:  "Welcome. Please configure your software."
AFTER:   "Welcome. I'm VaNi. I'll set everything up.
          Then try it in test mode — no real client needed."
```

### Success Metrics
- Lifts & Elevators seller: first TEST contract created within 15 minutes of registration
- Hospital buyer: ready to receive first contract within 10 minutes of registration
- Dual persona: fully operational within 20 minutes

---

## 2. Scope

### In Scope
- Full onboarding redesign: seller, buyer, and dual persona paths
- VaNi introduction immediately post-registration (Screen 1.5)
- Theme selection (fix existing dummy implementation)
- VaNi-driven catalog seeding — LIVE and TEST environments
- VaNi-driven asset + facility registry seeding (buyer path)
- Sample contact seeding in TEST environment (Claude Code generates seed data)
- Pricing review with market benchmarks (seller path)
- Equipment confirmation screen (buyer path)
- "Try it in test mode →" CTA on done screen — active, not placeholder
- ETL upload entry point placeholder (UI only — skill built in V2)
- `business_type_id` extension to support 'both' (dual persona)
- `seedTenantOnIndustryConfirmed` skill with `initial` + `incremental` modes
- Getting Started menu — state-aware re-entry point
- Settings pages regression (Claude Code task — exit criteria)

### Out of Scope
- Contract creation flow (next PRD)
- ETL skill implementation (V2)
- Industry change by tenant (admin-only, future feature)
- Multi-industry per tenant (future — schema must not block it)
- GeoIntelligence / service area definition (future layer)
- TEST environment UI design (Claude Code uses existing product patterns)
- Post-onboarding dashboard redesign
- Billing / subscription management
- BBB integration
- Technician management
- Mobile responsive (desktop first)
- Multi-language

---

## 3. Personas

### 3.1 Pure Seller
**Who:** Lifts & Elevators company, HVAC company, any service provider
**Goal:** Set up service catalog, define pricing, create contracts for clients
**Onboarding outcome:** Catalog seeded in LIVE + TEST, sample contacts seeded in TEST, ready to create first test contract

### 3.2 Pure Buyer
**Who:** RWA, Hospital (buying services), Commercial building facility manager
**Goal:** Register assets, receive contracts from vendors, manage service SLAs
**Onboarding outcome:** Equipment registry seeded, facility hierarchy configured, sample seller contacts seeded in TEST

### 3.3 Dual Persona (Buyer + Seller)
**Who:** Hospital (buys lift AMC AND sells healthcare packages), Hotel chain, Large corporate
**Goal:** Both of the above simultaneously
**Onboarding outcome:** Complete setup for both sides + full TEST environment ready

---

## 4. Industry Rules

### 4.1 Current Behavior (This PRD)
- Industry selection happens **once** during onboarding
- Cannot be changed by tenant after it is set
- Change requires **admin intervention**
- No UI affordance for self-service industry change

### 4.2 Settings Display
- `/settings/business-profile` → Industries tab → "Your Industry" section
- Industry shown as **read-only** with lock icon
- Copy: *"Contact support to change your industry"*

### 4.3 Served Industries — Editable by Tenant
- Served industries remain editable at any time
- Adding a new served industry → triggers `seedTenantOnIndustryConfirmed` in `incremental` mode
- Removing a served industry → no data removed (non-destructive)

### 4.4 Future Multi-Industry (Out of Scope — Must Not Block)
- Future: `t_tenant_industries` junction table replaces single `industry_id`
- Current schema does not block this

---

## 5. Invocation Points

### 5.1 Entry Point 1 — Post Registration (First Time)
```
Register
  ↓
Screen 1.5: VaNi Introduction
  ↓
Onboarding flow (Screens 2–9)
  ↓
onboardingController.completeOnboarding()
  ↓
seedTenantOnIndustryConfirmed(mode: 'initial')
  → seeds LIVE environment
  → seeds TEST environment
  → seeds sample contacts in TEST only
  → auto-switches tenant to TEST environment
```

### 5.2 Entry Point 2 — Getting Started Menu (Later / Incremental)

| Tenant State | Getting Started Shows |
|---|---|
| Onboarding never completed | Resume from last completed step |
| Seller — pricing incomplete | Jump to Screen 8A |
| Buyer — assets not confirmed | Jump to Screen 8B |
| Seller wanting to add buyer | Persona upgrade flow |
| Buyer wanting to add seller | Persona upgrade flow |
| New served industry added | VaNi consent → incremental seed |
| Everything complete | Summary dashboard only |

### 5.3 Incremental Seed Rules
- Check what exists before inserting
- Only create missing items
- Never duplicate, never remove
- Seeds both LIVE and TEST in incremental mode too

---

## 6. TEST vs LIVE Environment

### 6.1 Existing Infrastructure
ContractNest already has a TEST/LIVE switch. This PRD does not redesign it.

### 6.2 What Onboarding Seeds
```
LIVE environment:
  → Catalog blocks (m_cat_blocks with tenant_id)
  → Contract templates (t_cat_templates)
  → Asset registry placeholders (buyer path)
  → Facility hierarchy (buyer path)
  → Pricing (after Screen 8A)

TEST environment (sandboxed):
  → Mirror of LIVE catalog blocks
  → Mirror of LIVE contract templates
  → Sample contacts (5 per contact type)
  → Sample contract draft (one pre-built)
  → Asset registry placeholders (buyer path)
```

### 6.3 Post-Onboarding State
```
Onboarding completes
  ↓
System auto-switches to TEST environment
  ↓
Done screen (Screen 9) shows:
  "Try it in test mode →"
  "5 sample clients ready · switch to live anytime"
```

### 6.4 TEST Environment UI
Claude Code designs TEST environment indicator using existing product patterns.
No new UX designed in this PRD.

---

## 7. Sample Contact Seed Data

### 7.1 Spec
Claude Code generates seed data. 5 contacts per contact type per industry.

**Contact schema:**
```typescript
interface SampleContact {
  name: string              // realistic Indian company/person name
  contact_person: string    // realistic Indian name
  email: string             // sample@domain.com
  phone: string             // +91 format
  address: string           // realistic Indian address
  city: string
  industry_segment: string  // RWA | Commercial | Healthcare | Govt | IT
  is_test: true             // TEST env only
  is_seed: true             // VaNi-generated marker
  tenant_id: string         // scoped to tenant
}
```

### 7.2 Industries and Contact Types

**Lifts & Elevators — 5 contacts per type:**
- RWA (Residential Welfare Association)
- Commercial Building / IT Park
- Hospital / Healthcare Facility
- Government / Public Infrastructure
- Shopping Mall / Retail

**HVAC & Cooling — 5 contacts per type:**
- Corporate Office
- Hotel / Hospitality
- Hospital / Healthcare
- Industrial / Manufacturing
- Data Center / IT

**Healthcare — 5 contacts per type:**
- Corporate Employer (buys health packages)
- Insurance Company
- Independent Clinic
- Government Hospital
- Diagnostic Chain

**Facility Management — 5 contacts per type:**
- Residential Complex
- Commercial Tower
- Industrial Estate
- Government Building
- Educational Institution

**Other industries:** Claude Code to generate appropriate contact types based on industry served segments.

### 7.3 Naming Convention
- Company names: realistic Indian names (not "Sample Company 1")
- Hyderabad-first, with mix of other cities
- Contact persons: realistic Indian names
- Emails: firstname.lastname@companyname.com format
- Phones: valid +91 format

---

## 8. The Core Skill

### seedTenantOnIndustryConfirmed

**Triggers:**
- `onboardingController.completeOnboarding()` — mode: 'initial'
- `servedIndustriesController.addIndustries()` — mode: 'incremental'
- Getting Started persona upgrade — mode: 'incremental'

**Idempotency:** `t_idempotency_keys`
**Execution:** Async — does not block response
**Progress:** Emits progress events consumed by Screen 7

```typescript
interface SeedTenantInput {
  tenantId: string
  businessTypeId: 'buyer' | 'seller' | 'both'
  industryId: string
  servedIndustryIds: string[]
  region: string
  currency: string                      // default 'INR'
  mode: 'initial' | 'incremental'
}

interface SeedTenantOutput {
  // LIVE environment
  liveEnv: {
    blocksCreated: number
    blocksAlreadyExisted: number
    templatesCreated: number
    pricingPending: number
    equipmentPlaceholders: number       // buyer path
    facilityNodesCreated: number        // buyer path
  }

  // TEST environment
  testEnv: {
    blocksCreated: number               // mirror of live
    templatesCreated: number            // mirror of live
    contactsSeeded: number              // sample contacts
    contractDraftReady: boolean         // sample draft created
    equipmentPlaceholders: number       // buyer path
  }

  // Shared
  ktGenerated: boolean
  complianceStandardsApplied: number
  mode: 'initial' | 'incremental'
  status: 'seeded' | 'partial' | 'failed'
  errors: string[]
}
```

**Internal Steps:**
```
SELLER PATH:
  1. Resolve resource templates for industry
  2. Generate KT if missing (knowledgeTreeGeneratorService)
  3. Insert m_cat_blocks — LIVE env
  4. Insert m_cat_blocks — TEST env (mirror)
  5. Create t_cat_templates — both envs
  6. Seed sample contacts — TEST env only
  7. Create sample contract draft — TEST env only

BUYER PATH:
  1. Resolve resource templates
  2. Insert t_client_asset_registry placeholders — LIVE
  3. Insert t_client_asset_registry placeholders — TEST
  4. Seed facility hierarchy — both envs
  5. Seed sample seller contacts — TEST env only

BOTH PATH: seller path + buyer path sequentially

ALL PATHS:
  → Emit progress events
  → Use t_idempotency_keys
  → On completion: auto-switch tenant to TEST environment
```

---

## 9. Screen-by-Screen Specification

### VaNi Design Language
- **Font:** Outfit (headings/UI) + IBM Plex Mono (stats, codes)
- **VaNi accent:** `#ff6b2b` (orange)
- **Background:** `#f7f5f2` warm off-white
- **VaNi bubble:** White card, `border-radius: 3px 14px 14px 14px`, V avatar 36×36px
- **Action Island:** Fixed bottom center, `#0F172A 94%` opacity, backdrop-blur
- **Theme:** All screens from Step 4 onward render in chosen theme

### VaNi Voice Rules — Locked
| Screen | VaNi Presence | What VaNi Says |
|---|---|---|
| 1 Register | **Absent** | — |
| 1.5 VaNi Intro | **Full intro — once only** | "Hi [Name]. I'm VaNi. I'll be setting up [Company] — you won't configure anything from scratch. Takes about 10 minutes." |
| 2 Business Details | Minimal | "I've pre-filled what I know. Add your GST and address to continue." |
| 3 Persona | One line | "How does [Company] operate?" |
| 4 Theme | **Absent** | — |
| 5 Industry | Reacts to selection | "[Industry] serving [segments]. I know this domain well." |
| 6 Consent | Shows work plan | "Here's what I'm setting up. You'll only need to set your prices after." |
| 7 Working | Narrates live | "Creating [specific item]..." |
| 8A Pricing | Guides action | "One thing left — your prices. Start with your most common service." |
| 8B Equipment | Guides action | "I've created placeholders. Edit names to match what you actually have." |
| 9 Done | Signs off + TEST context | "Try it in test mode — 5 sample clients are ready." |

---

### Screen 0 — Getting Started (Re-entry)
**Pattern:** State-aware summary
**Trigger:** "Getting Started" menu item

```
  ✓  Business details        complete
  ✓  Industry                Lifts & Elevators
  ✓  Service catalog         12 blocks
  ⚠  Pricing                 4 of 12 set      → [Resume]
  ○  Buyer setup             not started      → [Add]
```

---

### Screen 1 — Register
Clean form. VaNi absent.
Fields: Company name, your name, work email, phone, city, password
Exit: → Screen 1.5

---

### Screen 1.5 — VaNi Introduction
Pattern: Deep space dark, morphing orb, glassmorphic card
VaNi: "Hi [Name]. I'm VaNi. I'll be setting up [Company] — you won't configure anything from scratch. Takes about 10 minutes."
CTA: [Let's go →]

---

### Screen 2 — Business Details
VaNi (minimal): "I've pre-filled what I know. Add your GST and address to continue."
Fields: From existing `BusinessBasicStep.tsx`, `BusinessBrandingStep.tsx`, `BusinessPreferencesStep.tsx`
No city / service area fields (GeoIntelligence future)

---

### Screen 3 — Persona Selection
VaNi: "How does [Company] operate?"
Cards: Service Provider (Seller) | Asset Owner (Buyer) | Both
VaNi reacts after selection.

---

### Screen 4 — Theme Selection
VaNi absent. Fix `ThemeSelectionStep.tsx:32` dummy.
Use actual product theme names and colors.

---

### Screen 5 — Industry Selection
Two-column: industry grid left, VaNi intelligence panel right.
VaNi reacts to every selection.
Action Island: "VaNi, set this up →"

---

### Screen 6 — VaNi Consent
Checklist left + dark stats panel right.
SELLER: 12 blocks, 3 templates, 4 equipment types
BUYER: 12 asset types, facility hierarchy, compliance standards
BOTH: combined

---

### Screen 7 — VaNi Working
Live progress. No input needed.
Shows LIVE and TEST environment seeding.
Right panel: block counter animates.
On completion → auto-advance.

---

### Screen 8A — Pricing Review (SELLER)
Step 1: Anchor price input + benchmark bar
Step 2: Full rate card, VaNi extrapolated
Multi-currency add
[Skip for now] → Getting Started shows ⚠

---

### Screen 8B — Equipment Confirm (BUYER)
VaNi-seeded placeholder list
Checkbox confirm + edit name per row
[Skip for now] → Getting Started shows ⚠

---

### Screen 9 — Done (all personas)
Pattern: Dark glassmorphic success card

**SELLER:**
```
  ✓ Service catalog      12 blocks
  ✓ Contract templates    3 ready
  ✓ Pricing              INR set
  ✓ Test environment     5 sample clients ready

  VaNi: "Try it in test mode —
          5 sample clients are ready to go."

  [Try it in test mode →]        ← ACTIVE, TEST env
  "Switch to live anytime from the header"

  ─────────────────────────────
  Already have a rate card or client list?
  [↑ Upload & Import]  ← UI only, V2
```

**BUYER:**
```
  ✓ Equipment registry    8 assets
  ✓ Facility hierarchy    configured
  ✓ Compliance standards  4 active
  ✓ Test environment     5 sample vendors ready

  Your code: CN-HOSP-4821  [Copy] [WhatsApp]

  [Try it in test mode →]        ← ACTIVE, TEST env
  [↑ Upload equipment list]  ← UI only, V2
```

**BOTH:** Seller + buyer stacked, both TEST CTAs.

---

## 10. Existing Code — Reuse vs Replace

| Component | Action | File |
|---|---|---|
| `RegisterPage.tsx` | Reuse | existing |
| Business details fields | Reuse definitions | `BusinessBasicStep.tsx`, `BusinessBrandingStep.tsx`, `BusinessPreferencesStep.tsx` |
| `ThemeSelectionStep.tsx` | **Fix** dummy `:32` | existing |
| Industry selection | Reuse base, enhance | `ServedIndustriesStep.tsx` |
| `onboardingController.completeOnboarding` | **Extend** — add skill call + TEST switch | `:405-451` |
| `useResourceTemplatesBrowser` | Reuse | existing |
| `useKnowledgeTreeCoverage` | Reuse | existing |
| `knowledgeTreeGeneratorService` | Reuse inside skill | `:1-137` |
| TEST/LIVE switch | Reuse existing — auto-switch on complete | existing |
| Industry display in settings | **Make read-only** + lock icon | `ServedIndustriesSection.tsx:910-995` |
| "Coming soon" banner | **Replace** with seeded state | `ServiceCatalogSection.tsx:446-448` |
| Old onboarding steps | **Delete** after tests pass | `pages/onboarding/steps/*` |
| `MasterDataStep.tsx` | **Delete** | existing |
| City / service area fields | **Remove** | any onboarding location fields |

---

## 11. Exit Criteria — 4 Tenant Scenarios

### Scenario 1: Pure Seller — Lifts & Elevators
**Tenant:** Sharma Elevators Pvt Ltd | Seller | L&E | Serves: Residential, Commercial

| Criterion | Pass Condition |
|---|---|
| VaNi intro shown | Screen 1.5 appears after registration |
| Onboarding completes | `t_onboarding.is_completed = true` |
| Persona saved | `business_type_id = 'seller'` |
| Industry locked | `industry_id` set, no edit in settings |
| LIVE catalog seeded | `m_cat_blocks` ≥ 8 rows, LIVE env |
| TEST catalog seeded | `m_cat_blocks` ≥ 8 rows, TEST env |
| Sample contacts seeded | ≥ 5 contacts in TEST env |
| Templates created | `t_cat_templates` ≥ 2 rows |
| Pricing set | All blocks `base_price IS NOT NULL` |
| Theme persisted | User theme in DB |
| Auto-switched to TEST | Tenant lands in TEST env post-onboarding |
| Done screen CTA | "Try it in test mode →" active |
| Time | ≤ 15 minutes |
| Settings regression | See §11.5 |

### Scenario 2: Pure Buyer — Hospital
**Tenant:** City General Hospital | Buyer | Healthcare

| Criterion | Pass Condition |
|---|---|
| VaNi intro shown | Screen 1.5 appears |
| Onboarding completes | `t_onboarding.is_completed = true` |
| Persona saved | `business_type_id = 'buyer'` |
| LIVE equipment seeded | `t_client_asset_registry` ≥ 6 rows, LIVE |
| TEST equipment seeded | `t_client_asset_registry` ≥ 6 rows, TEST |
| Sample vendor contacts | ≥ 5 vendor contacts in TEST |
| Facility hierarchy | ≥ 1 facility node |
| Compliance active | NABH/AERB visible |
| Auto-switched to TEST | Tenant lands in TEST post-onboarding |
| Done screen CTA | "Try it in test mode →" active |
| Time | ≤ 10 minutes |
| Settings regression | See §11.5 |

### Scenario 3: Dual Persona — Hospital with own packages
**Tenant:** Apollo Medical Services | Both | Healthcare

| Criterion | Pass Condition |
|---|---|
| Persona saved | `business_type_id = 'both'` |
| LIVE catalog seeded | Seller-side blocks |
| TEST catalog seeded | Seller-side mirror |
| LIVE equipment seeded | Buyer-side registry |
| TEST equipment seeded | Buyer-side mirror |
| Sample contacts seeded | Both buyer + seller contacts in TEST |
| Pricing set | Seller-side complete |
| Perspective switch | Revenue/Expense toggle works |
| Time | ≤ 20 minutes |
| Settings regression | See §11.5 |

### Scenario 4: Pure Seller — HVAC
**Tenant:** CoolAir Services | Seller | HVAC | Serves: Commercial, Industrial

| Criterion | Pass Condition |
|---|---|
| HVAC blocks seeded | HVAC variants, not L&E |
| TEST sample contacts | HVAC-appropriate contacts in TEST |
| Pricing benchmarks | HVAC rates shown in 8A |
| Isolation | No L&E blocks in this tenant |
| Time | ≤ 15 minutes |
| Settings regression | See §11.5 |

### 11.5 Settings Regression — All Scenarios (Claude Code task)

| Settings Page | Verify |
|---|---|
| `/settings/business-profile` Overview | Loads without error |
| `/settings/business-profile` Industries | `industry_id` read-only + lock icon; served industries editable |
| `/settings/business-profile` Service Catalog | Seeded blocks visible, no "coming soon" banner |
| `/settings/business-profile` Persona | Correct persona; 'both' renders without error |
| Equipment Registry | Seeded placeholders editable |
| Entity Registry | Facility hierarchy visible and editable |
| Catalog Studio | Seeded blocks visible, pricing editable |
| Served industries change | Adding new industry → incremental seed fires (LIVE + TEST) |
| TEST/LIVE switch | Switching environments works post-onboarding |
| Getting Started menu | Correct completion state per scenario |

---

## 12. VaNi Interaction Rules
1. VaNi introduces itself **once** — Screen 1.5 only
2. One bubble per screen, never repeated
3. Never asks questions — reacts and confirms
4. Narrates progress during Screen 7
5. Never shows failures — always "needs your input"
6. Absent on Screens 1 and 4

---

## 13. Open Questions

| # | Question | Recommendation |
|---|---|---|
| 1 | KT generation latency for first tenant? | Pre-seed L&E + HVAC before launch |
| 2 | Pricing benchmarks authoring | Manual — Charan + domain research |
| 3 | Facility hierarchy authoring | Manual — migration seed file |
| 4 | 'both' breakage scan | Claude Code pre-build task |
| 5 | Sample contact seed data | Claude Code generates — 5 per type per industry |

---

## 14. Out of Scope
- Contract creation flow → next PRD
- ETL skill → V2
- Industry change by tenant → admin-only
- Multi-industry per tenant → future
- GeoIntelligence → future
- TEST environment UI design → Claude Code uses existing patterns
- Post-onboarding dashboard
- Billing / BBB / Technician / Mobile / Multi-language

---

*End of PRD v1.3*
*Changes from v1.2:*
*— TEST + LIVE environment seeding added to skill*
*— Sample contact seeding: 5 per type per industry, Claude Code generates*
*— Done screen CTA: "Try it in test mode →" — active, not placeholder*
*— Auto-switch to TEST on onboarding complete*
*— TEST environment UI: Claude Code uses existing product patterns*
*— Exit criteria updated for LIVE + TEST seeding verification*
