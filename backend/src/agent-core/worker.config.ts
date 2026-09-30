/**
 * The worker's settings, from .env — no defaults (Charan, 2026-09-30: "no
 * hardcoding anywhere … everything comes from .env").
 *
 * Checked when the worker starts (assertWorkerConfig), and read at call time
 * everywhere else, so tests can set them per case. Missing or malformed values
 * are all reported at once.
 */
export interface WorkerConfig {
  /** How often the worker polls gt_events. */
  pollMs: number;
  /** Events claimed per poll. */
  batchSize: number;
  /** How often a running handler stamps "still alive" (must be well under staleClaimSeconds). */
  heartbeatMs: number;
  /** A claim with no heartbeat for this many seconds is presumed orphaned. */
  staleClaimSeconds: number;
  /** Claims before an event is failed as poison instead of retried. */
  maxAttempts: number;
}

export class WorkerConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`WORKER_CONFIG_INVALID: ${problems.join('; ')}. Set them in .env — see backend/.env.example.`);
    this.name = 'WorkerConfigError';
  }
}

export function readWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  const problems: string[] = [];
  const int = (name: string, min: number): number => {
    const raw = (env[name] ?? '').trim();
    if (!raw) { problems.push(`${name} is not set`); return NaN; }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) { problems.push(`${name}=${raw} is not a whole number ≥ ${min}`); return NaN; }
    return n;
  };
  const cfg: WorkerConfig = {
    pollMs: int('WORKER_POLL_MS', 100),
    batchSize: int('WORKER_BATCH_SIZE', 1),
    heartbeatMs: int('WORKER_HEARTBEAT_MS', 1000),
    staleClaimSeconds: int('WORKER_STALE_CLAIM_SECONDS', 1),
    maxAttempts: int('WORKER_MAX_ATTEMPTS', 1),
  };
  if (problems.length) throw new WorkerConfigError(problems);
  return cfg;
}

export function assertWorkerConfig(): WorkerConfig {
  const c = readWorkerConfig();
  console.log(`[Worker] poll=${c.pollMs}ms batch=${c.batchSize} heartbeat=${c.heartbeatMs}ms `
    + `stale-claim=${c.staleClaimSeconds}s max-attempts=${c.maxAttempts}`);
  return c;
}
