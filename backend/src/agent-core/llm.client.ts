/**
 * Vikuna Agent Core — LLM Client
 *
 * PRIMARY: VPS-hosted OpenAI-compatible endpoint (Ollama, vLLM, llama.cpp,
 *          LM Studio — anything that speaks /v1/chat/completions).
 *          Config: LLM_PRIMARY_URL + LLM_PRIMARY_MODEL.
 *          Zero external cost. All routine agent work runs here.
 *
 * FAILOVER (user-approved rule-12 exception, 2026-07-27): when the VPS
 *          call fails at the TRANSPORT level (LLM_VPS_UNREACHABLE timeout
 *          or LLM_VPS_ERROR non-200) and ANTHROPIC_API_KEY is configured,
 *          the SAME call is retried once on the Claude API
 *          (LLM_FAILOVER_MODEL, default claude-haiku-4-5). Per-call only —
 *          the next call goes back to the VPS primary. NEVER silent:
 *          every failover run gets a visible 'llm_failover' step in
 *          gt_agent_runs.steps carrying the real VPS error, and tokens are
 *          recorded under the separate 'escalation' usage bucket.
 *          Deliberately NOT triggered by LLM_VALIDATION_FAILED — a model
 *          that answers badly is a quality problem that must stay visible,
 *          not get papered over by paid calls.
 *          Without ANTHROPIC_API_KEY behavior is unchanged: fail loudly.
 *
 * Token budget: enforced per tenant per day via gt_tenant_context.
 *               vps and escalation usage tracked separately.
 *
 * Validation: callLLMValidated() — parses JSON output with a Zod schema.
 *             Retries ONCE with a correction message before throwing.
 */

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import type { Pool } from 'pg';
import { createTenantDb } from '../db';
import { appendStep } from './agent.runner';

/* ── VPS LLM config ──────────────────────────────────────────────────────── */

const VPS_URL   = process.env.LLM_PRIMARY_URL   ?? 'http://localhost:11434';
const VPS_MODEL = process.env.LLM_PRIMARY_MODEL ?? 'qwen2.5';
const VPS_TIMEOUT_MS = parseInt(process.env.LLM_PRIMARY_TIMEOUT_MS ?? '60000', 10);
const VPS_KEY   = process.env.LLM_PRIMARY_KEY   || '';

/* ── Claude failover config ──────────────────────────────────────────────── */

const FAILOVER_MODEL = process.env.LLM_FAILOVER_MODEL ?? 'claude-haiku-4-5';

let anthropicClient: Anthropic | null = null;
function getAnthropic(): Anthropic | null {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  if (!anthropicClient) anthropicClient = new Anthropic();
  return anthropicClient;
}

/* ── Types ───────────────────────────────────────────────────────────────── */

export interface LLMCallOptions {
  tenantId: string;
  pool: Pool;
  runId: string | number;
  system: string;
  messages: Array<{ role: 'user' | 'assistant'; content: string }>;
  maxTokens?: number;
  temperature?: number;
}

export interface LLMResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  source: 'vps' | 'escalation';
}

interface DailyUsage { vps?: number; escalation?: number }

/* ── Token budget ────────────────────────────────────────────────────────── */

/**
 * Today's spend, and the cap if this tenant has one.
 *
 * ── METERING AND CAPPING ARE DIFFERENT THINGS ─────────────────────────
 *
 * `used` is always real: every call is counted, cap or no cap. That number is
 * how anyone finds out what a batch of a hundred companies actually costs.
 *
 * `limit` is NULL for most tenants and that is correct (migration 217). A cap
 * exists only because somebody set one FOR THAT TENANT — the framework does
 * not get to impose one by default, which is how a number sized for chat
 * agents came to mean "seven companies" for account research.
 */
export interface TokenBudget {
  /** null = no cap for this tenant. */
  limit: number | null;
  used: number;
  /** Infinity when uncapped. */
  remaining: number;
  /** A cap is in force. When false, nothing here will ever refuse a call. */
  capped: boolean;
  /** There is a context row, so usage is being recorded. */
  tracked: boolean;
}

/**
 * What today has cost, and what is left if anything is limiting it.
 *
 * Exported because a cap that can only be discovered by CRASHING INTO IT is
 * not a cap, it is a trap. A long agent needs to know before it starts how
 * much work it can afford, and a screen needs to say "7 companies fit in what
 * you have left" instead of queueing a hundred and failing at eight.
 */
export async function getTokenBudget(
  pool: Pool,
  tenantId: string,
): Promise<TokenBudget> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<{
    daily_token_limit: number | null;
    daily_token_usage: Record<string, DailyUsage>;
  }>(
    `SELECT daily_token_limit, daily_token_usage
       FROM gt_tenant_context
      WHERE tenant_id = $tenant_id`,
    { tenant_id: tenantId },
  );

  // No context row yet → nothing is counted and nothing is capped.
  // ensureTenantContext should be called by the agent at startup, but a
  // missing row must never block a first-time agent.
  if (!result.rows[0]) {
    return {
      limit: null, used: 0, remaining: Number.POSITIVE_INFINITY,
      capped: false, tracked: false,
    };
  }

  const today = new Date().toISOString().split('T')[0];
  const usage = result.rows[0].daily_token_usage?.[today] ?? {};
  const used  = (usage.vps ?? 0) + (usage.escalation ?? 0);
  const limit = result.rows[0].daily_token_limit;

  // NULL or a non-positive number both mean "no cap". Accepting 0 as well
  // costs nothing and means an operator typing 0 gets what they obviously
  // meant rather than a tenant that can never call anything.
  const capped = typeof limit === 'number' && limit > 0;

  return {
    limit: capped ? limit : null,
    used,
    remaining: capped ? Math.max(0, (limit as number) - used) : Number.POSITIVE_INFINITY,
    capped,
    tracked: true,
  };
}

async function checkTokenBudget(
  pool: Pool,
  tenantId: string,
  estimatedTokens: number,
): Promise<void> {
  const budget = await getTokenBudget(pool, tenantId);
  if (!budget.capped) return;

  if (budget.used + estimatedTokens > (budget.limit as number)) {
    throw new Error(
      `TOKEN_BUDGET_EXCEEDED: Tenant ${tenantId} has used ${budget.used} tokens today `
      + `against a cap of ${budget.limit} that was set for this tenant. This is not the `
      + 'model refusing — change or remove the cap on the Research screen, or wait for '
      + 'midnight UTC.',
    );
  }
}

async function recordTokenUsage(
  pool: Pool,
  tenantId: string,
  tokens: number,
  source: 'vps' | 'escalation',
): Promise<void> {
  if (tokens <= 0) return;
  const today = new Date().toISOString().split('T')[0];
  const db    = createTenantDb(pool, tenantId);

  // jsonb_set with create_missing=true to initialise the day's bucket on first call.
  // Inner expression: COALESCE(existing day, '{"vps":0,"escalation":0}') ||
  //                   {sourceKey: existing[sourceKey] + tokens}
  await db.query(
    `UPDATE gt_tenant_context
        SET daily_token_usage = jsonb_set(
              daily_token_usage,
              ARRAY[$date_key]::text[],
              COALESCE(
                daily_token_usage -> $date_key,
                '{"vps":0,"escalation":0}'::jsonb
              ) || jsonb_build_object(
                $source_key::text,
                COALESCE(
                  ((daily_token_usage -> $date_key) ->> $source_key)::int,
                  0
                ) + $tokens::int
              ),
              true
            ),
            updated_at = now()
      WHERE tenant_id = $tenant_id`,
    {
      tenant_id:  tenantId,
      date_key:   today,
      source_key: source,
      tokens,
    },
  );
}

/* ── Primary: VPS LLM call ──────────────────────────────────────────────── */

async function callVps(options: LLMCallOptions): Promise<LLMResult> {
  const { tenantId, pool, system, messages, maxTokens = 1000, temperature = 0.2 } = options;

  // Qwen3 thinking suppression: append /no_think unless already present.
  const systemContent = system.includes('/no_think')
    ? system
    : `${system.trim()} /no_think`;

  const body = {
    model:       VPS_MODEL,
    max_tokens:  maxTokens,
    temperature,
    stream:      false,
    messages: [
      { role: 'system', content: systemContent },
      ...messages,
    ],
  };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (VPS_KEY) headers['Authorization'] = `Bearer ${VPS_KEY}`;

  let response: Response;
  try {
    response = await fetch(`${VPS_URL}/v1/chat/completions`, {
      method:  'POST',
      headers,
      body:    JSON.stringify(body),
      signal:  AbortSignal.timeout(VPS_TIMEOUT_MS),
    });
  } catch (err) {
    throw new Error(`LLM_VPS_UNREACHABLE: Cannot reach ${VPS_URL} — ${String(err)}`);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(
      `LLM_VPS_ERROR: ${response.status} ${response.statusText} — ${detail.slice(0, 300)}`,
    );
  }

  const data = await response.json() as {
    choices?: Array<{ message?: { content?: string } }>;
    usage?:   { prompt_tokens?: number; completion_tokens?: number };
  };

  const text         = data.choices?.[0]?.message?.content ?? '';
  const inputTokens  = data.usage?.prompt_tokens     ?? 0;
  const outputTokens = data.usage?.completion_tokens ?? 0;

  await recordTokenUsage(pool, tenantId, inputTokens + outputTokens, 'vps');

  return { text, inputTokens, outputTokens, source: 'vps' };
}

/* ── Failover: Claude API call ──────────────────────────────────────────── */

async function callClaude(options: LLMCallOptions): Promise<LLMResult> {
  const { tenantId, pool, system, messages, maxTokens = 1000 } = options;

  const client = getAnthropic();
  if (!client) {
    throw new Error('CLAUDE_NOT_CONFIGURED: ANTHROPIC_API_KEY is not set');
  }

  // The /no_think suffix is a qwen-ism — strip it for Claude.
  const systemContent = system.replace(/\s*\/no_think\s*$/, '').trim();

  const response = await client.messages.create({
    model:      FAILOVER_MODEL,
    max_tokens: maxTokens,
    system:     systemContent,
    messages,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');

  const inputTokens  = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;

  await recordTokenUsage(pool, tenantId, inputTokens + outputTokens, 'escalation');

  return { text, inputTokens, outputTokens, source: 'escalation' };
}

/* ── Failover visibility — rule 12: never silent ────────────────────────── */

// One 'llm_failover' step per run keeps the feed readable when several calls
// in the same run escalate; every escalation is still console-logged and
// visible in the token accounting ('escalation' bucket).
const failoverNotedRuns = new Set<string>();

async function noteFailover(
  pool: Pool,
  runId: string | number,
  vpsError: string,
): Promise<void> {
  const cause = vpsError.split('\n')[0].slice(0, 200);
  console.warn(`[LLM] VPS failed — failing over to ${FAILOVER_MODEL} (run ${runId}): ${cause}`);

  const key = String(runId);
  if (failoverNotedRuns.has(key)) return;
  failoverNotedRuns.add(key);
  if (failoverNotedRuns.size > 500) failoverNotedRuns.clear(); // bound memory

  try {
    await appendStep(pool, runId, {
      step_name:      'llm_failover',
      action:         `VPS model unavailable — ${FAILOVER_MODEL} took over for this run's failed calls`,
      output_summary: cause,
      status:         'ok',
    });
  } catch (err) {
    console.warn('[LLM] Could not record llm_failover step:', err);
  }
}

/* ── Public entry point ─────────────────────────────────────────────────── */

/**
 * Call the LLM: VPS primary, with per-call Claude failover on transport
 * failure (see header). Budget is checked once up front and covers both
 * paths; usage is recorded under 'vps' or 'escalation' respectively.
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMResult> {
  await checkTokenBudget(options.pool, options.tenantId, options.maxTokens ?? 1000);

  try {
    return await callVps(options);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const transportFailure =
      msg.startsWith('LLM_VPS_UNREACHABLE') || msg.startsWith('LLM_VPS_ERROR');

    if (transportFailure && getAnthropic()) {
      await noteFailover(options.pool, options.runId, msg);
      return callClaude(options);
    }
    throw err; // no key configured, or a non-transport failure → loud, as always
  }
}

/*
 * ── WHY TOKEN_BUDGET_EXCEEDED DOES NOT FAIL OVER ──────────────────────
 *
 * The budget check runs BEFORE callVps, so a budget stop never reaches the
 * catch above — and that is correct, not an oversight.
 *
 * The approved failover exception (CLAUDE.md rule 12) is for TRANSPORT
 * failures: the VPS is unreachable or returned a non-200. That is the machine
 * failing, and spending a few Claude tokens to get past it is obviously right.
 *
 * TOKEN_BUDGET_EXCEEDED is not the machine failing. It is a cap WE set,
 * working exactly as intended. Failing over to a paid API to get around our
 * own limit would mean the limit silently stops being a limit — the one
 * scenario where "it kept working" is the bad outcome, because the whole
 * point of the cap is that someone notices. So it stays loud, and the fix is
 * to raise the cap deliberately or wait for the reset.
 */

/* ── Validated call (JSON with Zod) ─────────────────────────────────────── */

/**
 * Call the VPS LLM and parse the response as JSON validated by a Zod schema.
 *
 * - Strips ```json fences before parsing.
 * - If jsonPath is provided (e.g. "slides"), extracts content between
 *   <slides>...</slides> tags first.
 * - On parse/validation failure, retries ONCE with a correction message
 *   appended ("Your response was not valid JSON...").
 * - Throws LLM_VALIDATION_FAILED on second failure.
 */
/**
 * Why a validated call failed. The distinction is the whole point.
 *
 * ── THE DIAGNOSTIC THIS FIXES ─────────────────────────────────────────
 *
 * This used to be `catch { return null }`, which made a JSON SYNTAX error and
 * a SCHEMA TYPE error indistinguishable — and then reported both as "Could
 * not parse valid JSON".
 *
 * A real pilot failure read:
 *
 *   LLM_VALIDATION_FAILED: Could not parse valid JSON after retry.
 *   Last response: { "what_they_make": "not stated", ... "named_contacts": "not s
 *
 * Everything about that message is misleading. The JSON parsed fine; the
 * model had sent the string "not stated" where an ARRAY was expected. The
 * response was not truncated either — `slice(0, 200)` in the error was doing
 * that. So the message pointed at a token limit that was not the problem and
 * hid the field that was.
 */
type ParseFailure =
  | { stage: 'json'; detail: string }
  | { stage: 'schema'; detail: string; fields: string[] };

/**
 * Both keys on both branches. TypeScript will not narrow a union whose
 * generic appears in only one arm, so `if (r.ok) …` leaves `.failure`
 * unreachable — and working around that with a cast would hide exactly the
 * kind of mistake this type exists to prevent.
 */
type ParseResult<T> =
  | { ok: true;  value: T;          failure?: undefined }
  | { ok: false; value?: undefined; failure: ParseFailure };

/** Zod issues as something a model — and a human — can act on. */
function describeIssues(err: z.ZodError): { detail: string; fields: string[] } {
  const issues = err.issues.slice(0, 6);
  const fields = issues.map((i) => i.path.join('.') || '(root)');
  const detail = issues
    .map((i) => {
      const where = i.path.join('.') || 'the response';
      // "expected array, received string" is the sentence that would have
      // ended the pilot failure in one read.
      const what = 'expected' in i && 'received' in i
        ? `expected ${(i as { expected: unknown }).expected}, got ${(i as { received: unknown }).received}`
        : i.message;
      return `${where}: ${what}`;
    })
    .join('; ');
  return { detail, fields };
}

/**
 * Trims trailing garbage after a syntactically complete top-level JSON
 * value. Small/fast models occasionally tack one stray character (a quote,
 * a period, a repeated closing brace) onto an otherwise-valid object — the
 * JSON itself is complete, only JSON.parse's strict "nothing after the
 * value" rule rejects it. Depth-count only the bracket type the value opens
 * with; brackets of the other type nested inside are self-balancing and
 * never affect that count, so this correctly finds the real end of the
 * value regardless of nesting. Unbalanced/truncated input falls through
 * unchanged — that is a real failure, not this one.
 */
function trimToJsonValue(text: string): string {
  const start = text.search(/[{[]/);
  if (start === -1) return text;

  const open = text[start];
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') { inString = true; continue; }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return text;
}

export async function callLLMValidated<T>(
  options: LLMCallOptions,
  schema: z.ZodSchema<T>,
  jsonPath?: string,
): Promise<T> {
  const tryParse = (text: string): ParseResult<T> => {
    let raw = text.replace(/```json|```/g, '').trim();
    if (jsonPath) {
      const re    = new RegExp(`<${jsonPath}>([\\s\\S]*?)<\\/${jsonPath}>`);
      const match = raw.match(re);
      if (match) raw = match[1].trim();
    }

    let json: unknown;
    try {
      json = JSON.parse(trimToJsonValue(raw));
    } catch (err) {
      return {
        ok: false,
        failure: {
          stage: 'json',
          detail: err instanceof Error ? err.message : String(err),
        },
      };
    }

    const result = schema.safeParse(json);
    if (result.success) return { ok: true, value: result.data };
    return { ok: false, failure: { stage: 'schema', ...describeIssues(result.error) } };
  };

  /**
   * A correction the model can act on.
   *
   * The old one always said "your response was not valid JSON". When the JSON
   * was valid and only the TYPES were wrong, the model read that, looked at
   * its own perfectly-valid JSON, and sent the same thing back — so the retry
   * was guaranteed to fail in exactly the same way. Naming the field and the
   * expected type is the difference between a retry and a second identical
   * attempt.
   */
  const correction = (f: ParseFailure): string =>
    f.stage === 'json'
      ? `Your response was not valid JSON (${f.detail}). Respond with ONLY the JSON `
        + 'object. No explanation, no markdown fences, no trailing commas.'
      : `Your JSON was valid but the types were wrong — ${f.detail}. Fix ONLY those `
        + 'fields and resend the whole object. A field with nothing to report must '
        + 'still use its declared type: an empty array [] for lists, null for text. '
        + 'Never the string "not stated" where a list is expected.';

  const first = await callLLM(options);
  const parsed = tryParse(first.text);
  if (parsed.ok) return parsed.value as T;
  const firstFailure = parsed.failure!;

  const retry = await callLLM({
    ...options,
    messages: [
      ...options.messages,
      { role: 'assistant', content: first.text },
      { role: 'user', content: correction(firstFailure) },
    ],
  });
  const parsedRetry = tryParse(retry.text);
  if (parsedRetry.ok) return parsedRetry.value as T;

  // Both attempts named, because "it failed twice the same way" and "it failed
  // two different ways" call for different fixes — a prompt change versus a
  // schema that does not match what the model can produce.
  const f = parsedRetry.failure!;
  const what = f.stage === 'json'
    ? `the response was not valid JSON (${f.detail})`
    : `the JSON was valid but did not match the expected shape — ${f.detail}`;

  throw new Error(
    `LLM_VALIDATION_FAILED: after a retry, ${what}. `
    + `First attempt failed at the ${firstFailure.stage} stage. `
    // 1,200, and labelled: the old 200-char slice looked exactly like the
    // model truncating and sent the last investigation to the wrong place.
    + `Response (first 1200 chars of ${retry.text.length}): ${retry.text.slice(0, 1200)}`,
  );
}
