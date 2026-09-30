/**
 * "No fixture, no merge" (AGENTS.md §7) — enforced.
 *
 * The first block validates the validator against a temporary skills tree.
 * The second loads EVERY contract in src/skills/<skill>/contracts and fails if
 * any lacks valid fixtures in src/skills/<skill>/evals.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { __resetContracts, registeredContracts } from '../contract';
import { validateFixtures, loadAllContracts } from '../contract-fixtures';
import { extractContract } from '../primitives';

describe('validateFixtures', () => {
  let dir: string;
  beforeEach(() => { __resetContracts(); dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fixtures-')); });
  afterEach(() => fs.rmSync(dir, { recursive: true, force: true }));

  const contract = () => extractContract({
    key: 'demo-skill.facts', purpose: 'p', sourceIs: 'a page', answerTokens: 100, fields: { product: 'what they sell' },
  });
  const write = (doc: unknown) => {
    fs.mkdirSync(path.join(dir, 'demo-skill', 'evals'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'demo-skill', 'evals', 'facts.json'), JSON.stringify(doc));
  };
  const good = {
    name: 'one', provenance: 'test fixture for the validator itself',
    vars: { source: 'We make pumps.' },
    expected: { facts: [{ field: 'product', value: 'pumps', evidence: 'We make pumps', confidence: 0.9 }] },
  };

  it('no file → refused', () => {
    expect(validateFixtures(contract(), dir)[0]).toMatch(/no fixture file/);
  });
  it('a valid fixture passes', () => {
    write({ contract: 'demo-skill.facts', fixtures: [good] });
    expect(validateFixtures(contract(), dir)).toEqual([]);
  });
  it('missing provenance, missing variable, schema failure are each named', () => {
    write({ contract: 'demo-skill.facts', fixtures: [
      { ...good, name: 'a', provenance: '' },
      { ...good, name: 'b', vars: {} },
      { ...good, name: 'c', expected: { facts: [{ field: 'nope' }] } },
    ] });
    const p = validateFixtures(contract(), dir).join('\n');
    expect(p).toMatch(/"a": needs a provenance/);
    expect(p).toMatch(/"b": vars missing source/);
    expect(p).toMatch(/"c": expected answer fails the schema/);
  });
  it('an expected answer that fails its own grounding check is a broken fixture', () => {
    write({ contract: 'demo-skill.facts', fixtures: [{ ...good, vars: { source: 'Something else entirely.' } }] });
    expect(validateFixtures(contract(), dir)[0]).toMatch(/check rejects 1 piece/);
  });
});

describe('every contract in the repo has valid fixtures', () => {
  it('no fixture, no merge', () => {
    __resetContracts();
    loadAllContracts();
    const problems = registeredContracts().flatMap((c) => validateFixtures(c));
    expect(problems).toEqual([]);
  });
});
