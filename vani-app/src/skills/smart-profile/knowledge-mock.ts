/** "What VaNi has read" in mock mode — in memory; real functions, never previewed. */
import type { KbSource } from './useKnowledge';
const SOURCES: KbSource[] = [];
let n = 0;
interface Node { id: string; label: string; name: string; description: string | null; properties: Record<string, unknown>; updated_at: string; source_id: string | null; source_name: string | null; source_type: string | null; }
const NODES: Node[] = [];
interface Edge { id: string; from_node_id: string; to_node_id: string; relationship: string; created_at: string; }
const EDGES: Edge[] = [];
const LINKS: [string, string, string][] = [
  ['Ledgerline', 'TARGETS', 'Head of Procurement, 200–800 bed hospital'], ['Head of Procurement, 200–800 bed hospital', 'FEELS', 'Missed renewals'],
  ['Head of Procurement, 200–800 bed hospital', 'FEELS', 'Unclaimed SLA penalties'], ['Ledgerline', 'SOLVES', 'Missed renewals'], ['Ledgerline', 'SOLVES', 'Unclaimed SLA penalties'],
  ['Ledgerline', 'DIFFERENTIATES_FROM', 'ContractWorks'], ['Sunridge Multispeciality', 'PROVES', 'Two-week contract audit'], ['Two-week contract audit', 'ADDRESSES', 'Unclaimed SLA penalties'],
];
interface Failover { run_id: string; agent: string; asked_at: string; failover_model: string | null; vps_error: string | null; question: string | null; source: KbSource; }
const FAILOVERS: Failover[] = [];
/** A read finished: status, yield and the timestamp the server's trigger would stamp. */
function finish(src: KbSource, count: number, learned = count) { src.status = 'complete'; src.node_count = count; src.updated_at = new Date().toISOString(); learn(src, learned); }
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
  for (const [from, rel, to] of LINKS) {
    const a = NODES.find((x) => x.name === from), b = NODES.find((x) => x.name === to);
    if (!a || !b || EDGES.some((e) => e.from_node_id === a.id && e.to_node_id === b.id && e.relationship === rel)) continue;
    EDGES.push({ id: `e-${EDGES.length + 1}`, from_node_id: a.id, to_node_id: b.id, relationship: rel, created_at: new Date().toISOString() });
  }
}
export const KNOWLEDGE_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'llm-provider-skill.pending_failovers': () => {
    const runs = FAILOVERS.map(({ source, ...r }) => {
      const superseded = source.status === 'complete' && source.updated_at > r.asked_at;
      return { ...r, source: { id: source.id, name: source.display_name, status: source.status, updated_at: source.updated_at }, superseded,
        superseded_detail: superseded ? `${source.display_name} was read successfully after this run parked. Approving would pay to read it again; declining loses nothing.` : null };
    });
    const stale = runs.filter((r) => r.superseded).length;
    return { runs, detail: runs.length ? `${runs.length} run${runs.length === 1 ? '' : 's'} waiting on a decision.${stale ? ` ${stale} of them ${stale === 1 ? 'is' : 'are'} already done by a later read.` : ''}` : 'Nothing waiting. Either the platform model is answering, or HAIKU_DEFAULT is true and escalation is automatic.' };
  },
  'ingestion-skill.list_sources': () => ({ sources: [...SOURCES].reverse(), total: SOURCES.length, recipe: 'source-list' }),
  'ingestion-skill.knowledge': (p) => {
    const label = String(p.label ?? '').trim() || null;
    const nodes = label ? NODES.filter((x) => x.label === label) : NODES;
    const counts: Record<string, number> = {}; for (const x of NODES) counts[x.label] = (counts[x.label] ?? 0) + 1;
    return { nodes, filtered_total: nodes.length, labels: Object.entries(counts).map(([l, c]) => ({ label: l, count: c })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)), edges: [...EDGES], total: NODES.length, recipe: 'knowledge-list' };
  },
  // The wizard polls one source for its run steps while the crawl runs.
  'ingestion-skill.get_source': (p) => {
    const s = SOURCES.find((x) => x.id === String(p.source_id)); if (!s) throw new Error('SOURCE_NOT_FOUND: No source with that id for this tenant');
    const done = s.status === 'complete';
    return { source: { ...s, run_status: done ? 'completed' : 'running', run_steps: done
      ? [{ step_name: 'parse', status: 'ok' }, { step_name: 'parse_complete', status: 'ok', output_summary: '6 pages, 23,211 chars' }, { step_name: 'draft_profile', status: 'ok' }, { step_name: 'extract_complete', status: 'ok', output_summary: '7 nodes, 8 relationships' }, { step_name: 'complete', status: 'ok' }]
      : (Date.now() - Number(s.id.split('-')[1] || 0)) > 0 && s.status === 'processing' ? [{ step_name: 'parse', status: 'ok' }, { step_name: 'parse_complete', status: 'ok', output_summary: '6 pages, 23,211 chars' }, { step_name: 'draft_profile', status: 'running' }] : [] }, recipe: 'source-detail' };
  },
};
export const KNOWLEDGE_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'ingestion-skill.update_node': (p) => {
    const n = NODES.find((x) => x.id === String(p.node_id)); if (!n) throw new Error('NODE_NOT_FOUND: No such entry for this tenant');
    const name = p.name === undefined ? undefined : String(p.name).trim();
    const description = p.description === undefined ? undefined : String(p.description).trim();
    if (name === undefined && description === undefined) throw new Error('MISSING_FIELDS: name or description is required');
    if (name !== undefined && !name) throw new Error('INVALID_NAME: a node needs a name');
    if (name !== undefined && NODES.some((x) => x.id !== n.id && x.label === n.label && x.name === name)) throw new Error(`NAME_TAKEN: another ${n.label} entry is already called "${name}" — remove one rather than merging them by rename`);
    if (name !== undefined) n.name = name; if (description !== undefined) n.description = description;
    n.properties = { ...n.properties, human_edited: true, edited_at: new Date().toISOString() }; n.updated_at = new Date().toISOString();
    return { node: n, recipe: 'knowledge-node' };
  },
  'ingestion-skill.delete_node': (p) => {
    const i = NODES.findIndex((x) => x.id === String(p.node_id)); if (i < 0) throw new Error('NODE_NOT_FOUND: No such entry for this tenant');
    const id = NODES[i].id; NODES.splice(i, 1);
    const before = EDGES.length; for (let j = EDGES.length - 1; j >= 0; j--) if (EDGES[j].from_node_id === id || EDGES[j].to_node_id === id) EDGES.splice(j, 1);
    return { deleted: true, node_id: id, edges_removed: before - EDGES.length, recipe: 'confirmation' };
  },
  'llm-provider-skill.resolve_failover': (p) => {
    const i = FAILOVERS.findIndex((f) => f.run_id === String(p.run_id));
    if (i < 0) return { ok: false, reason: 'NOT_WAITING', detail: `Run ${String(p.run_id)} is not waiting on a failover decision.` };
    const [f] = FAILOVERS.splice(i, 1);
    if (p.approve === true) { f.source.status = 'pending'; f.source.error_msg = null; setTimeout(() => finish(f.source, 5), 2500); return { ok: true, approved: true, event_id: `evt-${f.run_id}`, detail: 'Re-emitted with allow_failover: true.' }; }
    return { ok: true, approved: false, detail: 'Run failed with the real cause; nothing spent.' };
  },
  'ingestion-skill.submit_url': (p) => {
    const url = String(p.url ?? '').trim(); if (!url) throw new Error('MISSING_FIELDS: url is required');
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`; const host = new URL(href).hostname;
    const ex = SOURCES.find((s) => s.source_type === 'url' && s.display_name === host);
    if (ex) { ex.status = 'pending'; ex.error_msg = null; setTimeout(() => finish(ex, 7), 3000); return { source_id: ex.id, url: href }; }
    const s: KbSource = { id: `src-${++n}`, source_type: 'url', display_name: host, url: href, status: 'pending', chunk_count: 0, node_count: 0, error_msg: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    SOURCES.push(s);
    // A host with "fail" in it rehearses the parked-run path: the platform
    // model overran its window, HAIKU_DEFAULT=false, a person must decide.
    setTimeout(() => { if (s.status === 'pending') s.status = 'processing'; }, 900);
    if (/fail/.test(host)) {
      setTimeout(() => { s.status = 'error'; s.error_msg = 'LLM_FAILOVER_NEEDS_APPROVAL: LLM_VPS_ERROR: the platform LLM returned 500 Internal Server Error — {"error":{"code":500,"message":"Context size has been exceeded.","type":"server_error"}}';
        FAILOVERS.push({ run_id: String(200 + FAILOVERS.length), agent: 'ingestion-skill', asked_at: new Date().toISOString(), failover_model: 'claude-haiku-4-5', vps_error: 'LLM_VPS_ERROR: 500 {"message":"Context size has been exceeded."}', question: `Retry ${host} on claude-haiku-4-5? This spends Vikuna's key.`, source: s }); }, 2500);
    } else setTimeout(() => finish(s, 7), 3000);
    return { source_id: s.id, url: href };
  },
  'ingestion-skill.submit_text': (p) => {
    const text = String(p.text ?? '').trim(); if (text.length < 40) throw new Error('TEXT_TOO_SHORT: Provide at least 40 characters of context');
    const s: KbSource = { id: `src-${++n}`, source_type: 'txt', display_name: String(p.title ?? '').trim() || 'Pasted context', status: 'pending', chunk_count: 0, node_count: 0, error_msg: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    SOURCES.push(s); setTimeout(() => finish(s, 3, 8), 3000);
    return { source_id: s.id };
  },
  'ingestion-skill.delete_source': (p) => { const i = SOURCES.findIndex((s) => s.id === String(p.source_id)); if (i < 0) throw new Error('SOURCE_NOT_FOUND'); SOURCES.splice(i, 1); return { deleted: true }; },
};
