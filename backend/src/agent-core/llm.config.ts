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
 * That includes the numbers inside the algorithms — the tokens reserved for
 * the chat template, the calibration margins, the prefill factor, the default
 * answer size — and the list of providers a BYOK tenant may pick. They were
 * proposed as in-code constants; Charan (2026-09-30): "it should move to
 * .env". docs/llm-config.md explains each one.
 */

/** A provider a BYOK tenant can choose; baseUrl null = the tenant supplies it. */
export interface ByokProvider { label: string; baseUrl: string | null; defaultModel: string; keyRequired: boolean }

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

  // ── The budget and timeout arithmetic (docs/llm-config.md) ──
  /** Tokens inside the window taken by the chat template and role markers. */
  templateOverheadTokens: number;
  /** Tokens kept back for a caller's own wrapper around budgeted text. */
  budgetSlackTokens: number;
  /** Safety factor on the ratio learned from a server's "too large" refusal (0–1]. */
  overflowMargin: number;
  /** Calls before a learned chars/token ratio is trusted over the guess. */
  calibrationMinSamples: number;
  /** Answers shorter than this measure latency, not speed, and are ignored. */
  speedMinSampleTokens: number;
  /** A measured speed may not exceed this multiple of LLM_TOKENS_PER_SEC. */
  speedMaxMultiple: number;
  /** How much faster the server reads a prompt than it writes an answer. */
  prefillFactor: number;
  /** Added to every derived timeout for connection and queueing. */
  timeoutSlackMs: number;
  /** Answer tokens when a caller names none. */
  defaultMaxTokens: number;
  /** Temperature when a caller names none. */
  defaultTemperature: number;
  /** Extraction answer reserve = window ÷ divisor, clamped to [min, max]; max when the window is unknown. */
  extractAnswerDivisor: number;
  extractAnswerMin: number;
  extractAnswerMax: number;

  /** Providers a BYOK tenant may pick (LLM_BYOK_PROVIDERS, JSON). */
  byokProviders: Record<string, ByokProvider>;
}

/** Every variable this module reads, in the order .env.example lists them. */
export const LLM_ENV_VARS = [
  'LLM_PRIMARY_URL', 'LLM_PRIMARY_MODEL', 'LLM_PRIMARY_KEY', 'LLM_PRIMARY_TIMEOUT_MS',
  'LLM_PRIMARY_SYSTEM_SUFFIX', 'LLM_CONTEXT_TOKENS', 'LLM_MAX_CONCURRENT',
  'LLM_BYOK_MAX_CONCURRENT', 'LLM_CHARS_PER_TOKEN', 'LLM_TOKENS_PER_SEC',
  'HAIKU_DEFAULT', 'ANTHROPIC_API_KEY', 'LLM_FAILOVER_MODEL',
  'LLM_TEMPLATE_OVERHEAD_TOKENS', 'LLM_BUDGET_SLACK_TOKENS', 'LLM_OVERFLOW_MARGIN',
  'LLM_CALIBRATION_MIN_SAMPLES', 'LLM_SPEED_MIN_SAMPLE_TOKENS', 'LLM_SPEED_MAX_MULTIPLE',
  'LLM_PREFILL_FACTOR', 'LLM_TIMEOUT_SLACK_MS', 'LLM_DEFAULT_MAX_TOKENS', 'LLM_DEFAULT_TEMPERATURE',
  'LLM_EXTRACT_ANSWER_DIVISOR', 'LLM_EXTRACT_ANSWER_MIN', 'LLM_EXTRACT_ANSWER_MAX',
  'LLM_BYOK_PROVIDERS',
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

  const between = (name: string, lo: number, hi: number): number => {
    const raw = str(name);
    if (raw === '') return NaN;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < lo || n > hi) { problems.push(`${name}=${raw} must be between ${lo} and ${hi}`); return NaN; }
    return n;
  };

  const providers = (): Record<string, ByokProvider> => {
    const raw = str('LLM_BYOK_PROVIDERS');
    if (raw === '') return {};
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch {
      problems.push('LLM_BYOK_PROVIDERS is not valid JSON'); return {};
    }
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      problems.push('LLM_BYOK_PROVIDERS must be a JSON object keyed by provider code'); return {};
    }
    const out: Record<string, ByokProvider> = {};
    for (const [code, v] of Object.entries(parsed as Record<string, any>)) {
      const ok = v && typeof v.label === 'string' && v.label.trim()
        && (v.baseUrl === null || (typeof v.baseUrl === 'string' && /^https?:\/\//.test(v.baseUrl)))
        && typeof v.defaultModel === 'string' && typeof v.keyRequired === 'boolean';
      if (!ok) { problems.push(`LLM_BYOK_PROVIDERS.${code} needs {label, baseUrl (http(s) URL or null), defaultModel, keyRequired}`); continue; }
      out[code] = { label: v.label, baseUrl: v.baseUrl, defaultModel: v.defaultModel, keyRequired: v.keyRequired };
    }
    return out;
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

    templateOverheadTokens: int('LLM_TEMPLATE_OVERHEAD_TOKENS', 0),
    budgetSlackTokens:      int('LLM_BUDGET_SLACK_TOKENS', 0),
    overflowMargin:         between('LLM_OVERFLOW_MARGIN', 0.01, 1),
    calibrationMinSamples:  int('LLM_CALIBRATION_MIN_SAMPLES', 1),
    speedMinSampleTokens:   int('LLM_SPEED_MIN_SAMPLE_TOKENS', 1),
    speedMaxMultiple:       num('LLM_SPEED_MAX_MULTIPLE', 0),
    prefillFactor:          num('LLM_PREFILL_FACTOR', 0),
    timeoutSlackMs:         int('LLM_TIMEOUT_SLACK_MS', 0),
    defaultMaxTokens:       int('LLM_DEFAULT_MAX_TOKENS', 1),
    defaultTemperature:     between('LLM_DEFAULT_TEMPERATURE', 0, 2),
    extractAnswerDivisor:   num('LLM_EXTRACT_ANSWER_DIVISOR', 0),
    extractAnswerMin:       int('LLM_EXTRACT_ANSWER_MIN', 1),
    extractAnswerMax:       int('LLM_EXTRACT_ANSWER_MAX', 1),

    byokProviders:          providers(),
  };
  if (cfg.extractAnswerMin > cfg.extractAnswerMax) {
    problems.push(`LLM_EXTRACT_ANSWER_MIN (${cfg.extractAnswerMin}) is above LLM_EXTRACT_ANSWER_MAX (${cfg.extractAnswerMax})`);
  }

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
