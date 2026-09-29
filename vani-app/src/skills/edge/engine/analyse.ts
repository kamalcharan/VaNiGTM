/**
 * The P2P analysis engine — rulebook 0.1.0, recovered from the reference's
 * `p2p-reference-results.json` and `p2p-explorer.json` (both stamped
 * `generatedBy: tools/derive.py`, which the reference did not ship) and
 * verified to reproduce them number for number from the four sample CSVs
 * (scripts/test-edge-engine.mjs).
 *
 * Pure: rows in, analysis out. No DOM, no fetch. Runs in the browser on the
 * tenant's own registers or on the labelled sample — one path for both,
 * which is what makes "sample" and "own" honest about the same things.
 *
 * What it reconstructs, per invoice: the event trace (PO created/approved/
 * amended, goods received / GRN posted for every GRN, invoice received,
 * held, released, matched, returned, approved, debit note, paid), sorted by
 * time with consecutive repeats collapsed; from the traces the network
 * (nodes counted on raw events, edges on collapsed traces, ≥400 cases
 * shown), the variants (top five sequences), a median case per variant, the
 * KPIs, fifteen rules, six findings and the seven-step readiness score.
 */
import type { Row } from './csv';

// ── time ────────────────────────────────────────────────────────────────
const DAY = 86_400_000;
export function parseDate(s: string | undefined): Date | null {
  const t = (s ?? '').trim();
  if (!t) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/.exec(t);
  if (m) return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] ?? 0), +(m[5] ?? 0)));
  const d = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})(?:[ T](\d{2}):(\d{2}))?/.exec(t); // dd/mm/yyyy
  if (d) return new Date(Date.UTC(+d[3], +d[2] - 1, +d[1], +(d[4] ?? 0), +(d[5] ?? 0)));
  const n = Date.parse(t);
  return Number.isNaN(n) ? null : new Date(n);
}
const days = (a: Date, b: Date) => (b.getTime() - a.getTime()) / DAY;
const dateDays = (a: Date, b: Date) => Math.floor((Date.UTC(b.getUTCFullYear(), b.getUTCMonth(), b.getUTCDate()) - Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), a.getUTCDate())) / DAY);
const hasTime = (s: string | undefined) => /\d{2}:\d{2}/.test(s ?? '');
const median = (xs: number[]) => { if (!xs.length) return 0; const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r1 = (x: number) => Math.round(x * 10) / 10;
const pct = (n: number, d: number) => d ? r1(100 * n / d) : 0;
const num = (s: string | undefined) => { const v = parseFloat((s ?? '').replace(/[^0-9.-]/g, '')); return Number.isFinite(v) ? v : null; };
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = (d: Date, withTime: boolean) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${withTime ? ` ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}` : ''}`;

// ── rulebook parameters (declared rules; defaults from the reference) ───
export interface Rulebook {
  approvalTiers: { upTo: number | null; role: string }[];
  roleRank: string[];
  pricePct: number; qtyPct: number;
  msmeDays: number; otherDays: number;
  poThresholdINR: number;
  grnMaxDays: number;
  msmeWithAgreementDays: number; msmeWithoutAgreementDays: number;
  dupWindowDays: number;
  itcMaxDays: number;
}
export const DEFAULT_RULEBOOK: Rulebook = {
  approvalTiers: [{ upTo: 100000, role: 'Depot Manager' }, { upTo: 500000, role: 'Finance Controller' }, { upTo: null, role: 'CFO' }],
  roleRank: ['Depot Manager', 'Finance Controller', 'CFO'],
  pricePct: 2, qtyPct: 5, msmeDays: 45, otherDays: 60, poThresholdINR: 25000, grnMaxDays: 2,
  msmeWithAgreementDays: 45, msmeWithoutAgreementDays: 15, dupWindowDays: 7, itcMaxDays: 180,
};

// ── output shapes (the same the views already read) ─────────────────────
export interface Node { x: number; y: number; n: number; label: string; side?: number }
export type Edge = [string, string, number, number, number, string?];
export interface Variant { id: string; label: string; seq: string[]; share: number; cases: number; days: number }
export interface Case { inv: string; vendor: string; ev: [string, string, number?][] }
export interface Graph { nodes: Record<string, Node>; edges: Edge[]; variants: Variant[]; cases: Record<string, Case>; distinctVariants: number; invoices: number; activities: number }

export interface Rule { id: string; name: string; category: string; source: string; severity: string; fails: number | null; population: number | null; failPct: number | null; passPct: number | null; status: 'pass' | 'fail' | 'untested'; extra?: Record<string, unknown>; reason?: string }
export interface Finding { id: string; group: string; title: string; severity: string; text: string; value: string; rules: string[] }
export interface ReadinessStep { id: string; name: string; dimensions: Record<'VOL' | 'STD' | 'DAT' | 'RUL' | 'CMP', number | null>; rawScore: number; score: number; band: 'now' | 'fix' | 'wait'; bandName: string; confidence: 'High' | 'Low'; notes: string[] }
export interface DataHealth { name: string; provided: boolean; required: boolean; rows?: number; from?: string | null; to?: string | null; completenessPct?: number; missing?: { column: string; rows: number; pct: number }[] }

export interface Analysis {
  meta: { rulebook: string; generatedAt: string; months: number };
  profile: { activeVendors: number; vendorMaster: number; msmeVendors: number; microSmallVendors: number; receivingPoints: number; invoicesPerMonth: number; posPerMonth: number };
  dataHealth: Record<'ap' | 'po' | 'grn' | 'vendor', DataHealth>;
  graph: Graph;
  kpis: Record<string, { name: string; value: number | null; unit: string }>;
  rules: Record<string, Rule>;
  findings: Finding[];
  readiness: { steps: ReadinessStep[]; overall: number; firstSlice: { steps: string[]; title: string }; reviewTopic: { step: string; name: string; score: number } | null; stepWaits: Record<string, number> };
}

export interface Inputs { ap: Row[]; po: Row[]; grn?: Row[]; vendor?: Row[] }

// ── the network's fixed layout (presentation, from the reference) ───────
const LAYOUT: Record<string, Omit<Node, 'n'>> = {
  POC: { x: 180, y: 28, label: 'PO created' }, POA: { x: 180, y: 92, label: 'PO approved' }, AMD: { x: 372, y: 150, label: 'PO amended', side: 1 },
  GR: { x: 180, y: 176, label: 'Goods received' }, GRN: { x: 180, y: 250, label: 'GRN posted' }, INV: { x: 180, y: 324, label: 'Invoice received' },
  HLD: { x: 48, y: 360, label: 'Invoice held', side: 1 }, REL: { x: 48, y: 418, label: 'Hold released', side: 1 }, MAT: { x: 180, y: 408, label: 'Invoice matched' },
  RET: { x: 372, y: 452, label: 'Returned', side: 1 }, APP: { x: 180, y: 502, label: 'Invoice approved' }, DN: { x: 48, y: 540, label: 'Debit note', side: 1 }, PAY: { x: 180, y: 590, label: 'Paid' },
};
const HAPPY = ['POC', 'POA', 'GR', 'GRN', 'INV', 'MAT', 'APP', 'PAY'];
const EDGE_KIND: Record<string, string> = { 'APP-PAY': 'terms', 'DN-PAY': 'terms', 'POA-GR': 'lead' };
const MIN_EDGE = 400;

type Ev = [code: string, at: Date, raw: string];
interface Trace { row: Row; po: Row | null; grns: Row[]; ev: Ev[]; raw: Ev[] }

export function analyse(input: Inputs, rb: Rulebook = DEFAULT_RULEBOOK): Analysis {
  const ap = input.ap, poRows = input.po, grn = input.grn ?? [], vendor = input.vendor ?? [];
  const po = new Map(poRows.map((r) => [r['PO No'], r]));
  const ven = new Map(vendor.map((r) => [r['Vendor Code'], r]));
  const grnBy = new Map<string, Row[]>();
  for (const g of grn) { const k = g['Vendor Code'] + '\u0000' + g['Invoice Ref']; const a = grnBy.get(k); if (a) a.push(g); else grnBy.set(k, [g]); }
  const grnsOf = (r: Row) => grnBy.get(r['Vendor Code'] + '\u0000' + r['Invoice No']) ?? [];

  // ── traces ──
  const traces: Trace[] = ap.map((r) => {
    const p = r['PO No'] ? po.get(r['PO No']) ?? null : null;
    const gs = grnsOf(r);
    const raw: Ev[] = [];
    const push = (code: string, s: string | undefined) => { const d = parseDate(s); if (d) raw.push([code, d, s ?? '']); };
    if (p) { push('POC', p['PO Date']); push('POA', p['Approved On']); push('AMD', p['Amended On']); }
    for (const g of gs) { push('GR', g['Goods Received On']); push('GRN', g['GRN Posted On']); }
    push('INV', r['Received On']); push('HLD', r['Hold On']); push('REL', r['Hold Released On']); push('MAT', r['Matched On']);
    push('RET', r['Returned On']); push('APP', r['Approved On']); push('DN', r['Debit Note On']); push('PAY', r['Paid On']);
    raw.sort((a, b) => a[1].getTime() - b[1].getTime());
    const ev: Ev[] = [];
    for (const e of raw) if (!ev.length || ev[ev.length - 1][0] !== e[0]) ev.push(e);
    return { row: r, po: p, grns: gs, ev, raw };
  });

  // ── graph ──
  const nodeN = new Map<string, number>();
  const edgeN = new Map<string, number>(), edgeW = new Map<string, number[]>();
  for (const t of traces) {
    for (const [c] of t.raw) nodeN.set(c, (nodeN.get(c) ?? 0) + 1);
    for (let i = 1; i < t.ev.length; i++) {
      const k = t.ev[i - 1][0] + '-' + t.ev[i][0];
      edgeN.set(k, (edgeN.get(k) ?? 0) + 1);
      const w = edgeW.get(k); const d = days(t.ev[i - 1][1], t.ev[i][1]);
      if (w) w.push(d); else edgeW.set(k, [d]);
    }
  }
  const nodes: Record<string, Node> = {};
  for (const [code, lay] of Object.entries(LAYOUT)) if (nodeN.get(code)) nodes[code] = { ...lay, n: nodeN.get(code)! };
  const edges: Edge[] = [...edgeN.entries()].filter(([, n]) => n >= MIN_EDGE).sort((a, b) => b[1] - a[1]).map(([k, n]) => {
    const [a, b] = k.split('-');
    const normal = HAPPY.indexOf(b) === HAPPY.indexOf(a) + 1 && HAPPY.includes(a) ? 1 : 0;
    const e: Edge = [a, b, n, r1(median(edgeW.get(k)!)), normal];
    if (EDGE_KIND[k]) e.push(EDGE_KIND[k]);
    return e;
  });

  // variants
  const bySeq = new Map<string, Trace[]>();
  for (const t of traces) { const k = t.ev.map((e) => e[0]).join('>'); const a = bySeq.get(k); if (a) a.push(t); else bySeq.set(k, [t]); }
  const top = [...bySeq.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 5);
  const label = (seq: string[], i: number) => {
    if (seq.join() === HAPPY.join()) return 'Happy path';
    if (!seq.includes('POC')) return 'No PO';
    if (seq.includes('RET')) return 'Approval returned';
    if (seq.indexOf('POC') > seq.indexOf('INV') && seq.includes('INV')) return 'Retro PO';
    if (seq.includes('GRN') && seq.indexOf('INV') < seq.indexOf('GRN')) return 'Invoice before GRN';
    if (seq.includes('HLD')) return 'Invoice held';
    if (seq.includes('DN')) return 'Debit note';
    if (seq.includes('AMD')) return 'PO amended';
    return 'Variant ' + (i + 1);
  };
  const invPay = (t: Trace) => { const i = t.ev.find((e) => e[0] === 'INV'), p = t.ev.find((e) => e[0] === 'PAY'); return i && p ? days(i[1], p[1]) : null; };
  const variants: Variant[] = [], cases: Record<string, Case> = {};
  top.forEach(([k, ts], i) => {
    const seq = k.split('>');
    const durations = ts.map((t) => ({ t, d: invPay(t) })).filter((x): x is { t: Trace; d: number } => x.d !== null).sort((a, b) => a.d - b.d);
    const id = 'V' + (i + 1);
    variants.push({ id, label: label(seq, i), seq, cases: ts.length, share: Math.round(100 * ts.length / traces.length), days: r1(median(durations.map((x) => x.d))) });
    const pick = durations[durations.length >> 1]?.t ?? ts[0];
    cases[id] = { inv: pick.row['Invoice No'], vendor: pick.row['Vendor Name'] || pick.row['Vendor Code'], ev: pick.ev.map((e, j) => j ? [e[0], fmt(e[1], hasTime(e[2])), r1(days(pick.ev[j - 1][1], e[1]))] : [e[0], fmt(e[1], hasTime(e[2]))]) };
  });
  const graph: Graph = { nodes, edges, variants, cases, distinctVariants: bySeq.size, invoices: traces.length, activities: Object.keys(nodes).length };

  // ── data health, profile ──
  const range = (rows: Row[], col: string) => { const ds = rows.map((r) => parseDate(r[col])).filter((d): d is Date => !!d); if (!ds.length) return [null, null] as const; const min = new Date(Math.min(...ds.map((d) => d.getTime()))), max = new Date(Math.max(...ds.map((d) => d.getTime()))); return [min.toISOString().slice(0, 10), max.toISOString().slice(0, 10)] as const; };
  const health = (name: string, required: boolean, rows: Row[] | undefined, dateCol: string, cols: string[]): DataHealth => {
    if (!rows) return { name, provided: false, required };
    const present = cols.filter((c) => rows.some((r) => c in r));
    const missing = present.map((c) => ({ column: c, rows: rows.filter((r) => !(r[c] ?? '').trim()).length })).filter((m) => m.rows).map((m) => ({ ...m, pct: pct(m.rows, rows.length) }));
    const cells = present.length * rows.length, empty = missing.reduce((a, m) => a + m.rows, 0);
    const [from, to] = dateCol ? range(rows, dateCol) : [null, null];
    // Completeness as the reference reports it: the share of rows untouched by the worst gap.
    const worst = Math.max(0, ...missing.map((m) => m.rows));
    void cells; void empty;
    return { name, provided: true, required, rows: rows.length, from, to, completenessPct: pct(rows.length - worst, rows.length), missing };
  };
  const dataHealth = {
    ap: health('AP invoice register', true, ap, 'Received On', ['Invoice No', 'Vendor Code', 'Depot', 'Invoice Date', 'Received On', 'Invoice Amount', 'Approved On', 'Paid On']),
    po: health('PO register', true, poRows, 'PO Date', ['PO No', 'PO Date', 'Vendor Code', 'Depot', 'PO Value', 'Created By', 'Approved By', 'Approved On', 'Required By']),
    grn: health('GRN register', false, input.grn, 'Goods Received On', ['GRN No', 'PO No', 'Invoice Ref', 'Vendor Code', 'Depot', 'Goods Received On', 'GRN Posted On', 'Qty Received', 'Batch No', 'Expiry']),
    vendor: health('Vendor master', false, input.vendor, '', ['Vendor Code', 'Vendor Name', 'State', 'Payment Terms (days)', 'Written Agreement']),
  };
  const apFrom = parseDate(dataHealth.ap.from ?? undefined), apTo = parseDate(dataHealth.ap.to ?? undefined);
  const months = apFrom && apTo ? Math.max(1, Math.round(days(apFrom, apTo) / 30)) : 1;
  const msme = (r: Row | undefined) => ['Micro', 'Small', 'Medium'].includes(r?.['MSME Category'] ?? '');
  const microSmall = (r: Row | undefined) => ['Micro', 'Small'].includes(r?.['MSME Category'] ?? '');
  const profile = {
    activeVendors: new Set(ap.map((r) => r['Vendor Code'])).size, vendorMaster: vendor.length,
    msmeVendors: vendor.filter(msme).length, microSmallVendors: vendor.filter(microSmall).length,
    receivingPoints: new Set(ap.map((r) => r['Depot']).filter(Boolean)).size,
    invoicesPerMonth: Math.round(ap.length / months), posPerMonth: Math.round(poRows.length / months),
  };

  // ── rules ──
  const rules: Record<string, Rule> = {};
  const rule = (id: string, name: string, category: string, source: string, severity: string, fails: number | null, population: number | null, extra?: Record<string, unknown>, reason?: string): Rule => {
    const r: Rule = { id, name, category, source, severity, fails, population, failPct: fails === null || population === null ? null : pct(fails, population), passPct: fails === null || population === null ? null : r1(100 - pct(fails, population)), status: fails === null ? 'untested' : fails > 0 ? 'fail' : 'pass', extra, reason };
    rules[id] = r; return r;
  };
  const invD = (r: Row) => parseDate(r['Received On'])!;

  // D-01 approval limit by PO value
  const tierFor = (v: number) => rb.approvalTiers.find((t) => t.upTo === null || v <= t.upTo)!.role;
  const topLimit = rb.approvalTiers[rb.approvalTiers.length - 2]?.upTo ?? 0;
  const bigPOs = poRows.filter((p) => (num(p['PO Value']) ?? 0) > topLimit);
  const d01Fails = bigPOs.filter((p) => rb.roleRank.indexOf(p['Approver Role']) < rb.roleRank.indexOf(tierFor(num(p['PO Value']) ?? 0))).length;
  const d01AllFails = poRows.filter((p) => rb.roleRank.indexOf(p['Approver Role']) < rb.roleRank.indexOf(tierFor(num(p['PO Value']) ?? 0))).length;
  rule('D-01', 'Approval limit by PO value', 'declared', 'customer', 'high', d01Fails, bigPOs.length, { failsAllTiers: d01AllFails, posTotal: poRows.length, passPctAllPOs: r1(100 - pct(d01AllFails, poRows.length)), limitINR: topLimit });

  // D-02 3-way match: first pass and its causes
  const withPO = traces.filter((t) => t.po);
  const cause = (t: Trace): 'pass' | 'grn' | 'retro' | 'tol' => {
    const inv = invD(t.row), p = t.po!;
    const pd = parseDate(p['PO Date']); if (pd && pd > inv) return 'retro';
    if (!t.grns.length || !t.grns.every((g) => { const d = parseDate(g['GRN Posted On']); return d && d <= inv; })) return 'grn';
    const ir = num(t.row['Invoice Rate']), pr = num(p['Rate']);
    if (ir !== null && pr) { if (Math.abs(ir - pr) / pr > rb.pricePct / 100) return 'tol'; }
    const iq = num(t.row['Invoice Qty']); const rq = t.grns.reduce((a, g) => a + (num(g['Qty Received']) ?? 0), 0);
    if (iq !== null && Math.abs(iq - rq) / Math.max(rq, 1) > rb.qtyPct / 100) return 'tol';
    return 'pass';
  };
  const causes = withPO.map(cause);
  const cnt = (k: string) => causes.filter((c) => c === k).length;
  const d02Fails = withPO.length - cnt('pass');
  rule('D-02', '3-way match tolerance', 'declared', 'customer', 'medium', d02Fails, withPO.length, {
    firstPassPct: r1(100 - pct(d02Fails, withPO.length)),
    causes: ([['GRN not posted when invoice arrived', cnt('grn')], ['PO raised after invoice', cnt('retro')], ['Price or quantity outside tolerance', cnt('tol')]] as [string, number][]).map(([c, n]) => ({ cause: c, cases: n, shareOfFailures: pct(n, d02Fails) })).sort((a, b) => b.cases - a.cases),
    inPlaceAtReceiptPct: r1(100 - pct(cnt('grn') + cnt('retro'), withPO.length)),
  });

  // D-03 payment terms by vendor type (from invoice date; vendor terms when known)
  const termsFor = (r: Row) => { const v = ven.get(r['Vendor Code']); const t = num(v?.['Payment Terms (days)'] ?? ''); return t ?? (msme(v) ? rb.msmeDays : rb.otherDays); };
  const paidRows = ap.filter((r) => parseDate(r['Paid On']));
  const d03Fails = paidRows.filter((r) => { const a = parseDate(r['Invoice Date']) ?? invD(r); return days(a, parseDate(r['Paid On'])!) > termsFor(r); }).length;
  rule('D-03', 'Payment terms by vendor type', 'declared', 'customer', 'medium', vendor.length ? d03Fails : null, vendor.length ? ap.length : null, undefined, vendor.length ? undefined : 'Vendor master not provided');

  // D-04 PO mandatory above threshold (taxable value)
  const big = ap.filter((r) => (num(r['Taxable Value']) ?? 0) > rb.poThresholdINR);
  const noPOInPlace = (r: Row) => { if (!r['PO No']) return true; const p = po.get(r['PO No']); const pd = p ? parseDate(p['PO Date']) : null; return !p || !!(pd && pd > invD(r)); };
  const d04Fails = big.filter(noPOInPlace);
  const sumTax = (rows: Row[]) => Math.round(rows.reduce((a, r) => a + (num(r['Taxable Value']) ?? 0), 0) * 100) / 100;
  rule('D-04', 'PO mandatory above threshold', 'declared', 'customer', 'high', d04Fails.length, big.length, { valueFailINR: sumTax(d04Fails), valueTotalINR: sumTax(big), valueFailPct: pct(sumTax(d04Fails), sumTax(big)), valuePassPct: r1(100 - pct(sumTax(d04Fails), sumTax(big))) });

  // D-05 GRN posting time
  const lags = grn.map((g) => { const a = parseDate(g['Goods Received On']), b = parseDate(g['GRN Posted On']); return a && b ? days(a, b) : null; }).filter((x): x is number => x !== null);
  rule('D-05', 'GRN posting time', 'declared', 'default', 'medium', grn.length ? lags.filter((x) => x > rb.grnMaxDays).length : null, grn.length ? lags.length : null, { medianLagDays: r1(median(lags)) }, grn.length ? undefined : 'GRN register not provided');

  // S-01 MSME payment within 45 days of acceptance (latest goods receipt, else invoice receipt)
  const msRows = vendor.length ? paidRows.filter((r) => microSmall(ven.get(r['Vendor Code']))) : [];
  const s01Fails = msRows.filter((r) => {
    const gs = grnsOf(r).map((g) => parseDate(g['Goods Received On'])).filter((d): d is Date => !!d);
    const acc = gs.length ? new Date(Math.max(...gs.map((d) => d.getTime()))) : invD(r);
    const thr = (ven.get(r['Vendor Code'])?.['Written Agreement'] ?? 'Y').toUpperCase().startsWith('Y') ? rb.msmeWithAgreementDays : rb.msmeWithoutAgreementDays;
    return dateDays(acc, parseDate(r['Paid On'])!) > thr;
  }).length;
  rule('S-01', 'MSME payment within 45 days (Income Tax Act s.43B(h), MSMED Act s.15)', 'statutory', 'law', 'high', vendor.length ? s01Fails : null, vendor.length ? msRows.length : null, { verify: 'CA review required' }, vendor.length ? undefined : 'Vendor master not provided');
  // S-02 paid within 180 days
  rule('S-02', 'Supplier paid within 180 days or ITC reversed (CGST s.16(2), second proviso)', 'statutory', 'law', 'high', paidRows.filter((r) => days(parseDate(r['Invoice Date']) ?? invD(r), parseDate(r['Paid On'])!) > rb.itcMaxDays).length, ap.length, { verify: 'CA review required' });
  rule('S-03', 'ITC claimed only if invoice appears in GSTR-2B (CGST s.16(2)(aa))', 'statutory', 'law', 'high', null, null, { verify: 'CA review required' }, 'GSTR-2B not provided');

  // C-01..C-04 conformance
  rule('C-01', 'PO exists before invoice', 'conformance', 'processModel', 'medium', ap.filter(noPOInPlace).length, ap.length);
  rule('C-02', 'GRN before invoice approval', 'conformance', 'processModel', 'high', grn.length ? withPO.filter((t) => { const a = parseDate(t.row['Approved On']); return a && t.grns.length && t.grns.every((g) => { const d = parseDate(g['GRN Posted On']); return d && d > a; }); }).length : null, grn.length ? withPO.length : null, undefined, grn.length ? undefined : 'GRN register not provided');
  rule('C-03', 'Approval before payment', 'conformance', 'processModel', 'high', paidRows.filter((r) => { const a = parseDate(r['Approved On']); return !a || a > parseDate(r['Paid On'])!; }).length, ap.length);
  rule('C-04', 'PO creator is not the PO approver', 'conformance', 'control', 'high', poRows.filter((p) => p['Created By'] && p['Created By'] === p['Approved By']).length, poRows.length);

  // A-01 possible duplicates: same vendor + fuzzy-same number, or same amount within the window
  const key = (s: string) => (s.toUpperCase().match(/[A-Z]+|\d+/g) ?? []).map((t) => /^\d+$/.test(t) ? (t.replace(/^0+/, '') || '0') : t).join('/');
  const byNum = new Map<string, Row[]>();
  for (const r of ap) { const k = r['Vendor Code'] + '\u0000' + key(r['Invoice No']); const a = byNum.get(k); if (a) a.push(r); else byNum.set(k, [r]); }
  let sameNum = 0, dupAmt = 0, dupPaid = 0;
  for (const rows of byNum.values()) for (let i = 1; i < rows.length; i++) { sameNum++; dupAmt += num(rows[i]['Invoice Amount']) ?? 0; if (rows[i]['Paid On'] && rows[i - 1]['Paid On']) dupPaid++; }
  const byAmt = new Map<string, Row[]>();
  for (const r of ap) { const k = r['Vendor Code'] + '\u0000' + (num(r['Invoice Amount']) ?? ''); const a = byAmt.get(k); if (a) a.push(r); else byAmt.set(k, [r]); }
  let sameAmt = 0;
  for (const rows of byAmt.values()) {
    if (rows.length < 2) continue;
    const s = [...rows].sort((a, b) => (parseDate(a['Invoice Date'])?.getTime() ?? 0) - (parseDate(b['Invoice Date'])?.getTime() ?? 0));
    for (let i = 1; i < s.length; i++) {
      const a = parseDate(s[i - 1]['Invoice Date']) ?? invD(s[i - 1]), b = parseDate(s[i]['Invoice Date']) ?? invD(s[i]);
      if (key(s[i - 1]['Invoice No']) !== key(s[i]['Invoice No']) && Math.abs(dateDays(a, b)) <= rb.dupWindowDays) { sameAmt++; dupAmt += num(s[i]['Invoice Amount']) ?? 0; if (s[i]['Paid On'] && s[i - 1]['Paid On']) dupPaid++; }
    }
  }
  const lakh = Math.round(dupAmt / 10000) / 10;
  rule('A-01', 'Possible duplicate invoice', 'anomaly', 'default', 'high', sameNum + sameAmt, ap.length, { amountINR: Math.round(dupAmt), amountText: `₹${lakh} lakh`, byReason: { 'same amount within 7 days': sameAmt, 'same invoice number': sameNum } });
  // A-02 split POs under a limit: same vendor, within 7 days, each within 10% under a tier limit, together above it
  let split = 0;
  const byVendorPO = new Map<string, Row[]>();
  for (const p of poRows) { const a = byVendorPO.get(p['Vendor Code']); if (a) a.push(p); else byVendorPO.set(p['Vendor Code'], [p]); }
  for (const ps of byVendorPO.values()) {
    const s = ps.filter((p) => parseDate(p['PO Date'])).sort((a, b) => parseDate(a['PO Date'])!.getTime() - parseDate(b['PO Date'])!.getTime());
    for (let i = 1; i < s.length; i++) {
      const a = num(s[i - 1]['PO Value']) ?? 0, b = num(s[i]['PO Value']) ?? 0;
      if (Math.abs(days(parseDate(s[i - 1]['PO Date'])!, parseDate(s[i]['PO Date'])!)) > 7) continue;
      for (const t of rb.approvalTiers) if (t.upTo && a <= t.upTo && a >= t.upTo * 0.9 && b <= t.upTo && b >= t.upTo * 0.9 && a + b > t.upTo) { split++; break; }
    }
  }
  rule('A-02', 'Split POs under an approval limit', 'anomaly', 'derivedFrom:D-01', 'high', split, poRows.length);
  // A-03 retro PO
  rule('A-03', 'Retro PO', 'anomaly', 'default', 'medium', withPO.filter((t) => { const pd = parseDate(t.po!['PO Date']); return pd && pd > invD(t.row); }).length, withPO.length);

  // ── KPIs ──
  const w = (a: string, b: string, rows: Row[] = ap) => r1(median(rows.map((r) => { const x = parseDate(r[a]), y = parseDate(r[b]); return x && y ? days(x, y) : null; }).filter((v): v is number => v !== null)));
  const untouched = (r: Row) => !r['Hold On'] && !r['Returned On'] && !r['Debit Note On'];
  const touchless = withPO.filter((t, i) => causes[i] === 'pass' && untouched(t.row)).length;
  const kpis = {
    'K-02': { name: 'First-pass match rate', value: withPO.length ? r1(100 - pct(d02Fails, withPO.length)) : null, unit: '%' },
    'K-03': { name: 'Touchless rate', value: withPO.length ? pct(touchless, withPO.length) : null, unit: '%' },
    'K-04': { name: 'Late payment rate (vs terms)', value: rules['D-03'].failPct, unit: '%' },
    'K-05': { name: 'AP cycle time (invoice → payment)', value: w('Received On', 'Paid On'), unit: 'days' },
    'K-06': { name: 'Approval wait (invoice → approval)', value: w('Received On', 'Approved On'), unit: 'days' },
    'K-07': { name: 'Match wait (invoice → match)', value: w('Received On', 'Matched On'), unit: 'days' },
    'K-08': { name: 'GRN posting lag (goods in → GRN)', value: grn.length ? r1(median(lags)) : null, unit: 'days' },
  };

  // ── findings ──
  const fmtN = (n: number) => n.toLocaleString('en-IN');
  const f1 = (n: number | null | undefined) => n === null || n === undefined ? '—' : n.toFixed(1);
  const d02 = rules['D-02'].extra as { firstPassPct: number; causes: { cause: string; cases: number; shareOfFailures: number }[] };
  const topCause = d02.causes[0];
  const findings: Finding[] = [
    { id: 'F1', group: 'approval-wait', severity: 'high', title: 'Approval is the longest controllable wait', value: `${f1(kpis['K-06'].value)} days`, rules: ['K-06', 'H1'],
      text: `Median invoice receipt → approval is ${f1(kpis['K-06'].value)} days, the longest controllable wait (goods in → GRN ${f1(kpis['K-08'].value)}, invoice → match ${f1(kpis['K-07'].value)}). Median receipt → payment is ${f1(kpis['K-05'].value)} days.` },
    { id: 'F2', group: 'cfo-limit', severity: 'high', title: `Large POs skip ${rb.approvalTiers[rb.approvalTiers.length - 1].role} approval`, value: `${f1(rules['D-01'].failPct)}%`, rules: ['D-01', 'C-04', 'A-02'],
      text: `${fmtN(d01Fails)} of ${fmtN(bigPOs.length)} POs above ₹${topLimit / 100000} lakh (${f1(rules['D-01'].failPct)}%) have no ${rb.approvalTiers[rb.approvalTiers.length - 1].role} approval recorded.` },
    { id: 'F3', group: 'msme-late', severity: 'high', title: 'Micro and small vendors are paid late', value: rules['S-01'].failPct === null ? 'untested' : `${f1(rules['S-01'].failPct)}%`, rules: ['S-01', 'D-03'],
      text: rules['S-01'].failPct === null ? 'The MSME payment rule needs the vendor master to be tested.' : `${fmtN(s01Fails)} of ${fmtN(msRows.length)} invoices from Micro and Small vendors (${f1(rules['S-01'].failPct)}%) were paid more than ${rb.msmeWithAgreementDays} days after acceptance.` },
    { id: 'F4', group: 'match-receipt', severity: 'medium', title: 'Match failures start at receiving', value: `${f1(d02.firstPassPct)}%`, rules: ['D-02', 'D-05', 'H2'],
      text: `First-pass 3-way match is ${f1(d02.firstPassPct)}%. ${f1(topCause?.shareOfFailures ?? 0)}% of failures are "${topCause?.cause ?? '—'}"; GRN is posted a median ${f1(kpis['K-08'].value)} days after goods arrive.` },
    { id: 'F5', group: 'po-policy', severity: 'high', title: 'PO policy is not followed', value: `${f1((rules['D-04'].extra as { valueFailPct: number }).valueFailPct)}%`, rules: ['D-04', 'C-01', 'A-03'],
      text: `${f1((rules['D-04'].extra as { valueFailPct: number }).valueFailPct)}% of invoice value above ₹${fmtN(rb.poThresholdINR)} (₹${(Math.round((rules['D-04'].extra as { valueFailINR: number }).valueFailINR / 100000) / 100).toFixed(2)} crore, ${fmtN(d04Fails.length)} invoices) had no PO in place when the invoice arrived.` },
    { id: 'F6', group: 'duplicates', severity: 'high', title: 'Possible duplicate payments', value: `₹${lakh} lakh`, rules: ['A-01'],
      text: `${fmtN(sameNum + sameAmt)} invoices worth ₹${lakh} lakh flagged as possible duplicates${sameNum + sameAmt ? (dupPaid === sameNum + sameAmt ? '; all were paid.' : `; ${fmtN(dupPaid)} were paid.`) : '.'}` },
  ];

  // ── readiness ──
  const vol = (n: number) => Math.min(100, r1(25 * Math.log10(Math.max(1, n / months))));
  const compl = (k: 'ap' | 'po' | 'grn' | 'vendor') => dataHealth[k].provided ? dataHealth[k].completenessPct! : null;
  const invWithGrn = traces.filter((t) => t.grns.length);
  const singleGrn = invWithGrn.length ? pct(invWithGrn.filter((t) => t.grns.length === 1).length, invWithGrn.length) : null;
  const dims: [string, string, ReadinessStep['dimensions']][] = [
    ['requisition', 'Requisition', { VOL: vol(poRows.length), STD: null, DAT: 0, RUL: 0, CMP: null }],
    ['po', 'PO creation', { VOL: vol(poRows.length), STD: rules['C-01'].passPct, DAT: compl('po'), RUL: 100, CMP: (rules['D-04'].extra as { valuePassPct: number }).valuePassPct }],
    ['receipt', 'Goods receipt', { VOL: grn.length ? vol(grn.length) : null, STD: singleGrn, DAT: compl('grn'), RUL: 50, CMP: rules['D-05'].passPct }],
    ['capture', 'Invoice capture', { VOL: vol(ap.length), STD: pct(withPO.length, ap.length), DAT: compl('ap'), RUL: 50, CMP: rules['A-01'].passPct }],
    ['match', '3-way match', { VOL: vol(withPO.length), STD: d02.firstPassPct, DAT: compl('ap'), RUL: 100, CMP: (rules['D-02'].extra as { inPlaceAtReceiptPct: number }).inPlaceAtReceiptPct }],
    ['approval', 'Approval routing', { VOL: vol(ap.length), STD: r1(100 - pct(ap.filter((r) => r['Returned On']).length, ap.length)), DAT: compl('ap'), RUL: 100, CMP: rules['C-03'].passPct }],
    ['payment', 'Payment run', { VOL: vol(ap.length), STD: pct(paidRows.filter((r) => r['Payment Ref']).length, paidRows.length), DAT: compl('vendor') === null ? compl('ap') : r1(((compl('ap') ?? 0) + compl('vendor')!) / 2), RUL: 100, CMP: rules['S-01'].passPct }],
  ];
  const steps: ReadinessStep[] = [];
  for (const [id, name, d] of dims) {
    const v = (k: keyof typeof d) => d[k] ?? 50;
    const raw = Math.round(0.1 * v('VOL') + 0.3 * v('STD') + 0.2 * v('DAT') + 0.1 * v('RUL') + 0.3 * v('CMP'));
    const notes: string[] = [];
    let score = raw;
    const gates = (['STD', 'CMP'] as const).filter((k) => d[k] !== null && d[k]! < 70);
    if (gates.length && score > 69) { score = 69; notes.push('gate not met: ' + gates.map((k) => `${k} ${d[k]!.toFixed(1)}`).join(', ')); }
    const prev = steps[steps.length - 1];
    if (prev && prev.band === 'wait' && score > 69) { score = 69; notes.push(`capped by ${prev.name} (${prev.bandName})`); }
    const band: ReadinessStep['band'] = score >= 90 ? 'now' : score >= 50 ? 'fix' : 'wait';
    steps.push({ id, name, dimensions: d, rawScore: raw, score, band, bandName: band === 'now' ? 'Automate now' : band === 'fix' ? 'Fix first' : 'Not yet', confidence: Object.values(d).some((x) => x === null) ? 'Low' : 'High', notes });
  }
  const now = steps.filter((s) => s.band === 'now');
  const fix = steps.filter((s) => s.band === 'fix').sort((a, b) => a.score - b.score);
  const readinessOut = {
    steps, overall: Math.round(steps.reduce((a, s) => a + s.score, 0) / steps.length),
    firstSlice: { steps: now.map((s) => s.id), title: now.length ? now.map((s) => s.name).join(' + ') + (rules['S-01'].status === 'fail' ? ', with MSME due-date priority' : '') : 'No step is ready to automate yet' },
    reviewTopic: fix[0] ? { step: fix[0].id, name: fix[0].name, score: fix[0].score } : null,
    stepWaits: { receipt: kpis['K-08'].value ?? 0, match: kpis['K-07'].value ?? 0, approval: kpis['K-06'].value ?? 0 },
  };

  return { meta: { rulebook: '0.1.0', generatedAt: new Date().toISOString(), months }, profile, dataHealth, graph, kpis, rules, findings, readiness: readinessOut };
}
