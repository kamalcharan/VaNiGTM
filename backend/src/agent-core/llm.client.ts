/**
 * Vikuna Agent Core — LLM Client
 *
 * PRIMARY: VPS-hosted OpenAI-compatible endpoint (Ollama, vLLM, llama.cpp,
 *          LM Studio — anything that speaks /v1/chat/completions).
 *          Config: LLM_PRIMARY_URL + LLM_PRIMARY_MODEL.
 *          Zero external cost. All routine agent work runs here.
 *
 * ESCALATION: escalate() — stub. Throws ESCALATION_NOT_IMPLEMENTED.
 *             Will be wired up to Anthropic / OpenAI when an agent
 *             actually needs reasoning beyond the VPS model. No SDK
 *             installed until that day.
 *
 * Token budget: enforced per tenant per day via gt_tenant_context.
 *               vps and escalation usage tracked separately.
 *
 * Validation: callLLMValidated() — parses JSON output with a Zod schema.
 *             Retries ONCE with a correction message before throwing.
 */

import { z } from 'zod';
import type { Pool } from 'pg';
import { createTenantDb } from '../db';

/* ── VPS LLM config ──────────────────────────────────────────────────────── */

const VPS_URL   = process.env.LLM_PRIMARY_URL   ?? 'http://localhost:11434';
const VPS_MODEL = process.env.LLM_PRIMARY_MODEL ?? 'qwen2.5';
const VPS_TIMEOUT_MS = parseInt(process.env.LLM_PRIMARY_TIMEOUT_MS ?? '60000', 10);
const VPS_KEY   = process.env.LLM_PRIMARY_KEY   || '';

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

async function checkTokenBudget(
  pool: Pool,
  tenantId: string,
  estimatedTokens: number,
): Promise<void> {
  const db = createTenantDb(pool, tenantId);
  const result = await db.query<{
    daily_token_limit: number;
    daily_token_usage: Record<string, DailyUsage>;
  }>(
    `SELECT daily_token_limit, daily_token_usage
       FROM gt_tenant_context
      WHERE tenant_id = $tenant_id`,
    { tenant_id: tenantId },
  );

  // No context row yet → allow. ensureTenantContext should be called by the
  // agent at startup, but a missing row should not block first-time agents.
  if (!result.rows[0]) return;

  const today = new Date().toISOString().split('T')[0];
  const usage = result.rows[0].daily_token_usage?.[today] ?? {};
  const total = (usage.vps ?? 0) + (usage.escalation ?? 0);
  const limit = result.rows[0].daily_token_limit ?? 100000;

  if (total + estimatedTokens > limit) {
    throw new Error(
      `TOKEN_BUDGET_EXCEEDED: Tenant ${tenantId} has used ${total} tokens today (limit: ${limit})`,
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

/**
 * Call the VPS-hosted LLM via OpenAI-compatible /v1/chat/completions.
 * Works with Ollama, vLLM, llama.cpp server, LM Studio.
 *
 * Records token usage in gt_tenant_context.daily_token_usage.vps.
 * Throws on transport / non-200 / budget exceeded.
 */
export async function callLLM(options: LLMCallOptions): Promise<LLMResult> {
  const { tenantId, pool, system, messages, maxTokens = 1000, temperature = 0.2 } = options;

  await checkTokenBudget(pool, tenantId, maxTokens);

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

/* ── Escalation (stub) ──────────────────────────────────────────────────── */

/**
 * Placeholder for future external LLM (Anthropic / OpenAI) integration.
 * No SDK is installed yet. Wire up when the first agent needs complex
 * reasoning beyond the VPS model.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export async function escalate(_prompt: string, _context?: string): Promise<string> {
  throw new Error(
    'ESCALATION_NOT_IMPLEMENTED: External LLM escalation not yet configured. ' +
    'The VPS model handles all current agent reasoning.',
  );
}

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
export async function callLLMValidated<T>(
  options: LLMCallOptions,
  schema: z.ZodSchema<T>,
  jsonPath?: string,
): Promise<T> {
  const tryParse = (text: string): T | null => {
    try {
      let raw = text.replace(/```json|```/g, '').trim();
      if (jsonPath) {
        const re    = new RegExp(`<${jsonPath}>([\\s\\S]*?)<\\/${jsonPath}>`);
        const match = raw.match(re);
        if (match) raw = match[1].trim();
      }
      return schema.parse(JSON.parse(raw));
    } catch {
      return null;
    }
  };

  const first  = await callLLM(options);
  const parsed = tryParse(first.text);
  if (parsed !== null) return parsed;

  // Retry once with explicit correction.
  const correctionMessages: LLMCallOptions['messages'] = [
    ...options.messages,
    { role: 'assistant', content: first.text },
    {
      role: 'user',
      content: 'Your response was not valid JSON. Respond with ONLY valid JSON. No explanation, no markdown fences.',
    },
  ];

  const retry        = await callLLM({ ...options, messages: correctionMessages });
  const parsedRetry  = tryParse(retry.text);
  if (parsedRetry !== null) return parsedRetry;

  throw new Error(
    `LLM_VALIDATION_FAILED: Could not parse valid JSON after retry. ` +
    `Last response: ${retry.text.slice(0, 200)}`,
  );
}
