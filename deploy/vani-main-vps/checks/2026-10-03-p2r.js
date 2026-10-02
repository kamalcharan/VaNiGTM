/**
 * Release check — release 2 (P2-R): the model router. READ-ONLY.
 * Run on the VPS from the repo checkout, in BOTH containers:
 *
 *   docker exec -i vani-backend node - < deploy/vani-main-vps/checks/2026-10-03-p2r.js
 *   docker exec -i vani-worker  node - < deploy/vani-main-vps/checks/2026-10-03-p2r.js
 *
 * Every line must say OK. Paste the output back if not. Never prints a key.
 */
const { Client } = require('pg');
let failed = 0;
const row = (ok, what, detail) => { if (!ok) failed++; console.log(`${ok ? 'OK  ' : 'FAIL'}  ${what}${detail === undefined ? '' : '  — ' + detail}`); };
const env = (k) => (process.env[k] || '').trim();

(async () => {
  // 1. The router's settings parse exactly as the API and worker read them.
  let cfg = null;
  try { cfg = require('/app/dist/agent-core/llm.router.config.js').readRouterConfig(); }
  catch (e) { row(false, 'router settings', e.message); }
  if (cfg) {
    const ext = Object.values(cfg.providers).filter((p) => p.kind === 'external');
    row(true, 'router settings parse', `providers: ${ext.map((p) => `${p.code} (${p.model}, ${p.dataTerms})`).join(', ') || 'none'}`);
    for (const p of ext) row(p.key !== '', `.env LLM_${p.code.toUpperCase()}_KEY is filled in`, p.key ? 'set (not shown)' : 'empty — paste the NEW key into .env');
    for (const r of ['high', 'medium', 'low']) row(true, `route ${r}`, cfg.routes[r].join(' → '));
  }

  // 2. Migration 272 on the database, as the runtime role.
  const c = new Client({ connectionString: env('DB_PRIMARY'),
    ssl: env('DB_PRIMARY_SSL') === 'true' ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  const one = async (sql) => { try { return (await c.query(sql)).rows[0] || {}; } catch (e) { return { error: e.message }; } };
  const t = await one(`SELECT to_regclass('gt_llm_calls') IS NOT NULL AS calls, to_regclass('gt_llm_provider_switch') IS NOT NULL AS sw`);
  row(t.calls && t.sw, 'tables gt_llm_calls and gt_llm_provider_switch exist (migration 272)', t.error);
  const st = await one(`SELECT count(*)::int n, coalesce(sum(tokens_today),0)::bigint t FROM gt_llm_route_state()`);
  row(st.error === undefined, 'gt_llm_route_state() counts calls and tokens (migrations 272 + 273)', st.error || `${st.n} provider(s) called today, ${st.t} tokens`);
  const u = await one(`SELECT count(*)::int n FROM gt_llm_usage_today()`);
  row(u.error === undefined, 'gt_llm_usage_today() runs for the runtime role', u.error);
  const trg = await one(`SELECT count(*)::int n FROM pg_trigger WHERE tgname IN ('gt_llm_calls_append_only','gt_llm_provider_switch_append_only')`);
  row(trg.n === 2, 'both tables are append-only (triggers present)', trg.error);
  const on = await one(`SELECT string_agg(provider_code, ', ') AS codes FROM (
      SELECT DISTINCT ON (provider_code) provider_code, enabled FROM gt_llm_provider_switch
       WHERE purpose = 'enrichment' ORDER BY provider_code, changed_at DESC, id DESC) s WHERE enabled`);
  row(on.error === undefined, 'switched on for enrichment', on.error || on.codes || 'none yet — switch them on in Settings → Platform models');
  await c.end();

  console.log(failed ? `\n${failed} FAILED — paste this output back.` : '\nAll OK.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAIL  check could not run —', e.message); process.exit(1); });
