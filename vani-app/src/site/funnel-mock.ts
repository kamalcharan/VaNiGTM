/**
 * The funnel in mock mode (no NEXT_PUBLIC_API_ORIGIN) — fictional, Ledgerline,
 * the same invented company the console's mock uses. Never reached in live
 * mode: live-transport routes funnel.* to the API.
 */
import type { SiteStatus, SubmitResult } from './funnel';

const READS = new Map<string, { site: string; polls: number }>();
/** Requests made in mock mode, so the console's Access requests list has something honest to show. */
const REQUESTS: Record<string, unknown>[] = [];
let seq = 0;

const hostOf = (w: unknown) => String(w ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];

function status(token: string): SiteStatus {
  const r = READS.get(token);
  if (!r) throw new Error('This preview has expired — enter your website again.');
  r.polls++;
  if (r.site.startsWith('fail')) return { status: 'failed', site: r.site, card: null, failure: `${r.site} answered HTTP 404`, claimed: false };
  if (r.polls < 3) return { status: 'reading', site: r.site, card: null, failure: null, claimed: false };
  return {
    status: 'read', site: r.site, claimed: false, failure: null, read_at: new Date().toISOString(),
    card: {
      product_name: 'Ledgerline',
      product_tagline: 'Every vendor contract, renewal and SLA in one place',
      product_category: 'Contract software for hospitals',
      product_description: 'Ledgerline tracks hospital vendor contracts and AMCs, warns before renewals, and raises SLA penalties with the evidence attached.',
    },
    audit: { present: ['title', 'body_text'], missing: ['meta_description', 'og_tags', 'json_ld'] },
    graph_failure: null,
    graph: {
      partial: false,
      nodes: [
        { id: 'n1', label: 'Product', name: 'Ledgerline', description: 'Contract software for hospitals.', properties: {} },
        { id: 'n2', label: 'Feature', name: 'Renewal alerts', description: null, properties: {} },
        { id: 'n3', label: 'ICP', name: 'Hospital procurement heads', description: null, properties: {} },
        { id: 'n4', label: 'PainPoint', name: 'Missed renewals', description: null, properties: {} },
        { id: 'n5', label: 'PainPoint', name: 'Unclaimed SLA penalties', description: null, properties: {} },
        { id: 'n6', label: 'Differentiator', name: 'Two-week contract audit', description: null, properties: {} },
      ],
      edges: [
        { id: 'e1', from_node_id: 'n1', to_node_id: 'n2', relationship: 'HAS_FEATURE' },
        { id: 'e2', from_node_id: 'n1', to_node_id: 'n3', relationship: 'TARGETS' },
        { id: 'e3', from_node_id: 'n3', to_node_id: 'n4', relationship: 'FEELS' },
        { id: 'e4', from_node_id: 'n1', to_node_id: 'n4', relationship: 'SOLVES' },
        { id: 'e5', from_node_id: 'n1', to_node_id: 'n5', relationship: 'SOLVES' },
      ],
    },
  };
}

export const FUNNEL_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'funnel.site_status': (p) => status(String(p.token)),
  'access-skill.list_requests': () => ({ requests: [...REQUESTS].reverse(), total: REQUESTS.length, recipe: 'access-requests' }),
};

export const FUNNEL_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'funnel.submit_site': (p): SubmitResult => {
    const site = hostOf(p.website);
    if (!site.includes('.')) throw new Error(`"${String(p.website ?? '')}" is not a website address`);
    const token = `mock-${++seq}`;
    READS.set(token, { site, polls: 0 });
    return { ...status(token), token, reused: 'new' };
  },
  'funnel.claim': (p) => {
    const r = READS.get(String(p.token));
    if (!r) throw new Error('this preview has expired or does not exist');
    return { site: r.site, source_id: 'mock-source', profile_applied: true, graph_written: { nodes: 6, edges: 5, failed: 0 } };
  },
  'funnel.request_access': (p) => {
    if (!String(p.email ?? '').includes('@')) throw new Error('Enter a work email.');
    const site = typeof p.token === 'string' ? READS.get(p.token)?.site ?? null : null;
    REQUESTS.push({ lead_id: `mock-lead-${REQUESTS.length + 1}`, lead_no: `VANI-${String(REQUESTS.length + 1).padStart(4, '0')}`,
      name: p.name, email: p.email, company: p.company, role_title: p.role_title, country_code: p.country_code ?? null,
      mobile: p.mobile || null, site, consent_text: p.consent_text, requested_at: new Date().toISOString(), times_asked: 1, status: 'new' });
    return { received: true, replayed: false };
  },
};
