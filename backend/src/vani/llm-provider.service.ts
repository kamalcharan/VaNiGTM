/**
 * BYOK — reading, writing and testing a tenant's own model provider.
 *
 * The store behind Settings → Model provider and the `vani:llm_provider`
 * onboarding step. Resolution at call time lives in
 * agent-core/llm.provider.ts; this is the half a human touches.
 *
 * ── THE KEY GOES IN AND NEVER COMES BACK ──────────────────────────────
 *
 * Nothing here returns a stored key, not to an admin, not to the owner who
 * typed it. `getProviderSummary` returns a HINT (`sk-a…7f3c`) — enough to
 * recognise which key is saved, useless to anyone who intercepts it. A tenant
 * who has lost their key recovers it from their provider, not from us.
 *
 * That costs one real affordance: the settings form cannot pre-fill the key
 * for an edit. It shows the hint and an empty field, and an empty field on
 * save means "leave the key alone" rather than "clear it" — so changing only
 * the model does not require re-typing a 100-character secret.
 *
 * ── THE ENCRYPTION KEY IS PER TENANT ──────────────────────────────────
 *
 * secret.crypto derives a distinct key per tenant from the master secret, and
 * the salt is the **vn_tenants id** — the one the JWT carries and the one
 * every call site here and in agent-core/llm.provider.ts already has.
 * vani_tenant.id would need a lookup that llm.provider does not perform, and a
 * salt that is only sometimes available is not a salt.
 *
 * Consequence worth knowing: a credential encrypted for one tenant cannot be
 * decrypted in another's context even if a query were wrong, because the
 * derived key differs and GCM refuses. That is a lock behind the RLS policy,
 * not a replacement for it.
 *
 * ── EVERY PATH GOES THROUGH withTenantClient ──────────────────────────
 *
 * vani_llm_provider is FORCE ROW LEVEL SECURITY (migration 247). A raw
 * pool.query carries no tenant GUC and reads zero rows — which for a write
 * would look like success and store nothing. The explicit tenant join stays
 * anyway: app-layer filtering is the belt this repo wears with the RLS
 * braces.
 */

import type { Pool, PoolClient } from 'pg';
import { withTenantClient } from '../db';
import { encryptSecret, decryptSecret, maskSecret } from '../agent-core/secret.crypto';
import {
  PROVIDER_CATALOGUE,
  isKnownProvider,
  invalidateProvider,
  serialiseCredentials,
  type ProviderSummary,
} from '../agent-core/llm.provider';

/* ── Errors the caller can act on ────────────────────────────────────────── */

export class ProviderError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

/* ── Input ───────────────────────────────────────────────────────────────── */

export interface ProviderInput {
  providerCode: string;
  /** Omit or leave empty to keep the stored key when one exists. */
  key?: string;
  model?: string;
  /** Required for 'custom'; ignored for catalogue providers. */
  baseUrl?: string;
}

/**
 * Validate what a tenant submitted, and say precisely what is wrong.
 *
 * Rule 12 applies to input as much as to failures: an unknown provider code
 * silently coerced to a default, or a missing key silently treated as "no
 * auth needed", produces a provider row that looks configured and cannot
 * work. Each of those gets its own refusal instead.
 */
function validate(input: ProviderInput, hasStoredKey: boolean): void {
  if (!input.providerCode || !isKnownProvider(input.providerCode)) {
    throw new ProviderError(400, 'UNKNOWN_PROVIDER',
      `'${input.providerCode}' is not a provider we know. Choose one of: `
      + `${Object.keys(PROVIDER_CATALOGUE).join(', ')}.`);
  }

  const catalogue = PROVIDER_CATALOGUE[input.providerCode];

  if (catalogue.keyRequired && !input.key && !hasStoredKey) {
    throw new ProviderError(400, 'KEY_REQUIRED',
      `${catalogue.label} needs an API key.`);
  }

  if (!catalogue.baseUrl && !input.baseUrl) {
    throw new ProviderError(400, 'BASE_URL_REQUIRED',
      'A self-hosted provider must give the endpoint URL of its '
      + 'OpenAI-compatible API, for example https://llm.example.com/v1');
  }

  if (input.baseUrl) {
    let parsed: URL;
    try {
      parsed = new URL(input.baseUrl);
    } catch {
      throw new ProviderError(400, 'BASE_URL_INVALID',
        `'${input.baseUrl}' is not a valid URL.`);
    }
    if (parsed.protocol !== 'https:' && parsed.hostname !== 'localhost') {
      // An API key over plain http is a key sent in clear text across
      // whatever network sits between us and them.
      throw new ProviderError(400, 'BASE_URL_INSECURE',
        'The endpoint must be https (localhost excepted, for local development). '
        + 'An API key sent over http travels in clear text.');
    }
  }

  if (!catalogue.defaultModel && !input.model) {
    throw new ProviderError(400, 'MODEL_REQUIRED',
      'Name the model to use — this provider has no default.');
  }
}

/* ── The vn_ → vani_ bridge ──────────────────────────────────────────────── */

/**
 * The JWT carries a vn_tenants id; vani_llm_provider keys on vani_tenant.
 * Joined by slug, the same bridge onboarding.routes and vara.routes use.
 *
 * Read-only here: it does NOT provision. A tenant reaching model settings has
 * been through registration, and provisioning a platform tenant as a
 * side-effect of opening a settings screen would create rows for anyone who
 * merely looked.
 */
async function vaniTenantId(client: PoolClient, vnTenantId: string): Promise<string> {
  const found = await client.query<{ id: string }>(
    `SELECT vt.id FROM vani_tenant vt
       JOIN vn_tenants t ON t.slug = vt.slug
      WHERE t.id = $1`,
    [vnTenantId],
  );
  if (!found.rows.length) {
    throw new ProviderError(409, 'TENANT_NOT_PROVISIONED',
      'This workspace has no platform tenant yet. Complete the domain step of '
      + 'onboarding first — that is what provisions it.');
  }
  return found.rows[0].id;
}

/* ── Read ────────────────────────────────────────────────────────────────── */

/** What is configured, minus the secret. Null when nothing is declared. */
export async function getProviderSummary(
  pool: Pool,
  vnTenantId: string,
): Promise<ProviderSummary | null> {
  return withTenantClient(pool, vnTenantId, async (client) => {
    const result = await client.query<{
      provider_code: string;
      credentials_enc: string;
      test_status: 'untested' | 'passed' | 'failed';
      last_test_at: Date | null;
    }>(
      `SELECT p.provider_code, p.credentials_enc, p.test_status, p.last_test_at
         FROM vani_llm_provider p
         JOIN vani_tenant vt ON vt.id = p.tenant_id
         JOIN vn_tenants  t  ON t.slug = vt.slug
        WHERE t.id = $1
        LIMIT 1`,
      [vnTenantId],
    );

    const row = result.rows[0];
    if (!row) return null;

    // A credential we cannot open is reported as such rather than as absent.
    // "No provider configured" would invite the tenant to add one while the
    // unreadable row is still what their agents hit.
    let keyHint: string | null = null;
    let model: string | null = null;
    let baseUrl: string | null = null;
    try {
      const stored = JSON.parse(decryptSecret(row.credentials_enc, vnTenantId));
      keyHint = stored.key ? maskSecret(stored.key) : null;
      model   = stored.model   ?? null;
      baseUrl = stored.baseUrl ?? null;
    } catch {
      keyHint = '⚠ unreadable';
    }

    return {
      providerCode: row.provider_code,
      model:        model ?? PROVIDER_CATALOGUE[row.provider_code]?.defaultModel ?? null,
      baseUrl:      baseUrl ?? PROVIDER_CATALOGUE[row.provider_code]?.baseUrl ?? null,
      testStatus:   row.test_status,
      lastTestAt:   row.last_test_at ? row.last_test_at.toISOString() : null,
      keyHint,
    };
  });
}

/* ── Write ───────────────────────────────────────────────────────────────── */

/**
 * Declare or update a provider, on a client the CALLER already holds.
 *
 * This is the shape the onboarding step writer needs: the provider row and
 * the step mark must commit together (the two-phase-commit rule), so the
 * write has to join a transaction already in progress rather than opening
 * its own.
 *
 * It does NOT invalidate the resolver cache — the caller's transaction has
 * not committed yet, so dropping the cache here would let a concurrent call
 * re-read and re-cache the OLD row microseconds before the new one lands.
 * `saveProvider` invalidates after its commit; onboarding does the same.
 *
 * Upsert on the table's unique (tenant_id, provider_code), so a replayed
 * request lands on the same row — idempotent by construction, the same
 * property the onboarding endpoint relies on.
 */
export async function saveProviderWithin(
  client: PoolClient,
  vnTenantId: string,
  input: ProviderInput,
): Promise<ProviderSummary> {
  const run = async (c: PoolClient): Promise<ProviderSummary> => {
    const tid = await vaniTenantId(c, vnTenantId);

    // An edit that changes only the model must not require re-typing the key.
    const existing = await c.query<{ credentials_enc: string }>(
      `SELECT credentials_enc FROM vani_llm_provider
        WHERE tenant_id = $1 AND provider_code = $2`,
      [tid, input.providerCode],
    );

    let storedKey: string | undefined;
    if (existing.rows.length) {
      try {
        storedKey = JSON.parse(decryptSecret(existing.rows[0].credentials_enc, vnTenantId)).key;
      } catch {
        // Unreadable — treat as absent so a new key can replace it. This is
        // the one recovery path out of a lost TENANT_SECRET_KEY.
        storedKey = undefined;
      }
    }

    validate(input, Boolean(storedKey));

    const catalogue = PROVIDER_CATALOGUE[input.providerCode];
    const credentials = {
      key:     input.key || storedKey || '',
      model:   input.model   || catalogue.defaultModel,
      baseUrl: input.baseUrl || catalogue.baseUrl || undefined,
    };

    // A tenant runs ONE provider. Declaring a second replaces the first
    // rather than leaving two rows for resolveProvider to choose between —
    // that choice would be arbitrary and invisible.
    await c.query(
      `DELETE FROM vani_llm_provider WHERE tenant_id = $1 AND provider_code <> $2`,
      [tid, input.providerCode],
    );

    await c.query(
      `INSERT INTO vani_llm_provider (tenant_id, provider_code, credentials_enc, test_status)
       VALUES ($1, $2, $3, 'untested')
       ON CONFLICT (tenant_id, provider_code)
       DO UPDATE SET credentials_enc = EXCLUDED.credentials_enc,
                     test_status     = 'untested',
                     last_test_at    = NULL`,
      [tid, input.providerCode, encryptSecret(serialiseCredentials(credentials), vnTenantId)],
    );

    return {
      providerCode: input.providerCode,
      model:        credentials.model,
      baseUrl:      credentials.baseUrl ?? null,
      testStatus:   'untested',
      lastTestAt:   null,
      keyHint:      credentials.key ? maskSecret(credentials.key) : null,
    };
  };

  return run(client);
}

/** Declare or update a provider in its own transaction. */
export async function saveProvider(
  pool: Pool,
  vnTenantId: string,
  input: ProviderInput,
): Promise<ProviderSummary> {
  const summary = await withTenantClient(pool, vnTenantId, (client) =>
    saveProviderWithin(client, vnTenantId, input));

  // Every agent in this process is now one call behind. The TTL would catch
  // it within a minute; invalidating makes the change take effect at once.
  invalidateProvider(vnTenantId);
  return summary;
}

/** Drop the provider and return to the platform model. */
export async function deleteProvider(pool: Pool, vnTenantId: string): Promise<void> {
  await withTenantClient(pool, vnTenantId, async (client) => {
    const tid = await vaniTenantId(client, vnTenantId);
    await client.query(`DELETE FROM vani_llm_provider WHERE tenant_id = $1`, [tid]);
  });
  invalidateProvider(vnTenantId);
}

/* ── Test ────────────────────────────────────────────────────────────────── */

export interface TestResult {
  ok: boolean;
  /** The real reason when ok is false — shown to the tenant verbatim. */
  detail: string;
  model: string;
  latencyMs: number;
}

/**
 * Send one real, tiny completion to the tenant's endpoint and report what
 * happened.
 *
 * A test that only checked the URL parsed would pass for a revoked key, a
 * wrong model name and a firewalled host alike — and the tenant would find
 * out when their first agent run failed. So this is a real round trip, and
 * the failure text is whatever the provider said, not a generic
 * "connection failed".
 *
 * `test_status` and `last_test_at` are recorded either way: a known-failing
 * provider is information, and a settings screen that shows only successes
 * is one a tenant cannot use to debug.
 */
export async function testProvider(pool: Pool, vnTenantId: string): Promise<TestResult> {
  const summary = await getProviderSummary(pool, vnTenantId);
  if (!summary) {
    throw new ProviderError(404, 'NO_PROVIDER',
      'No model provider is configured for this workspace.');
  }

  // Read the key for this one call. resolveProvider is deliberately not used
  // here: it caches, and a test must exercise what is STORED right now.
  const credentials = await withTenantClient(pool, vnTenantId, async (client) => {
    const r = await client.query<{ credentials_enc: string }>(
      `SELECT p.credentials_enc FROM vani_llm_provider p
         JOIN vani_tenant vt ON vt.id = p.tenant_id
         JOIN vn_tenants  t  ON t.slug = vt.slug
        WHERE t.id = $1 LIMIT 1`,
      [vnTenantId],
    );
    if (!r.rows.length) throw new ProviderError(404, 'NO_PROVIDER', 'No provider configured.');
    return JSON.parse(decryptSecret(r.rows[0].credentials_enc, vnTenantId)) as
      { key?: string; model?: string; baseUrl?: string };
  });

  const catalogue = PROVIDER_CATALOGUE[summary.providerCode];
  const baseUrl   = (credentials.baseUrl ?? catalogue?.baseUrl ?? '').replace(/\/+$/, '');
  const model     = credentials.model || catalogue?.defaultModel || '';
  const started   = Date.now();

  let result: TestResult;
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (credentials.key) headers['Authorization'] = `Bearer ${credentials.key}`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        max_tokens: 4,
        messages: [{ role: 'user', content: 'Reply with the word: ok' }],
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, 300);
      result = {
        ok: false,
        detail: `${response.status} ${response.statusText} — ${detail || 'no detail returned'}`,
        model,
        latencyMs: Date.now() - started,
      };
    } else {
      const data = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
      const text = data.choices?.[0]?.message?.content ?? '';
      result = {
        ok: true,
        detail: `Answered in ${Date.now() - started}ms: "${text.trim().slice(0, 60)}"`,
        model,
        latencyMs: Date.now() - started,
      };
    }
  } catch (err) {
    result = {
      ok: false,
      detail: `Could not reach ${baseUrl} — ${err instanceof Error ? err.message : String(err)}`,
      model,
      latencyMs: Date.now() - started,
    };
  }

  await withTenantClient(pool, vnTenantId, async (client) => {
    const tid = await vaniTenantId(client, vnTenantId);
    await client.query(
      `UPDATE vani_llm_provider
          SET test_status = $2, last_test_at = now()
        WHERE tenant_id = $1`,
      [tid, result.ok ? 'passed' : 'failed'],
    );
  });
  invalidateProvider(vnTenantId);

  return result;
}

/* ── Catalogue ───────────────────────────────────────────────────────────── */

/** What the settings screen offers. No secrets, safe to serve unauthenticated. */
export function providerCatalogue() {
  return Object.entries(PROVIDER_CATALOGUE).map(([code, c]) => ({
    code,
    label:          c.label,
    defaultModel:   c.defaultModel,
    keyRequired:    c.keyRequired,
    needsBaseUrl:   c.baseUrl === null,
  }));
}
