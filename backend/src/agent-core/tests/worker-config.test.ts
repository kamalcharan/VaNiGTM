/** worker.config — the worker's settings from .env, no defaults (2026-09-30). */
import { readWorkerConfig, WorkerConfigError } from '../worker.config';

const FULL = { WORKER_POLL_MS: '3000', WORKER_BATCH_SIZE: '5', WORKER_HEARTBEAT_MS: '30000',
  WORKER_STALE_CLAIM_SECONDS: '120', WORKER_MAX_ATTEMPTS: '3' };
const problems = (env: NodeJS.ProcessEnv) => {
  try { readWorkerConfig(env); return []; } catch (e) { return (e as WorkerConfigError).problems; }
};

describe('worker.config', () => {
  it('reads a complete configuration', () => {
    expect(readWorkerConfig(FULL)).toEqual({ pollMs: 3000, batchSize: 5, heartbeatMs: 30000, staleClaimSeconds: 120, maxAttempts: 3 });
  });
  it('has no defaults — every missing one is named', () => {
    expect(problems({})).toHaveLength(5);
  });
  it('rejects a non-numeric stale claim — it reaches SQL only as a parameter', () => {
    expect(problems({ ...FULL, WORKER_STALE_CLAIM_SECONDS: '2 minutes' })[0])
      .toMatch(/WORKER_STALE_CLAIM_SECONDS=2 minutes is not a whole number/);
  });
});
