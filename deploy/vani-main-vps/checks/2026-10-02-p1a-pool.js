/**
 * Release check — common pool P1 sprint A (migrations 264–267, ETL settings).
 * READ-ONLY. Run on the VPS from the repo checkout:
 *
 *   docker exec -i vani-backend node - < deploy/vani-main-vps/checks/2026-10-02-p1a-pool.js
 *
 * Every line must say OK. Paste the output back if any says FAIL.
 */
const { Client } = require('pg');
const c = new Client({
  connectionString: process.env.DB_PRIMARY,
  ssl: process.env.DB_PRIMARY_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
});
let failed = 0;
const row = (ok, what, detail) => {
  if (!ok) failed++;
  console.log(`${ok ? 'OK  ' : 'FAIL'}  ${what}${detail === undefined ? '' : '  — ' + detail}`);
};
// A query that errors (a missing column on an unmigrated database) reads as
// "nothing there", so the check reports FAIL on that line and carries on.
const all = async (sql) => { try { return (await c.query(sql)).rows; } catch (e) { return null; } };
const one = async (sql) => { const r = await all(sql); return r ? r[0] : undefined; };
const hasCol = async (t, col) =>
  Number(((await one(`SELECT count(*) n FROM information_schema.columns
                      WHERE table_schema = 'public' AND table_name = '${t}' AND column_name = '${col}'`)) || {}).n) === 1;

(async () => {
  await c.connect();

  // 1. Settings the API and worker now refuse to start without.
  for (const k of ['ETL_UPLOAD_MAX_BYTES', 'ETL_SYNC_MAX_BYTES', 'ETL_STAGE_CHUNK_ROWS']) {
    const v = (process.env[k] || '').trim();
    row(/^\d+$/.test(v), `.env ${k}`, v || 'not set');
  }

  // 2. The runner recorded each file.
  const rec = ((await all(`SELECT filename FROM vn_migrations WHERE filename ~ '^26[2-7]_' ORDER BY filename`)) || []).map((r) => r.filename);
  for (const f of ['262_vani_funnel_graph_and_access.sql', '264_pool_sources_and_loads.sql',
                   '265_pool_staging_lifecycle.sql', '266_pool_universe_lifecycle.sql', '267_industry_master.sql']) {
    row(rec.includes(f), `migration recorded: ${f}`);
  }
  row(!rec.some((f) => f.startsWith('263_')), 'migration 263 NOT applied (reserved for the DPDP notice draft)');

  // 3. What each migration made.
  row(await hasCol('gt_data_sources', 'may_enter_pool'), '264: gt_data_sources.may_enter_pool');
  const up = await one(`SELECT may_enter_pool m FROM gt_data_sources WHERE code = 'upload'`);
  row(up && up.m === false, '264: source "upload" may NOT enter the pool', up ? String(up.m) : 'no upload row');
  const seeded = (await one(`SELECT count(*) n FROM gt_data_sources WHERE code IN
    ('mca','udyam','analytica','prospector','legacy_dir','crawl','llm_pass','findymail','places','manual')`)) || { n: 0 };
  row(Number(seeded.n) === 10, '264: ten pool sources seeded', `${seeded.n} of 10`);
  row(await hasCol('gt_source_loads', 'load_kind'), '264: gt_source_loads.load_kind');

  row(await hasCol('ki_import_staging', 'junk_reason'), '265: ki_import_staging.junk_reason');
  const pair = (await one(`SELECT count(*) n FROM pg_constraint WHERE conname = 'ki_import_staging_junk_reason_pairs'`)) || { n: 0 };
  row(Number(pair.n) === 1, '265: junk reason/by/at pairing constraint');
  const statusChecks = (await one(`SELECT count(*) n FROM pg_constraint
    WHERE conrelid = 'ki_import_staging'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%processing_status%' AND conname <> 'ki_import_staging_junk_reason_pairs'`)) || { n: -1 };
  row(Number(statusChecks.n) === 1, '265: exactly one processing_status check', `${statusChecks.n} found`);

  const trgm = (await one(`SELECT count(*) n FROM pg_extension WHERE extname = 'pg_trgm'`)) || { n: 0 };
  row(Number(trgm.n) === 1, '266: pg_trgm extension');
  row(await hasCol('gt_universe_companies', 'lifecycle_state'), '266: gt_universe_companies.lifecycle_state');
  row(await hasCol('gt_universe_company_sources', 'method'), '266: gt_universe_company_sources.method');
  row(await hasCol('gt_prospects', 'last_enriched_at'), '266: gt_prospects.last_enriched_at');
  const states = await all(`SELECT lifecycle_state s, count(*) n FROM gt_universe_companies GROUP BY 1 ORDER BY 1`);
  row(states !== null, '266: pool rows by state (existing rows start as candidate)',
      states ? (states.map((r) => `${r.s}=${r.n}`).join(', ') || 'pool is empty') : 'could not read');

  row(await hasCol('gt_industries', 'nic_prefixes'), '267: gt_industries.nic_prefixes');
  const ind = (await one(`SELECT count(*) FILTER (WHERE cardinality(nic_prefixes) > 0) with_nic, count(*) total FROM gt_industries`)) || { with_nic: 0, total: '?' };
  row(Number(ind.with_nic) > 0, '267: industries carry NIC prefixes', `${ind.with_nic} of ${ind.total}`);

  // 4. The worker can run the new job.
  const unconsumed = (await one(`SELECT count(*) n FROM gt_events
    WHERE event_type = 'IMPORT_STAGE_REQUESTED' AND status = 'pending' AND created_at < now() - interval '2 minutes'`)) || { n: '?' };
  row(Number(unconsumed.n) === 0, 'no IMPORT_STAGE_REQUESTED stuck pending > 2 min', `${unconsumed.n} stuck`);

  await c.end();
  console.log(failed ? `\n${failed} FAILED — paste this output back.` : '\nAll OK.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAIL  check could not run —', e.message); process.exit(1); });
