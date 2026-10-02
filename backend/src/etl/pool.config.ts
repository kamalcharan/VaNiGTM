/**
 * Common pool matching settings, from .env — no defaults (S8, approved
 * 2026-10-01; the suggested values are in backend/.env.example).
 *
 * Checked when the API and the worker start (assertPoolConfig), read at call
 * time everywhere else so tests can set them per case.
 */
export interface PoolConfig {
  /** Rung 4: name similarity (trigram) to link within the same city. */
  matchLinkMin: number;
  /** Rung 5: from here up to matchLinkMin, same state → flag for a person. */
  matchReviewMin: number;
  /** Rung 2: same domain AND at least this name similarity → the same company. */
  matchDomainNameMin: number;
  /** Source rows resolved per transaction by the worker. */
  resolveChunkRows: number;
}

export class PoolConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`POOL_CONFIG_INVALID: ${problems.join('; ')}. Set them in .env — see backend/.env.example.`);
    this.name = 'PoolConfigError';
  }
}

export function readPoolConfig(env: NodeJS.ProcessEnv = process.env): PoolConfig {
  const problems: string[] = [];
  const ratio = (name: string): number => {
    const raw = (env[name] ?? '').trim();
    if (!raw) { problems.push(`${name} is not set`); return NaN; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 1) { problems.push(`${name}=${raw} is not a number in (0, 1]`); return NaN; }
    return n;
  };
  const int = (name: string): number => {
    const raw = (env[name] ?? '').trim();
    if (!raw) { problems.push(`${name} is not set`); return NaN; }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < 1) { problems.push(`${name}=${raw} is not a whole number ≥ 1`); return NaN; }
    return n;
  };
  const cfg: PoolConfig = {
    matchLinkMin: ratio('MATCH_LINK_MIN'),
    matchReviewMin: ratio('MATCH_REVIEW_MIN'),
    matchDomainNameMin: ratio('MATCH_DOMAIN_NAME_MIN'),
    resolveChunkRows: int('POOL_RESOLVE_CHUNK_ROWS'),
  };
  if (!problems.length && cfg.matchReviewMin >= cfg.matchLinkMin) {
    problems.push(`MATCH_REVIEW_MIN (${cfg.matchReviewMin}) must be below MATCH_LINK_MIN (${cfg.matchLinkMin})`);
  }
  if (problems.length) throw new PoolConfigError(problems);
  return cfg;
}

export function assertPoolConfig(who: string): PoolConfig {
  const c = readPoolConfig();
  console.log(`[${who}] Pool matching: link ≥ ${c.matchLinkMin}, review ≥ ${c.matchReviewMin}, `
    + `domain+name ≥ ${c.matchDomainNameMin}, ${c.resolveChunkRows} rows per resolve chunk`);
  return c;
}
