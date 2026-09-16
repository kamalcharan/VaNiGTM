/**
 * BYOK — the two rulings, held by the code rather than by a comment.
 *
 * A tenant on their own key pays their own inference bill. Two consequences
 * were ruled on (user, 2026-09-15), and both are the kind of thing that
 * silently regresses when someone edits a condition in callLLM:
 *
 *   1. The daily token CAP does not apply. It exists because Vikuna pays.
 *   2. The Claude FAILOVER does not apply. Moving a tenant's work onto our
 *      paid API would bill us for their outage AND hide that their endpoint
 *      is down — rule 12's exact failure mode.
 *
 * (2) is the one that matters most: it fails OPEN if it breaks. Nothing
 * crashes, runs keep completing, and the bill arrives a month later. So it
 * is asserted from both directions — a BYOK failure must not call Claude,
 * and the identical platform failure must.
 */

import { callLLM } from '../llm.client';
import { encryptSecret, resetKeyCache } from '../secret.crypto';
import { invalidateAllProviders, serialiseCredentials } from '../llm.provider';

const TENANT = '11111111-1111-1111-1111-111111111111';
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

/** Requests the code actually made, so we can assert where they went. */
let requests: Array<{ url: string; auth?: string; model: string }> = [];
/** What the endpoint should do when called. */
let endpointBehaviour: 'ok' | 'unreachable' | 'error' = 'ok';
/** Anthropic SDK calls — the failover path. */
const claudeCalls: unknown[] = [];

jest.mock('@anthropic-ai/sdk', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: async (args: unknown) => {
        claudeCalls.push(args);
        return {
          content: [{ type: 'text', text: 'from-claude' }],
          usage: { input_tokens: 1, output_tokens: 1 },
        };
      },
    },
  }));
});

/**
 * A pool that answers the provider lookup and swallows everything else.
 *
 * `byok` is the encrypted credentials row resolveProvider will find; null
 * means the tenant declared nothing, which is the platform path.
 */
function poolWith(byok: { provider_code: string; credentials: object } | null) {
  const client = {
    query: async (sql: string) => {
      if (/vani_llm_provider/.test(sql)) {
        return {
          rows: byok
            ? [{
                provider_code:   byok.provider_code,
                credentials_enc: encryptSecret(serialiseCredentials(byok.credentials as never), TENANT),
              }]
            : [],
        };
      }
      return { rows: [] };
    },
    release: () => {},
  };
  return {
    connect: async () => client,
    query: async () => ({ rows: [] }),
  } as never;
}

const opts = (pool: unknown) => ({
  tenantId: TENANT,
  pool: pool as never,
  runId: 'run-1',
  system: 'stub',
  messages: [{ role: 'user' as const, content: 'go' }],
});

beforeEach(() => {
  requests = [];
  claudeCalls.length = 0;
  endpointBehaviour = 'ok';

  process.env.TENANT_SECRET_KEY  = 'YWJjZGVmZ2hpamtsbW5vcHFyc3R1dnd4eXoxMjM0NTY=';
  process.env.LLM_PRIMARY_URL    = 'http://platform.internal:11434/v1';
  process.env.LLM_PRIMARY_MODEL  = 'qwen3:8b';
  process.env.LLM_PRIMARY_KEY    = '';
  process.env.ANTHROPIC_API_KEY  = 'sk-ant-test';
  resetKeyCache();
  invalidateAllProviders();

  global.fetch = jest.fn(async (url: unknown, init: { body: string; headers: Record<string,string> }) => {
    const body = JSON.parse(init.body);
    requests.push({ url: String(url), auth: init.headers?.Authorization, model: body.model });

    if (endpointBehaviour === 'unreachable') throw new Error('ECONNREFUSED');
    if (endpointBehaviour === 'error') {
      return { ok: false, status: 502, statusText: 'Bad Gateway', text: async () => 'upstream down' };
    }
    return {
      ok: true, status: 200,
      json: async () => ({
        choices: [{ message: { content: 'from-endpoint' } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      }),
    };
  }) as unknown as typeof fetch;
});

afterAll(() => {
  global.fetch = originalFetch;
  process.env = originalEnv;
});

const OPENAI_BYOK = {
  provider_code: 'openai',
  credentials: { key: 'sk-tenant-own-key', model: 'gpt-4o-mini' },
};

describe('routing', () => {
  it('sends a declared tenant to their own endpoint, key and model', async () => {
    const result = await callLLM(opts(poolWith(OPENAI_BYOK)));

    expect(requests).toHaveLength(1);
    expect(requests[0].url).toBe('https://api.openai.com/v1/chat/completions');
    expect(requests[0].auth).toBe('Bearer sk-tenant-own-key');
    expect(requests[0].model).toBe('gpt-4o-mini');
    expect(result.text).toBe('from-endpoint');
  });

  it('leaves a tenant who declared nothing exactly where they were', async () => {
    await callLLM(opts(poolWith(null)));

    expect(requests[0].url).toBe('http://platform.internal:11434/v1/chat/completions');
    expect(requests[0].model).toBe('qwen3:8b');
    expect(requests[0].auth).toBeUndefined();
  });

  it('does not send the qwen /no_think marker to a tenant provider', async () => {
    // It is a qwen-ism. GPT would read it as an instruction in the prompt.
    const captured: string[] = [];
    global.fetch = jest.fn(async (_u: unknown, init: { body: string }) => {
      captured.push(JSON.parse(init.body).messages[0].content);
      return { ok: true, status: 200, json: async () => ({
        choices: [{ message: { content: '' } }], usage: {},
      }) };
    }) as unknown as typeof fetch;

    await callLLM(opts(poolWith(OPENAI_BYOK)));
    expect(captured[0]).not.toContain('/no_think');

    invalidateAllProviders();
    await callLLM(opts(poolWith(null)));
    expect(captured[1]).toContain('/no_think');
  });
});

describe('ruling 1 — the cap does not apply to BYOK', () => {
  /** A tenant already over a cap that Vikuna set. */
  function cappedPool(byok: typeof OPENAI_BYOK | null) {
    const client = {
      query: async (sql: string) => {
        if (/vani_llm_provider/.test(sql)) {
          return {
            rows: byok
              ? [{ provider_code: byok.provider_code,
                   credentials_enc: encryptSecret(serialiseCredentials(byok.credentials as never), TENANT) }]
              : [],
          };
        }
        if (/gt_tenant_context/i.test(sql)) {
          const today = new Date().toISOString().split('T')[0];
          return {
            rows: [{
              daily_token_limit: 100,
              daily_token_usage: { [today]: { vps: 100 } }, // already at the cap
            }],
          };
        }
        return { rows: [] };
      },
      release: () => {},
    };
    return { connect: async () => client, query: async () => ({ rows: [] }) } as never;
  }

  it('refuses a platform call that is over the cap', async () => {
    await expect(callLLM(opts(cappedPool(null)))).rejects.toThrow(/TOKEN_BUDGET_EXCEEDED/);
    expect(requests).toHaveLength(0);
  });

  it('lets the same call through on BYOK — we do not throttle their bill', async () => {
    const result = await callLLM(opts(cappedPool(OPENAI_BYOK)));
    expect(result.text).toBe('from-endpoint');
    expect(requests).toHaveLength(1);
  });
});

describe('ruling 2 — BYOK never fails over to Vikuna\'s key', () => {
  it('fails loudly when a tenant endpoint is unreachable', async () => {
    endpointBehaviour = 'unreachable';

    await expect(callLLM(opts(poolWith(OPENAI_BYOK))))
      .rejects.toThrow(/LLM_BYOK_UNREACHABLE.*your openai endpoint/s);

    // The whole point: our paid API was not touched.
    expect(claudeCalls).toHaveLength(0);
  });

  it('fails loudly when a tenant endpoint returns an error', async () => {
    endpointBehaviour = 'error';

    await expect(callLLM(opts(poolWith(OPENAI_BYOK))))
      .rejects.toThrow(/LLM_BYOK_ERROR.*502/s);
    expect(claudeCalls).toHaveLength(0);
  });

  it('DOES fail over on the identical platform failure', async () => {
    // The control. Without this, the test above would also pass if failover
    // were broken outright rather than correctly scoped to the platform.
    endpointBehaviour = 'unreachable';

    const result = await callLLM(opts(poolWith(null)));
    expect(result.text).toBe('from-claude');
    expect(result.source).toBe('escalation');
    expect(claudeCalls).toHaveLength(1);
  });

  it('uses error codes a BYOK failure cannot share with the VPS', async () => {
    // Belt to the posture check's braces: even if someone widened the
    // failover condition, LLM_BYOK_* does not match LLM_VPS_*.
    endpointBehaviour = 'unreachable';
    await expect(callLLM(opts(poolWith(OPENAI_BYOK)))).rejects.toThrow(
      expect.objectContaining({ message: expect.not.stringContaining('LLM_VPS_') }) as never,
    );
  });
});

describe('an unreadable credential does not quietly become a platform call', () => {
  it('throws rather than serving their work on our model', async () => {
    // The tenant moved off our model deliberately. Silently serving them
    // anyway means we pay, and they never find out.
    const client = {
      query: async (sql: string) => (/vani_llm_provider/.test(sql)
        ? { rows: [{ provider_code: 'openai', credentials_enc: 'v1.deadbeef.x.y.z' }] }
        : { rows: [] }),
      release: () => {},
    };
    const pool = { connect: async () => client, query: async () => ({ rows: [] }) } as never;

    await expect(callLLM(opts(pool))).rejects.toThrow(/LLM_PROVIDER_UNREADABLE/);
    expect(requests).toHaveLength(0);
    expect(claudeCalls).toHaveLength(0);
  });
});
