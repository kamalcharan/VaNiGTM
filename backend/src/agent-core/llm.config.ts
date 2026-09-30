/**
 * Every LLM setting, from .env — and nowhere else.
 *
 * Charan, 2026-09-30: "we will have to use qwen hosted on the self VPS; haiku
 * will be the fallback; no hardcoding anywhere unless my approval — otherwise
 * everything comes from .env."
 *
 * Before this file, each setting had a value in code standing behind the env
 * var (`?? 'http://localhost:11434'`, `?? 'qwen2.5'`, `?? '8192'`, …). A
 * default is a silent decision: the Main VPS ran for weeks against
 * `localhost:11434` — Ollama's port, but inside a container `localhost` is the
 * container — because the URL was never set and the code quietly supplied one
 * (CLAUDE.md, "Main VPS — known broken"). Rule 12 applies to configuration too.
 *
 * So there are no defaults. A setting that is missing or malformed stops the
 * process at start with the full list of what to fix — `assertLlmConfig()` is
 * called by server.ts and worker.ts before they do anything else — and a
 * caller that reaches one anyway gets the same named error, never a guess.
 *
 * Read at CALL time, not import time: tests set the environment per case, and
 * a value frozen when the module loaded is how a test ends up asserting
 * against the wrong configuration without knowing it.
 *
 * What is NOT here, deliberately: the numbers inside the algorithms (the 200
 * tokens reserved for the chat template, the 64 kept for a caller's wrapper,
 * the prefill factor, the calibration margins). They are properties of how
 * the budget is computed, not of the deployment; they are listed with their
 * reasons in docs/llm-config.md and stay in code by Charan's approval.
 */

export interface LlmConfig {
  /** The platform model — Charan's self-hosted qwen, OpenAI-compatible. */
  primaryUrl: string;
  primaryModel: string;
  /** Empty for a self-hosted endpoint with no auth. Optional by nature. */
  primaryKey: string;
  /** Floor for every call's timeout; the real one is derived per call from the measured speed. */
  primaryTimeoutMs: number;
  /**
   * Appended to every PLATFORM system prompt, e.g. `/no_think` for qwen3.
   * It used to be added whenever the model name contained "qwen" — model
   * behaviour keyed on a string match. Now it is declared; empty means none.
   * Never sent to a tenant's endpoint, and stripped before the Claude failover.
   */
  primarySystemSuffix: string;
  /** The platform server's real window in tokens (e.g. n_ctx). 0 = unknown: no budget, no check. */
  contextTokens: number;
  /** Platform calls in flight at once, across every process (C5). */
  maxConcurrent: number;
  /** A tenant endpoint's calls in flight at once, per process. */
  byokMaxConcurrent: number;
  /** Cold-start chars-per-token guess, until the server reports real counts. */
  charsPerToken: number;
  /** Cold-start generation-speed guess, until calls are measured. */
  tokensPerSec: number;
  /** true = fail over to Claude on its own; false = park the run and ask a person. */
  haikuDefault: boolean;
  /** The Claude model used when the platform model is unreachable. Required when ANTHROPIC_API_KEY is set. */
  failoverModel: string | null;
}

/** Every variable this module reads, in the order .env.example lists them. */
export const LLM_ENV_VARS = [
  'LLM_PRIMARY_URL', 'LLM_PRIMARY_MODEL', 'LLM_PRIMARY_KEY', 'LLM_PRIMARY_TIMEOUT_MS',
  'LLM_PRIMARY_SYSTEM_SUFFIX', 'LLM_CONTEXT_TOKENS', 'LLM_MAX_CONCURRENT',
  'LLM_BYOK_MAX_CONCURRENT', 'LLM_CHARS_PER_TOKEN', 'LLM_TOKENS_PER_SEC',
  'HAIKU_DEFAULT', 'ANTHROPIC_API_KEY', 'LLM_FAILOVER_MODEL',
] as const;

export class LlmConfigError extends Error {
  constructor(public readonly problems: string[]) {
    super(
      `LLM_CONFIG_INVALID: ${problems.join('; ')}. `
      + 'Every LLM setting comes from .env — see backend/.env.example.',
    );
    this.name = 'LlmConfigError';
  }
}

export function readLlmConfig(env: NodeJS.ProcessEnv = process.env): LlmConfig {
  const problems: string[] = [];

  const str = (name: string, opts: { allowEmpty?: boolean } = {}): string => {
    const v = env[name];
    if (v === undefined) { problems.push(`${name} is not set`); return ''; }
    if (!opts.allowEmpty && v.trim() === '') { problems.push(`${name} is empty`); return ''; }
    return v.trim();
  };
  const int = (name: string, min: number): number => {
    const raw = str(name);
    if (raw === '') return NaN;
    const n = Number(raw);
    if (!Number.isInteger(n) || n < min) { problems.push(`${name}=${raw} is not a whole number ≥ ${min}`); return NaN; }
    return n;
  };
  const num = (name: string, minExclusive: number): number => {
    const raw = str(name);
    if (raw === '') return NaN;
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= minExclusive) { problems.push(`${name}=${raw} must be a number > ${minExclusive}`); return NaN; }
    return n;
  };
  const bool = (name: string): boolean => {
    const raw = str(name).toLowerCase();
    if (raw === '') return false;
    if (raw !== 'true' && raw !== 'false') { problems.push(`${name}=${raw} must be true or false`); return false; }
    return raw === 'true';
  };

  const primaryUrl = str('LLM_PRIMARY_URL').replace(/\/+$/, '');
  if (primaryUrl && !/^https?:\/\//.test(primaryUrl)) problems.push(`LLM_PRIMARY_URL=${primaryUrl} is not an http(s) URL`);

  const cfg: LlmConfig = {
    primaryUrl,
    primaryModel:        str('LLM_PRIMARY_MODEL'),
    primaryKey:          str('LLM_PRIMARY_KEY', { allowEmpty: true }),
    primaryTimeoutMs:    int('LLM_PRIMARY_TIMEOUT_MS', 1000),
    primarySystemSuffix: str('LLM_PRIMARY_SYSTEM_SUFFIX', { allowEmpty: true }),
    contextTokens:       int('LLM_CONTEXT_TOKENS', 0),
    maxConcurrent:       int('LLM_MAX_CONCURRENT', 1),
    byokMaxConcurrent:   int('LLM_BYOK_MAX_CONCURRENT', 1),
    charsPerToken:       num('LLM_CHARS_PER_TOKEN', 0),
    tokensPerSec:        num('LLM_TOKENS_PER_SEC', 0),
    haikuDefault:        bool('HAIKU_DEFAULT'),
    failoverModel:       null,
  };

  // The failover exists only when there is a key to fail over WITH; then its
  // model is required — which Claude model spends Vikuna's money is not
  // something the code gets to pick.
  if ((env.ANTHROPIC_API_KEY ?? '').trim() !== '') {
    cfg.failoverModel = str('LLM_FAILOVER_MODEL') || null;
  }

  if (problems.length) throw new LlmConfigError(problems);
  return cfg;
}

/**
 * Called first thing by server.ts and worker.ts. Prints what is in force (never
 * a key) so "which model is this box on?" is answered by the log, and throws
 * with every problem at once so a deploy is fixed in one edit, not five.
 */
export function assertLlmConfig(scope: string): LlmConfig {
  const c = readLlmConfig();
  console.log(
    `[${scope}] LLM platform=${c.primaryModel} @ ${c.primaryUrl}`
    + ` window=${c.contextTokens || 'unknown'} concurrent=${c.maxConcurrent}`
    + ` failover=${c.failoverModel ?? 'none (no ANTHROPIC_API_KEY)'}`
    + ` automatic=${c.failoverModel ? c.haikuDefault : 'n/a'}`,
  );
  return c;
}
