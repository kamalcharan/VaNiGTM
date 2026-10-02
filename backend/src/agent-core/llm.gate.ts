/**
 * Two guards on every LLM call: TAKE TURNS, and MEASURE BEFORE YOU SEND.
 *
 * Run 114, 2026-09-18:
 *
 *   [Queue] Reclaimed orphaned events: 5 requeued, 0 failed
 *   [Worker] Run 114 ... LLM_VPS_ERROR: 500 {"message":"Context size has been exceeded."}
 *
 * Those two lines are one event. The reclaim returned five events to pending,
 * `WORKER_BATCH_SIZE` is 5, and `processEvent` is fire-and-forget — so five
 * agents went at one small model server at the same moment. "Context size has
 * been exceeded" from a server serving five concurrent requests is its KV
 * cache split five ways, not one prompt being too long: llama.cpp-family
 * servers divide `n_ctx` across `n_parallel` slots, so the window each request
 * actually gets is a fraction of the advertised one. The same prompts succeed
 * when a run has the box to itself, which is exactly what made this look
 * intermittent.
 *
 * Fixing the batch claim (the CTE) capped how many events are CLAIMED at once.
 * It never capped how many LLM calls are IN FLIGHT at once, and that is the
 * number the model server cares about.
 *
 * ── Gate one: concurrency ──────────────────────────────────────────────────
 * A FIFO queue per endpoint URL. Platform defaults to ONE call at a time,
 * because the platform endpoint is one small model and serialising it is the
 * difference between five slow answers and five failures. Waiting is not
 * degradation — the work still happens, in order, and the worker's 30s
 * heartbeat keeps a queued run from being reclaimed out from under itself.
 *
 * Keyed by URL so a tenant on their own endpoint never queues behind Vikuna's,
 * or behind another tenant's.
 *
 * ── Gate two: the context budget ───────────────────────────────────────────
 * A server that answers 500 has already spent the round trip and tells us
 * nothing about how big the prompt was. When the window is known we check
 * first and refuse with the numbers: the estimate, the output reservation, the
 * budget, and which prompt. That turns "Context size has been exceeded" into
 * something a person can act on without a reproduction.
 *
 * The check is PLATFORM-ONLY. A tenant's GPT-4o or Claude endpoint has a
 * window we do not know, and guessing 8k for it would refuse calls that would
 * have worked — a silent cap is as bad as a silent fallback. Theirs stays
 * loud: their server says no, in its own words.
 *
 * ── Across processes (POA C5, 2026-09-30) ─────────────────────────────────
 * The in-process lane alone did not span the API process, a second worker, or
 * another box — two processes on one endpoint still made two calls at once.
 * So a PLATFORM call, once through its own process's lane, also takes one of
 * N Postgres advisory locks for that endpoint (N = LLM_MAX_CONCURRENT, the
 * same number — it now means "in flight at once, anywhere", not "per
 * process"). Session-level locks on a dedicated connection: if the process
 * dies mid-call, Postgres drops the connection and the slot frees itself —
 * nothing to reclaim, nothing to expire. The in-process lane stays as the fast
 * path and is what bounds how many DB connections a process can hold for
 * this: never more than N per endpoint.
 *
 * Platform only. The platform endpoint is the shared, self-hosted model this
 * whole file exists to protect; a tenant's own endpoint is their provider's
 * to rate-limit, and the Claude failover goes through the Anthropic SDK, not
 * through here.
 *
 * NEITHER GATE TRUNCATES, SUMMARISES OR RETRIES SMALLER. Trimming a prompt to
 * fit changes the question without saying so, and the answer comes back
 * looking exactly like a full one — rule 12. Making a prompt smaller is the
 * caller's job (split the work, ask for less), and it can only do that job if
 * it is told the real numbers.
 */

// Every setting below is read from .env through llm.config.ts at call time —
// no value in this file stands in for a missing one (Charan, 2026-09-30).
const cfg = () => readLlmConfig();

/**
 * The platform model's context window, in tokens — LLM_CONTEXT_TOKENS, set to
 * what the deployed server is actually configured for (its n_ctx). 0 means
 * "unknown" and disables the budget and the check; it is a declared value, not
 * a missing one.
 */
const platformContext = () => cfg().contextTokens;

/** The platform window as configured (0 = unknown), for callers that size an answer reserve from it. */
export function platformContextTokens(): number { return platformContext(); }

/**
 * Headroom left for the chat template, role markers and the server's own
 * bookkeeping, which are inside the window and not inside our string.
 */
const overheadTokens = () => cfg().templateOverheadTokens;   // LLM_TEMPLATE_OVERHEAD_TOKENS
/** Kept back by charBudgetFor for the caller's own wrapper around the budgeted text. */
export const budgetSlackTokens = () => cfg().budgetSlackTokens;   // LLM_BUDGET_SLACK_TOKENS

import type { Pool, PoolClient } from 'pg';
import { readLlmConfig } from './llm.config';

/**
 * Who is waiting on a call (AGENTS.md §4 rule 5, 2026-10-02). INTERACTIVE — a
 * person is waiting (Smart Profile, the console, a decision card) — goes ahead
 * of BATCH (enrichment, graph extraction) in this process's lane; within each
 * priority the order stays FIFO. Without it an admin's enrichment run slows
 * every tenant's onboarding with no error to show for it.
 *
 * In-process only: the cross-process advisory slot below is first come, first
 * served. That is enough today because the worker runs both kinds; batch model
 * work is meant to run on its own rungs (free pools, Haiku batch — other URLs,
 * other lanes) and reach the platform lane only as a declared rung.
 */
export type LlmPriority = 'interactive' | 'batch';

interface Lane { running: number; waiting: { interactive: Array<() => void>; batch: Array<() => void> }; limit: number }
const lanes = new Map<string, Lane>();

function laneFor(url: string, limit: number): Lane {
  let lane = lanes.get(url);
  if (!lane) { lane = { running: 0, waiting: { interactive: [], batch: [] }, limit }; lanes.set(url, lane); }
  // A limit can only be tightened by a later caller, never loosened — two
  // postures sharing one URL (a tenant pointing BYOK at our endpoint) must get
  // the stricter of the two, or the strict one buys nothing.
  lane.limit = Math.min(lane.limit, limit);
  return lane;
}

/**
 * Run `fn` with at most N in flight against `url`. Returns whatever `fn`
 * returns; `waitedMs` is reported through `onWait` so a caller can make the
 * queueing visible rather than leaving a run looking hung.
 */
export async function withLlmSlot<T>(
  url: string,
  posture: 'platform' | 'byok' | 'external',
  fn: () => Promise<T>,
  onWait?: (waitedMs: number, queueDepth: number, where: 'process' | 'shared') => void,
  /** When given, platform calls also take a cross-process slot (see header). */
  pool?: Pool,
  priority: LlmPriority = 'interactive',
): Promise<T> {
  // An external router rung (Groq, OpenRouter…) is someone else's server with
  // its own rate limits, enforced by the router from gt_llm_calls; in-process
  // it gets the same bound as a tenant's endpoint, and no shared slot.
  const lane = laneFor(url, posture === 'platform' ? cfg().maxConcurrent : cfg().byokMaxConcurrent);
  const startedWaiting = Date.now();

  if (lane.running >= lane.limit) {
    // Depth = everyone who goes before this call.
    const depth = lane.waiting.interactive.length + (priority === 'batch' ? lane.waiting.batch.length : 0) + 1;
    await new Promise<void>((resolve) => lane.waiting[priority].push(resolve));
    onWait?.(Date.now() - startedWaiting, depth, 'process');
  }

  lane.running += 1;
  try {
    if (posture === 'platform' && pool) {
      return await withSharedSlot(pool, url, lane.limit, fn, onWait);
    }
    return await fn();
  } finally {
    lane.running -= 1;
    // Hand the slot to the next waiter rather than letting everyone race for
    // it: interactive first, then FIFO within a priority — the run that has
    // waited longest goes next, which is also the one closest to its timeout.
    const next = lane.waiting.interactive.shift() ?? lane.waiting.batch.shift();
    if (next) next();
  }
}

/**
 * One of `limit` advisory locks for this endpoint, held on a dedicated
 * connection for the length of the call.
 *
 * Keys are the two-int form (namespace hash, slot), which never overlaps the
 * single-bigint `pg_advisory_xact_lock(hashtext(...))` keys used elsewhere.
 * Try every slot without waiting first; if all are busy, block on one. With
 * limit 1 — the platform default — that is exact FIFO-by-Postgres. With more,
 * a blocked caller may wait on a slot while another frees; it is never
 * admitted over the limit, which is the property that matters.
 */
async function withSharedSlot<T>(
  pool: Pool,
  url: string,
  limit: number,
  fn: () => Promise<T>,
  onWait?: (waitedMs: number, queueDepth: number, where: 'process' | 'shared') => void,
): Promise<T> {
  const client: PoolClient = await pool.connect();
  const ns = `vani-llm-lane:${url}`;
  let slot = -1;
  let broken = false;
  try {
    for (let i = 0; i < limit && slot < 0; i++) {
      const r = await client.query<{ ok: boolean }>(
        'SELECT pg_try_advisory_lock(hashtext($1), $2) AS ok', [ns, i]);
      if (r.rows[0]?.ok) slot = i;
    }
    if (slot < 0) {
      const startedWaiting = Date.now();
      const pick = Math.floor(Math.random() * limit);
      await client.query('SELECT pg_advisory_lock(hashtext($1), $2)', [ns, pick]);
      slot = pick;
      onWait?.(Date.now() - startedWaiting, limit, 'shared');
    }
    return await fn();
  } catch (err) {
    // A failure of the LOCK query leaves the session in an unknown state;
    // fn's own failure does not, and is simply rethrown.
    if (slot < 0) broken = true;
    throw err;
  } finally {
    if (slot >= 0) {
      try {
        await client.query('SELECT pg_advisory_unlock(hashtext($1), $2)', [ns, slot]);
      } catch {
        broken = true;   // cannot prove the lock is gone — drop the session, which drops it
      }
    }
    client.release(broken);
  }
}

/* ── Counting tokens without asking twice ──────────────────────────────── */

/**
 * Charan, 2026-09-18: "llm invocation is required to check tokens".
 *
 * Correct — four characters per token is a heuristic, and it is wrong in both
 * directions: JSON and code run denser, Devanagari and CJK far denser, and the
 * error is systematic per model rather than random.
 *
 * But the model already tells us. Every successful response carries
 * `usage.prompt_tokens`, which is the server's own count of the exact string
 * we sent. So instead of a second invocation to a /tokenize endpoint that not
 * every OpenAI-compatible server exposes, this LEARNS from the calls already
 * being made: characters sent ÷ tokens counted, per model, updated on every
 * success.
 *
 * The first call on a cold process still uses 4.0 and is still an estimate.
 * From the second onward the ratio is measured, and it is measured on this
 * tenant's actual prompts in this model's actual tokenizer.
 *
 * Deliberately CONSERVATIVE in how it is applied: a ratio learned from English
 * prose (4.6 chars/token, say) would let a budget through that a sudden block
 * of JSON overruns, so `charsPerToken` never returns more than the observed
 * minimum — the densest text this model has actually seen is what the budget
 * is built on. Optimism here is paid for with a 500.
 */
const observed = new Map<string, { minRatio: number; samples: number }>();

/**
 * The cold-start guess, before any call has reported its count.
 *
 * It was 4, and 4 is what cost the vikuna.io crawl (2026-09-25): the worker
 * restarts on every deploy and every env change, the FIRST call after a
 * restart is the profile drafter filling the whole window at 4 chars/token,
 * and qwen3's tokenizer on crawl text — URLs, page markers, punctuation —
 * runs nearer 3. So the first big call after every restart was over the
 * window by a quarter, the server said "Context size has been exceeded", and
 * a 500 carries no usage, so the calibration never got the sample that would
 * have corrected it. A trap that re-arms itself on every restart.
 *
 * 3 is pessimistic for English prose and about right for what agents actually
 * send. Pessimism here costs a shorter first prompt; optimism costs a 500.
 * `LLM_CHARS_PER_TOKEN` overrides it for a model known to be looser or denser.
 */
const coldCharsPerToken = () => cfg().charsPerToken;

export function noteObservedTokens(model: string, chars: number, promptTokens: number): void {
  // A zero or missing count means the server did not report usage — learning
  // from it would poison the ratio with an infinity.
  if (!model || chars <= 0 || !promptTokens || promptTokens <= 0) return;
  const ratio = chars / promptTokens;
  // A ratio below 1 is not physically meaningful for any tokenizer worth
  // trusting; treat it as a bad sample rather than clamping the budget to zero.
  if (!Number.isFinite(ratio) || ratio < 1) return;
  const prev = observed.get(model);
  observed.set(model, {
    minRatio: prev ? Math.min(prev.minRatio, ratio) : ratio,
    samples: (prev?.samples ?? 0) + 1,
  });
}

/**
 * The server refused a prompt as too large. That is a measurement too: the
 * prompt's real token count was above the room it had, so the model's ratio
 * is BELOW chars ÷ room. Record that bound (with a margin) so the next call is
 * built smaller instead of failing the same way — without it, a 500 teaches
 * nothing and the run loops on the same oversized prompt after every retry.
 * Platform only: a tenant's own window is unknown, so no bound can be derived.
 */
export function noteContextOverflow(model: string, chars: number, reservedOutputTokens: number): void {
  const window = platformContext();
  if (!model || chars <= 0 || window <= 0) return;
  const room = window - overheadTokens() - Math.max(0, reservedOutputTokens);
  if (room <= 0) return;
  const bound = (chars / room) * cfg().overflowMargin;
  if (!Number.isFinite(bound) || bound < 1) return;
  const prev = observed.get(model);
  if (prev && prev.minRatio <= bound) return;    // already budgeting tighter than this bound
  observed.set(model, { minRatio: bound, samples: Math.max(prev?.samples ?? 0, cfg().calibrationMinSamples) });
}

/* ── How fast the model actually answers ──────────────────────────────── */

/**
 * Tokens per second, learned the same way as the ratio: from calls that
 * already happened. A timeout that is configured is a guess; one derived
 * from the slowest generation speed this model has shown is a measurement.
 * `LLM_TOKENS_PER_SEC` is the cold-start guess (qwen3-4b on the VPS: ~12).
 */
const coldTokensPerSec = () => cfg().tokensPerSec;
const speed = new Map<string, { minTps: number; samples: number }>();

export function noteObservedSpeed(model: string, completionTokens: number, ms: number): void {
  // Under 50 tokens the per-token time is dominated by prefill and latency,
  // not generation — a bad sample, not a slow model.
  if (!model || completionTokens < cfg().speedMinSampleTokens || ms <= 0) return;
  const tps = completionTokens / (ms / 1000);
  if (!Number.isFinite(tps) || tps <= 0) return;
  const prev = speed.get(model);
  speed.set(model, { minTps: prev ? Math.min(prev.minTps, tps) : tps, samples: (prev?.samples ?? 0) + 1 });
}

/** The slowest generation speed seen for this model, or the guess. */
export function tokensPerSec(model?: string): number {
  const o = model ? speed.get(model) : undefined;
  const guess = coldTokensPerSec();
  return o ? Math.min(o.minTps, guess * cfg().speedMaxMultiple) : guess;
}

/** Never trust a learned ratio to be MORE generous than the heuristic without
 *  evidence from several calls — one short prompt is not a calibration. */
const effective = (o: { minRatio: number; samples: number }) =>
  (o.samples >= cfg().calibrationMinSamples ? o.minRatio : Math.min(o.minRatio, coldCharsPerToken()));

/**
 * Chars per token: the densest ratio seen for this model, or the heuristic.
 *
 * With NO model — which is how every prompt builder calls it, because the
 * model is resolved per tenant later, inside callLLM — it is the densest ratio
 * seen for ANY platform model. That is what keeps the budget and the check in
 * agreement: the vikuna.io run (2026-09-26) had the drafter budget its text at
 * the heuristic while the gate checked the same call at the ratio it had just
 * learned for qwen3-4b, and refused what the budget had allowed. A budget built
 * on the densest known ratio can never hand out more than the check accepts.
 */
export function charsPerToken(model?: string): number {
  const o = model ? observed.get(model) : undefined;
  if (o) return effective(o);
  let densest = coldCharsPerToken();
  for (const x of observed.values()) densest = Math.min(densest, effective(x));
  return densest;
}

/** Tokens, using whatever this model has taught us so far. */
export function estimateTokens(text: string, model?: string): number {
  return Math.ceil(text.length / charsPerToken(model));
}

/**
 * How many CHARACTERS of variable content still fit.
 *
 * This is the function that makes the budget the authority. Charan, again:
 * `LLM_CONTEXT_TOKENS` is the only place the window is declared, "so ideally
 * that limit should not exceed" — the code must not be able to BUILD a prompt
 * over it. Hand-picked caps cannot do that: `profile.drafter` sliced website
 * text at 24,000 characters, which is ~6,000 tokens before the system prompt,
 * and no one would notice it had outgrown the window until a 500 arrived.
 *
 * Callers pass what is already fixed (system prompt, JSON context) and what
 * they are reserving for the answer; they get back the room that is left.
 * Returns 0 when there is none, which is a real answer: the fixed part alone
 * does not fit, and trimming the variable part to nothing will not save it.
 */
export function charBudgetFor(
  model: string | undefined,
  reserveOutputTokens: number,
  fixedText: string,
): number {
  const window = platformContext();
  if (window <= 0) return Number.MAX_SAFE_INTEGER;   // window unknown, do not cap
  // Slack for what the caller wraps around the text it budgets — a heading,
  // a role line — which the check will count and the budget did not see.
  const usable = window - overheadTokens() - reserveOutputTokens - budgetSlackTokens();
  const left = usable - estimateTokens(fixedText, model);
  return left <= 0 ? 0 : Math.floor(left * charsPerToken(model));
}

/** Test seam. */
export function __resetCalibration(): void { observed.clear(); speed.clear(); }

export interface ContextCheck {
  estimatedPromptTokens: number;
  reservedOutputTokens: number;
  budgetTokens: number;
  /** The ratio the estimate was made at — learned, or the cold-start guess. */
  charsPerToken: number;
  fits: boolean;
}

/**
 * Would this call fit? `null` when the window is unknown (BYOK, or the budget
 * turned off), which means "do not judge", not "yes".
 */
export function checkContext(
  posture: 'platform' | 'byok' | 'external',
  text: string,
  maxTokens: number,
  model?: string,
): ContextCheck | null {
  const window = platformContext();
  if (posture !== 'platform' || window <= 0) return null;
  const estimatedPromptTokens = estimateTokens(text, model);
  const budgetTokens = window - overheadTokens();
  return {
    estimatedPromptTokens,
    reservedOutputTokens: maxTokens,
    budgetTokens,
    charsPerToken: charsPerToken(model),
    // max_tokens is RESERVED inside the window, not added to it — a prompt
    // that fits on its own still fails when the space kept for the answer does
    // not. That is the arithmetic the 500 was hiding.
    fits: estimatedPromptTokens + maxTokens <= budgetTokens,
  };
}

/** The refusal, worded so the fix is obvious from the log line alone. */
export function contextError(c: ContextCheck, label: string): Error {
  return new Error(
    `LLM_CONTEXT_TOO_LARGE: ${label} needs ~${c.estimatedPromptTokens} prompt tokens `
    + `plus ${c.reservedOutputTokens} reserved for the answer, and the platform model's `
    + `window is ${c.budgetTokens} usable. Nothing was sent. Split the work into smaller `
    + `calls, ask for fewer output tokens, or raise LLM_CONTEXT_TOKENS if the server is `
    + `configured for a larger window. (Prompt size is an estimate at ${c.charsPerToken.toFixed(2)} chars/token.)`,
  );
}

/** Test seam — lanes are module state and would leak between cases. */
export function __resetLanes(): void { lanes.clear(); }
