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

/**
 * Tokens, roughly. Four characters per token is the usual English heuristic
 * and it is wrong in both directions — JSON and code run denser, other scripts
 * far denser. It is used only to REFUSE a call that is clearly over, never to
 * trim one, so a loose estimate costs a rejected call that might have fit, and
 * the error says it is an estimate so nobody reads it as a measurement.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

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
): ContextCheck | null {
  if (posture !== 'platform' || PLATFORM_CONTEXT <= 0) return null;
  const estimatedPromptTokens = estimateTokens(text);
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
