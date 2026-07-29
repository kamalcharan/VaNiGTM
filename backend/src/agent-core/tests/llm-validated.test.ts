/**
 * callLLMValidated — what it says when it fails.
 *
 * The diagnostic IS the feature here. A pilot brief failed with:
 *
 *   LLM_VALIDATION_FAILED: Could not parse valid JSON after retry.
 *   Last response: { "what_they_make": "not stated", ... "named_contacts": "not s
 *
 * Every part of that was misleading. The JSON parsed fine — the model sent a
 * string where an array belonged. The response was not truncated either; the
 * error's own 200-char slice did that, which sent the investigation straight
 * at a token limit that was not the problem.
 */

import { z } from 'zod';
import { callLLMValidated } from '../llm.client';

const calls: { messages: { role: string; content: string }[] }[] = [];
let replies: string[] = [];
const originalFetch = global.fetch;

beforeEach(() => {
  calls.length = 0;
  replies = [];
  global.fetch = jest.fn(async (_url: unknown, init: { body: string }) => {
    const body = JSON.parse(init.body);
    calls.push({ messages: body.messages });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: replies.shift() ?? '' } }],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      }),
    };
  }) as unknown as typeof fetch;
});

afterAll(() => { global.fetch = originalFetch; });

const Schema = z.object({ name: z.string(), tags: z.array(z.string()) });

/**
 * A pool whose queries return no rows: getTokenBudget then reports "not
 * tracked, not capped", which is the same path an uncapped tenant takes.
 */
const opts = () => ({
  tenantId: '11111111-1111-1111-1111-111111111111',
  pool: {
    connect: async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    }),
    query: async () => ({ rows: [] }),
  } as never,
  runId: '1',
  system: 'stub',
  messages: [{ role: 'user' as const, content: 'go' }],
});

describe('what it reports when validation fails', () => {
  // The exact pilot shape: valid JSON, a string where a list belongs.
  const BAD = '{"name":"Acme","tags":"not stated"}';

  it('says the TYPES were wrong, not that the JSON was unparseable', async () => {
    replies = [BAD, BAD];
    await expect(callLLMValidated(opts(), Schema)).rejects.toThrow(
      /JSON was valid but did not match the expected shape/,
    );
  });

  it('names the field and what was expected', async () => {
    replies = [BAD, BAD];
    await expect(callLLMValidated(opts(), Schema)).rejects.toThrow(/tags: expected array/);
  });

  it('still says JSON when the JSON really is broken', async () => {
    replies = ['{"name": "Acme",,,', '{"name": "Acme",,,'];
    await expect(callLLMValidated(opts(), Schema)).rejects.toThrow(
      /the response was not valid JSON/,
    );
  });

  // The old 200-char slice looked exactly like the model truncating.
  it('shows enough of the response, and says how much it cut', async () => {
    const long = `{"name":"${'x'.repeat(3000)}","tags":"nope"}`;
    replies = [long, long];
    await expect(callLLMValidated(opts(), Schema))
      .rejects.toThrow(new RegExp(`first 1200 chars of ${long.length}`));
  });
});

describe('the correction it sends on retry', () => {
  it('tells the model which field to fix rather than "send valid JSON"', async () => {
    replies = ['{"name":"Acme","tags":"not stated"}', '{"name":"Acme","tags":[]}'];
    await callLLMValidated(opts(), Schema);

    const correction = calls[1].messages.at(-1)!.content;
    expect(correction).toMatch(/types were wrong/);
    expect(correction).toMatch(/tags/);
    // The old message said only "not valid JSON" — which a model could read,
    // check against its own perfectly valid JSON, and answer identically.
    expect(correction).not.toMatch(/^Your response was not valid JSON\. Respond/);
  });

  it('recovers when the retry fixes it', async () => {
    replies = ['{"name":"Acme","tags":"none"}', '{"name":"Acme","tags":["api"]}'];
    await expect(callLLMValidated(opts(), Schema)).resolves.toEqual({
      name: 'Acme', tags: ['api'],
    });
  });

  it('does not retry at all when the first answer is good', async () => {
    replies = ['{"name":"Acme","tags":[]}'];
    await callLLMValidated(opts(), Schema);
    expect(calls).toHaveLength(1);
  });
});
