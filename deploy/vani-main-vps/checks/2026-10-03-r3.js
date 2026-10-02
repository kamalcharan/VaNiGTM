/**
 * Release check — release 3 (P2-B): scoring profiles, token budget + top-ups,
 * the tenant context. READ-ONLY. In BOTH containers:
 *
 *   docker exec -i vani-backend node - < deploy/vani-main-vps/checks/2026-10-03-r3.js
 *   docker exec -i vani-worker  node - < deploy/vani-main-vps/checks/2026-10-03-r3.js
 */
const { Client } = require('pg');
let failed = 0;
const row = (ok, what, detail) => { if (!ok) failed++; console.log(`${ok ? 'OK  ' : 'FAIL'}  ${what}${detail === undefined ? '' : '  — ' + detail}`); };
const env = (k) => (process.env[k] || '').trim();

(async () => {
  try { const c = require('/app/dist/agent-core/token.budget.js').readBudgetConfig(); row(true, 'token budget settings', `${c.dailyLimit} a day, ${c.monthlyLimit} a month`); }
  catch (e) { row(false, 'token budget settings', e.message); }

  const c = new Client({ connectionString: env('DB_PRIMARY'), ssl: env('DB_PRIMARY_SSL') === 'true' ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  const one = async (sql) => { try { return (await c.query(sql)).rows[0] || {}; } catch (e) { return { error: e.message }; } };
  const p = await one(`SELECT version, part_weights FROM gt_score_profiles WHERE tenant_id IS NULL ORDER BY version DESC LIMIT 1`);
  row(p.version >= 1, 'platform scoring default present (migration 274)', p.error || `v${p.version}: ${JSON.stringify(p.part_weights)}`);
  const t = await one(`SELECT to_regclass('gt_token_topups') IS NOT NULL AS ok`);
  row(t.ok === true, 'gt_token_topups exists', t.error);
  const m = await one(`SELECT count(*)::int n FROM information_schema.columns WHERE table_name = 'gt_tenant_context' AND column_name = 'monthly_token_limit'`);
  row(m.n === 1, 'gt_tenant_context.monthly_token_limit exists', m.error);
  const f = await one(`SELECT count(*)::int n FROM gt_token_topup_balances()`);
  row(f.error === undefined, 'gt_token_topup_balances() runs for the runtime role', f.error || `${f.n} tenant(s) with top-ups`);
  const s = await one(`SELECT count(*) FILTER (WHERE coverage_parts ? 'level')::int scored, count(*)::int total FROM gt_universe_companies WHERE merged_into_id IS NULL`);
  row(s.error === undefined, 'pool companies scored', s.error || `${s.scored} of ${s.total} — if fewer, press "Re-score the common pool" in Settings → Scoring`);
  await c.end();
  console.log(failed ? `\n${failed} FAILED — paste this output back.` : '\nAll OK.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAIL  check could not run —', e.message); process.exit(1); });
