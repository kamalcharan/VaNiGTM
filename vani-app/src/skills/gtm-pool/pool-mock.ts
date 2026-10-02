/**
 * Mock-mode fixtures for pool-skill (no session, pure UI work). Numbers follow
 * the P1 prototype and FTCCI's measured shape; nothing here is presented as
 * real data on the live transport.
 */
import type { CompanyResult, Delivery, IndustryNode, RowsResult, SourcesResult } from './usePool';

const SOURCES: SourcesResult = {
  pool: { candidate: 2098, enriching: 0, held: 21, complete: 0, junk: 17 },
  sources: [
    { id: 1, code: 'mca', name: 'MCA company master data', kind: 'registry', tier: 90, licence_class: 'open_gov', may_enter_pool: true, is_active: true, deliveries: 0, retired_deliveries: 0, rows_staged: 0, source_rows: 0, in_pool: 0 },
    { id: 2, code: 'prospector', name: 'Prospector export', kind: 'provider', tier: 75, licence_class: 'licensed_shareable', may_enter_pool: false, is_active: true, deliveries: 0, retired_deliveries: 0, rows_staged: 0, source_rows: 0, in_pool: 0 },
    { id: 3, code: 'ftcci', name: 'FTCCI members', kind: 'directory', tier: 55, licence_class: 'licensed_private', may_enter_pool: true, is_active: true, deliveries: 1, retired_deliveries: 0, rows_staged: 2913, source_rows: 2912, in_pool: 0 },
    { id: 4, code: 'analytica', name: 'analytica Lab India exhibitors', kind: 'listing', tier: 45, licence_class: 'public_listing', may_enter_pool: true, is_active: true, deliveries: 0, retired_deliveries: 0, rows_staged: 0, source_rows: 0, in_pool: 0 },
    { id: 5, code: 'upload', name: 'Generic upload', kind: 'upload', tier: 40, licence_class: 'unknown_provenance', may_enter_pool: false, is_active: true, deliveries: 0, retired_deliveries: 0, rows_staged: 0, source_rows: 0, in_pool: 0 },
  ],
};
const DELIVERIES: Delivery[] = [{
  id: '12', label: 'FTCCI · Members, Oct-2023', region: 'Telangana', as_of: '2023-10-01', status: 'active', loaded_at: '2026-10-01T10:00:00Z',
  load_kind: 'delivery', source_code: 'ftcci', source_name: 'FTCCI members', staged: 2913, staged_junk: 1, staged_held: 0,
  source_rows: 2912, unmatched: 640, complete: 0, waiting: 2098, held: 21, junk: 17, duplicates: 137,
}];
const ROWS: RowsResult = {
  state: 'held', total: 1, rows: [{
    company_id: '1204', source_row_id: '88123', name: 'Sri Venkateswara Agencies', city: 'Hyderabad', state_code: 'TS',
    domain_normalized: null, industry_raw: 'Advocates & Notaries', pin: '500004', lifecycle_state: 'held', needs_review: false,
    duplicate_of_id: null, is_individual: null, passed: 5, total_checks: 8,
    open: [{ key: 'industry', label: 'Industry', status: 'pending' }, { key: 'domain_lookup', label: 'Domain lookup attempted', status: 'pending' }, { key: 'type', label: 'Type: company or individual', status: 'pending' }],
  }],
};
const COMPANY: CompanyResult = {
  company: {
    id: '1204', name: 'Sri Venkateswara Agencies', lifecycle_state: 'held', junk_reason: null, needs_review: false,
    duplicate_of_id: null, duplicate_of_name: null, industry_name: null, city: 'Hyderabad', state_code: 'TS', pin: '500004',
    admitted_at: null, source_codes: ['ftcci'],
    field_sources: { name: { source: 'ftcci', row: 88123, as_of: '2023-10-01' }, city: { source: 'ftcci', row: 88123, as_of: '2023-10-01' } },
    complete_checks: { passed: 5, total: 8, checks: [
      { key: 'name', label: 'Clean name', status: 'pass', detail: 'Sri Venkateswara Agencies' },
      { key: 'anchor', label: 'Identity anchor', status: 'pass', detail: 'name + PIN 500004' },
      { key: 'location', label: 'Location', status: 'pass', detail: 'Hyderabad, TS' },
      { key: 'industry', label: 'Industry', status: 'pending', detail: 'not mapped to the industry master yet' },
      { key: 'domain_lookup', label: 'Domain lookup attempted', status: 'pending', detail: 'not tried yet' },
      { key: 'match', label: 'Match decided', status: 'pass', detail: 'new' },
      { key: 'type', label: 'Type: company or individual', status: 'pending', detail: 'not decided yet' },
      { key: 'legal', label: 'Legal status', status: 'na', detail: 'no source gives one' },
    ] },
  },
  sources: [{ id: '88123', source_code: 'ftcci', source_name: 'FTCCI members', tier: 55, load_label: 'FTCCI · Members, Oct-2023', load_status: 'active', as_of: '2023-10-01', method: 'import', is_decision: false, name: 'SRI VENKATESWARA AGENCIES', city: 'Hyderabad', domain_normalized: null, industry_raw: 'Advocates & Notaries', raw: { BUSINESS: 'Advocates & Notaries', REP_POST1: 'Advocate' } }],
};
const INDUSTRIES: IndustryNode[] = [
  { id: 1, code: 'manufacturing', name: 'Manufacturing', parent_id: null, nic_prefixes: ['10-33'], source: 'seed', in_pool: 0, companies: 2104, children: [
    { id: 11, code: 'manufacturing.pharma', name: 'Pharma and life sciences', parent_id: 1, nic_prefixes: ['21'], source: 'seed', in_pool: 0, companies: 186, children: [] },
  ] },
  { id: 2, code: 'professional_services', name: 'Professional services', parent_id: null, nic_prefixes: ['69-75'], source: 'seed', in_pool: 0, companies: 210, children: [] },
];

export const POOL_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'pool-skill.sources': () => SOURCES,
  'pool-skill.deliveries': () => ({ deliveries: DELIVERIES }),
  'pool-skill.delivery_rows': (p) => ({ ...ROWS, state: String(p.state ?? 'all'), rows: ['held', 'all'].includes(String(p.state ?? 'all')) ? ROWS.rows : [], total: ['held', 'all'].includes(String(p.state ?? 'all')) ? 1 : 0 }),
  'pool-skill.company': () => COMPANY,
  'pool-skill.industries': () => ({ industries: INDUSTRIES }),
};
export const POOL_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'pool-skill.decide': (p) => ({ company: { id: String(p.company_id), lifecycle_state: p.decision === 'individual' || p.decision === 'junk' ? 'junk' : 'candidate' } }),
  'pool-skill.retire_delivery': (p) => ({ retired: Number(p.load_id), companies_retested: 2098 }),
  'pool-skill.resolve': () => ({ event_id: 'mock', queued: true }),
};
