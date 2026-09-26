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
 * ── What this does NOT do ─────────────────────────────────────────────────
 * The lane is IN-PROCESS. The worker is one process, which is where the five
 * concurrent agents came from, so it covers the failure that happened. It does
 * not span the API process, a second worker, or another box: two workers on
 * one endpoint still make two calls at once. A cross-process limit needs a
 * shared lock (an advisory lock on the endpoint, or the model server's own
 * queue), and that is a decision to raise before building, not a gap to
 * discover later from the same 500.
 *
 * NEITHER GATE TRUNCATES, SUMMARISES OR RETRIES SMALLER. Trimming a prompt to
 * fit changes the question without saying so, and the answer comes back
 * looking exactly like a full one — rule 12. Making a prompt smaller is the
 * caller's job (split the work, ask for less), and it can only do that job if
 * it is told the real numbers.
 */

const PLATFORM_MAX = Math.max(1, parseInt(process.env.LLM_MAX_CONCURRENT ?? '1', 10) || 1);
const BYOK_MAX = Math.max(1, parseInt(process.env.LLM_BYOK_MAX_CONCURRENT ?? '4', 10) || 4);

/**
 * The platform model's context window, in tokens. 8192 is qwen3:8b's default
 * under Ollama; set it to what the deployed server is actually configured for.
 * Zero or unset disables the check rather than guessing.
 */
const PLATFORM_CONTEXT = Math.max(0, parseInt(process.env.LLM_CONTEXT_TOKENS ?? '8192', 10) || 0);

/**
 * Headroom left for the chat template, role markers and the server's own
 * bookkeeping, which are inside the window and not inside our string.
 */
const OVERHEAD_TOKENS = 200;

interface Lane { running: number; waiting: Array<() => void>; limit: number }
const lanes = new Map<string, Lane>();

function laneFor(url: string, limit: number): Lane {
  let lane = lanes.get(url);
  if (!lane) { lane = { running: 0, waiting: [], limit }; lanes.set(url, lane); }
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
  posture: 'platform' | 'byok',
  fn: () => Promise<T>,
  onWait?: (waitedMs: number, queueDepth: number) => void,
): Promise<T> {
  const lane = laneFor(url, posture === 'byok' ? BYOK_MAX : PLATFORM_MAX);
  const startedWaiting = Date.now();

  if (lane.running >= lane.limit) {
    const depth = lane.waiting.length + 1;
    await new Promise<void>((resolve) => lane.waiting.push(resolve));
    onWait?.(Date.now() - startedWaiting, depth);
  }

  lane.running += 1;
  try {
    return await fn();
  } finally {
    lane.running -= 1;
    // Hand the slot to the next waiter rather than letting everyone race for
    // it: FIFO means the run that has waited longest goes next, which is also
    // the one closest to its own timeout.
    const next = lane.waiting.shift();
    if (next) next();
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
const DEFAULT_CHARS_PER_TOKEN = Math.max(1, Number(process.env.LLM_CHARS_PER_TOKEN) || 3);

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
  if (!model || chars <= 0 || PLATFORM_CONTEXT <= 0) return;
  const room = PLATFORM_CONTEXT - OVERHEAD_TOKENS - Math.max(0, reservedOutputTokens);
  if (room <= 0) return;
  const bound = (chars / room) * 0.9;
  if (!Number.isFinite(bound) || bound < 1) return;
  const prev = observed.get(model);
  if (prev && prev.minRatio <= bound) return;    // already budgeting tighter than this bound
  observed.set(model, { minRatio: bound, samples: Math.max(prev?.samples ?? 0, 3) });
}

/** Chars per token for this model: the densest ratio seen, or the heuristic. */
export function charsPerToken(model?: string): number {
  const o = model ? observed.get(model) : undefined;
  if (!o) return DEFAULT_CHARS_PER_TOKEN;
  // Never trust a learned ratio to be MORE generous than the heuristic without
  // evidence from several calls — one short prompt is not a calibration.
  return o.samples >= 3 ? o.minRatio : Math.min(o.minRatio, DEFAULT_CHARS_PER_TOKEN);
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
  if (PLATFORM_CONTEXT <= 0) return Number.MAX_SAFE_INTEGER;   // window unknown, do not cap
  const usable = PLATFORM_CONTEXT - OVERHEAD_TOKENS - reserveOutputTokens;
  const left = usable - estimateTokens(fixedText, model);
  return left <= 0 ? 0 : Math.floor(left * charsPerToken(model));
}

/** Test seam. */
export function __resetCalibration(): void { observed.clear(); }

export interface ContextCheck {
  estimatedPromptTokens: number;
  reservedOutputTokens: number;
  budgetTokens: number;
  fits: boolean;
}

/**
 * Would this call fit? `null` when the window is unknown (BYOK, or the budget
 * turned off), which means "do not judge", not "yes".
 */
export function checkContext(
  posture: 'platform' | 'byok',
  text: string,
  maxTokens: number,
  model?: string,
): ContextCheck | null {
  if (posture !== 'platform' || PLATFORM_CONTEXT <= 0) return null;
  const estimatedPromptTokens = estimateTokens(text, model);
  const budgetTokens = PLATFORM_CONTEXT - OVERHEAD_TOKENS;
  return {
    estimatedPromptTokens,
    reservedOutputTokens: maxTokens,
    budgetTokens,
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
    + `configured for a larger window. (Prompt size is an estimate at 4 chars/token.)`,
  );
}

/** Test seam — lanes are module state and would leak between cases. */
export function __resetLanes(): void { lanes.clear(); }
