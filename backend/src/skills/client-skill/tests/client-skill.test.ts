/**
 * KI-27: Client Skill — Unit Tests
 *
 * Tests verify:
 * (a) correct data for valid input
 * (b) empty result for non-existent entity
 * (c) zero rows when querying with wrong tenant_id
 */

import { SkillContext, QueryResult } from '../../../shared/types';
import { maskPan } from '../functions/get-client-profile';

// ---------------------------------------------------------------------------
// Mock helpers
// ---------------------------------------------------------------------------

type MockQueryFn = (sql: string, params?: Record<string, unknown>) => Promise<QueryResult>;

function createMockContext(
  tenant_id: string,
  queryFn: MockQueryFn
): SkillContext {
  return {
    tenant_id,
    db: {
      query: queryFn as SkillContext['db']['query'],
      transaction: async <T>(fn: (tx: any) => Promise<T>) => fn({ query: queryFn as SkillContext['db']['query'], transaction: async () => { throw new Error('nested'); } }),
    },
  };
}

const TENANT_A = 'tenant-aaa-1111';
const TENANT_WRONG = 'tenant-zzz-9999';
const CLIENT_ID = 101;
const CLIENT_MISSING = 99999;

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const clientRows = [
  {
    id: 101,
    name: 'Rajesh Sharma',
    email: 'rajesh@example.com',
    phone: '9876543210',
    risk_profile: 'moderate',
    tags: ['HNI', 'SIP-active'],
    last_interaction_date: '2026-03-15T10:00:00Z',
    aum: 2500000,
    sip_count: 3,
    active_sips_total: 25000,
    goals_count: 2,
  },
  {
    id: 102,
    name: 'Priya Patel',
    email: 'priya@example.com',
    phone: '9876543211',
    risk_profile: 'aggressive',
    tags: ['young-investor'],
    last_interaction_date: '2026-03-10T10:00:00Z',
    aum: 800000,
    sip_count: 2,
    active_sips_total: 15000,
    goals_count: 1,
  },
];

const profileRow = {
  id: 101,
  name: 'Rajesh Sharma',
  email: 'rajesh@example.com',
  phone: '9876543210',
  pan_encrypted: 'encrypted-value',
  pan_last4: '1234',
  dob: '1985-06-15',
  address: '123 MG Road',
  city: 'Mumbai',
  state: 'Maharashtra',
  occupation: 'Business Owner',
  annual_income: 2500000,
  risk_capacity: 'moderate-aggressive',
  risk_tolerance: 'moderate',
  risk_required: 'moderate',
  risk_overall: 'moderate',
  family_group_id: 5,
  tags: ['HNI'],
  notes: 'Long-term client since 2018',
  created_at: '2018-01-15T00:00:00Z',
  last_interaction: '2026-03-15T10:00:00Z',
  portfolio_total_value: 2500000,
  portfolio_total_invested: 2000000,
  portfolio_return_pct: 25.0,
  portfolio_scheme_count: 5,
  goals_total: 2,
  goals_on_track: 1,
  goals_at_risk: 1,
  goals_behind: 0,
};

const riskRow = {
  name: 'Rajesh Sharma',
  risk_capacity: 'moderate-aggressive',
  risk_tolerance: 'moderate',
  risk_required: 'moderate',
  risk_overall: 'moderate',
  annual_income: 2500000,
  dob: '1985-06-15',
  occupation: 'Business Owner',
  total_invested: 2000000,
  current_value: 2500000,
  goals_count: 2,
  avg_goal_years: 10,
  updated_at: '2026-01-15T00:00:00Z',
};

// ---------------------------------------------------------------------------
// Tests: PAN masking
// ---------------------------------------------------------------------------

describe('maskPan', () => {
  test('masks PAN correctly as XXXXX1234X', () => {
    expect(maskPan('1234')).toBe('XXXXX1234X');
  });

  test('returns null for null input', () => {
    expect(maskPan(null)).toBeNull();
  });

  test('handles different last4 values', () => {
    expect(maskPan('5678')).toBe('XXXXX5678X');
    expect(maskPan('9012')).toBe('XXXXX9012X');
  });
});

// ---------------------------------------------------------------------------
// Tests: get_clients
// ---------------------------------------------------------------------------

describe('get_clients', () => {
  test('(a) returns correct client list for valid tenant', async () => {
    const queryFn: MockQueryFn = async (sql) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ total: 2 }] };
      return { rows: clientRows };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_clients } = await import('../functions/get-clients');
    const result = await get_clients({ filters: {} }, ctx);

    expect(result.recipe).toBe('client-list');
    expect(result.clients).toHaveLength(2);
    expect(result.total).toBe(2);
    expect(result.clients[0].name).toBe('Rajesh Sharma');
    expect(result.clients[0].aum).toBe(2500000);
    expect(result.clients[0].sip_count).toBe(3);
    expect(result.clients[0].tags).toContain('HNI');
  });

  test('(a) applies search filter', async () => {
    const queryFn: MockQueryFn = async (sql, params) => {
      // Verify search param is passed
      expect(params?.$search).toBe('%Rajesh%');
      if (sql.includes('COUNT(*)')) return { rows: [{ total: 1 }] };
      return { rows: [clientRows[0]] };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_clients } = await import('../functions/get-clients');
    const result = await get_clients(
      { filters: { search: 'Rajesh' } },
      ctx
    );

    expect(result.clients).toHaveLength(1);
    expect(result.clients[0].name).toBe('Rajesh Sharma');
  });

  test('(b) returns empty list for tenant with no clients', async () => {
    const queryFn: MockQueryFn = async (sql) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ total: 0 }] };
      return { rows: [] };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_clients } = await import('../functions/get-clients');
    const result = await get_clients({ filters: {} }, ctx);

    expect(result.clients).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  test('(c) returns zero rows when querying with wrong tenant_id', async () => {
    const queryFn: MockQueryFn = async (sql, params) => {
      if (params?.$tenant_id === TENANT_WRONG) {
        if (sql.includes('COUNT(*)')) return { rows: [{ total: 0 }] };
        return { rows: [] };
      }
      return { rows: clientRows };
    };
    const ctx = createMockContext(TENANT_WRONG, queryFn);

    const { get_clients } = await import('../functions/get-clients');
    const result = await get_clients({ filters: {} }, ctx);

    expect(result.clients).toHaveLength(0);
    expect(result.total).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: get_client_profile
// ---------------------------------------------------------------------------

describe('get_client_profile', () => {
  test('(a) returns complete profile with masked PAN for valid client', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [profileRow] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_client_profile } = await import('../functions/get-client-profile');
    const result = await get_client_profile({ client_id: CLIENT_ID }, ctx);

    expect(result).not.toBeNull();
    expect(result!.recipe).toBe('client-360');
    expect(result!.name).toBe('Rajesh Sharma');
    expect(result!.pan).toBe('XXXXX1234X');
    expect(result!.address).toBe('123 MG Road, Mumbai, Maharashtra');
    expect(result!.portfolio_summary.total_value).toBe(2500000);
    expect(result!.portfolio_summary.return_pct).toBe(25.0);
    expect(result!.goals_summary.total_goals).toBe(2);
    expect(result!.goals_summary.on_track).toBe(1);
    expect(result!.risk_profile.capacity).toBe('moderate-aggressive');
    expect(result!.risk_profile.overall).toBe('moderate');
  });

  test('(b) returns null for non-existent client', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_client_profile } = await import('../functions/get-client-profile');
    const result = await get_client_profile({ client_id: CLIENT_MISSING }, ctx);

    expect(result).toBeNull();
  });

  test('(c) returns null when querying with wrong tenant_id', async () => {
    const queryFn: MockQueryFn = async (_sql, params) => {
      if (params?.$tenant_id === TENANT_WRONG) return { rows: [] };
      return { rows: [profileRow] };
    };
    const ctx = createMockContext(TENANT_WRONG, queryFn);

    const { get_client_profile } = await import('../functions/get-client-profile');
    const result = await get_client_profile({ client_id: CLIENT_ID }, ctx);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: get_risk_profile
// ---------------------------------------------------------------------------

describe('get_risk_profile', () => {
  test('(a) returns correct risk profile with factors for valid client', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [riskRow] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_risk_profile } = await import('../functions/get-risk-profile');
    const result = await get_risk_profile({ client_id: CLIENT_ID }, ctx);

    expect(result).not.toBeNull();
    expect(result!.recipe).toBe('detail-sidebar');
    expect(result!.client_name).toBe('Rajesh Sharma');
    expect(result!.overall_risk).toBe('moderate');
    expect(result!.risk_capacity.score).toBe('moderate-aggressive');
    expect(result!.risk_tolerance.score).toBe('moderate');
    expect(result!.risk_required.score).toBe('moderate');
    expect(result!.recommendation).toContain('60:40');
    expect(result!.risk_capacity.factors.length).toBeGreaterThan(0);
    // Verify age factor
    const ageFactor = result!.risk_capacity.factors.find(f => f.factor === 'Age');
    expect(ageFactor).toBeDefined();
    expect(ageFactor!.impact).toBe('positive'); // Born 1985, ~40 years old → positive
  });

  test('(b) returns null for non-existent client', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_risk_profile } = await import('../functions/get-risk-profile');
    const result = await get_risk_profile({ client_id: CLIENT_MISSING }, ctx);

    expect(result).toBeNull();
  });

  test('(c) returns null when querying with wrong tenant_id', async () => {
    const queryFn: MockQueryFn = async (_sql, params) => {
      if (params?.$tenant_id === TENANT_WRONG) return { rows: [] };
      return { rows: [riskRow] };
    };
    const ctx = createMockContext(TENANT_WRONG, queryFn);

    const { get_risk_profile } = await import('../functions/get-risk-profile');
    const result = await get_risk_profile({ client_id: CLIENT_ID }, ctx);

    expect(result).toBeNull();
  });

  test('risk levels map to correct recommendations', async () => {
    const levels = [
      'conservative', 'moderate-conservative', 'moderate',
      'moderate-aggressive', 'aggressive',
    ];
    for (const level of levels) {
      const row = { ...riskRow, risk_overall: level };
      const queryFn: MockQueryFn = async () => ({ rows: [row] });
      const ctx = createMockContext(TENANT_A, queryFn);

      const { get_risk_profile } = await import('../functions/get-risk-profile');
      const result = await get_risk_profile({ client_id: CLIENT_ID }, ctx);

      expect(result).not.toBeNull();
      expect(result!.overall_risk).toBe(level);
      expect(result!.recommendation.length).toBeGreaterThan(10);
    }
  });
});
