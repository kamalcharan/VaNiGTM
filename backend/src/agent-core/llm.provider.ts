/**
 * Vikuna Agent Core — Per-tenant LLM provider resolution
 *
 * Answers one question for llm.client: which endpoint, model and key should
 * THIS tenant's call use? Two possible answers.
 *
 *   PLATFORM  no provider row — the tenant runs on Vikuna's VPS LLM, the env
 *             config, the way every tenant did before BYOK existed. Vikuna
 *             pays for the inference.
 *   BYOK      the tenant declared their own provider in vani_llm_provider.
 *             Their endpoint, their key, their bill.
 *
 * ── WHY THE DISTINCTION REACHES FURTHER THAN A URL ────────────────────
 *
 * Who pays changes two behaviours that have nothing to do with HTTP, both
 * ruled on by the user (2026-09-15):
 *
 *   BUDGET    gt_tenant_context's daily cap exists because Vikuna pays. On
 *             BYOK the cap does not apply — we do not throttle spend on a
 *             bill we do not receive. Usage is still RECORDED, because
 *             "what did this cost" is a question the tenant will ask and
 *             metering is not capping.
 *   FAILOVER  the approved rule-12 exception retries a failed VPS call on
 *             Vikuna's Anthropic key. It was written when Vikuna owned both
 *             sides. On BYOK it does not apply: silently moving a tenant's
 *             work onto our paid API would bill us for their outage AND hide
 *             that their endpoint is down — the exact "degraded output that
 *             looks like real output" rule 12 exists to prevent.
 *
 * So resolution returns a POSTURE, not just connection details, and
 * llm.client reads the posture rather than re-deriving it.
 *
 * ── CACHING ───────────────────────────────────────────────────────────
 *
 * An agent run makes many calls; each one hitting the database and a KDF to
 * learn the same unchanged answer is waste. Cached for CACHE_TTL_MS per
 * tenant, invalidated explicitly when the provider row is written (the routes
 * call invalidate()). The TTL is the backstop for a write that happened in
 * another process — a worker will pick up a provider change within a minute
 * without a restart.
 *
 * The cache holds the DECRYPTED key in memory. That is the same exposure as
 * the env key already has and is unavoidable — the key must be plaintext to
 * sign a request. It is never logged and never leaves this process.
 */

import type { Pool } from 'pg';
import { withTenantClient } from '../db';
import { decryptSecret } from './secret.crypto';

/* ── Types ───────────────────────────────────────────────────────────────── */

export type LLMPosture = 'platform' | 'byok';

export interface ResolvedProvider {
  /** 'platform' = Vikuna pays. 'byok' = the tenant pays. */
  posture: LLMPosture;
  /** Base URL of an OpenAI-compatible endpoint (no trailing slash). */
  url: string;
  model: string;
  /** Bearer token; '' when the endpoint needs none (a local Ollama). */
  key: string;
  timeoutMs: number;
  /** For diagnostics — 'platform' or e.g. 'openai', 'anthropic', 'groq'. */
  providerCode: string;
}

/**
 * What a tenant declared, without the secret. Safe to return from an API.
 */
export interface ProviderSummary {
  providerCode: string;
  model: string | null;
  baseUrl: string | null;
  testStatus: 'untested' | 'passed' | 'failed';
  lastTestAt: string | null;
  /** e.g. 'sk-a…7f3c'. Enough to recognise, never enough to use. */
  keyHint: string | null;
}

/* ── Platform defaults (what every tenant used before BYOK) ──────────────── */

function platformProvider(): ResolvedProvider {
  return {
    posture:      'platform',
    url:          (process.env.LLM_PRIMARY_URL ?? 'http://localhost:11434').replace(/\/+$/, ''),
    model:        process.env.LLM_PRIMARY_MODEL ?? 'qwen2.5',
    key:          process.env.LLM_PRIMARY_KEY || '',
    timeoutMs:    parseInt(process.env.LLM_PRIMARY_TIMEOUT_MS ?? '60000', 10),
    providerCode: 'platform',
  };
}

/* ── Provider catalogue ──────────────────────────────────────────────────── */

/**
 * Known providers and their OpenAI-compatible endpoints.
 *
 * A tenant supplies a provider_code and a key; they should not have to know
 * the base URL. `custom` exists for a self-hosted endpoint and is the one
 * case where they must supply one — anything else would mean guessing on
 * their behalf, and a guessed endpoint for a real API key is worse than an
 * error.
 */
export const PROVIDER_CATALOGUE: Record<
  string,
  { label: string; baseUrl: string | null; defaultModel: string; keyRequired: boolean }
> = {
  openai:    { label: 'OpenAI',        baseUrl: 'https://api.openai.com/v1',       defaultModel: 'gpt-4o-mini',            keyRequired: true  },
  anthropic: { label: 'Anthropic',     baseUrl: 'https://api.anthropic.com/v1',    defaultModel: 'claude-haiku-4-5',       keyRequired: true  },
  groq:      { label: 'Groq',          baseUrl: 'https://api.groq.com/openai/v1',  defaultModel: 'llama-3.3-70b-versatile', keyRequired: true  },
  together:  { label: 'Together AI',   baseUrl: 'https://api.together.xyz/v1',     defaultModel: 'meta-llama/Llama-3.3-70B-Instruct-Turbo', keyRequired: true },
  custom:    { label: 'Self-hosted',   baseUrl: null,                              defaultModel: '',                        keyRequired: false },
};

export function isKnownProvider(code: string): boolean {
  return Object.prototype.hasOwnProperty.call(PROVIDER_CATALOGUE, code);
}

/* ── Cache ───────────────────────────────────────────────────────────────── */

const CACHE_TTL_MS = 60_000;

interface CacheEntry { at: number; value: ResolvedProvider }
const cache = new Map<string, CacheEntry>();

/** Drop a tenant's cached provider. Called whenever its row is written. */
export function invalidateProvider(tenantId: string): void {
  cache.delete(tenantId);
}

/** Tests, and a full config reload. */
export function invalidateAllProviders(): void {
  cache.clear();
}

/* ── Stored shape ────────────────────────────────────────────────────────── */

/**
 * provider_code and credentials_enc are columns (migration 240). Everything
 * else a provider needs — model, base URL — rides inside the encrypted blob
 * as JSON rather than in new columns, because the schema is frozen without
 * approval and because a base URL alongside the key it authenticates is not
 * unreasonable to keep sealed together.
 */
interface StoredCredentials {
  key?: string;
  model?: string;
  baseUrl?: string;
}

function parseStored(plaintext: string): StoredCredentials {
  try {
    const parsed = JSON.parse(plaintext);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as StoredCredentials;
    }
  } catch {
    // Not JSON — an earlier shape, or a bare key. Treat it as the key itself
    // rather than throwing: the value decrypted and authenticated, so it is
    // ours, and refusing it would lock a tenant out of their own credential.
  }
  return { key: plaintext };
}

export function serialiseCredentials(c: StoredCredentials): string {
  return JSON.stringify(c);
}

/* ── Resolution ──────────────────────────────────────────────────────────── */

/**
 * Which provider this tenant's next call should use.
 *
 * Falls back to the platform provider when the tenant declared nothing —
 * that is a genuine absence of configuration, not a failure being papered
 * over, so rule 12 does not apply.
 *
 * It DOES apply when a tenant declared a provider we then cannot read: a
 * broken key or a lost TENANT_SECRET_KEY throws rather than silently running
 * their work on our VPS. Otherwise a tenant who deliberately moved to their
 * own model would quietly be served by ours, be billed by us, and have no way
 * to tell.
 */
export async function resolveProvider(
  pool: Pool,
  tenantId: string,
): Promise<ResolvedProvider> {
  const hit = cache.get(tenantId);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

  const row = await readProviderRow(pool, tenantId);

  let resolved: ResolvedProvider;
  if (!row) {
    resolved = platformProvider();
  } else {
    let stored: StoredCredentials;
    try {
      // Salted with the vn_tenants id — the same id the JWT carries and the
      // one every call site here has. vani_tenant.id would need a lookup this
      // path does not do, and a salt that is sometimes unavailable is not a
      // salt.
      stored = parseStored(decryptSecret(row.credentials_enc, tenantId));
    } catch (err) {
      const cause = err instanceof Error ? err.message : String(err);
      throw new Error(
        `LLM_PROVIDER_UNREADABLE: tenant ${tenantId} declared provider `
        + `'${row.provider_code}' but its stored credential cannot be opened — ${cause} `
        + `Their calls are NOT being served by the platform model in the meantime; `
        + `re-enter the key in Settings → Model provider.`,
      );
    }

    const catalogue = PROVIDER_CATALOGUE[row.provider_code];
    const baseUrl   = stored.baseUrl ?? catalogue?.baseUrl ?? null;

    if (!baseUrl) {
      throw new Error(
        `LLM_PROVIDER_NO_ENDPOINT: tenant ${tenantId} declared provider `
        + `'${row.provider_code}' with no base URL, and none is known for that provider. `
        + `A self-hosted provider must supply its endpoint.`,
      );
    }

    resolved = {
      posture:      'byok',
      url:          baseUrl.replace(/\/+$/, ''),
      model:        stored.model || catalogue?.defaultModel || '',
      key:          stored.key ?? '',
      timeoutMs:    parseInt(process.env.LLM_PRIMARY_TIMEOUT_MS ?? '60000', 10),
      providerCode: row.provider_code,
    };

    if (!resolved.model) {
      throw new Error(
        `LLM_PROVIDER_NO_MODEL: tenant ${tenantId} declared provider `
        + `'${row.provider_code}' without a model, and that provider has no default.`,
      );
    }
  }

  cache.set(tenantId, { at: Date.now(), value: resolved });
  return resolved;
}

/**
 * The row, or null.
 *
 * withTenantClient, not pool.query: vani_llm_provider is FORCE ROW LEVEL
 * SECURITY as of migration 247, so a raw pool connection — which carries no
 * tenant GUC — reads zero rows. The WHERE clause is still explicit, because
 * application-layer filtering is the belt this repo wears with the RLS
 * braces, not an alternative to it.
 *
 * Note the id bridge: vani_llm_provider.tenant_id references vani_tenant,
 * while everything in agent-core carries a vn_tenants id. They are joined by
 * slug, the same bridge vara.routes.ts uses.
 */
async function readProviderRow(
  pool: Pool,
  tenantId: string,
): Promise<{ provider_code: string; credentials_enc: string } | null> {
  return withTenantClient(pool, tenantId, async (client) => {
    const result = await client.query<{ provider_code: string; credentials_enc: string }>(
      `SELECT p.provider_code, p.credentials_enc
         FROM vani_llm_provider p
         JOIN vani_tenant vt ON vt.id = p.tenant_id
         JOIN vn_tenants  t  ON t.slug = vt.slug
        WHERE t.id = $1
        ORDER BY p.last_test_at DESC NULLS LAST
        LIMIT 1`,
      [tenantId],
    );
    return result.rows[0] ?? null;
  });
}
