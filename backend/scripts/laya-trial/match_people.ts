/**
 * Measure the in-code matcher on people-sample.jsonl: for each person, the
 * candidate pool is the set of DISTINCT company strings in the file, and the
 * query is the HEADLINE alone. A hit on the person's own company column is
 * "correct". This measures whether the fuzzy layer reconciles the two
 * strings the export gives us for the same employer — the gap is what Haiku
 * would see.   npx tsx scripts/laya-trial/match_people.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { matchCompany, companyKey, employerFromHeadline } from '../../src/etl/company-matcher';

const rows = fs.readFileSync(path.join(__dirname, 'people-sample.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const pool = [...new Map(rows.map((r) => [companyKey(r.company), { id: companyKey(r.company), name: r.company }])).values()].filter((c) => c.id);
let matched = 0, correct = 0, gap = 0, none = 0, noEmployer = 0;
const wrong: string[] = [], gaps: string[] = [], nones: string[] = [];
for (const r of rows) {
  const emp = employerFromHeadline(r.headline);
  if (!emp) { noEmployer++; continue; }
  const m = matchCompany(emp, '', pool);
  if (m.status === 'matched') { matched++; if (m.candidate!.id === companyKey(r.company)) correct++; else wrong.push(`${r.name}: "${emp}" → ${m.candidate!.name} (column: ${r.company})`); }
  else if (m.status === 'gap') { gap++; gaps.push(`${r.name}: "${emp}" ~ ${m.shortlist.map((s) => `${s.candidate.name} ${s.score.toFixed(2)}`).join(' | ')}`); }
  else { none++; nones.push(`${r.name}: "${emp}" (column: ${r.company})`); }
}
const withEmp = rows.length - noEmployer;
console.log(`${rows.length} people, ${pool.length} distinct company keys; ${noEmployer} headlines name no employer`);
console.log(`of ${withEmp} with an employer in the headline: matched ${matched} (${correct} to their own column), gap ${gap}, none ${none}`);
console.log(`\nWRONG (${wrong.length}):`); wrong.forEach((w) => console.log('  ' + w));
console.log(`\nGAP (${gap}) — what Haiku would see:`); gaps.forEach((g) => console.log('  ' + g));
console.log(`\nNONE (${none}):`); nones.forEach((n) => console.log('  ' + n));
