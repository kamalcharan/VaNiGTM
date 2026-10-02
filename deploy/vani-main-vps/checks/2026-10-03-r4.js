/**
 * Release check — release 4 (P2-C): pool enrichment on the model router, and
 * the pool graph in the Brain's tables (migration 271, S16 revised / D-Q20).
 * READ-ONLY. In BOTH containers:
 *
 *   docker exec -i vani-backend node - < deploy/vani-main-vps/checks/2026-10-03-r4.js
 *   docker exec -i vani-worker  node - < deploy/vani-main-vps/checks/2026-10-03-r4.js
 */
const { Client } = require('pg');
let failed = 0;
const row = (ok, what, detail) => { if (!ok) failed++; console.log(`${ok ? 'OK  ' : 'FAIL'}  ${what}${detail === undefined ? '' : '  — ' + detail}`); };
const env = (k) => (process.env[k] || '').trim();

(async () => {
  try { const c = require('/app/dist/etl/enrich.config.js').readEnrichConfig(); row(true, 'pool enrichment settings', `${c.dailyRecords} records a day, ${c.pagesPerCompany} pages, confidence ≥ ${c.minConfidence}`); }
  catch (e) { row(false, 'pool enrichment settings (ENRICH_POOL_*)', e.message); }
  try { const h = require('/app/dist/agent-core/handled-events.js'); row(h.isHandledEvent('POOL_ENRICH_REQUESTED'), 'the worker handles POOL_ENRICH_REQUESTED'); }
  catch (e) { row(false, 'the worker handles POOL_ENRICH_REQUESTED', e.message); }

  const c = new Client({ connectionString: env('DB_PRIMARY'), ssl: env('DB_PRIMARY_SSL') === 'true' ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  const one = async (sql) => { try { return (await c.query(sql)).rows[0] || {}; } catch (e) { return { error: e.message }; } };
  const col = await one(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name IN ('gt_kg_nodes','gt_kg_edges') AND column_name = 'universe_company_id'`);
  row(col.n === 2, 'universe_company_id on gt_kg_nodes and gt_kg_edges (migration 271)', col.error);
  const ck = await one(`SELECT count(*)::int n FROM pg_constraint WHERE conname IN ('gt_kg_nodes_one_owner','gt_kg_edges_one_owner')`);
  row(ck.n === 2, 'one owner per row enforced', ck.error);
  const fn = await one(`SELECT count(*)::int n FROM pg_proc WHERE proname IN ('gt_pool_kg_upsert_node','gt_pool_kg_upsert_edge','gt_pool_kg_read','gt_pool_kg_withdraw_run') AND has_function_privilege(oid, 'EXECUTE')`);
  row(fn.n === 4, 'the four pool graph functions run for the runtime role', fn.error || `${fn.n} of 4`);
  const src = await one(`SELECT count(*)::int n FROM gt_data_sources WHERE code IN ('crawl', 'llm_pass')`);
  row(src.n === 2, 'enrichment sources crawl and llm_pass exist (migration 264)', src.error);
  const sw = await one(`SELECT string_agg(provider_code, ', ') FILTER (WHERE enabled) AS on FROM (SELECT DISTINCT ON (provider_code) provider_code, enabled FROM gt_llm_provider_switch WHERE purpose = 'enrichment' ORDER BY provider_code, changed_at DESC, id DESC) x`);
  row(sw.error === undefined, 'models switched on for enrichment', sw.error || (sw.on || 'none — switch at least one on in Settings → Platform models before a run'));
  const rd = await one(`SELECT gt_pool_kg_read(0) AS g`);
  row(rd.error === undefined, 'gt_pool_kg_read answers', rd.error);
  const leak = await one(`SELECT count(*)::int n FROM gt_kg_nodes WHERE tenant_id IS NULL`);
  // 0 for vanigtm_app (RLS). A runtime that sees pool rows bypasses RLS — the role switch was lost.
  row(leak.n === 0, 'the runtime role cannot see pool rows directly', leak.error || `${leak.n} visible`);
  await c.end();
  console.log(failed ? `\n${failed} FAILED — paste this output back.` : '\nAll OK.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAIL  check could not run —', e.message); process.exit(1); });
