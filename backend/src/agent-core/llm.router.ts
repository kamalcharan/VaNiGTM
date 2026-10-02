/**
 * The model router — several models serve enrichment, by route (POA D-Q13–D-Q17).
 *
 * Charan, 2026-10-02: "we need to manage with multiple free llms … only qwen
 * and haiku won't be sufficient", and "mark the LLMs to be switched on/off by
 * the admin for enrichment … whatever are on, will run".
 *
 * A routed call names how hard its step is (`route`: high · medium · low) and
 * what its prompt carries (`dataClass`). The route (.env) lists providers in
 * order; this file walks it:
 *
 *   PLAN    per provider, now: switched on by the admin? its terms allow this
 *           data? requests AND tokens left this minute and today? not cooling
 *           down after a 429? the prompt fits its window? Skips are reasons,
 *           not silence.
 *   CALL    the first eligible provider. One row in gt_llm_calls per call.
 *   MOVE    a 429, a timeout, an error → the next provider, as a visible step
 *           in the run ("groq answered 429 — cooling down 60s; trying qwen").
 *           A 429 also cools that provider down for every process.
 *   VERDICT a validated call whose answer fails validation (after one
 *           correction) on a provider → the next provider. Never the same
 *           question again elsewhere without saying so.
 *   STOP    nothing left → LLM_ROUTE_EXHAUSTED with every provider's reason.
 *           Nothing is guessed (rule 12).
 *
 * Haiku is a rung like any other when a route names it (D-Q16a): it replaces
 * the separate failover for routed calls, and the admin's switch is what
 * decides whether enrichment may spend on it.
 *
 * BYOK: a tenant on their own key never enters a route — their calls go to
 * their own endpoint, as every call of theirs does (D-Q15).
 *
 * The data gate (P0 §9.3):
 *   public_company  any provider
 *   tenant          only providers whose terms say no_training
 *   people          only Vikuna's own model (qwen) or Haiku — free providers
 *                   stay closed to personal data until the DPDP review says
 *                   otherwise, whatever their terms
 */
import type { Pool } from 'pg';
import type { z } from 'zod';
import { withTenantClient } from '../db';
import { appendStep } from './agent.runner';
import {
  callClaude, callEndpoint, getTokenBudget, LlmCallError, validateOn,
  type LLMCallOptions, type LLMResult,
} from './llm.client';
import { resolveProvider, platformProvider, type ResolvedProvider } from './llm.provider';
import { readLlmConfig } from './llm.config';
import { charsPerToken } from './llm.gate';
import { readRouterConfig, type RouteClass, type RouterConfig, type RouterProvider } from './llm.router.config';

export type DataClass = 'public_company' | 'tenant' | 'people';
export type Purpose = 'enrichment';

/** The platform-wide state one provider is in right now. */
export interface ProviderState {
  enabled: boolean;
  callsMinute: number;
  callsToday: number;
  cooldownUntil: Date | null;
  tokensMinute: number;
  tokensToday: number;
}

export interface Skip { code: string; reason: string }
export interface RoutePlan { eligible: RouterProvider[]; skipped: Skip[] }

/* ── Plan: pure, so the rules are tested without a database ────────────── */

/** May a prompt of this class go to this provider? null = yes, else why not. */
export function dataGate(p: RouterProvider, dataClass: DataClass): string | null {
  if (dataClass === 'public_company') return null;
  if (dataClass === 'people') {
    return p.kind === 'external'
      ? 'people data never goes to an outside free provider until the DPDP review'
      : null;
  }
  return p.dataTerms === 'no_training' ? null : `${p.dataTerms.replace('_', ' ')} on prompts — this is tenant data`;
}

const EMPTY: ProviderState = { enabled: false, callsMinute: 0, callsToday: 0, cooldownUntil: null, tokensMinute: 0, tokensToday: 0 };
const fmt = (n: number) => n.toLocaleString('en-US');
const hhmmss = (d: Date) => d.toISOString().slice(11, 19) + ' UTC';

/**
 * Which providers of the route may take this call, in order, and why each of
 * the others may not. `promptTokens` + `maxTokens` are checked against each
 * provider's own window: a prompt built for one model is not trimmed to fit
 * another — that provider is skipped, and said to be.
 */
export function planRoute(
  cfg: RouterConfig,
  route: RouteClass,
  dataClass: DataClass,
  state: Record<string, ProviderState>,
  now: Date,
  fit?: { promptChars: number; maxTokens: number; overheadTokens: number },
): RoutePlan {
  const eligible: RouterProvider[] = [];
  const skipped: Skip[] = [];
  for (const code of cfg.routes[route]) {
    const p = cfg.providers[code];
    if (!p) { skipped.push({ code, reason: 'not configured' }); continue; }
    const st = state[code] ?? EMPTY;
    if (!st.enabled) { skipped.push({ code, reason: 'switched off' }); continue; }
    const gate = dataGate(p, dataClass);
    if (gate) { skipped.push({ code, reason: gate }); continue; }
    if (st.cooldownUntil && st.cooldownUntil > now) { skipped.push({ code, reason: `cooling down until ${hhmmss(st.cooldownUntil)}` }); continue; }
    if (p.daily > 0 && st.callsToday >= p.daily) { skipped.push({ code, reason: `today's quota spent (${st.callsToday}/${p.daily})` }); continue; }
    if (p.rpm > 0 && st.callsMinute >= p.rpm) { skipped.push({ code, reason: `per-minute limit reached (${st.callsMinute}/${p.rpm})` }); continue; }
    // This call's size in this provider's tokens, when the caller said how big it is.
    const need = fit ? Math.ceil(fit.promptChars / charsFor(p)) + fit.maxTokens : 0;
    if (p.tpd > 0 && st.tokensToday + need > p.tpd) {
      skipped.push({ code, reason: `today's tokens spent (${fmt(st.tokensToday)}/${fmt(p.tpd)}${need ? `, this call ~${fmt(need)}` : ''})` });
      continue;
    }
    if (p.tpm > 0 && need > p.tpm) {
      skipped.push({ code, reason: `a call this size (~${fmt(need)} tokens) is larger than its ${fmt(p.tpm)} tokens a minute` });
      continue;
    }
    if (p.tpm > 0 && st.tokensMinute + need > p.tpm) {
      skipped.push({ code, reason: `per-minute token limit reached (${fmt(st.tokensMinute)}/${fmt(p.tpm)}${need ? `, this call ~${fmt(need)}` : ''})` });
      continue;
    }
    if (fit && p.ctx > 0 && need > p.ctx - fit.overheadTokens) {
      skipped.push({ code, reason: `prompt too large for its ${fmt(p.ctx)}-token window (~${fmt(need)} needed)` });
      continue;
    }
    eligible.push(p);
  }
  return { eligible, skipped };
}

// Chars per token for a provider's model: the densest ratio the gate has
// learned for it, else the configured cold-start guess (llm.gate.ts) — one
// source of truth for the ratio, so the plan and the gate never disagree.
const charsFor = (p: RouterProvider): number => charsPerToken(p.model);

/* ── State: the switches and the counts, read fresh for every routed call ─ */

export async function readRouteState(pool: Pool, purpose: Purpose): Promise<Record<string, ProviderState>> {
  const out: Record<string, ProviderState> = {};
  const sw = await pool.query<{ provider_code: string; enabled: boolean }>(
    `SELECT DISTINCT ON (provider_code) provider_code, enabled
       FROM gt_llm_provider_switch
      WHERE purpose = $1
      ORDER BY provider_code, changed_at DESC, id DESC`, [purpose]);
  for (const r of sw.rows) out[r.provider_code] = { ...EMPTY, enabled: r.enabled };
  const st = await pool.query<{
    provider_code: string; calls_minute: number; calls_today: number; cooldown_until: Date | null;
    tokens_minute: string; tokens_today: string;
  }>('SELECT * FROM gt_llm_route_state()');
  for (const r of st.rows) {
    // 272 without 273: the function has no token counts. Counting them as
    // zero would let every provider past its token limits without a word, so
    // the router refuses instead — and says which migration is missing.
    if (!('tokens_today' in r)) {
      throw new Error('LLM_ROUTER_SCHEMA_OUTDATED: gt_llm_route_state() returns no token counts — migration 273 '
        + '(273_llm_router_token_limits.sql) is not applied to this database. Apply it with the migration runner.');
    }
    const cur = out[r.provider_code] ?? EMPTY;
    out[r.provider_code] = {
      ...cur, callsMinute: Number(r.calls_minute), callsToday: Number(r.calls_today), cooldownUntil: r.cooldown_until,
      tokensMinute: Number(r.tokens_minute), tokensToday: Number(r.tokens_today),
    };
  }
  return out;
}

/* ── One call on one provider, recorded ────────────────────────────────── */

type Outcome = 'ok' | 'rate_limited' | 'timeout' | 'error' | 'refused_context' | 'invalid';

interface CallRow {
  rung: number; provider: RouterProvider; outcome: Outcome;
  promptTokens?: number; answerTokens?: number; truncated?: boolean;
  latencyMs?: number; detail?: string; cooldownUntil?: Date | null;
}

async function record(options: LLMCallOptions, c: CallRow): Promise<void> {
  try {
    await withTenantClient(options.pool, options.tenantId, (client) => client.query(
      `INSERT INTO gt_llm_calls (tenant_id, run_id, purpose, step, route, rung, provider_code, model, data_class,
                                 prompt_tokens, answer_tokens, outcome, truncated, latency_ms, detail, cooldown_until)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [options.tenantId, options.runId === undefined || options.runId === null ? null : String(options.runId),
        options.purpose ?? 'enrichment', options.step ?? null, options.route, c.rung, c.provider.code, c.provider.model,
        options.dataClass, c.promptTokens ?? 0, c.answerTokens ?? 0, c.outcome, c.truncated ?? false,
        c.latencyMs ?? null, c.detail ? c.detail.slice(0, 500) : null, c.cooldownUntil ?? null]));
  } catch (e) {
    // The answer is real and is returned; the meter row is lost. Loud, because
    // quotas are counted from these rows — a run of these means the router is
    // counting short.
    console.error(`[LLM:router] could not record a ${c.outcome} call to ${c.provider.code}:`, (e as Error).message);
  }
}

async function note(options: LLMCallOptions, action: string, status: 'ok' | 'error' = 'ok'): Promise<void> {
  console.log(`[LLM:router] run ${options.runId ?? '-'}: ${action}`);
  const id = options.runId;
  if (id === undefined || id === null || id === '' || Number(id) === 0) return;
  try { await appendStep(options.pool, id, { step_name: 'llm_route', action, status }); }
  catch (e) { console.warn('[LLM:router] could not record the llm_route step:', (e as Error).message); }
}

function asResolved(p: RouterProvider): ResolvedProvider {
  if (p.kind === 'platform') return platformProvider();
  return {
    posture: 'external', url: p.url, model: p.model, key: p.key,
    timeoutMs: readLlmConfig().primaryTimeoutMs, providerCode: p.code, contextTokens: p.ctx,
  };
}

/** Thrown inside a rung to say "move on"; carries what to record. */
class MoveOn extends Error {
  constructor(public readonly outcome: Outcome, message: string, public readonly cooldownUntil: Date | null = null) { super(message); }
}

async function callOnProvider(options: LLMCallOptions, p: RouterProvider, rung: number, cfg: RouterConfig): Promise<LLMResult> {
  const started = Date.now();
  try {
    const res = p.kind === 'haiku' ? await callClaude(options) : await callEndpoint(options, asResolved(p));
    await record(options, {
      rung, provider: p, outcome: 'ok', promptTokens: res.inputTokens, answerTokens: res.outputTokens,
      truncated: res.truncated, latencyMs: Date.now() - started,
    });
    return { ...res, provider: p.code, model: p.model };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const status = err instanceof LlmCallError ? err.status : (err as { status?: number })?.status;
    const tooLarge = /LLM_CONTEXT_TOO_LARGE/.test(msg);
    const outcome: Outcome = tooLarge ? 'refused_context'
      : err instanceof LlmCallError && err.kind === 'timeout' ? 'timeout'
        : status === 429 ? 'rate_limited' : 'error';
    let cooldownUntil: Date | null = null;
    if (outcome === 'rate_limited') {
      const retryAfter = err instanceof LlmCallError ? err.retryAfterS : undefined;
      cooldownUntil = new Date(Date.now() + 1000 * (retryAfter ?? cfg.cooldownSeconds));
    }
    await record(options, { rung, provider: p, outcome, latencyMs: Date.now() - started, detail: msg, cooldownUntil });
    throw new MoveOn(outcome, msg, cooldownUntil);
  }
}

function describeMove(p: RouterProvider, m: MoveOn): string {
  const first = m.message.split('\n')[0].slice(0, 160);
  switch (m.outcome) {
    case 'rate_limited': return `${p.code} answered 429 (rate limit) — cooling down until ${hhmmss(m.cooldownUntil!)}`;
    case 'timeout': return `${p.code} timed out — ${first}`;
    case 'refused_context': return `${p.code}: the prompt does not fit its window — nothing was sent`;
    default: return `${p.code} failed — ${first}`;
  }
}

function exhausted(options: LLMCallOptions, reasons: Skip[]): Error {
  return new Error(
    `LLM_ROUTE_EXHAUSTED: route ${options.route} for ${options.dataClass?.replace('_', ' ')} data has no provider left — `
    + reasons.map((r) => `${r.code}: ${r.reason}`).join('; ')
    + '. Nothing was guessed. Switch a provider on in Settings → Models, wait for a quota or cooldown, or add a provider to the route in .env.',
  );
}

/* ── Entry points (called by llm.client when options.route is set) ────── */

interface Prepared { cfg: RouterConfig; plan: RoutePlan; byok: ResolvedProvider | null }

async function prepare(options: LLMCallOptions): Promise<Prepared> {
  if (!options.dataClass) {
    throw new Error('LLM_ROUTE_NO_DATA_CLASS: a routed call must say what its prompt carries (public_company · tenant · people) — the data gate will not guess.');
  }
  const tenantProvider = await resolveProvider(options.pool, options.tenantId);
  if (tenantProvider.posture === 'byok') return { cfg: null as never, plan: { eligible: [], skipped: [] }, byok: tenantProvider };

  // Platform posture: the tenant's budget first, exactly as an unrouted call.
  const budget = await getTokenBudget(options.pool, options.tenantId);
  const maxTokens = options.maxTokens ?? readLlmConfig().defaultMaxTokens;
  if (budget.capped && budget.used + maxTokens > (budget.limit as number)) {
    throw new Error(`TOKEN_BUDGET_EXCEEDED: Tenant ${options.tenantId} has used ${budget.used} tokens today against a cap of ${budget.limit}.`);
  }

  const cfg = readRouterConfig();
  const state = await readRouteState(options.pool, options.purpose ?? 'enrichment');
  const promptChars = options.system.length + options.messages.reduce((n, m) => n + String(m.content ?? '').length, 0);
  const plan = planRoute(cfg, options.route!, options.dataClass, state, new Date(),
    { promptChars, maxTokens, overheadTokens: readLlmConfig().templateOverheadTokens });
  return { cfg, plan, byok: null };
}

async function announce(options: LLMCallOptions, plan: RoutePlan): Promise<void> {
  if (!plan.skipped.length) return;
  await note(options, `route ${options.route}: skipped ${plan.skipped.map((s) => `${s.code} (${s.reason})`).join(', ')}`);
}

export async function callRouted(options: LLMCallOptions): Promise<LLMResult> {
  const { cfg, plan, byok } = await prepare(options);
  if (byok) return callEndpoint(options, byok);   // their key, their endpoint, no route
  await announce(options, plan);
  const reasons = [...plan.skipped];
  const order = cfg.routes[options.route!];
  for (let i = 0; i < plan.eligible.length; i++) {
    const p = plan.eligible[i];
    try {
      return await callOnProvider(options, p, order.indexOf(p.code) + 1, cfg);
    } catch (e) {
      if (!(e instanceof MoveOn)) throw e;
      reasons.push({ code: p.code, reason: describeMove(p, e) });
      const next = plan.eligible[i + 1];
      await note(options, `${describeMove(p, e)}${next ? `; trying ${next.code}` : ''}`, next ? 'ok' : 'error');
    }
  }
  throw exhausted(options, reasons);
}

export async function callRoutedValidated<T>(
  options: LLMCallOptions, schema: z.ZodSchema<T>, jsonPath?: string,
): Promise<T> {
  const { cfg, plan, byok } = await prepare(options);
  if (byok) return validateOn((o) => callEndpoint(o, byok), options, schema, jsonPath);
  await announce(options, plan);
  const reasons = [...plan.skipped];
  const order = cfg.routes[options.route!];
  for (let i = 0; i < plan.eligible.length; i++) {
    const p = plan.eligible[i];
    const rung = order.indexOf(p.code) + 1;
    const next = plan.eligible[i + 1];
    try {
      return await validateOn((o) => callOnProvider(o, p, rung, cfg), options, schema, jsonPath);
    } catch (e) {
      if (e instanceof MoveOn) {
        reasons.push({ code: p.code, reason: describeMove(p, e) });
        await note(options, `${describeMove(p, e)}${next ? `; trying ${next.code}` : ''}`, next ? 'ok' : 'error');
        continue;
      }
      const msg = e instanceof Error ? e.message : String(e);
      if (!/^LLM_VALIDATION_FAILED/.test(msg)) throw e;
      // The provider answered twice and neither answer was usable: a verdict
      // on this provider for this step, recorded, and the question moves on.
      await record(options, { rung, provider: p, outcome: 'invalid', detail: msg });
      reasons.push({ code: p.code, reason: 'answered, but the answer failed validation twice' });
      await note(options, `${p.code}'s answer failed validation — ${msg.slice(0, 160)}${next ? `; asking ${next.code}` : ''}`, next ? 'ok' : 'error');
    }
  }
  throw exhausted(options, reasons);
}

/* ── For the admin's Models screen and its test button ─────────────────── */

/** One provider, outside any route and regardless of its switch: does it answer? */
export async function testProvider(
  pool: Pool, tenantId: string, code: string,
): Promise<{ ok: boolean; model: string; latencyMs: number; answer?: string; error?: string }> {
  const cfg = readRouterConfig();
  const p = cfg.providers[code];
  if (!p) throw new Error(`"${code}" is not a configured provider.`);
  if (p.paid) throw new Error(`${code} is paid per token; it is not tested from here. Switch it on and run a route instead.`);
  const options: LLMCallOptions = {
    tenantId, pool, runId: 0, system: 'Answer with exactly one word.',
    messages: [{ role: 'user', content: 'Reply with the word: ready' }],
    maxTokens: 16, temperature: 0, route: 'low', dataClass: 'public_company', step: 'provider_test', purpose: 'enrichment',
  };
  const started = Date.now();
  try {
    const res = await callOnProvider(options, p, 0, cfg);
    return { ok: true, model: p.model, latencyMs: Date.now() - started, answer: res.text.trim().slice(0, 80) };
  } catch (e) {
    return { ok: false, model: p.model, latencyMs: Date.now() - started, error: (e as Error).message.slice(0, 400) };
  }
}
