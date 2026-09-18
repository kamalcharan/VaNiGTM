/**
 * The gate that stops five agents sharing one small model server.
 *
 * Run 114's failure was invisible to every existing test because it only
 * happens with calls IN FLIGHT AT ONCE — the batch-claim fix capped how many
 * events are claimed, not how many requests reach the model.
 */

import { withLlmSlot, checkContext, contextError, estimateTokens, __resetLanes } from '../llm.gate';

const URL_A = 'http://llm.example/v1';
const URL_B = 'http://other.example/v1';

/** A call that reports the highest concurrency it ever saw. */
function tracker() {
  let running = 0;
  let peak = 0;
  return {
    peak: () => peak,
    run: async (ms = 10) => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, ms));
      running -= 1;
      return 'ok';
    },
  };
}

beforeEach(() => { __resetLanes(); });

describe('taking turns', () => {
  it('runs platform calls one at a time', async () => {
    const t = tracker();
    await Promise.all(Array.from({ length: 5 }, () =>
      withLlmSlot(URL_A, 'platform', () => t.run())));
    expect(t.peak()).toBe(1);
  });

  it('still runs all five — queued, not dropped', async () => {
    const seen: number[] = [];
    await Promise.all(Array.from({ length: 5 }, (_, i) =>
      withLlmSlot(URL_A, 'platform', async () => { seen.push(i); })));
    expect(seen.sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('serves the longest waiter next (FIFO, not a scramble)', async () => {
    const order: number[] = [];
    const calls = Array.from({ length: 4 }, (_, i) =>
      withLlmSlot(URL_A, 'platform', async () => {
        order.push(i);
        await new Promise((r) => setTimeout(r, 5));
      }));
    await Promise.all(calls);
    expect(order).toEqual([0, 1, 2, 3]);
  });

  it('does not make one endpoint queue behind another', async () => {
    // A tenant on their own endpoint must never wait for Vikuna's, or one slow
    // platform run would stall every BYOK tenant on the box.
    const t = tracker();
    const started = Date.now();
    await Promise.all([
      withLlmSlot(URL_A, 'platform', () => t.run(60)),
      withLlmSlot(URL_B, 'byok', () => t.run(60)),
    ]);
    expect(t.peak()).toBe(2);
    expect(Date.now() - started).toBeLessThan(120);
  });

  it('releases the slot when a call throws', async () => {
    await expect(withLlmSlot(URL_A, 'platform', async () => { throw new Error('boom'); }))
      .rejects.toThrow('boom');
    // If the finally block were missing, this would hang rather than fail —
    // which is the failure mode worth having a test for.
    await expect(withLlmSlot(URL_A, 'platform', async () => 'after')).resolves.toBe('after');
  });

  it('reports the wait so a queued run does not read as hung', async () => {
    const waits: number[] = [];
    await Promise.all([
      withLlmSlot(URL_A, 'platform', () => new Promise((r) => setTimeout(r, 40))),
      withLlmSlot(URL_A, 'platform', async () => 'second', (ms) => waits.push(ms)),
    ]);
    expect(waits).toHaveLength(1);
    expect(waits[0]).toBeGreaterThanOrEqual(20);
  });
});

describe('the context budget', () => {
  it('counts the answer against the window, not on top of it', () => {
    // 8192 - 200 overhead = 7992 usable. A 7000-token prompt fits alone and
    // does not fit with 1000 reserved for the answer — the arithmetic the
    // server's 500 was hiding.
    const prompt = 'x'.repeat(7000 * 4);
    expect(checkContext('platform', prompt, 500)?.fits).toBe(true);
    expect(checkContext('platform', prompt, 1000)?.fits).toBe(false);
  });

  it('judges nothing for a tenant on their own key', () => {
    // Their window is unknown. Guessing 8k for a 128k model would refuse calls
    // that work, which is a silent cap — as bad as a silent fallback.
    expect(checkContext('byok', 'x'.repeat(400000), 1000)).toBeNull();
  });

  it('names the numbers and says nothing was sent', () => {
    const c = checkContext('platform', 'x'.repeat(40000), 1000)!;
    const msg = contextError(c, 'this call to qwen3:8b').message;
    expect(msg).toMatch(/LLM_CONTEXT_TOO_LARGE/);
    expect(msg).toMatch(/10000 prompt tokens/);
    expect(msg).toMatch(/1000 reserved/);
    expect(msg).toMatch(/7992 usable/);
    expect(msg).toMatch(/Nothing was sent/);
    // Says it is an estimate, so nobody reads 10000 as a measurement.
    expect(msg).toMatch(/estimate/i);
  });

  it('estimates, and says so rather than pretending to count', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcde')).toBe(2);
  });
});
