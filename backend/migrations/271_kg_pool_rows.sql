-- ============================================================================
-- 271 — the common pool's company graph lives in the EXISTING knowledge-graph
-- tables (S16 revised, Charan 2026-10-02: "we have tables already … have an
-- identifier that these are part of common pool").
--
-- One graph shape, two owners:
--   a tenant's Brain   tenant_id set,           universe_company_id NULL  (unchanged)
--   a pool company     tenant_id NULL,          universe_company_id set   (new)
-- Exactly one of the two, enforced.
--
-- Why it is safe for every existing reader: the isolation policy (181/234)
-- admits a row only when tenant_id equals the caller's tenant, and every one
-- of the 21 reads in the code also says WHERE tenant_id = $1. A row with no
-- tenant matches neither, so pool rows can never appear in a tenant's Brain,
-- a deck or a profile score. No reader changes.
--
-- Why pool rows have their own writer: the same policy refuses an INSERT whose
-- tenant_id is NULL (no WITH CHECK → USING applies to writes), as it did for
-- platform tags (235). So pool rows are written, read and withdrawn ONLY
-- through the SECURITY DEFINER functions below — one road, like
-- gt_llm_route_state() (272/273).
--
-- Runs: properties.runs lists every run that found a pool node or edge, so
-- withdrawing a run (D-Q19 E1) removes only what that run ALONE found.
--
-- A tenant whose own website is a pool company is SEEDED from it by COPY
-- (src/etl/pool-graph.ts): the copies are the tenant's rows from then on —
-- their corrections never reach the pool, and nothing flows the other way.
--
-- Idempotent and guarded.
-- ============================================================================

-- ── columns ─────────────────────────────────────────────────────────────────
ALTER TABLE gt_kg_nodes ADD COLUMN IF NOT EXISTS universe_company_id BIGINT
    REFERENCES gt_universe_companies(id) ON DELETE CASCADE;
ALTER TABLE gt_kg_edges ADD COLUMN IF NOT EXISTS universe_company_id BIGINT
    REFERENCES gt_universe_companies(id) ON DELETE CASCADE;

ALTER TABLE gt_kg_nodes ALTER COLUMN tenant_id DROP NOT NULL;
ALTER TABLE gt_kg_edges ALTER COLUMN tenant_id DROP NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gt_kg_nodes_one_owner') THEN
    ALTER TABLE gt_kg_nodes ADD CONSTRAINT gt_kg_nodes_one_owner
      CHECK ((tenant_id IS NULL) <> (universe_company_id IS NULL));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'gt_kg_edges_one_owner') THEN
    ALTER TABLE gt_kg_edges ADD CONSTRAINT gt_kg_edges_one_owner
      CHECK ((tenant_id IS NULL) <> (universe_company_id IS NULL));
  END IF;
END $$;

COMMENT ON COLUMN gt_kg_nodes.universe_company_id IS
  'Set on a common-pool row (tenant_id NULL): the pool company this fact is about. Written only by gt_pool_kg_upsert_node (271).';
COMMENT ON COLUMN gt_kg_edges.universe_company_id IS
  'Set on a common-pool row (tenant_id NULL). Written only by gt_pool_kg_upsert_edge (271).';

-- The tenant key (tenant_id, label, name) is untouched — NULLs never collide in
-- it, so pool rows need their own: one node per (company, label, name).
CREATE UNIQUE INDEX IF NOT EXISTS gt_kg_nodes_pool_unique
    ON gt_kg_nodes (universe_company_id, label, name) WHERE tenant_id IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS gt_kg_edges_pool_unique
    ON gt_kg_edges (universe_company_id, from_node_id, relationship, to_node_id) WHERE tenant_id IS NULL;

-- ── writer: a pool node ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION gt_pool_kg_upsert_node(
  p_company BIGINT, p_label TEXT, p_name TEXT, p_description TEXT, p_properties JSONB, p_run BIGINT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id   UUID;
  v_run  JSONB := CASE WHEN p_run IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p_run) END;
  v_prop JSONB := coalesce(p_properties, '{}'::jsonb) - 'runs';
BEGIN
  IF p_company IS NULL OR coalesce(trim(p_label), '') = '' OR coalesce(trim(p_name), '') = '' THEN
    RAISE EXCEPTION 'POOL_KG_INVALID: company, label and name are required';
  END IF;
  INSERT INTO gt_kg_nodes (tenant_id, universe_company_id, label, name, description, properties, source_run_id)
  VALUES (NULL, p_company, p_label, p_name, coalesce(p_description, ''), v_prop || jsonb_build_object('runs', v_run), p_run)
  ON CONFLICT (universe_company_id, label, name) WHERE tenant_id IS NULL DO UPDATE
     SET description   = EXCLUDED.description,
         properties    = gt_kg_nodes.properties || v_prop || jsonb_build_object('runs',
                           (SELECT coalesce(jsonb_agg(DISTINCT r), '[]'::jsonb)
                              FROM jsonb_array_elements(coalesce(gt_kg_nodes.properties -> 'runs', '[]'::jsonb) || v_run) r)),
         source_run_id = coalesce(EXCLUDED.source_run_id, gt_kg_nodes.source_run_id),
         updated_at    = now()
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ── writer: a pool edge (both ends must be this company's pool nodes) ──────
CREATE OR REPLACE FUNCTION gt_pool_kg_upsert_edge(
  p_company BIGINT, p_from UUID, p_relationship TEXT, p_to UUID, p_properties JSONB, p_run BIGINT)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id   UUID;
  v_run  JSONB := CASE WHEN p_run IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p_run) END;
  v_prop JSONB := coalesce(p_properties, '{}'::jsonb) - 'runs';
BEGIN
  IF (SELECT count(*) FROM gt_kg_nodes
       WHERE id IN (p_from, p_to) AND tenant_id IS NULL AND universe_company_id = p_company)
     <> (CASE WHEN p_from = p_to THEN 1 ELSE 2 END) THEN
    RAISE EXCEPTION 'POOL_KG_INVALID: both ends of an edge must be pool nodes of company %', p_company;
  END IF;
  INSERT INTO gt_kg_edges (tenant_id, universe_company_id, from_node_id, to_node_id, relationship, properties, source_run_id)
  VALUES (NULL, p_company, p_from, p_to, p_relationship, v_prop || jsonb_build_object('runs', v_run), p_run)
  ON CONFLICT (universe_company_id, from_node_id, relationship, to_node_id) WHERE tenant_id IS NULL DO UPDATE
     SET properties    = gt_kg_edges.properties || v_prop || jsonb_build_object('runs',
                           (SELECT coalesce(jsonb_agg(DISTINCT r), '[]'::jsonb)
                              FROM jsonb_array_elements(coalesce(gt_kg_edges.properties -> 'runs', '[]'::jsonb) || v_run) r)),
         source_run_id = coalesce(EXCLUDED.source_run_id, gt_kg_edges.source_run_id)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ── reader: one pool company's graph, as one JSON document ─────────────────
-- Pool facts are shared by design (they are what the pool gives tenants), so
-- any app caller may read them; a tenant's own rows are never returned here.
CREATE OR REPLACE FUNCTION gt_pool_kg_read(p_company BIGINT)
RETURNS JSONB
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'nodes', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'id', n.id, 'label', n.label, 'name', n.name, 'description', n.description,
                 'properties', n.properties, 'updated_at', n.updated_at) ORDER BY n.label, n.name)
               FROM gt_kg_nodes n WHERE n.tenant_id IS NULL AND n.universe_company_id = p_company), '[]'::jsonb),
    'edges', coalesce((SELECT jsonb_agg(jsonb_build_object(
                 'from', e.from_node_id, 'to', e.to_node_id, 'relationship', e.relationship,
                 'properties', e.properties))
               FROM gt_kg_edges e WHERE e.tenant_id IS NULL AND e.universe_company_id = p_company), '[]'::jsonb))
$$;

-- ── withdraw a run: remove what it ALONE found, keep what others found too ─
CREATE OR REPLACE FUNCTION gt_pool_kg_withdraw_run(p_run BIGINT)
RETURNS TABLE (nodes_removed INTEGER, edges_removed INTEGER, nodes_kept INTEGER, edges_kept INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_run JSONB := to_jsonb(p_run);
BEGIN
  UPDATE gt_kg_edges e
     SET properties = jsonb_set(e.properties, '{runs}',
           (SELECT coalesce(jsonb_agg(r), '[]'::jsonb) FROM jsonb_array_elements(e.properties -> 'runs') r WHERE r <> v_run))
   WHERE e.tenant_id IS NULL AND e.properties -> 'runs' @> jsonb_build_array(p_run);
  GET DIAGNOSTICS edges_kept = ROW_COUNT;
  DELETE FROM gt_kg_edges e
   WHERE e.tenant_id IS NULL AND e.source_run_id = p_run AND jsonb_array_length(coalesce(e.properties -> 'runs', '[]'::jsonb)) = 0;
  GET DIAGNOSTICS edges_removed = ROW_COUNT;

  UPDATE gt_kg_nodes n
     SET properties = jsonb_set(n.properties, '{runs}',
           (SELECT coalesce(jsonb_agg(r), '[]'::jsonb) FROM jsonb_array_elements(n.properties -> 'runs') r WHERE r <> v_run)),
         updated_at = now()
   WHERE n.tenant_id IS NULL AND n.properties -> 'runs' @> jsonb_build_array(p_run);
  GET DIAGNOSTICS nodes_kept = ROW_COUNT;
  DELETE FROM gt_kg_nodes n   -- its edges go with it (ON DELETE CASCADE)
   WHERE n.tenant_id IS NULL AND n.source_run_id = p_run AND jsonb_array_length(coalesce(n.properties -> 'runs', '[]'::jsonb)) = 0;
  GET DIAGNOSTICS nodes_removed = ROW_COUNT;

  -- A survivor still naming the withdrawn run as its source points at the
  -- latest run that still vouches for it.
  UPDATE gt_kg_nodes n SET source_run_id = (n.properties -> 'runs' ->> (jsonb_array_length(n.properties -> 'runs') - 1))::bigint
   WHERE n.tenant_id IS NULL AND n.source_run_id = p_run AND jsonb_array_length(coalesce(n.properties -> 'runs', '[]'::jsonb)) > 0;
  UPDATE gt_kg_edges e SET source_run_id = (e.properties -> 'runs' ->> (jsonb_array_length(e.properties -> 'runs') - 1))::bigint
   WHERE e.tenant_id IS NULL AND e.source_run_id = p_run AND jsonb_array_length(coalesce(e.properties -> 'runs', '[]'::jsonb)) > 0;

  nodes_kept := nodes_kept - nodes_removed;
  edges_kept := edges_kept - edges_removed;
  RETURN NEXT;
END $$;

REVOKE ALL ON FUNCTION gt_pool_kg_upsert_node(BIGINT, TEXT, TEXT, TEXT, JSONB, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION gt_pool_kg_upsert_edge(BIGINT, UUID, TEXT, UUID, JSONB, BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION gt_pool_kg_read(BIGINT) FROM PUBLIC;
REVOKE ALL ON FUNCTION gt_pool_kg_withdraw_run(BIGINT) FROM PUBLIC;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'vanigtm_app') THEN
    GRANT EXECUTE ON FUNCTION gt_pool_kg_upsert_node(BIGINT, TEXT, TEXT, TEXT, JSONB, BIGINT) TO vanigtm_app;
    GRANT EXECUTE ON FUNCTION gt_pool_kg_upsert_edge(BIGINT, UUID, TEXT, UUID, JSONB, BIGINT) TO vanigtm_app;
    GRANT EXECUTE ON FUNCTION gt_pool_kg_read(BIGINT) TO vanigtm_app;
    GRANT EXECUTE ON FUNCTION gt_pool_kg_withdraw_run(BIGINT) TO vanigtm_app;
  END IF;
END $$;
