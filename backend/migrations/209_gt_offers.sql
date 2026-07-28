-- ============================================================
-- Migration: 209_gt_offers.sql
-- Purpose:   What a tenant sells — editable in the app, not in a JSON file
--            on a developer's disk.
--
-- Plan: documents/POA-manufacturing-pilot.md, Step 2.
--
-- ── WHY THIS MOVED OUT OF A FILE ──────────────────────────────────────
--
-- config/offers/<slug>.json was the right shape while the wording was being
-- drafted, and the wrong place the moment a human had to fill it in: asking
-- someone to hand-edit JSON on the server to describe their own business is
-- not a product. Same content, same validation, now a table with a screen.
--
-- ── WHY signals AND disqualifiers ARE NOT OPTIONAL ────────────────────
--
-- `signals` is what the fit stage matches a crawled website against, and
-- `disqualifiers` is the only reason the model ever says "do not contact".
-- Without them fit scoring degenerates into always saying yes. Both are
-- validated in the application layer (offer-catalogue.ts) rather than by a
-- CHECK, so the error can name every gap at once instead of failing on the
-- first — but they are NOT NULL here so a row cannot exist without them.
--
-- price_band and proof are NULLABLE on purpose: a tenant creates the offer,
-- then fills those in. is_ready is the derived answer to "can this be scored
-- against", and the research agent refuses to run until every offer says yes.
-- ============================================================

DO $$
DECLARE missing TEXT;
BEGIN
    SELECT string_agg(t, ', ') INTO missing
    FROM   unnest(ARRAY['vn_tenants']) AS t
    WHERE  to_regclass('public.' || t) IS NULL;

    IF missing IS NOT NULL THEN
        RAISE EXCEPTION 'Missing prerequisite table(s): %.', missing;
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS gt_offers (
    id            BIGSERIAL    PRIMARY KEY,
    tenant_id     UUID         NOT NULL REFERENCES vn_tenants(id) ON DELETE CASCADE,

    -- Stable key the fit stage returns and gt_account_briefs stores. Not the
    -- PK, because it appears in prompts and in JSON, and a readable id is
    -- what makes an invented one obvious.
    offer_key     VARCHAR(60)  NOT NULL,
    name          VARCHAR(120) NOT NULL,

    one_line      TEXT         NOT NULL,
    who_for       TEXT         NOT NULL,
    problem       TEXT         NOT NULL,
    what_we_do    TEXT[]       NOT NULL DEFAULT '{}',

    -- What in a crawled site indicates this fits.
    signals       TEXT[]       NOT NULL DEFAULT '{}',
    -- When NOT to pitch it. "No fit" is only reachable because of these.
    disqualifiers TEXT[]       NOT NULL DEFAULT '{}',

    price_band    TEXT,
    proof         TEXT,

    is_active     BOOLEAN      NOT NULL DEFAULT true,
    sort_order    SMALLINT     NOT NULL DEFAULT 0,

    created_by    UUID,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_gt_offers_key
    ON gt_offers(tenant_id, offer_key);

CREATE INDEX IF NOT EXISTS idx_gt_offers_tenant
    ON gt_offers(tenant_id) WHERE is_active = true;

ALTER TABLE gt_offers ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
    CREATE POLICY gt_offers_tenant_isolation ON gt_offers
        USING (tenant_id = current_setting('app.current_tenant_id', true)::uuid);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column')
       AND NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_gt_offers_updated_at') THEN
        CREATE TRIGGER trg_gt_offers_updated_at
            BEFORE UPDATE ON gt_offers
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;

COMMENT ON TABLE  gt_offers IS 'What a tenant sells, in the shape the fit-scoring stage needs. price_band and proof are nullable until a human fills them; the research agent refuses to run until they are set.';
COMMENT ON COLUMN gt_offers.signals IS 'What in a crawled website indicates this offer fits. The fit stage matches against these.';
COMMENT ON COLUMN gt_offers.disqualifiers IS 'When NOT to pitch this. Without these the model always finds a reason to say yes.';

-- ── SEED: the three Vikuna offers, for the manufacturing pilot ────────
--
-- The drafted wording from config/offers/vikuna.json, which was written from
-- the offer names alone and needs correcting in the app. price_band and
-- proof are deliberately left NULL — they are facts about the business that
-- cannot be invented, and they end up in front of a real prospect.
--
-- Seeded for every ADMIN tenant, because that is who ran the pilot import.
-- Guarded per tenant per key, so a re-run never duplicates and never
-- overwrites wording a human has since fixed.

INSERT INTO gt_offers (tenant_id, offer_key, name, one_line, who_for, problem,
                       what_we_do, signals, disqualifiers, sort_order)
SELECT t.id, v.offer_key, v.name, v.one_line, v.who_for, v.problem,
       v.what_we_do, v.signals, v.disqualifiers, v.sort_order
FROM   vn_tenants t
CROSS  JOIN (VALUES
    ('cdo-as-a-service', 'CDO as a Service', 'A fractional Chief Data Officer for pharma manufacturers whose data is trapped in plant systems, spreadsheets and regulatory filings.', 'Mid-size pharma / bulk-drug manufacturers, roughly 100-1000 staff, multiple plants or export markets, with an IT function but no data leadership.',
     'Batch records, QC results, ERP and regulatory submissions all live in separate systems. Nobody owns the definition of a number, so every audit, every customer qualification and every management report is rebuilt by hand.', ARRAY['Data ownership model and a single definition layer across plant, quality and commercial systems','Regulatory and customer-audit reporting that assembles itself instead of being rebuilt','A roadmap the existing IT team can execute, with us accountable for the outcome']::text[], ARRAY['More than one manufacturing site or unit listed','Exports, or US/EU regulatory approvals mentioned (FDA, EDQM, WHO-GMP, CEP, DMF)','Quality / compliance / accreditation pages with named certifications','Careers page hiring IT, MIS, ERP or QA roles but no data or analytics leadership','ERP named on the site (SAP, Oracle, Tally) without any analytics layer']::text[], ARRAY['Single small unit, no exports, no named certifications','Trading or distribution only — no manufacturing of their own','Already advertises a data or analytics leadership function']::text[], 0),
    ('caio-as-a-service', 'CAIO as a Service', 'A fractional Chief AI Officer for manufacturers with an AI mandate from the board and nobody qualified to own it.', 'Pharma manufacturers where leadership has committed to ''doing AI'' but has no in-house AI capability and is being sold point tools by vendors.',
     'AI arrives as disconnected vendor pilots — a chatbot here, a vision system there — none of them owned, measured or connected to a P&L line. Spend accumulates and nothing reaches production.', ARRAY['An AI portfolio tied to business outcomes, not tools, with a kill rule for each pilot','Vendor and build/buy decisions made by someone with no stake in the sale','Governance the regulator will accept: model provenance, validation, audit trail']::text[], ARRAY['Public statements about digital transformation, Industry 4.0 or AI adoption','Recent funding, expansion or a new plant — budget and a change mandate','A named CIO/CTO/Head of Digital but no AI or data science leadership','Existing automation vendors visible on the site or in press coverage']::text[], ARRAY['No digital signal anywhere on the site','Under ~100 staff — the mandate and the budget will not be there','Already has a named AI or data science leader']::text[], 1),
    ('ai-automations', 'AI Automations', 'Automating the document and approval load that pharma manufacturing runs on — batch records, CoAs, dossiers, customer qualifications.', 'Pharma manufacturers whose staff spend their days moving documents: QA, regulatory affairs, export documentation, customer qualification packs.',
     'Every batch, every shipment and every customer qualification generates a pack of documents that a person assembles, checks and chases. It scales with volume, it does not scale with headcount, and mistakes are expensive.', ARRAY['Automated assembly and checking of batch records, CoAs and regulatory dossiers','Customer qualification and audit-response packs generated from existing systems','Human approval kept in the loop where the regulator requires it']::text[], ARRAY['Wide product catalogue or many SKUs — document load scales with it','Export markets, which multiply documentation per shipment','Named certifications implying formal, documented quality processes','Careers page hiring regulatory affairs, documentation or QA coordinators','Downloadable CoAs, MSDS or product dossiers on the site']::text[], ARRAY['Very small catalogue and domestic-only sales','No quality or regulatory function evident anywhere']::text[], 2)
) AS v(offer_key, name, one_line, who_for, problem, what_we_do, signals, disqualifiers, sort_order)
WHERE  t.is_admin = true
  AND  NOT EXISTS (
      SELECT 1 FROM gt_offers o
       WHERE o.tenant_id = t.id AND o.offer_key = v.offer_key
  );
