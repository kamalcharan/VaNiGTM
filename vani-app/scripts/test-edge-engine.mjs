// Proves the Edge analysis engine against the reference: runs it on the four
// sample CSVs and diffs every number it produces with p2p-explorer.json and
// p2p-reference-results.json (the outputs of the prototype's derive.py).
//
//   node --experimental-strip-types --import ./scripts/ts-resolve.mjs scripts/test-edge-engine.mjs
//
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTable, project } from '../src/skills/edge/engine/csv.ts';
import { SCHEMA } from '../src/skills/edge/engine/schema.ts';
import { analyse } from '../src/skills/edge/engine/analyse.ts';

const dir = resolve('public/edge/data');
const load = (kind) => project(parseTable(readFileSync(resolve(dir, `p2p-${kind}-sample.csv`), 'utf8')), SCHEMA[kind].columns.map((c) => c.name));
const t0 = Date.now();
const a = analyse({ ap: load('ap'), po: load('po'), grn: load('grn'), vendor: load('vendor') });
const ms = Date.now() - t0;
const refG = JSON.parse(readFileSync(resolve(dir, 'p2p-explorer.json'), 'utf8'));
const refR = JSON.parse(readFileSync(resolve(dir, 'p2p-reference-results.json'), 'utf8'));

let fails = 0, checks = 0;
const eq = (what, got, want) => { checks++; if (JSON.stringify(got) !== JSON.stringify(want)) { fails++; console.log('✗', what, 'got', JSON.stringify(got), 'want', JSON.stringify(want)); } };

for (const [k, n] of Object.entries(refG.nodes)) eq(`node ${k}`, a.graph.nodes[k]?.n, n.n);
for (const e of refG.edges) { const g = a.graph.edges.find((x) => x[0] === e[0] && x[1] === e[1]); eq(`edge ${e[0]}→${e[1]}`, g, e); }
eq('edge count', a.graph.edges.length, refG.edges.length);
refG.variants.forEach((v, i) => { const g = a.graph.variants[i]; eq(`variant ${v.id}`, [g.label, g.seq, g.cases, g.share, g.days], [v.label, v.seq, v.cases, v.share, v.days]); });
eq('distinct variants', a.graph.distinctVariants, 47);
// Which invoice illustrates a variant is not recoverable from the reference
// (its pick sits at an arbitrary position among the tied medians), so the
// engine picks the median-rank case; check it sits at the variant's median.
for (const v of a.graph.variants) {
  const c = a.graph.cases[v.id];
  const seq = c.ev.map((e) => e[0]);
  const inv = c.ev.findIndex((e) => e[0] === 'INV'), pay = c.ev.findIndex((e) => e[0] === 'PAY');
  const d = c.ev.slice(inv + 1, pay + 1).reduce((s, e) => s + (e[2] ?? 0), 0);
  eq(`case ${v.id} sequence`, seq, v.seq);
  eq(`case ${v.id} at median`, Math.abs(d - v.days) < 0.35, true);
}

for (const [id, r] of Object.entries(refR.rules)) {
  const g = a.rules[id];
  eq(`rule ${id} fails/pop/pct`, [g.fails, g.population, g.failPct, g.passPct, g.status], [r.fails, r.population, r.failPct, r.passPct, r.status]);
}
eq('D-02 causes', a.rules['D-02'].extra.causes, refR.rules['D-02'].causes);
eq('D-02 inPlace', a.rules['D-02'].extra.inPlaceAtReceiptPct, refR.rules['D-02'].inPlaceAtReceiptPct);
eq('D-04 value', [a.rules['D-04'].extra.valueFailINR, a.rules['D-04'].extra.valueTotalINR, a.rules['D-04'].extra.valueFailPct], [refR.rules['D-04'].valueFailINR, refR.rules['D-04'].valueTotalINR, refR.rules['D-04'].valueFailPct]);
eq('A-01 byReason', a.rules['A-01'].extra.byReason, refR.rules['A-01'].byReason);
eq('A-01 amount', a.rules['A-01'].extra.amountText, refR.rules['A-01'].amountText);
for (const [id, k] of Object.entries(refR.kpis)) eq(`kpi ${id}`, a.kpis[id].value, k.value);
eq('profile', a.profile, refR.profile);
for (const k of ['ap', 'po', 'grn', 'vendor']) eq(`dataHealth ${k}`, [a.dataHealth[k].rows, a.dataHealth[k].from, a.dataHealth[k].to, a.dataHealth[k].completenessPct, a.dataHealth[k].missing], [refR.dataHealth[k].rows, refR.dataHealth[k].from, refR.dataHealth[k].to, refR.dataHealth[k].completenessPct, refR.dataHealth[k].missing]);
refR.readiness.steps.forEach((s, i) => { const g = a.readiness.steps[i]; eq(`readiness ${s.id}`, [g.dimensions, g.rawScore, g.score, g.band, g.bandName, g.confidence, g.notes], [s.dimensions, s.rawScore, s.score, s.band, s.bandName, s.confidence, s.notes]); });
eq('readiness overall', a.readiness.overall, refR.readiness.overall);
eq('firstSlice', a.readiness.firstSlice, { steps: refR.readiness.firstSlice.steps, title: refR.readiness.firstSlice.title });
eq('reviewTopic', a.readiness.reviewTopic, refR.readiness.reviewTopic);
eq('stepWaits', a.readiness.stepWaits, refR.readiness.stepWaits);
refR.findings.forEach((f, i) => eq(`finding ${f.id}`, [a.findings[i].title, a.findings[i].value, a.findings[i].text], [f.title, f.value, f.text]));

console.log(`${checks - fails}/${checks} checks passed in ${ms} ms${fails ? '' : ' — engine reproduces the reference'}`);
process.exit(fails ? 1 : 0);
