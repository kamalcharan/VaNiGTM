-- ============================================================================
-- Migration 267: gt_industries becomes THE industry master
--
-- Common pool P1 (P0-mapping §2.8a; S9–S11). Approved by Charan 2026-10-01:
-- "it provides critical data infra."
--
-- Four industry lists existed and nothing joined them: the console's 10
-- onboarding choices, gt_industries (194, never seeded), the normalizer's
-- clusters (206/218) and Vara's domain packs. From here there is one.
--
-- WHAT IT ADDS
--   gt_industries.nic_prefixes  NIC-2008 code prefixes each node covers, so
--                               MCA/Udyam rows classify BY CODE, free
--   gt_industries.source        seed · nic · proposal
--   gt_industries.approved_by / approved_at
--   the seed: sectors from NIC-2008 sections/divisions, named for selling;
--   the normalizer's manufacturing sub-clusters as the first sub-segments
--   (codes 'manufacturing.<sub>', so industry_canonical/_sub map by
--   concatenation); the 10 onboarding choices as platform aliases.
--
-- NIC-2008 follows ISIC Rev.4 at the division (2-digit) level; the ranges
-- below are those divisions. VERIFY against MoSPI's published NIC-2008
-- before the P1 checkout (POA §3.2 item 7) — a wrong prefix misfiles every
-- registry row under it.
--
-- New nodes after this come only through the review queue (taxonomy_proposal,
-- S10) with an admin's approval; a model never creates one.
-- Guarded and idempotent: ON CONFLICT (code) DO NOTHING throughout.
-- ============================================================================

DO $$
BEGIN
  IF to_regclass('public.gt_industries') IS NULL OR to_regclass('public.gt_industry_aliases') IS NULL THEN
    RAISE EXCEPTION '[267] gt_industries / gt_industry_aliases missing — migration 194 first';
  END IF;
END $$;

ALTER TABLE gt_industries ADD COLUMN IF NOT EXISTS nic_prefixes TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE gt_industries ADD COLUMN IF NOT EXISTS source       VARCHAR(10) NOT NULL DEFAULT 'seed';
ALTER TABLE gt_industries ADD COLUMN IF NOT EXISTS approved_by  UUID;
ALTER TABLE gt_industries ADD COLUMN IF NOT EXISTS approved_at  TIMESTAMPTZ;

DO $$ BEGIN
  ALTER TABLE gt_industries ADD CONSTRAINT gt_industries_source_check
    CHECK (source IN ('seed', 'nic', 'proposal'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS idx_gt_industries_nic ON gt_industries USING gin (nic_prefixes);

COMMENT ON COLUMN gt_industries.nic_prefixes IS
  'NIC-2008 code prefixes this node covers. A registry row whose NIC code starts with one is classified here by code, without a model (P0 §2.8a).';

-- ── Sectors (top level) ────────────────────────────────────────────────────
INSERT INTO gt_industries (code, name, sort_order, nic_prefixes, source, approved_at) VALUES
  ('agriculture',           'Agriculture, forestry and fishing',      10, ARRAY['01','02','03'], 'seed', now()),
  ('mining',                'Mining and quarrying',                   20, ARRAY['05','06','07','08','09'], 'seed', now()),
  ('manufacturing',         'Manufacturing',                          30, ARRAY['10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','25','26','27','28','29','30','31','32','33'], 'seed', now()),
  ('utilities',             'Energy, water and waste',                40, ARRAY['35','36','37','38','39'], 'seed', now()),
  ('construction',          'Construction',                           50, ARRAY['41','42','43'], 'seed', now()),
  ('trade',                 'Wholesale, retail and e-commerce',       60, ARRAY['45','46','47'], 'seed', now()),
  ('logistics',             'Transport and logistics',                70, ARRAY['49','50','51','52','53'], 'seed', now()),
  ('hospitality',           'Hotels, restaurants and food service',   80, ARRAY['55','56'], 'seed', now()),
  ('technology',            'Technology, media and telecom',          90, ARRAY['58','59','60','61','62','63'], 'seed', now()),
  ('financial_services',    'Financial services',                    100, ARRAY['64','65','66'], 'seed', now()),
  ('real_estate',           'Real estate',                           110, ARRAY['68'], 'seed', now()),
  ('professional_services', 'Professional services',                 120, ARRAY['69','70','71','72','73','74','75'], 'seed', now()),
  ('business_support',      'Business support services',             130, ARRAY['77','78','79','80','81','82'], 'seed', now()),
  ('public_sector',         'Government and public administration',  140, ARRAY['84'], 'seed', now()),
  ('education',             'Education',                             150, ARRAY['85'], 'seed', now()),
  ('healthcare',            'Healthcare',                            160, ARRAY['86','87','88'], 'seed', now()),
  ('arts_recreation',       'Arts, sports and recreation',           170, ARRAY['90','91','92','93'], 'seed', now()),
  ('other_services',        'Other services',                        180, ARRAY['94','95','96'], 'seed', now()),
  ('other',                 'Other',                                 190, '{}',                 'seed', now())
ON CONFLICT (code) DO NOTHING;

-- ── Manufacturing sub-segments: the normalizer's clusters ──────────────────
-- Codes are 'manufacturing.' || the normalizer's sub, so gt_prospects'
-- industry_canonical / industry_sub map onto the master by concatenation.
INSERT INTO gt_industries (code, name, parent_id, sort_order, nic_prefixes, source, approved_at)
SELECT v.code, v.name, p.id, v.sort_order, v.nic, 'seed', now()
  FROM (VALUES
    ('manufacturing.pharma',       'Pharma and life sciences',           1, ARRAY['21']),
    ('manufacturing.food',         'Food, agri and beverages',           2, ARRAY['10','11','12']),
    ('manufacturing.plastics',     'Plastics, polymers and packaging',   3, ARRAY['22']),
    ('manufacturing.electrical',   'Electrical and electronics',         4, ARRAY['26','27']),
    ('manufacturing.engineering',  'Engineering, metals and machinery',  5, ARRAY['24','25','28','29','30','33']),
    ('manufacturing.chemicals',    'Chemicals, dyes and fertilisers',    6, ARRAY['20']),
    ('manufacturing.textiles',     'Textiles, apparel and leather',      7, ARRAY['13','14','15']),
    ('manufacturing.construction', 'Construction and building materials',8, ARRAY['23'])
  ) AS v(code, name, sort_order, nic)
  JOIN gt_industries p ON p.code = 'manufacturing'
ON CONFLICT (code) DO NOTHING;

-- ── The console's 10 onboarding choices, as platform aliases (S11) ─────────
-- source_id NULL = applies to any source. Existing tenants'
-- vn_tenant_profiles.industry values stay valid: they now resolve to a node.
INSERT INTO gt_industry_aliases (source_id, raw_value, industry_id, confidence, mapped_by)
SELECT NULL, v.raw, i.id, 1.000, 'human'
  FROM (VALUES
    ('Financial services',    'financial_services'),
    ('Manufacturing',         'manufacturing'),
    ('Healthcare',            'healthcare'),
    ('Retail & e-commerce',   'trade'),
    ('Technology & SaaS',     'technology'),
    ('Logistics',             'logistics'),
    ('Education',             'education'),
    ('Professional services', 'professional_services'),
    ('Real estate',           'real_estate'),
    ('Other',                 'other')
  ) AS v(raw, code)
  JOIN gt_industries i ON i.code = v.code
ON CONFLICT DO NOTHING;
