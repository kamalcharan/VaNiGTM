/**
 * Common-pool enrichment settings (release 4, D-Q19), from .env — no defaults,
 * like every LLM and worker setting (CLAUDE.md "LLM configuration — .env
 * only"). The suggested values are in backend/.env.example.
 *
 * Checked when the API and the worker start (assertEnrichConfig), read at call
 * time everywhere else so tests can set them per case.
 */
export interface EnrichConfig {
  /** Companies the pool may read in a UTC day, across every run (E4). Not tokens. */
  dailyRecords: number;
  /** Pages read per company besides the home page (About, Contact, Products). */
  pagesPerCompany: number;
  /** Below this confidence a model's answer for a field is not written (abstain). */
  minConfidence: number;
  /** Tokens of site text the HIGH call may carry. */
  readTokens: number;
  /** Answer cap of the HIGH call (what it does, industry, type, size, graph). */
  highMaxTokens: number;
  /** Answer cap of the LOW call (which contacts are the company's own). */
  lowMaxTokens: number;
}

export class EnrichConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(`ENRICH_CONFIG_INVALID: ${problems.join('; ')}. Set them in .env — see backend/.env.example.`);
    this.name = 'EnrichConfigError';
  }
}

export function readEnrichConfig(env: NodeJS.ProcessEnv = process.env): EnrichConfig {
  const problems: string[] = [];
  const int = (name: string, min: number): number => {
    const raw = (env[name] ?? '').trim();
    if (!raw) { problems.push(`${name} is not set`); return NaN; }
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) { problems.push(`${name}=${raw} is not a whole number ≥ ${min}`); return NaN; }
    return n;
  };
  const ratio = (name: string): number => {
    const raw = (env[name] ?? '').trim();
    if (!raw) { problems.push(`${name} is not set`); return NaN; }
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0 || n > 1) { problems.push(`${name}=${raw} is not a number in (0, 1]`); return NaN; }
    return n;
  };
  const cfg: EnrichConfig = {
    dailyRecords: int('ENRICH_POOL_DAILY_RECORDS', 1),
    pagesPerCompany: int('ENRICH_POOL_PAGES', 0),
    minConfidence: ratio('ENRICH_POOL_MIN_CONFIDENCE'),
    readTokens: int('ENRICH_POOL_READ_TOKENS', 200),
    highMaxTokens: int('ENRICH_POOL_HIGH_MAX_TOKENS', 100),
    lowMaxTokens: int('ENRICH_POOL_LOW_MAX_TOKENS', 50),
  };
  if (problems.length) throw new EnrichConfigError(problems);
  return cfg;
}

export function assertEnrichConfig(who: string): EnrichConfig {
  const c = readEnrichConfig();
  console.log(`[${who}] Pool enrichment: ${c.dailyRecords} records a day, ${c.pagesPerCompany} pages a company, `
    + `confidence ≥ ${c.minConfidence}, ${c.readTokens} tokens of site text, answers ≤ ${c.highMaxTokens}/${c.lowMaxTokens}`);
  return c;
}
