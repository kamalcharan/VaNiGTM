/** "What VaNi has read" in mock mode — in memory; real functions, never previewed. */
import type { KbSource } from './useKnowledge';
const SOURCES: KbSource[] = [];
let n = 0;
interface Node { id: string; label: string; name: string; description: string | null; properties: Record<string, unknown>; updated_at: string; source_id: string | null; source_name: string | null; source_type: string | null; }
const NODES: Node[] = [];
/** What a read of a site or a deck yields in mock mode — fictional, Ledgerline. */
const LEARNED: [string, string, string][] = [
  ['Product', 'Ledgerline', 'Contract software for hospitals: every vendor contract, renewal and SLA in one place.'],
  ['ICP', 'Head of Procurement, 200–800 bed hospital', 'Owns vendor contracts and AMC schedules; measured on leakage and audit findings.'],
  ['PainPoint', 'Missed renewals', 'Contracts auto-renew on unfavourable terms because nobody sees them coming.'],
  ['PainPoint', 'Unclaimed SLA penalties', 'Vendors miss SLAs; penalties are never raised because the evidence is in email.'],
  ['Differentiator', 'Two-week contract audit', 'An entry engagement that produces a leakage number before any software is bought.'],
  ['Competitor', 'ContractWorks', 'Generic contract repository; no hospital AMC model.'],
  ['CaseStudy', 'Sunridge Multispeciality', '140 contracts audited; ₹38L of unclaimed penalties found in the first month.'],
  ['Pricing', 'Audit · fixed fee', 'Two-week audit at a fixed fee; platform priced per site.'],
];
function learn(src: KbSource, count: number) {
  const pick = LEARNED.slice(0, count);
  for (const [label, name, description] of pick) {
    if (NODES.some((x) => x.label === label && x.name === name)) continue;
    NODES.push({ id: `kg-${NODES.length + 1}`, label, name, description, properties: {}, updated_at: new Date().toISOString(), source_id: src.id, source_name: src.display_name, source_type: src.source_type });
  }
}
export const KNOWLEDGE_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'ingestion-skill.list_sources': () => ({ sources: [...SOURCES].reverse(), total: SOURCES.length, recipe: 'source-list' }),
  'ingestion-skill.knowledge': (p) => {
    const label = String(p.label ?? '').trim() || null;
    const nodes = label ? NODES.filter((x) => x.label === label) : NODES;
    const counts: Record<string, number> = {}; for (const x of NODES) counts[x.label] = (counts[x.label] ?? 0) + 1;
    return { nodes, filtered_total: nodes.length, labels: Object.entries(counts).map(([l, c]) => ({ label: l, count: c })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)), total: NODES.length, recipe: 'knowledge-list' };
  },
  // The wizard polls one source for its run steps while the crawl runs.
  'ingestion-skill.get_source': (p) => {
    const s = SOURCES.find((x) => x.id === String(p.source_id)); if (!s) throw new Error('SOURCE_NOT_FOUND: No source with that id for this tenant');
    const done = s.status === 'complete';
    return { source: { ...s, run_status: done ? 'completed' : 'running', run_steps: done
      ? [{ step_name: 'crawl', status: 'completed', output_summary: 'read 6 pages' }, { step_name: 'extract', status: 'completed' }, { step_name: 'kg_write', status: 'completed' }]
      : [{ step_name: 'crawl', status: 'running' }] }, recipe: 'source-detail' };
  },
};
export const KNOWLEDGE_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'ingestion-skill.submit_url': (p) => {
    const url = String(p.url ?? '').trim(); if (!url) throw new Error('MISSING_FIELDS: url is required');
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`; const host = new URL(href).hostname;
    const ex = SOURCES.find((s) => s.source_type === 'url' && s.display_name === host);
    if (ex) { ex.status = 'pending'; ex.error_msg = null; return { source_id: ex.id, url: href }; }
    const s: KbSource = { id: `src-${++n}`, source_type: 'url', display_name: host, status: 'pending', chunk_count: 0, node_count: 0, error_msg: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    SOURCES.push(s); setTimeout(() => { s.status = 'complete'; s.node_count = 7; learn(s, 7); }, 3000);
    return { source_id: s.id, url: href };
  },
  'ingestion-skill.submit_text': (p) => {
    const text = String(p.text ?? '').trim(); if (text.length < 40) throw new Error('TEXT_TOO_SHORT: Provide at least 40 characters of context');
    const s: KbSource = { id: `src-${++n}`, source_type: 'txt', display_name: String(p.title ?? '').trim() || 'Pasted context', status: 'pending', chunk_count: 0, node_count: 0, error_msg: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    SOURCES.push(s); setTimeout(() => { s.status = 'complete'; s.node_count = 3; learn(s, 8); }, 3000);
    return { source_id: s.id };
  },
  'ingestion-skill.delete_source': (p) => { const i = SOURCES.findIndex((s) => s.id === String(p.source_id)); if (i < 0) throw new Error('SOURCE_NOT_FOUND'); SOURCES.splice(i, 1); return { deleted: true }; },
};
