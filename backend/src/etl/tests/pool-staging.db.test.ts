/**
 * Common pool P1-A against the REAL schema (every migration) and the REAL
 * router over HTTP: the licence gate, the worker path for large CSVs with a
 * crash in the middle, the workbook refusal, and junk · held · restore —
 * and uploads as TEMPORARY files (Charan, 2026-10-02): gone once staged, the
 * same content refused even renamed, a failed import never blocking its file.
 */
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import express from 'express';
import type { AddressInfo } from 'net';
import { Pool } from 'pg';
import * as XLSX from 'xlsx';
import { createEtlRouter } from '../etl.routes';
import { runStageJob } from '../stage-job';
import * as staging from '../staging';
import { register } from '../../auth/auth.service';
import { signAccessToken } from '../../auth/token.service';

const HOST = process.env.PGHOST || '/tmp';
const PORT = Number(process.env.PGPORT) || 55432;
const USER = process.env.PGUSER || 'postgres';
const DB = 'pool_staging_test';
const BACKEND = path.resolve(__dirname, '../../..');

const available = (() => {
  try { execSync(`pg_isready -h ${HOST} -p ${PORT}`, { stdio: 'ignore' }); return true; }
  catch { return false; }
})();

let pool: Pool;
let server: ReturnType<express.Express['listen']>;
let origin = '';
let admin = { token: '', tenant: '', user: '' };
let other = { token: '' };

const fakeReq = { headers: { 'user-agent': 'jest' }, ip: '127.0.0.1', socket: { remoteAddress: '127.0.0.1' } } as any;

// Every file's content is unique: the load checksum guard (202) rightly
// refuses the same delivery twice.
let fileNo = 0;
const csvOf = (n: number, broken?: number, extraRows = 0) => {
  const lines = ['COMPANY,WEB,CITY,PIN'];
  fileNo++;
  for (let i = 1; i <= n; i++) {
    lines.push(i === broken ? `"Broken ${i},x.in,Pune,411001` : `Company ${i} Pvt Ltd,company${i}.in,Hyderabad,500004`);
  }
  for (let i = 1; i <= extraRows; i++) lines.push(`Extra ${fileNo}-${i},extra${fileNo}x${i}.in,Pune,411001`);
  lines.push(`Marker ${fileNo},marker${fileNo}.in,Chennai,600001`);
  return lines.join('\n') + '\n';
};

async function upload(token: string, name: string, body: Buffer | string) {
  const fd = new FormData();
  fd.append('file', new Blob([body]), name);
  fd.append('import_type', 'company');
  const r = await fetch(`${origin}/upload`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: fd });
  return { status: r.status, body: await r.json() as any };
}

async function call(method: string, p: string, body: unknown, token = admin.token) {
  const r = await fetch(`${origin}${p}`, {
    method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: r.status, body: await r.json() as any };
}

const session = (file_id: number, source_code = 'ftcci') =>
  call('POST', '/sessions', { file_id, import_type: 'company', destination: 'universe_companies', source_code });

beforeAll(async () => {
  if (!available) return;
  const root = new Pool({ host: HOST, port: PORT, user: USER, database: 'postgres', connectionTimeoutMillis: 2000 });
  await root.query(`DROP DATABASE IF EXISTS ${DB}`);
  await root.query(`CREATE DATABASE ${DB}`);
  await root.end();
  execSync('npx tsx src/migrate.ts', { cwd: BACKEND, stdio: 'ignore',
    env: { ...process.env, DB_PRIMARY: `postgresql://${USER}@localhost/${DB}?host=${HOST}&port=${PORT}`, DB_PRIMARY_SSL: 'false', DB_MIGRATE: '' } });
  pool = new Pool({ host: HOST, port: PORT, user: USER, database: DB });

  const a = await register(pool, { name: 'Steward', email: 'steward@vikuna.test', password: 'Passw0rdA', tenant_name: 'Vikuna' }, fakeReq);
  await pool.query('UPDATE vn_tenants SET is_admin = true WHERE id = $1', [a.tenant.id]);
  admin = { tenant: a.tenant.id, user: a.user.id,
    token: signAccessToken({ user_id: a.user.id, tenant_id: a.tenant.id, email: 'steward@vikuna.test', role: 'owner', is_live: true, is_admin: true } as any) };
  const b = await register(pool, { name: 'Other', email: 'other@acme.test', password: 'Passw0rdA', tenant_name: 'Acme' }, fakeReq);
  other = { token: b.tokens.access_token };

  const app = express();
  app.use(express.json());
  app.use('/', createEtlRouter(pool));
  server = app.listen(0);
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}, 180000);

afterAll(async () => {
  if (server) server.close();
  if (pool) await pool.end();
});

const d = available ? describe : describe.skip;

d('common pool P1-A — staging', () => {
  it('the licence gate refuses a source that may not feed the pool, and names the ones that may', async () => {
    const up = await upload(admin.token, 'small.csv', csvOf(3));
    expect(up.status).toBe(201);
    for (const code of ['upload', 'apollo']) {
      const r = await session(up.body.file_id ?? up.body.file?.id, code);
      expect(r.status).toBe(400);
      expect(r.body.error.code).toBe('SOURCE_NOT_POOLABLE');
      expect(r.body.error.message).toMatch(/ftcci/);
      expect(r.body.error.message).not.toMatch(/\bapollo\b,|, apollo\b/);
    }
  });

  it('a small file still stages in the request, as before', async () => {
    process.env.ETL_SYNC_MAX_BYTES = '10485760';
    const up = await upload(admin.token, 'small2.csv', csvOf(5));
    const r = await session(up.body.file_id ?? up.body.file?.id);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'staged', total_records: 6 });   // 5 + the marker row
  });

  it('a large CSV goes to the worker; a crash mid-file resumes with no duplicates', async () => {
    process.env.ETL_SYNC_MAX_BYTES = '1000';
    process.env.ETL_STAGE_CHUNK_ROWS = '1000';
    const up = await upload(admin.token, 'big.csv', csvOf(2499));   // + marker = 2,500
    const r = await session(up.body.file_id ?? up.body.file?.id);
    expect(r.status).toBe(202);
    expect(r.body).toMatchObject({ status: 'staging', total_records: null });
    const sid = r.body.session_id;

    const ev = await pool.query(`SELECT tenant_id, payload FROM gt_events WHERE event_type = 'IMPORT_STAGE_REQUESTED' AND source_id = $1`, [String(sid)]);
    expect(ev.rows).toHaveLength(1);

    // First attempt dies on the second chunk.
    const real = staging.insertStagingRows;
    let calls = 0;
    const spy = jest.spyOn(staging, 'insertStagingRows').mockImplementation(async (db, s, rows) => {
      calls++;
      if (calls === 2) throw new Error('simulated crash');
      return real(db, s, rows);
    });
    await expect(runStageJob(pool, admin.tenant, ev.rows[0].payload, 0)).rejects.toThrow(/simulated crash/);
    spy.mockRestore();

    let st = await pool.query('SELECT status, last_processed_row FROM ki_import_sessions WHERE id = $1', [sid]);
    expect(st.rows[0]).toMatchObject({ status: 'pending', last_processed_row: 1000 });
    expect(Number((await pool.query('SELECT count(*) FROM ki_import_staging WHERE session_id = $1', [sid])).rows[0].count)).toBe(1000);

    // The retry resumes after row 1,000.
    const done = await runStageJob(pool, admin.tenant, ev.rows[0].payload, 0);
    expect(done).toEqual({ staged: 1500, total: 2500 });
    st = await pool.query('SELECT status, total_records, last_processed_row FROM ki_import_sessions WHERE id = $1', [sid]);
    expect(st.rows[0]).toMatchObject({ status: 'staged', total_records: 2500, last_processed_row: 2500 });
    const c = await pool.query('SELECT count(*) AS n, count(DISTINCT row_number) AS d, min(row_number) AS lo, max(row_number) AS hi FROM ki_import_staging WHERE session_id = $1', [sid]);
    expect(c.rows[0]).toEqual({ n: 2500, d: 2500, lo: 1, hi: 2500 });

    // The status route reports progress.
    const status = await call('GET', `/sessions/${sid}/status`, undefined);
    expect(status.body.session).toMatchObject({ status: 'staged', staged_rows: 2500 });

    // A second delivery of the event changes nothing.
    expect(await runStageJob(pool, admin.tenant, ev.rows[0].payload, 0)).toEqual({ skipped: 'staged' });
  });

  it('the worker and the request stage the same row identically', async () => {
    process.env.ETL_SYNC_MAX_BYTES = '10485760';
    const small = await upload(admin.token, 'same-a.csv', csvOf(3));
    const viaRequest = (await session(small.body.file_id ?? small.body.file?.id)).body.session_id;
    process.env.ETL_SYNC_MAX_BYTES = '10';
    const big = await upload(admin.token, 'same-b.csv', csvOf(3));   // same 3 company rows, a different marker
    const viaWorker = (await session(big.body.file_id ?? big.body.file?.id)).body.session_id;
    const ev = await pool.query(`SELECT payload FROM gt_events WHERE event_type = 'IMPORT_STAGE_REQUESTED' AND source_id = $1`, [String(viaWorker)]);
    await runStageJob(pool, admin.tenant, ev.rows[0].payload, 0);
    const pick = async (sid: number) => (await pool.query(
      `SELECT row_number, mapped_data->'company'->>'name' AS name, mapped_data->'company'->>'domain_normalized' AS domain,
              mapped_data->'company'->>'pin' AS pin, completeness, validity
         FROM ki_import_staging WHERE session_id = $1 AND row_number <= 3 ORDER BY row_number`, [sid])).rows;
    expect(await pick(viaWorker)).toEqual(await pick(viaRequest));
  });

  it('a malformed CSV fails the session with the row it stopped at', async () => {
    process.env.ETL_SYNC_MAX_BYTES = '10';
    process.env.ETL_STAGE_CHUNK_ROWS = '10';
    const up = await upload(admin.token, 'broken.csv', csvOf(30, 25));
    const sid = (await session(up.body.file_id ?? up.body.file?.id)).body.session_id;
    const ev = await pool.query(`SELECT payload FROM gt_events WHERE event_type = 'IMPORT_STAGE_REQUESTED' AND source_id = $1`, [String(sid)]);
    await expect(runStageJob(pool, admin.tenant, ev.rows[0].payload, 0)).rejects.toThrow(/not valid CSV after row 20/);   // rows 21–30 hold the broken quote
    const st = await pool.query('SELECT status, error_summary FROM ki_import_sessions WHERE id = $1', [sid]);
    expect(st.rows[0].status).toBe('failed');
    expect(st.rows[0].error_summary).toMatch(/Rows up to 20 are staged/);
  });

  it('a large workbook is refused with the reason, not read into memory', async () => {
    process.env.ETL_SYNC_MAX_BYTES = '100';
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['COMPANY'], ...Array.from({ length: 50 }, (_, i) => [`Co ${i}`])]), 'S');
    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const up = await upload(admin.token, 'big.xlsx', buf);
    const r = await session(up.body.file_id ?? up.body.file?.id);
    expect(r.status).toBe(413);
    expect(r.body.error.code).toBe('WORKBOOK_TOO_LARGE');
    expect(r.body.error.message).toMatch(/Save it as CSV/);
  });

  it('junk needs a reason, is reversible, and cannot touch a row that already landed', async () => {
    process.env.ETL_SYNC_MAX_BYTES = '10485760';
    const up = await upload(admin.token, 'states.csv', csvOf(3));
    const sid = (await session(up.body.file_id ?? up.body.file?.id)).body.session_id;
    const ids = (await pool.query('SELECT id FROM ki_import_staging WHERE session_id = $1 ORDER BY row_number', [sid])).rows.map((r) => r.id);
    const state = (id: number, body: unknown, token?: string) => call('POST', `/sessions/${sid}/records/${id}/state`, body, token);

    expect((await state(ids[0], { state: 'junk' })).status).toBe(400);
    const j = await state(ids[0], { state: 'junk', reason: 'placeholder' });
    expect(j.status).toBe(200);
    expect(j.body.record).toMatchObject({ processing_status: 'junk', junk_reason: 'placeholder', junk_by: admin.user });
    expect((await state(ids[0], { state: 'held' })).status).toBe(409);         // junk → held is not a move
    const back = await state(ids[0], { state: 'restore' });
    expect(back.body.record).toMatchObject({ processing_status: 'pending', junk_reason: null, junk_by: null, junk_at: null });

    expect((await state(ids[1], { state: 'held' })).body.record.processing_status).toBe('held');

    await pool.query(`UPDATE ki_import_staging SET processing_status = 'success' WHERE id = $1`, [ids[2]]);
    const landed = await state(ids[2], { state: 'junk', reason: 'defunct' });
    expect(landed.status).toBe(409);
    expect(landed.body.error.message).toMatch(/mark the company junk there/);

    // Another workspace cannot reach these rows at all.
    expect((await state(ids[1], { state: 'restore' }, other.token)).status).toBe(404);
  });
});

d('uploads are temporary files (Charan, 2026-10-02)', () => {
  const fileRow = async (id: number) => (await pool.query(
    'SELECT original_filename, file_size, file_hash, file_path, processing_status FROM ki_file_uploads WHERE id = $1', [id])).rows[0];
  const ownImport = (file_id: number) => call('POST', '/sessions', { file_id, import_type: 'company' });

  it('a file staged in the request is deleted; its metadata stays', async () => {
    process.env.ETL_SYNC_MAX_BYTES = '10485760';
    const up = await upload(admin.token, 'temp-sync.csv', csvOf(4));
    const before = await fileRow(up.body.file_id);
    expect(fs.existsSync(before.file_path)).toBe(true);
    const r = await ownImport(up.body.file_id);
    expect(r.status).toBe(201);
    const after = await fileRow(up.body.file_id);
    expect(fs.existsSync(after.file_path)).toBe(false);
    expect(after).toMatchObject({ original_filename: 'temp-sync.csv', processing_status: 'completed' });
    expect(Number(after.file_size)).toBeGreaterThan(0);
    expect(after.file_hash).toMatch(/^[0-9a-f]{64}$/);
    const st = await pool.query('SELECT total_records FROM ki_import_sessions WHERE id = $1', [r.body.session_id]);
    expect(st.rows[0].total_records).toBe(5);   // the row count lives on the session
  });

  it('a file staged by the worker is deleted when the job finishes', async () => {
    process.env.ETL_SYNC_MAX_BYTES = '10';
    process.env.ETL_STAGE_CHUNK_ROWS = '1000';
    const up = await upload(admin.token, 'temp-worker.csv', csvOf(20));
    const sid = (await ownImport(up.body.file_id)).body.session_id;
    expect(fs.existsSync((await fileRow(up.body.file_id)).file_path)).toBe(true);   // the worker still needs it
    const ev = await pool.query(`SELECT payload FROM gt_events WHERE event_type = 'IMPORT_STAGE_REQUESTED' AND source_id = $1`, [String(sid)]);
    await runStageJob(pool, admin.tenant, ev.rows[0].payload, 0);
    const after = await fileRow(up.body.file_id);
    expect(fs.existsSync(after.file_path)).toBe(false);
    expect(after.processing_status).toBe('completed');
  });

  it('the same content is refused once staged — renaming does not get it through', async () => {
    process.env.ETL_SYNC_MAX_BYTES = '10485760';
    const body = csvOf(3);
    const first = await upload(admin.token, 'original.csv', body);
    expect((await ownImport(first.body.file_id)).status).toBe(201);
    for (const name of ['original.csv', 'renamed copy.csv']) {
      const again = await upload(admin.token, name, body);
      expect(again.status).toBe(409);
      expect(again.body.error.code).toBe('ALREADY_IMPORTED');
      expect(again.body.error.message).toMatch(/renaming it does not change that/);
    }
    // An edited file is a new delivery; its overlapping rows are duplicates, not a refusal.
    const edited = await upload(admin.token, 'original.csv', body + 'One more Co,onemore.in,Pune,411001\n');
    expect(edited.status).toBe(201);
  });

  it('a failed import never blocks its own file', async () => {
    process.env.ETL_SYNC_MAX_BYTES = '10';
    process.env.ETL_STAGE_CHUNK_ROWS = '10';
    const body = csvOf(30, 25);
    const up = await upload(admin.token, 'fails.csv', body);
    const sid = (await ownImport(up.body.file_id)).body.session_id;
    const ev = await pool.query(`SELECT payload FROM gt_events WHERE event_type = 'IMPORT_STAGE_REQUESTED' AND source_id = $1`, [String(sid)]);
    await expect(runStageJob(pool, admin.tenant, ev.rows[0].payload, 0)).rejects.toThrow(/not valid CSV/);
    const failed = await fileRow(up.body.file_id);
    expect(fs.existsSync(failed.file_path)).toBe(false);
    expect(failed.processing_status).toBe('failed');

    // The same bytes come back in, and a new import is created from them.
    const again = await upload(admin.token, 'fails.csv', body);
    expect(again.status).toBe(201);
    const second = await ownImport(again.body.file_id);
    expect(second.status).toBe(202);
    const loads = await pool.query(
      `SELECT l.status FROM ki_import_sessions s JOIN gt_source_loads l ON l.id = s.load_id WHERE s.id = ANY($1::int[]) ORDER BY s.id`,
      [[sid, second.body.session_id]]);
    expect(loads.rows.map((r) => r.status)).toEqual(['retired', 'active']);   // the failed one stepped aside
  });

  it('a file that is gone says so, and may be uploaded again', async () => {
    process.env.ETL_SYNC_MAX_BYTES = '10485760';
    const body = csvOf(2);
    const up = await upload(admin.token, 'vanished.csv', body);
    fs.unlinkSync((await fileRow(up.body.file_id)).file_path);   // a deploy, or the sweep
    const h = await call('GET', `/headers/${up.body.file_id}`, undefined);
    expect(h.status).toBe(410);
    expect(h.body.error.code).toBe('FILE_GONE');
    expect((await ownImport(up.body.file_id)).status).toBe(410);
    expect((await upload(admin.token, 'vanished.csv', body)).status).toBe(201);
  });

  it('an upload never staged is swept after the TTL; one being staged is not', async () => {
    process.env.ETL_SYNC_MAX_BYTES = '10';
    const abandoned = await upload(admin.token, 'abandoned.csv', csvOf(2));
    const inFlight = await upload(admin.token, 'in-flight.csv', csvOf(2));
    await ownImport(inFlight.body.file_id);   // 202: the worker has not run yet
    await pool.query(`UPDATE ki_file_uploads SET created_at = now() - interval '25 hours' WHERE id = ANY($1::int[])`,
      [[abandoned.body.file_id, inFlight.body.file_id]]);
    await upload(admin.token, 'trigger.csv', csvOf(1));   // each upload sweeps
    const a = await fileRow(abandoned.body.file_id);
    expect(fs.existsSync(a.file_path)).toBe(false);
    expect(a.processing_status).toBe('failed');
    expect(fs.existsSync((await fileRow(inFlight.body.file_id)).file_path)).toBe(true);
  });
});
