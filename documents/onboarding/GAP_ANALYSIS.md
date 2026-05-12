# KT ↔ Catalog Studio ↔ Template Agent — Gap Analysis & POA

**Date:** 2026-05-10  
**Author:** Charan Kamal Bommakanti / Claude Session  
**Purpose:** Architecture alignment document before implementation begins  
**Status:** ✅ Phase 1 — COMPLETED (tested & working, 2026-05-10)

---

## 🔁 Session Handover — Next Session Starts Here

**Phase 1 is done and merged.** All KT agent-readiness fields are live:
- `service_name` on checkpoints, `catalog_name` on service cycles, pricing on spare parts + cycles
- "Generate Service Names" + "Generate Pricing" buttons working in KT UI
- SparePartsTab, CyclesTab, CheckpointsTab all updated

**Next session starts with Phase 2 — Catalog Studio KT Linkage.**

First task: **Task 8 — DB migration on `cat_blocks`**
```sql
ALTER TABLE cat_blocks
  ADD COLUMN resource_template_id UUID REFERENCES m_resource_templates(id),
  ADD COLUMN kt_checkpoint_ids UUID[];
```

Then proceed in order: Task 9 (variant step from KT) → Task 10 (bulk block creation API) → Task 11 (global→tenant copy).

**Key context to carry forward:**
- KT median pricing → `base_price` on cat_block
- KT variant → `variant_pricing` on cat_block
- `service` blocks ← service cycles; `spare` blocks ← spare parts/consumables
- Static `currencies.ts` is the system's currency source (all hooks wrap it — confirmed)
- All MANUAL_COPY_FILES output goes under `MANUAL_COPY_FILES/kt-catalog-integration/`

---

---

## 1. Vision Summary

```
GLOBAL LAYER (Admin builds once)
─────────────────────────────────────────────────────────────
KT (Steps 1–5)              → Operational + Pricing brain
TemplateAgent               → Generates Global AMC Templates
                               (1 template per variant × duration)

TENANT LAYER (Onboarding Agent runs at signup)
─────────────────────────────────────────────────────────────
Onboarding Agent            → Reads KT → Populates Catalog Studio
                               < 5 minutes, zero manual entry
Tenant                      → Reviews, adjusts own pricing
                               Copies global AMC templates to their space
```

---

## 2. Conceptual Mapping (Agreed)

| KT Concept | Catalog Studio Concept | Notes |
|-----------|----------------------|-------|
| Variants (equipment models/capacities) | Catalog Variants / variant_pricing | 1-to-1 mapping |
| Variants (facility zones/wings) | Catalog Variants / variant_pricing | 1-to-1 mapping |
| Spare Parts | Spare Parts block (`spare`) | Always "spare" in catalog regardless of KT label |
| Consumables (facility KT) | Spare Parts block (`spare`) | Naming is KT-side cosmetic only |
| Service Cycles (PM/Repair/Inspect/Install/Decomm) | Service blocks (`service`) | Cycles = categories/groupings |
| Checkpoints (inside a cycle) | Scope of work within a service block | Not separate catalog line items |
| KT Step 5 Pricing (median) | `base_price` on cat_block | Median → default price; tenant edits |

### Block Type Relevance

| Block Type | KT Relationship |
|------------|----------------|
| `service` | ✅ Maps from KT service cycles |
| `spare` | ✅ Maps from KT spare parts / consumables |
| `text` | ❌ No KT relationship |
| `video` | ❌ No KT relationship |
| `image` | ❌ No KT relationship |
| `document` | ❌ No KT relationship |

### Resource Dependency in Catalog Studio

| Resource Dependency Type | KT Relationship |
|--------------------------|----------------|
| Independent Pricing | None |
| Resource Dependent → Team Members | None |
| Resource Dependent → Equipment | Indirectly related (equipment KT exists for template) |
| Resource Dependent → Facility | Indirectly related (facility KT exists for template) |

> **Note:** Equipment/Facility resource dependency integration deferred — will evolve separately.

---

## 3. Current State: KT (Steps 1–4)

### DB Tables & Key Fields

| Table | Current Fields | Purpose |
|-------|--------------|---------|
| `m_equipment_variants` | id, resource_template_id, name, description, capacity_range, attributes, sort_order, source, is_active | Equipment/facility variants |
| `m_equipment_spare_parts` | id, resource_template_id, component_group, name, description, specifications (JSONB), sort_order, source, is_active | Spare parts / consumables |
| `m_spare_part_variant_map` | id, spare_part_id, variant_id, is_recommended, notes | Maps parts to specific variants |
| `m_equipment_checkpoints` | id, resource_template_id, checkpoint_type, service_activity, section_name, name, description, layer, unit, normal_min/max, amber/red_threshold, threshold_note, compliance_standard, is_mandatory, source, sort_order, is_active | Inspection/task checkpoints |
| `m_checkpoint_values` | id, checkpoint_id, label, severity, triggers_part_consumption, requires_photo, sort_order | Condition checkpoint options |
| `m_checkpoint_variant_map` | id, checkpoint_id, variant_id, override_min/max/amber/red | Variant-specific threshold overrides |
| `m_service_cycles` | id, checkpoint_id, frequency_value, frequency_unit, varies_by, alert_overdue_days, source, is_active | Frequency per checkpoint |

### What Each Step Generates Today

| Step | Generates | Max Tokens |
|------|-----------|-----------|
| Step 1 | Variants (name, capacity_range, attributes) | 2,000 |
| Step 2 | Spare parts + variant map | 10,000 |
| Step 3 | Checkpoints + values (per service_activity) | 8,000 |
| Step 4 | Service cycles (frequency, varies_by) | 4,000 |

---

## 4. Current State: Catalog Studio

### cat_blocks Table

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | VARCHAR | Block display name |
| display_name | VARCHAR | Optional alternate name |
| block_type_id | UUID → `service`/`spare`/text/video/image/document | Block category |
| pricing_mode_id | UUID | independent / resource_based |
| base_price | NUMERIC | Single price value |
| currency | VARCHAR | Default: INR |
| config | JSONB | All flexible fields (see below) |
| resource_pricing | JSONB | Resource-based pricing overrides |
| variant_pricing | JSONB | Variant-specific pricing |
| tenant_id | UUID (nullable) | NULL = global block |
| is_seed | BOOLEAN | true = available to all tenants |

### config JSONB — Key Fields

```json
{
  "pricingMode": "independent | resource_based",
  "selectedResources": [{ "resource_id", "resource_type_id", "resource_name", "quantity" }],
  "pricingRecords": [{ "id", "currency", "amount", "price_type", "taxes" }]
}
```

### Notable: No KT Linkage Exists

- No `resource_template_id` on cat_blocks
- No `kt_checkpoint_ids` or scope-of-work linkage
- `variant_pricing` field exists but no wizard UI to populate from KT variants
- No bulk block creation API

---

## 5. Gap Analysis

### 5A — KT Gaps (Fields Missing for Agent Readiness)

| Gap | Location | Impact |
|-----|----------|--------|
| No `service_name` on checkpoints | `m_equipment_checkpoints` | Onboarding Agent cannot generate meaningful catalog service block names |
| No `catalog_name` on service cycles | `m_service_cycles` | No commercial name for AMC services |
| No pricing on spare parts | `m_equipment_spare_parts` | Cannot auto-price Spare Parts blocks in catalog |
| No pricing on service cycles | `m_service_cycles` | Cannot auto-price Service blocks in catalog |
| Step 3 LLM prompt doesn't generate `service_name` | `kt-checkpoints-generator.md` + `kt-facility-checkpoints-generator.md` | Missing field |
| Step 4 LLM prompt doesn't generate `catalog_name` | `kt-service-cycles-generator.md` | Missing field |
| No Step 5 (pricing generation) exists | New | No geo/currency-aware pricing available |
| KT UI form doesn't display `service_name` | `KnowledgeTreeDetail.tsx` | Admin cannot review/edit service names |

### 5B — Catalog Studio Gaps (For KT Linkage)

| Gap | Location | Impact |
|-----|----------|--------|
| No `resource_template_id` on cat_blocks | `cat_blocks` table | Cannot trace a block back to the KT it was generated from |
| No `kt_checkpoint_ids` linkage | `cat_blocks` / config | Catalog service block has no scope-of-work from KT |
| No variant step in block wizard from KT | Wizard UI | Cannot auto-populate `variant_pricing` from KT variants |
| No bulk block creation API | Edge function | Onboarding Agent needs to create 10–30 blocks at once |
| No global → tenant block copy mechanism | Edge function | TemplateAgent cannot distribute global blocks to tenants |

### 5C — Contract Templates Gap (Future / TemplateAgent)

| Gap | Impact |
|-----|--------|
| No `contract_templates` table | TemplateAgent cannot persist generated AMC templates |
| No global template copy-to-tenant flow | Tenant onboarding cannot pre-load AMC templates |
| No service cycle → contract block frequency mapping | AMC generation needs cycle frequency to compute visit counts per duration |

> **Note:** Contract templates deferred — will be built when TemplateAgent is implemented.

---

## 6. Plan of Action (POA)

### Phase 1 — Extend KT for Agent Readiness ✅ COMPLETED

#### 1.1 DB: Add Missing Columns

```sql
-- m_equipment_checkpoints
ALTER TABLE m_equipment_checkpoints ADD COLUMN service_name TEXT;

-- m_service_cycles  
ALTER TABLE m_service_cycles ADD COLUMN catalog_name TEXT;

-- m_equipment_spare_parts (pricing)
ALTER TABLE m_equipment_spare_parts 
  ADD COLUMN price_min NUMERIC,
  ADD COLUMN price_median NUMERIC,
  ADD COLUMN price_max NUMERIC,
  ADD COLUMN price_unit TEXT;  -- e.g. "per unit", "per kg", "per litre"

-- m_service_cycles (pricing)
ALTER TABLE m_service_cycles
  ADD COLUMN price_min NUMERIC,
  ADD COLUMN price_median NUMERIC,
  ADD COLUMN price_max NUMERIC,
  ADD COLUMN price_currency TEXT DEFAULT 'INR',
  ADD COLUMN price_geo TEXT DEFAULT 'IN';  -- ISO country code
```

#### 1.2 Step 3: Enhance Checkpoint LLM Output

Add `service_name` to both:
- `kt-checkpoints-generator.md`
- `kt-facility-checkpoints-generator.md`

**Rule:** Multiple checkpoints in the same section/activity share the same `service_name`.  
**Example:** All PM checkpoints in "Filter, Coils & Drainage" section → `service_name: "Monthly AC Service"`

#### 1.3 Step 4: Enhance Service Cycles LLM Output

Add `catalog_name` to:
- `kt-service-cycles-generator.md`

**Rule:** Each cycle gets a commercial-facing name derived from activity + frequency.  
**Example:** PM / 30 days → `catalog_name: "Monthly Preventive Maintenance"`

#### 1.4 Step 5: Build Pricing Generation (New)

**Trigger:** Manual button in KT UI — "Generate Pricing"  
**Currency selector:** Default INR, UI allows override  
**LLM call:** Single call with full KT context (variants + spare parts + service cycles)  
**Output:** min / median / max per spare part and per service cycle  
**Save mode:** New `'pricing'` mode in edge function — upserts pricing columns only  

**New skill file:** `kt-pricing-generator.md`

#### 1.5 KT UI: Show `service_name` in Checkpoint Form

- Add `service_name` column/field in checkpoint list view
- Inline editable (admin can override generated name)
- Group checkpoints visually by `service_name`

---

### Phase 2 — Catalog Studio: KT Linkage

#### 2.1 DB: Add KT Reference to cat_blocks

```sql
ALTER TABLE cat_blocks
  ADD COLUMN resource_template_id UUID REFERENCES m_resource_templates(id),
  ADD COLUMN kt_checkpoint_ids UUID[];  -- array of checkpoint UUIDs (scope of work)
```

#### 2.2 Catalog Studio: Variant Step from KT

- When `resource_template_id` is set on a block, wizard can offer "Load variants from KT"
- Populates `variant_pricing` from KT variants with median pricing per variant

#### 2.3 Bulk Block Creation API

- New edge function endpoint: `POST /cat-blocks/bulk`
- Accepts array of blocks — creates all in one transaction
- Required for Onboarding Agent

#### 2.4 Global → Tenant Block Copy

- New endpoint: `POST /cat-blocks/copy-to-tenant`
- Copies a global/seed block into tenant's space
- Tenant can then edit their own pricing

---

### Phase 3 — Onboarding Agent (Future)

- Reads KT (Steps 1–5) for a given resource template
- Calls `/cat-blocks/bulk` to create Service + Spare Parts blocks
- Populates `base_price` from KT median pricing
- Links `resource_template_id` on each block
- Runs in < 5 minutes for full tenant catalog setup

---

### Phase 4 — TemplateAgent + Contract Templates (Future)

- New `contract_templates` table (global, admin-managed)
- TemplateAgent: Generates AMC templates per variant × duration (6m / 1y / 2y)
- Coverage: subset of service blocks + spare parts blocks from catalog
- Pricing: computed from median × frequency × duration (slight AMC discount)
- Tenant onboarding: Copies global templates to tenant's contract wizard

---

## 7. Implementation Sequence

| # | Task | Phase | Scope | Status |
|---|------|-------|-------|--------|
| 1 | DB migrations: add `service_name`, `catalog_name`, pricing columns to KT tables | 1.1 | API/DB | ✅ Done |
| 2 | Enhance Step 3 skill prompts to generate `service_name` | 1.2 | API (skills) | ✅ Done |
| 3 | Enhance Step 4 skill prompt to generate `catalog_name` | 1.3 | API (skills) | ✅ Done |
| 4 | Update edge function save for new columns | 1.1 | Edge | ✅ Done |
| 5 | Update KnowledgeTreeGeneratorService to pass new fields | 1.2/1.3 | API | ✅ Done |
| 6 | Build Step 5: pricing skill + API endpoint + edge save | 1.4 | API + Edge | ✅ Done |
| 6A | Option A: `generate-service-names` skill + endpoint + edge patch | 1.4 | API + Edge | ✅ Done |
| 7 | KT UI: `service_name` badge, currency selector, "Generate Pricing" + "Service Names" buttons | 1.5 | UI | ✅ Done |
| 7A | SparePartsTab: grouped parts, pricing, variant chips, CRUD | 1.5 | UI | ✅ Done |
| 7B | CyclesTab: `catalog_name` badge, pricing column | 1.5 | UI | ✅ Done |
| 7C | CheckpointsTab: `service_name` amber badge + edit modal field | 1.5 | UI | ✅ Done |
| 8 | DB migration: add `resource_template_id`, `kt_checkpoint_ids` to cat_blocks | 2.1 | DB | ⏳ Next |
| 9 | Catalog Studio: variant step from KT | 2.2 | UI | ⏳ Pending |
| 10 | Bulk block creation API | 2.3 | Edge | ⏳ Pending |
| 11 | Global → tenant block copy | 2.4 | Edge | ⏳ Pending |
| 12 | Onboarding Agent | Phase 3 | Agent | ⏳ Pending |
| 13 | contract_templates table + TemplateAgent | Phase 4 | Agent + DB | ⏳ Pending |

---

## 8. Key Business Rules (Locked)

1. **Spare Parts naming**: "Spare Parts" in equipment KT, "Consumables" in facility KT — both map to `spare` block type in catalog. Naming is KT-side only.
2. **Pricing**: Always min / median / max. Median → auto-populated into catalog. Tenant edits their own price.
3. **Pricing is geo + currency aware**: Default India / INR. UI allows override before Step 5 generation.
4. **service_name groups checkpoints**: Multiple checkpoints share a `service_name` — they are the scope, not the service itself.
5. **Global templates**: Admin creates once, tenants copy and customize. Pricing in templates is median-based.
6. **AMC template per variant**: Each KT variant (100TR, 200TR etc.) gets its own AMC template set.
7. **Onboarding target**: < 5 minutes from signup to usable catalog. Zero manual data entry.
