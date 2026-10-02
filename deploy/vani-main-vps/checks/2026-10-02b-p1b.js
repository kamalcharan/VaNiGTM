/**
 * Release check — uploads are temporary + common pool P1-B + Sprint 0a part 1.
 * READ-ONLY. Run on the VPS from the repo checkout:
 *
 *   docker exec -i vani-backend node - < deploy/vani-main-vps/checks/2026-10-02b-p1b.js
 *   docker exec -i vani-worker  node - < deploy/vani-main-vps/checks/2026-10-02b-p1b.js
 *
 * Every line must say OK, in BOTH containers. Paste the output back if not.
 */
const fs = require('fs');
const { Client } = require('pg');
let failed = 0;
const row = (ok, what, detail) => { if (!ok) failed++; console.log(`${ok ? 'OK  ' : 'FAIL'}  ${what}${detail === undefined ? '' : '  — ' + detail}`); };
const env = (k) => (process.env[k] || '').trim();

(async () => {
  // 1. Settings this release added (the process refuses to start without them).
  for (const k of ['ETL_UPLOAD_DIR', 'ETL_UPLOAD_TEMP_TTL_HOURS', 'MATCH_LINK_MIN', 'MATCH_REVIEW_MIN',
    'MATCH_DOMAIN_NAME_MIN', 'POOL_RESOLVE_CHUNK_ROWS', 'RUNS_STREAM_POLL_MS', 'RUNS_STREAM_HEARTBEAT_MS', 'RUNS_STREAM_MAX_SECONDS']) {
    row(env(k) !== '', `.env ${k}`, env(k) || 'not set');
  }
  row(env('ETL_UPLOAD_MAX_BYTES') === '209715200', '.env ETL_UPLOAD_MAX_BYTES raised to 200 MB', env('ETL_UPLOAD_MAX_BYTES'));
  row(env('ETL_SYNC_MAX_BYTES') === '5242880', '.env ETL_SYNC_MAX_BYTES lowered to 5 MB (bigger CSVs go to the worker)', env('ETL_SYNC_MAX_BYTES'));

  // 2. The shared temp folder: present, writable, and the same folder in both containers.
  const dir = env('ETL_UPLOAD_DIR');
  let writable = false;
  try { fs.mkdirSync(dir, { recursive: true }); const f = `${dir}/.release-check-${process.pid}`; fs.writeFileSync(f, String(Date.now())); fs.unlinkSync(f); writable = true; } catch (e) { /* reported below */ }
  row(writable, `${dir} is writable here`);
  let mounted = false;
  try { mounted = fs.readFileSync('/proc/self/mountinfo', 'utf8').split('\n').some((l) => l.split(' ')[4] === dir); } catch (e) { /* reported below */ }
  row(mounted, `${dir} is a mounted host folder (not the container's own disk)`);

  // 3. The database side of P1-B.
  const c = new Client({ connectionString: env('DB_PRIMARY'),
    ssl: env('DB_PRIMARY_SSL') === 'true' ? { rejectUnauthorized: false } : undefined });
  await c.connect();
  const one = async (sql) => { try { return (await c.query(sql)).rows[0]; } catch (e) { return { error: e.message }; } };
  const manual = await one(`SELECT count(*)::int n FROM gt_data_sources WHERE code = 'manual'`);
  row(manual && manual.n === 1, 'the "manual" source exists (a person\'s decisions are recorded under it)');
  const trgm = await one(`SELECT similarity('ANALAB SCIENTIFIC INSTRUMENTS','ANALAB SCIENTIFIC INSTRUMENT') AS s`);
  row(trgm && Number(trgm.s) > 0.85, 'pg_trgm similarity works for the runtime role', trgm && (trgm.s ?? trgm.error));
  const pool = await one(`SELECT
      (SELECT count(*) FROM gt_universe_company_sources s JOIN gt_source_loads l ON l.id = s.load_id
        WHERE l.tenant_id IS NULL AND l.status = 'active' AND s.company_id IS NULL)::int AS unmatched,
      (SELECT count(*) FROM gt_universe_companies)::int AS companies`);
  row(!pool.error, 'pool tables readable', pool.error || `${pool.unmatched} unmatched source rows, ${pool.companies} companies`);
  await c.end();

  console.log(failed ? `\n${failed} FAILED — paste this output back.` : '\nAll OK.');
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error('FAIL  check could not run —', e.message); process.exit(1); });
