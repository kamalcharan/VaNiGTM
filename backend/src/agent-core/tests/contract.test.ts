/**
 * Prompt contracts and the three primitives (POA C2).
 *
 * These test the CODE — rendering, definition checks, grounding checks, the
 * call path — with made-up inputs. They say nothing about prompt quality;
 * that is what fixtures from real data and C3's runner are for.
 */
import { z } from 'zod';
import {
  defineContract, renderContract, runContract, fixedTextOf, __resetContracts,
} from '../contract';
import { extractContract, classifyContract, draftContract, normaliseForEvidence } from '../primitives';

beforeEach(() => __resetContracts());

describe('defineContract refuses a prompt and caller that have drifted apart', () => {
  const base = { purpose: 'p', output: z.object({}), tag: 'out', answerTokens: 100 };
  it('a template using an undeclared variable', () => {
    expect(() => defineContract({ ...base, key: 'x-skill.a', variables: ['a'], system: '{{a}} {{b}}', user: '' }))
      .toThrow(/undeclared b/);
  });
  it('a declared variable no template uses', () => {
    expect(() => defineContract({ ...base, key: 'x-skill.b', variables: ['a', 'b'], system: '{{a}}', user: '' }))
      .toThrow(/never used: b/);
  });
  it('a key that is not <skill>.<name>', () => {
    expect(() => defineContract({ ...base, key: 'NoDot', variables: [], system: '', user: '' })).toThrow(/key must be/);
  });
  it('the same key defined twice', () => {
    defineContract({ ...base, key: 'x-skill.c', variables: [], system: 's', user: 'u' });
    expect(() => defineContract({ ...base, key: 'x-skill.c', variables: [], system: 's', user: 'u' })).toThrow(/defined twice/);
  });
});

describe('renderContract', () => {
  const c = () => defineContract({
    key: 'x-skill.render', purpose: 'p', variables: ['name', 'list'] as const,
    system: 'Hello {{ name }}', user: 'Items: {{list}}', output: z.object({}), tag: 'out', answerTokens: 10,
  });
  it('fills every variable, objects as JSON', () => {
    const r = renderContract(c(), { name: 'Acme', list: ['a', 'b'] });
    expect(r.system).toBe('Hello Acme');
    expect(r.user).toContain('"a"');
  });
  it('a missing variable is an error, not an empty string', () => {
    expect(() => renderContract(c(), { name: 'Acme' } as never)).toThrow(/CONTRACT_VARIABLE_MISSING.*\{\{list\}\}/);
  });
  it('null is a supplied value ("nothing known")', () => {
    expect(renderContract(c(), { name: null, list: null }).system).toBe('Hello ');
  });
  it('fixedTextOf leaves the variables out, for charBudgetFor', () => {
    expect(fixedTextOf(c())).toBe('Hello Items: ');
  });
});

describe('extract — evidence must really be in the source', () => {
  const ex = () => extractContract({
    key: 'x-skill.extract', purpose: 'p', sourceIs: 'a page', answerTokens: 500,
    fields: { product: 'what they sell', buyer: 'who buys it' },
  });
  const source = 'Acme builds  pump controllers\nfor “small farms” in Telangana.';

  it('keeps a fact quoted verbatim, across case, spacing and curly quotes', () => {
    const { answer, rejected } = ex().check!({ facts: [
      { field: 'product', value: 'pump controllers', evidence: 'acme builds pump controllers', confidence: 0.9 },
      { field: 'buyer', value: 'small farms', evidence: 'for "small farms" in Telangana', confidence: 0.8 },
    ] }, { source });
    expect(answer.facts).toHaveLength(2);
    expect(rejected).toEqual([]);
  });

  it('rejects a paraphrased "quote", and says which', () => {
    const { answer, rejected } = ex().check!({ facts: [
      { field: 'buyer', value: 'farmers', evidence: 'Acme sells to farmers', confidence: 0.9 },
    ] }, { source });
    expect(answer.facts).toHaveLength(0);
    expect(rejected[0].reason).toBe('EVIDENCE_NOT_IN_SOURCE');
  });

  it('the schema refuses a field the contract did not declare', () => {
    expect(ex().output.safeParse({ facts: [{ field: 'revenue', value: '1', evidence: 'x', confidence: 1 }] }).success).toBe(false);
  });

  it('normaliseForEvidence unifies what a copy-paste changes', () => {
    expect(normaliseForEvidence('A  “B” – C')).toBe(normaliseForEvidence('a "b" - c'));
  });
});

describe('classify — one declared label, confidence in [0,1]', () => {
  const cl = () => classifyContract({
    key: 'x-skill.classify', purpose: 'p', itemIs: 'a company', answerTokens: 100,
    labels: { company: 'an organisation', individual: 'a person practising alone' },
  });
  it('accepts a declared label', () => {
    expect(cl().output.safeParse({ label: 'individual', confidence: 0.9, reason: 'Advocate' }).success).toBe(true);
  });
  it('refuses an invented label and an out-of-range confidence', () => {
    const c = cl();
    expect(c.output.safeParse({ label: 'partnership', confidence: 0.9, reason: 'x' }).success).toBe(false);
    expect(c.output.safeParse({ label: 'company', confidence: 1.4, reason: 'x' }).success).toBe(false);
  });
  it('needs at least two labels', () => {
    expect(() => classifyContract({ key: 'x-skill.one', purpose: 'p', itemIs: 'x', answerTokens: 1, labels: { a: 'a' } }))
      .toThrow(/at least two labels/);
  });
});

describe('draft — prose may cite only the facts it was given', () => {
  const dr = () => draftContract({ key: 'x-skill.draft', purpose: 'p', write: 'a summary', maxChars: 300, answerTokens: 200 });
  const facts = [{ id: 'f1', text: 'Builds pump controllers' }, { id: 'f2', text: 'Sells in Telangana' }];
  it('keeps known ids', () => {
    const r = dr().check!({ text: 'Acme builds pump controllers.', facts_used: ['f1'] }, { facts, voice: 'plain' });
    expect(r.rejected).toEqual([]);
  });
  it('rejects an id it was never given', () => {
    const r = dr().check!({ text: 'x', facts_used: ['f1', 'f9'] }, { facts, voice: 'plain' });
    expect(r.answer.facts_used).toEqual(['f1']);
    expect(r.rejected.map((x) => x.reason)).toEqual(['UNKNOWN_FACT_ID']);
  });
  it('flags a draft grounded in nothing', () => {
    const r = dr().check!({ text: 'We are the best.', facts_used: [] }, { facts, voice: 'plain' });
    expect(r.rejected.map((x) => x.reason)).toEqual(['NO_FACTS_CITED']);
  });
  it('the schema holds the length cap', () => {
    expect(dr().output.safeParse({ text: 'x'.repeat(301), facts_used: ['f1'] }).success).toBe(false);
  });
});

describe('runContract — render, call, validate, check', () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it('sends the rendered prompt with the contract\'s answer budget, and returns kept + rejected', async () => {
    const c = extractContract({
      key: 'x-skill.run', purpose: 'p', sourceIs: 'a page', answerTokens: 321,
      fields: { product: 'what they sell' },
    });
    let sent: any;
    global.fetch = (async (_url: string, init: { body: string }) => {
      sent = JSON.parse(init.body);
      const content = '<facts>{"facts":['
        + '{"field":"product","value":"pumps","evidence":"We make pumps","confidence":0.9},'
        + '{"field":"product","value":"valves","evidence":"We make valves","confidence":0.7}]}</facts>';
      return new Response(JSON.stringify({
        choices: [{ message: { content }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 50, completion_tokens: 40 },
      }), { status: 200 });
    }) as never;
    const answer = async () => ({ rows: [] });
    const pool = { query: answer, connect: async () => ({ query: answer, release: () => {} }) } as never;

    const r = await runContract(c, { source: 'We make pumps.' }, {
      pool, tenantId: '11111111-1111-1111-1111-111111111111', runId: 'run-1',
    });

    expect(sent.max_tokens).toBe(321);
    expect(sent.messages.at(-1).content).toContain('We make pumps.');
    expect(r.answer.facts.map((f) => f.value)).toEqual(['pumps']);
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].reason).toBe('EVIDENCE_NOT_IN_SOURCE');
  });
});
