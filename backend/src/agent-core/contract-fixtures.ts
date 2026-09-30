/**
 * Fixtures for prompt contracts — "no fixture, no merge" (AGENTS.md §7).
 *
 * A contract `<skill>.<name>` keeps its fixtures in
 * `src/skills/<skill>/evals/<name>.json`:
 *
 *   {
 *     "contract": "<skill>.<name>",
 *     "fixtures": [{
 *       "name": "short-id",
 *       "provenance": "where the input came from — a real crawl, a real JD,
 *                      a real member row (redacted), and when",
 *       "vars": { ...every variable the contract declares... },
 *       "expected": { ...an answer that satisfies the schema... },
 *       "expected_rejected": 0        // optional: how many pieces the check
 *     }]                               // should reject from `expected`
 *   }
 *
 * `validateFixtures` checks what can be checked WITHOUT a model: the file
 * exists, every fixture names its provenance, supplies every variable, and its
 * expected answer passes the schema AND the contract's own grounding check
 * (an extract fixture whose expected evidence is not in its own source is a
 * broken fixture). Running the fixtures against a model and scoring agreement
 * is C3's runner (`npm run eval`); this is the gate that makes that possible.
 *
 * Contracts are found by loading every `src/skills/<skill>/contracts/*.contract.ts`,
 * so a contract cannot escape the check by living somewhere unexpected.
 */
import fs from 'fs';
import path from 'path';
import type { PromptContract } from './contract';

export interface Fixture {
  name: string;
  provenance: string;
  vars: Record<string, unknown>;
  expected: unknown;
  expected_rejected?: number;
}

const SKILLS_DIR = path.resolve(__dirname, '..', 'skills');

export function fixturePath(key: string, skillsDir = SKILLS_DIR): string {
  const [skill, name] = key.split('.');
  return path.join(skillsDir, skill, 'evals', `${name}.json`);
}

export function readFixtures(key: string, skillsDir = SKILLS_DIR): Fixture[] | null {
  const p = fixturePath(key, skillsDir);
  if (!fs.existsSync(p)) return null;
  const doc = JSON.parse(fs.readFileSync(p, 'utf8'));
  if (doc.contract !== key) throw new Error(`${p}: "contract" is ${doc.contract}, expected ${key}`);
  return Array.isArray(doc.fixtures) ? doc.fixtures as Fixture[] : [];
}

/** Every problem with a contract's fixtures; empty means it may merge. */
export function validateFixtures(c: PromptContract<string, unknown>, skillsDir = SKILLS_DIR): string[] {
  const where = path.relative(process.cwd(), fixturePath(c.key, skillsDir));
  let fixtures: Fixture[] | null;
  try { fixtures = readFixtures(c.key, skillsDir); } catch (e) { return [`${c.key}: ${(e as Error).message}`]; }
  if (fixtures === null) return [`${c.key}: no fixture file at ${where}`];
  if (!fixtures.length) return [`${c.key}: ${where} has no fixtures`];

  const problems: string[] = [];
  const names = new Set<string>();
  for (const f of fixtures) {
    const id = `${c.key} fixture "${f.name ?? '?'}"`;
    if (!f.name) problems.push(`${id}: has no name`);
    else if (names.has(f.name)) problems.push(`${id}: name used twice`);
    names.add(f.name);
    if (!f.provenance || f.provenance.trim().length < 10) {
      problems.push(`${id}: needs a provenance — where the real input came from`);
    }
    const missing = c.variables.filter((v) => !(v in (f.vars ?? {})));
    if (missing.length) problems.push(`${id}: vars missing ${missing.join(', ')}`);

    const parsed = c.output.safeParse(f.expected);
    if (!parsed.success) {
      problems.push(`${id}: expected answer fails the schema — ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
      continue;
    }
    if (c.check && !missing.length) {
      const { rejected } = c.check(parsed.data, f.vars as Record<string, unknown>);
      const want = f.expected_rejected ?? 0;
      if (rejected.length !== want) {
        problems.push(`${id}: the check rejects ${rejected.length} piece(s) of the expected answer, fixture says ${want}`
          + (rejected[0] ? ` (first: ${rejected[0].reason} ${rejected[0].detail ?? ''})` : ''));
      }
    }
  }
  return problems;
}

/** Load every skill's contracts so the registry is complete. Returns the files loaded. */
export function loadAllContracts(): string[] {
  const loaded: string[] = [];
  if (!fs.existsSync(SKILLS_DIR)) return loaded;
  for (const skill of fs.readdirSync(SKILLS_DIR)) {
    const dir = path.join(SKILLS_DIR, skill, 'contracts');
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (!/\.contract\.(ts|js)$/.test(f)) continue;
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      require(path.join(dir, f));
      loaded.push(path.join(skill, 'contracts', f));
    }
  }
  return loaded;
}
