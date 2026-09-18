/**
 * HAIKU_DEFAULT — is escalating to Claude automatic, or a decision?
 *
 * Seven runs failed over inside a minute on 2026-09-18 and the only place
 * that showed was the worker's stdout, while Vikuna was billed for every one
 * of those calls. The escalation was doing its job; what was missing was the
 * ability to say "no, tell me first".
 *
 * Both positions are asserted, and each needs the other to mean anything: a
 * test that only proves the gate blocks would also pass if failover were
 * broken outright, which is the same mistake llm-byok.test.ts calls out about
 * its own control.
 *
 * HAIKU_DEFAULT is read at module load, so each direction re-imports the
 * client under a fresh module registry rather than mutating a constant.
 */

const TENANT = '11111111-1111-1111-1111-111111111111';
const originalFetch = global.fetch;
const originalEnv = { ...process.env };

const claudeCalls: unknown[] = [];

jest.mock('@anthropic-ai/sdk', () => jest.fn().mockImplementation(() => ({
  messages: {
    create: async (args: unknown) => {
      claudeCalls.push(args);
      return {
        content: [{ type: 'text', text: 'from-claude' }],
        usage: { input_tokens: 1, output_tokens: 1 },
      };
    },
  },
})));

/**
 * A platform tenant (no BYOK row) whose run may or may not carry approval.
 * Everything else answers empty, which is what the budget and usage writes
 * expect.
 */
function poolWithApproval(allowed: boolean) {
  const answer = async (sql: string) => {
    if (/allow_failover/.test(sql)) return { rows: [{ ok: allowed }] };
    return { rows: [] };
  };
  return {
    connect: async () => ({ query: answer, release: () => {} }),
    query: answer,
  } as never;
}

const opts = (pool: unknown) => ({
  tenantId: TENANT, pool: pool as never, runId: 'run-1',
  system: 'stub', messages: [{ role: 'user' as const, content: 'go' }],
});

beforeEach(() => {
  claudeCalls.length = 0;
  jest.resetModules();
  process.env = {
    ...originalEnv,
    ANTHROPIC_API_KEY: 'sk-test',
    LLM_PRIMARY_URL: 'https://llm.dristiq.com',
    LLM_PRIMARY_MODEL: 'qwen3-4b',
  };
  // The outage from the log: the platform endpoint does not answer.
  global.fetch = (async () => { throw new Error('TimeoutError: aborted'); }) as never;
});

afterEach(() => { global.fetch = originalFetch; process.env = { ...originalEnv }; });

describe('HAIKU_DEFAULT=true — escalation is automatic', () => {
  it('fails over without asking', async () => {
    process.env.HAIKU_DEFAULT = 'true';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { callLLM } = require('../llm.client');

    const r = await callLLM(opts(poolWithApproval(false)));
    expect(r.text).toBe('from-claude');
    expect(r.source).toBe('escalation');
    expect(claudeCalls).toHaveLength(1);
  });

  it('is the default when the variable is unset', async () => {
    // The flag must not change behaviour for a deployment that never sets it.
    delete process.env.HAIKU_DEFAULT;
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { callLLM } = require('../llm.client');

    const r = await callLLM(opts(poolWithApproval(false)));
    expect(r.source).toBe('escalation');
  });
});

describe('HAIKU_DEFAULT=false — escalation is a decision', () => {
  it('refuses to spend, and says what actually broke', async () => {
    process.env.HAIKU_DEFAULT = 'false';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { callLLM } = require('../llm.client');

    await expect(callLLM(opts(poolWithApproval(false))))
      .rejects.toThrow(/LLM_FAILOVER_NEEDS_APPROVAL.*LLM_VPS_UNREACHABLE/s);

    // The whole point. Nothing was billed.
    expect(claudeCalls).toHaveLength(0);
  });

  it('carries the VPS diagnosis, not a paraphrase of it', async () => {
    // "Cannot reach" and "context size exceeded" are different outages and
    // lead to different fixes. A generic "model unavailable" would have left
    // 2026-09-18 unexplained.
    process.env.HAIKU_DEFAULT = 'false';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { callLLM } = require('../llm.client');

    await expect(callLLM(opts(poolWithApproval(false))))
      .rejects.toThrow(/llm\.dristiq\.com/);
  });

  it('DOES escalate once the run carries approval', async () => {
    // The control. Without it, the two tests above would also pass if the
    // gate refused everything and approval never worked.
    process.env.HAIKU_DEFAULT = 'false';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { callLLM } = require('../llm.client');

    const r = await callLLM(opts(poolWithApproval(true)));
    expect(r.text).toBe('from-claude');
    expect(claudeCalls).toHaveLength(1);
  });

  it('treats an unreadable run as unapproved rather than assuming yes', async () => {
    // Defaulting the other way would spend money on a database hiccup.
    process.env.HAIKU_DEFAULT = 'false';
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { callLLM } = require('../llm.client');

    // Only the approval read fails. Everything else answers normally, so the
    // call reaches the gate rather than dying before it.
    const brokenPool = {
      connect: async () => ({ query: async () => ({ rows: [] }), release: () => {} }),
      query: async (sql: string) => {
        if (/allow_failover/.test(sql)) throw new Error('connection lost');
        return { rows: [] };
      },
    } as never;

    await expect(callLLM(opts(brokenPool))).rejects.toThrow(/LLM_FAILOVER_NEEDS_APPROVAL/);
    expect(claudeCalls).toHaveLength(0);
  });
});
