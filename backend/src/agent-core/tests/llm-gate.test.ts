/**
 * The gate that stops five agents sharing one small model server.
 *
 * Run 114's failure was invisible to every existing test because it only
 * happens with calls IN FLIGHT AT ONCE — the batch-claim fix capped how many
 * events are claimed, not how many requests reach the model.
 */

import {
  withLlmSlot, checkContext, contextError, estimateTokens, charBudgetFor,
  charsPerToken, noteObservedTokens, noteContextOverflow, __resetLanes, __resetCalibration,
} from '../llm.gate';

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

beforeEach(() => { __resetLanes(); __resetCalibration(); });

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
    const prompt = 'x'.repeat(7000 * 3);
    expect(checkContext('platform', prompt, 500)?.fits).toBe(true);
    expect(checkContext('platform', prompt, 1000)?.fits).toBe(false);
  });

  it('judges nothing for a tenant on their own key', () => {
    // Their window is unknown. Guessing 8k for a 128k model would refuse calls
    // that work, which is a silent cap — as bad as a silent fallback.
    expect(checkContext('byok', 'x'.repeat(400000), 1000)).toBeNull();
  });

  it('names the numbers and says nothing was sent', () => {
    const c = checkContext('platform', 'x'.repeat(30000), 1000)!;
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
    expect(estimateTokens('abc')).toBe(1);
    expect(estimateTokens('abcd')).toBe(2);
  });
});

describe('learning the real token count from the model', () => {
  // "llm invocation is required to check tokens" — it is, and the invocation
  // already happened: every successful response reports prompt_tokens for the
  // exact string we sent. These cover learning from it rather than guessing.

  it('starts on the heuristic and does not pretend otherwise', () => {
    // 3, not 4: the cold-start guess is pessimistic on purpose — see the
    // constant. A worker restarts on every deploy, and its first big call
    // must not be the one that overruns.
    expect(charsPerToken('qwen3:8b')).toBe(3);
    expect(estimateTokens('abc', 'qwen3:8b')).toBe(1);
  });

  it('uses the model\'s own count once it has enough samples', () => {
    for (let i = 0; i < 3; i++) noteObservedTokens('qwen3:8b', 6000, 1000);  // 6 chars/token
    expect(charsPerToken('qwen3:8b')).toBeCloseTo(6);
    expect(estimateTokens('x'.repeat(6000), 'qwen3:8b')).toBe(1000);
  });

  it('keeps the DENSEST ratio seen, never the friendliest', () => {
    // Prose at 6 chars/token then a block of JSON at 2.5. Budgeting on 6 would
    // let a prompt through that the JSON overruns — optimism here is paid for
    // with a 500, so the minimum wins.
    noteObservedTokens('m', 6000, 1000);
    noteObservedTokens('m', 5000, 2000);
    noteObservedTokens('m', 6000, 1000);
    expect(charsPerToken('m')).toBeCloseTo(2.5);
  });

  it('will not adopt a generous ratio off one sample', () => {
    noteObservedTokens('m', 8000, 1000);   // 8 chars/token, one call
    expect(charsPerToken('m')).toBe(3);    // still the heuristic
  });

  it('ignores a server that reports no usage', () => {
    noteObservedTokens('m', 6000, 0);
    noteObservedTokens('m', 0, 500);
    expect(charsPerToken('m')).toBe(3);
  });
});

describe('the budget as the authority on what gets built', () => {
  it('says how much variable content still fits', () => {
    // 8192 - 200 overhead - 1200 output = 6792 tokens, minus a 1000-char
    // system prompt (334 tokens at 3 chars/token) = 6458 tokens = 19374 chars.
    const room = charBudgetFor(undefined, 1200, 'x'.repeat(1000));
    expect(room).toBe(19374);
  });

  it('shrinks as the model turns out to be denser than the heuristic', () => {
    const before = charBudgetFor('dense', 1200, 'x'.repeat(1000));
    for (let i = 0; i < 3; i++) noteObservedTokens('dense', 2000, 1000);  // 2 chars/token
    const after = charBudgetFor('dense', 1200, 'x'.repeat(1000));
    expect(after).toBeLessThan(before);
  });

  it('returns 0 when the fixed part alone does not fit', () => {
    // A real answer, not a small number: trimming the variable part to nothing
    // would not save this call, and the caller has to say so rather than send it.
    expect(charBudgetFor(undefined, 1200, 'x'.repeat(200_000))).toBe(0);
  });

  it('what it allows actually passes the check it is derived from', () => {
    // The two would drift apart silently otherwise — a budget that hands back
    // more room than checkContext accepts is worse than no budget at all.
    const system = 'x'.repeat(1000);
    const room = charBudgetFor(undefined, 1200, system);
    const prompt = system + 'y'.repeat(room);
    expect(checkContext('platform', prompt, 1200)?.fits).toBe(true);
    const oneMore = system + 'y'.repeat(room + 40);
    expect(checkContext('platform', oneMore, 1200)?.fits).toBe(false);
  });
});

describe('learning from a refusal', () => {
  // The vikuna.io crawl, 2026-09-25: the server said "Context size has been
  // exceeded", the 500 carried no usage, nothing was learned, and the retry
  // sent the same prompt. A refusal is a measurement too.

  it('a context overflow tightens the ratio so the next call is smaller', () => {
    const before = charBudgetFor('q', 1200, 'x'.repeat(1000));
    // The whole budget was sent and refused: the real ratio is below what we
    // used, so the bound must land under 3.
    noteContextOverflow('q', before + 1000, 1200);
    expect(charsPerToken('q')).toBeLessThan(3);
    expect(charBudgetFor('q', 1200, 'x'.repeat(1000))).toBeLessThan(before);
  });

  it('the refused prompt no longer passes the gate', () => {
    const system = 'x'.repeat(1000);
    const room = charBudgetFor('q', 1200, system);
    const prompt = system + 'y'.repeat(room);
    expect(checkContext('platform', prompt, 1200, 'q')?.fits).toBe(true);
    noteContextOverflow('q', prompt.length, 1200);
    expect(checkContext('platform', prompt, 1200, 'q')?.fits).toBe(false);
  });

  it('never loosens a ratio the model has already taught tighter', () => {
    for (let i = 0; i < 3; i++) noteObservedTokens('q', 2000, 1000);   // measured: 2 chars/token
    noteContextOverflow('q', 20000, 1200);                             // bound would be ~2.65
    expect(charsPerToken('q')).toBeCloseTo(2);
  });

  it('ignores a refusal it cannot bound', () => {
    noteContextOverflow('', 5000, 1200);
    noteContextOverflow('q', 0, 1200);
    expect(charsPerToken('q')).toBe(3);
  });
});
