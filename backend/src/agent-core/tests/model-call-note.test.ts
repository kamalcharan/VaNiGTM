/**
 * The context report (AGENTS.md §4b): one model_call step per call, carrying
 * window fill, lane wait, time and a cut-off — and never failing the call.
 */
import { noteCallInRun } from '../llm.client';

const fakePool = (sink: any[], fail = false) => ({
  query: async (_sql: string, params: any[]) => { if (fail) throw new Error('db down'); sink.push(JSON.parse(params[0])[0]); return { rows: [] }; },
}) as any;

const base = { model: 'qwen3-8b', posture: 'platform', priority: 'interactive' as const,
  inputTokens: 3353, outputTokens: 330, maxTokens: 1000, elapsedMs: 95_300, queuedMs: 12_000, truncated: false, window: 16384 };

describe('the per-call context report', () => {
  it('says model, tokens, window fill, lane wait and time', async () => {
    const steps: any[] = [];
    await noteCallInRun(fakePool(steps), 42, base);
    expect(steps[0]).toMatchObject({ step_name: 'model_call', status: 'ok', duration_ms: 95_300 });
    expect(steps[0].action).toBe('qwen3-8b: 3,353 prompt + 330 answer tokens · 27% of the 16,384-token window · waited 12s in the interactive lane · 95.3s');
  });
  it('marks a cut-off answer and the failover model', async () => {
    const steps: any[] = [];
    await noteCallInRun(fakePool(steps), 42, { ...base, posture: 'escalation', model: 'claude-haiku-4-5', window: 0, queuedMs: 0, truncated: true });
    expect(steps[0].status).toBe('error');
    expect(steps[0].action).toMatch(/^claude-haiku-4-5 \(failover\): .* · CUT OFF at the answer limit$/);
    expect(steps[0].action).not.toMatch(/window|waited/);
  });
  it('without a run, or when the run cannot be written, the call is not affected', async () => {
    const steps: any[] = [];
    await noteCallInRun(fakePool(steps), 0, base);
    await noteCallInRun(fakePool(steps), undefined, base);
    expect(steps).toHaveLength(0);
    await expect(noteCallInRun(fakePool([], true), 7, base)).resolves.toBeUndefined();
  });
});

import { agentOf, NAMED_RUN_KEYS } from '../agent-names';
import { HANDLED_EVENT_TYPES } from '../handled-events';

describe('runs are named by agent', () => {
  it('every event the worker handles has an agent name', () => {
    expect(HANDLED_EVENT_TYPES.filter((e) => !NAMED_RUN_KEYS.includes(e))).toEqual([]);
  });
  it('an unknown key is shown as itself, never hidden', () => {
    expect(agentOf('URL_SUBMITTED')).toBe('Ingestion');
    expect(agentOf('SOMETHING_NEW')).toBe('SOMETHING_NEW');
    expect(agentOf(null)).toBe('unknown');
  });
});
