/**
 * The D3 split of the profile drafter must not change onboarding.
 *
 * The old drafter (verbatim from main at 5579b2d, fixtures/profile-drafter-v1)
 * and the new one run side by side with the model and the profile store
 * mocked. They must make the SAME model call and write the SAME profile, with
 * and without an improvement baseline, and when the text has to be trimmed.
 * draftFromText must write nothing.
 */
const llmCalls: unknown[] = [];
jest.mock('../../../agent-core/llm.client', () => ({
  callLLMValidated: jest.fn(async (opts: unknown) => {
    llmCalls.push(opts);
    return { product_name: 'Acme', product_tagline: 'Paid on time', key_differentiators: ['Offline'] };
  }),
}));

const upserts: unknown[] = [];
let stored: Record<string, unknown> | null = null;
jest.mock('../profile.service', () => ({
  getProfile: jest.fn(async () => stored),
  upsertProfile: jest.fn(async (_p: unknown, _t: unknown, fill: unknown, by: unknown, note: unknown) => {
    upserts.push({ fill, by, note });
    return { ...(stored ?? {}), ...(fill as object) };
  }),
}));

import type { Pool } from 'pg';
import { draftProfileFromText, draftFromText } from '../profile.drafter';
import { draftProfileFromText as oldDraftProfileFromText } from './fixtures/profile-drafter-v1';

const pool = {} as Pool;
let log: jest.SpyInstance;
beforeAll(() => { log = jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterAll(() => log.mockRestore());

async function both(run: (f: typeof draftProfileFromText) => Promise<unknown>) {
  llmCalls.length = 0; upserts.length = 0;
  const oldResult = await run(oldDraftProfileFromText as unknown as typeof draftProfileFromText);
  const oldCall = llmCalls[0]; const oldUpserts = [...upserts];
  llmCalls.length = 0; upserts.length = 0;
  const newResult = await run(draftProfileFromText);
  return { oldCall, newCall: llmCalls[0], oldUpserts, newUpserts: [...upserts], oldResult, newResult };
}

describe('profile drafter split (D3) — onboarding unchanged', () => {
  beforeEach(() => { stored = null; });

  it('same model call and same write, first draft', async () => {
    const r = await both((f) => f(pool, 't1', 'Acme makes invoicing for plumbers.', 'run-1'));
    expect(r.newCall).toEqual(r.oldCall);
    expect(r.newUpserts).toEqual(r.oldUpserts);
    expect(r.newResult).toEqual(r.oldResult);
  });

  it('same model call and same write, improvement pass with a baseline', async () => {
    stored = { product_name: 'Acme', product_tagline: null };
    const baseline = { product_name: 'Acme', product_tagline: null } as never;
    const r = await both((f) => f(pool, 't1', 'More site text.', 'run-2', { improveBaseline: baseline, changeNote: 'enriched' }));
    expect(r.newCall).toEqual(r.oldCall);
    expect(r.newUpserts).toEqual(r.oldUpserts);
  });

  it('same trimming when the text is larger than the window', async () => {
    const huge = 'word '.repeat(400_000);
    const r = await both((f) => f(pool, 't1', huge, 'run-3'));
    expect(r.newCall).toEqual(r.oldCall);
  });

  it('draftFromText returns the draft and writes nothing', async () => {
    llmCalls.length = 0; upserts.length = 0;
    const d = await draftFromText(pool, 'funnel', 'Acme makes invoicing for plumbers.', 'run-4');
    expect(d.product_name).toBe('Acme');
    expect(upserts).toHaveLength(0);
    expect(llmCalls).toHaveLength(1);
  });
});
