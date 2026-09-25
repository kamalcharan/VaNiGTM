/** "What VaNi has read" in mock mode — in memory; real functions, never previewed. */
import type { KbSource } from './useKnowledge';
const SOURCES: KbSource[] = [];
let n = 0;
export const KNOWLEDGE_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'ingestion-skill.list_sources': () => ({ sources: [...SOURCES].reverse(), total: SOURCES.length, recipe: 'source-list' }),
};
export const KNOWLEDGE_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'ingestion-skill.submit_url': (p) => {
    const url = String(p.url ?? '').trim(); if (!url) throw new Error('MISSING_FIELDS: url is required');
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`; const host = new URL(href).hostname;
    const ex = SOURCES.find((s) => s.source_type === 'url' && s.display_name === host);
    if (ex) { ex.status = 'pending'; ex.error_msg = null; return { source_id: ex.id, url: href }; }
    const s: KbSource = { id: `src-${++n}`, source_type: 'url', display_name: host, status: 'pending', chunk_count: 0, node_count: 0, error_msg: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    SOURCES.push(s); setTimeout(() => { s.status = 'complete'; s.node_count = 7; }, 3000);
    return { source_id: s.id, url: href };
  },
  'ingestion-skill.submit_text': (p) => {
    const text = String(p.text ?? '').trim(); if (text.length < 40) throw new Error('TEXT_TOO_SHORT: Provide at least 40 characters of context');
    const s: KbSource = { id: `src-${++n}`, source_type: 'txt', display_name: String(p.title ?? '').trim() || 'Pasted context', status: 'pending', chunk_count: 0, node_count: 0, error_msg: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    SOURCES.push(s); setTimeout(() => { s.status = 'complete'; s.node_count = 3; }, 3000);
    return { source_id: s.id };
  },
  'ingestion-skill.delete_source': (p) => { const i = SOURCES.findIndex((s) => s.id === String(p.source_id)); if (i < 0) throw new Error('SOURCE_NOT_FOUND'); SOURCES.splice(i, 1); return { deleted: true }; },
};
