/**
 * One "process" for llm-lane-shared.db.test.ts: takes the platform lane for
 * CALLS calls of HOLD_MS each and prints `start <ms>` / `end <ms>` per call.
 * A separate OS process on purpose — the in-process lane would serialise
 * callers in one process by itself and prove nothing about the shared one.
 */
import { Pool } from 'pg';
import { withLlmSlot } from '../../llm.gate';

const calls = Number(process.env.CALLS || 2);
const hold = Number(process.env.HOLD_MS || 300);
const pool = new Pool({ connectionString: process.env.LANE_DB, max: 4 });

(async () => {
  await Promise.all(Array.from({ length: calls }, () =>
    withLlmSlot('http://lane-test.invalid/v1', 'platform', async () => {
      console.log(`start ${Date.now()}`);
      await new Promise((r) => setTimeout(r, hold));
      console.log(`end ${Date.now()}`);
    }, undefined, pool)));
  await pool.end();
})().catch((e) => { console.error(e); process.exit(1); });
