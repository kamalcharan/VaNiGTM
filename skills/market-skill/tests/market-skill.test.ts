/**
 * KI-28: Market Skill — Unit Tests
 *
 * Tests verify:
 * (a) correct data for valid input
 * (b) empty result for non-existent entity
 * (c) zero rows when querying with wrong tenant_id (N/A for shared tables — test missing scheme instead)
 */

import { SkillContext, QueryResult } from '../../../shared/types';

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
    db: { query: queryFn as SkillContext['db']['query'] },
  };
}

const TENANT_A = 'tenant-aaa-1111';

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const navRow = {
  scheme_code: 'INF740KA1234',
  scheme_name: 'HDFC Top 100 Fund - Growth',
  amc: 'HDFC Asset Management',
  category: 'Large Cap',
  expense_ratio: 1.62,
  risk_grade: 'moderate-high',
  aum_cr: 23456.78,
  nav: 852.34,
  nav_date: '2026-03-19',
};

const navHistoryData = [
  { date: '2025-03-19', nav: 750.0 },
  { date: '2025-06-19', nav: 780.5 },
  { date: '2025-09-19', nav: 810.2 },
  { date: '2025-12-19', nav: 835.0 },
  { date: '2026-03-19', nav: 852.34 },
];

const searchResults = [
  {
    scheme_code: 'INF740KA1234',
    scheme_name: 'HDFC Top 100 Fund - Growth',
    amc: 'HDFC Asset Management',
    category: 'Large Cap',
    nav: 852.34,
    nav_date: '2026-03-19',
    rank: 0.8,
  },
  {
    scheme_code: 'INF740KA5678',
    scheme_name: 'HDFC Mid-Cap Opportunities Fund',
    amc: 'HDFC Asset Management',
    category: 'Mid Cap',
    nav: 125.67,
    nav_date: '2026-03-19',
    rank: 0.5,
  },
];

const categorySchemes = [
  { scheme_code: 'S1', scheme_name: 'Scheme Alpha', nav_current: 110, nav_period_start: 100 },
  { scheme_code: 'S2', scheme_name: 'Scheme Beta', nav_current: 105, nav_period_start: 100 },
  { scheme_code: 'S3', scheme_name: 'Scheme Gamma', nav_current: 120, nav_period_start: 100 },
  { scheme_code: 'S4', scheme_name: 'Scheme Delta', nav_current: 95, nav_period_start: 100 },
  { scheme_code: 'S5', scheme_name: 'Scheme Epsilon', nav_current: 115, nav_period_start: 100 },
  { scheme_code: 'S6', scheme_name: 'Scheme Zeta', nav_current: 90, nav_period_start: 100 },
];

// ---------------------------------------------------------------------------
// Tests: get_nav
// ---------------------------------------------------------------------------

describe('get_nav', () => {
  test('(a) returns correct NAV data for valid scheme_code', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [navRow] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_nav } = await import('../functions/get-nav');
    const result = await get_nav({ scheme_code: 'INF740KA1234' }, ctx);

    expect(result).not.toBeNull();
    expect(result!.recipe).toBe('stat-row');
    expect(result!.scheme_code).toBe('INF740KA1234');
    expect(result!.scheme_name).toBe('HDFC Top 100 Fund - Growth');
    expect(result!.nav).toBe(852.34);
    expect(result!.nav_date).toBe('2026-03-19');
    expect(result!.amc).toBe('HDFC Asset Management');
    expect(result!.category).toBe('Large Cap');
  });

  test('(b) returns null for non-existent scheme', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_nav } = await import('../functions/get-nav');
    const result = await get_nav({ scheme_code: 'NONEXISTENT' }, ctx);

    expect(result).toBeNull();
  });

  test('(c) returns null for invalid scheme_code format', async () => {
    const queryFn: MockQueryFn = async (_sql, params) => {
      if (params?.$scheme_code === 'INVALID') return { rows: [] };
      return { rows: [navRow] };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_nav } = await import('../functions/get-nav');
    const result = await get_nav({ scheme_code: 'INVALID' }, ctx);

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: get_nav_history
// ---------------------------------------------------------------------------

describe('get_nav_history', () => {
  test('(a) returns history with period_return_pct for valid scheme', async () => {
    const queryFn: MockQueryFn = async (sql) => {
      if (sql.includes('scheme_name')) return { rows: [{ scheme_name: 'HDFC Top 100' }] };
      return { rows: navHistoryData };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_nav_history } = await import('../functions/get-nav-history');
    const result = await get_nav_history(
      { scheme_code: 'INF740KA1234', from_date: '2025-03-19', to_date: '2026-03-19' },
      ctx
    );

    expect(result.recipe).toBe('line-chart');
    expect(result.scheme_code).toBe('INF740KA1234');
    expect(result.scheme_name).toBe('HDFC Top 100');
    expect(result.data).toHaveLength(5);
    expect(result.data[0].nav).toBe(750.0);
    expect(result.data[4].nav).toBe(852.34);
    // Period return: (852.34 - 750) / 750 * 100 = 13.65%
    expect(result.period_return_pct).toBeCloseTo(13.65, 1);
  });

  test('(b) returns empty data for non-existent scheme', async () => {
    const queryFn: MockQueryFn = async (sql) => {
      if (sql.includes('scheme_name')) return { rows: [] };
      return { rows: [] };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_nav_history } = await import('../functions/get-nav-history');
    const result = await get_nav_history(
      { scheme_code: 'NONEXISTENT', from_date: '2025-01-01', to_date: '2026-01-01' },
      ctx
    );

    expect(result.data).toHaveLength(0);
    expect(result.period_return_pct).toBe(0);
  });

  test('(c) returns zero return for single data point', async () => {
    const queryFn: MockQueryFn = async (sql) => {
      if (sql.includes('scheme_name')) return { rows: [{ scheme_name: 'Test' }] };
      return { rows: [{ date: '2026-03-19', nav: 100 }] };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_nav_history } = await import('../functions/get-nav-history');
    const result = await get_nav_history(
      { scheme_code: 'TEST', from_date: '2026-03-19', to_date: '2026-03-19' },
      ctx
    );

    expect(result.data).toHaveLength(1);
    expect(result.period_return_pct).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: search_schemes
// ---------------------------------------------------------------------------

describe('search_schemes', () => {
  test('(a) returns matching schemes for valid query', async () => {
    const queryFn: MockQueryFn = async (sql) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ total: 2 }] };
      return { rows: searchResults };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { search_schemes } = await import('../functions/search-schemes');
    const result = await search_schemes({ query: 'HDFC' }, ctx);

    expect(result.recipe).toBe('data-table');
    expect(result.results).toHaveLength(2);
    expect(result.total_matches).toBe(2);
    expect(result.results[0].scheme_name).toContain('HDFC');
    expect(result.results[0].nav).toBe(852.34);
  });

  test('(b) returns empty results for no-match query', async () => {
    const queryFn: MockQueryFn = async (sql) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ total: 0 }] };
      return { rows: [] };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { search_schemes } = await import('../functions/search-schemes');
    const result = await search_schemes({ query: 'NONEXISTENT_FUND_XYZ' }, ctx);

    expect(result.results).toHaveLength(0);
    expect(result.total_matches).toBe(0);
  });

  test('(c) respects limit parameter', async () => {
    const queryFn: MockQueryFn = async (sql, params) => {
      if (sql.includes('COUNT(*)')) return { rows: [{ total: 50 }] };
      expect(params?.$limit).toBe(5);
      return { rows: searchResults.slice(0, 1) };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { search_schemes } = await import('../functions/search-schemes');
    const result = await search_schemes({ query: 'HDFC', limit: 5 }, ctx);

    expect(result.results).toHaveLength(1);
    expect(result.total_matches).toBe(50);
  });
});

// ---------------------------------------------------------------------------
// Tests: compare_schemes
// ---------------------------------------------------------------------------

describe('compare_schemes', () => {
  const schemeRows = [
    {
      scheme_code: 'S1',
      scheme_name: 'Fund A',
      amc: 'AMC A',
      category: 'Large Cap',
      expense_ratio: 1.5,
      risk_grade: 'moderate',
      aum: 5000,
      nav: 100,
    },
    {
      scheme_code: 'S2',
      scheme_name: 'Fund B',
      amc: 'AMC B',
      category: 'Mid Cap',
      expense_ratio: 1.8,
      risk_grade: 'high',
      aum: 3000,
      nav: 200,
    },
  ];

  test('(a) returns side-by-side comparison for valid schemes', async () => {
    let callIdx = 0;
    const queryFn: MockQueryFn = async (sql) => {
      callIdx++;
      // First call: scheme details
      if (callIdx === 1) return { rows: schemeRows };
      // Subsequent calls: NAV at date queries (1y, 3y, 5y per scheme)
      return { rows: [{ nav: 90 }] };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { compare_schemes } = await import('../functions/compare-schemes');
    const result = await compare_schemes(
      { scheme_codes: ['S1', 'S2'] },
      ctx
    );

    expect(result.recipe).toBe('comparison');
    expect(result.schemes).toHaveLength(2);
    expect(result.schemes[0].scheme_name).toBe('Fund A');
    expect(result.schemes[1].scheme_name).toBe('Fund B');
    expect(result.schemes[0].expense_ratio).toBe(1.5);
    expect(result.schemes[0].returns_1y).not.toBeNull();
  });

  test('(b) returns empty for non-existent schemes', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { compare_schemes } = await import('../functions/compare-schemes');
    const result = await compare_schemes(
      { scheme_codes: ['NONEXISTENT'] },
      ctx
    );

    expect(result.schemes).toHaveLength(0);
  });

  test('(c) handles schemes with no historical NAV', async () => {
    let callIdx = 0;
    const queryFn: MockQueryFn = async () => {
      callIdx++;
      if (callIdx === 1) return { rows: [schemeRows[0]] };
      return { rows: [] }; // No historical NAV
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { compare_schemes } = await import('../functions/compare-schemes');
    const result = await compare_schemes(
      { scheme_codes: ['S1'] },
      ctx
    );

    expect(result.schemes).toHaveLength(1);
    expect(result.schemes[0].returns_1y).toBeNull();
    expect(result.schemes[0].returns_3y).toBeNull();
    expect(result.schemes[0].returns_5y).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: get_category_performance
// ---------------------------------------------------------------------------

describe('get_category_performance', () => {
  test('(a) returns ranked top 5 / bottom 5 for valid category', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: categorySchemes });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_category_performance } = await import('../functions/get-category-performance');
    const result = await get_category_performance(
      { category: 'Large Cap', period: '1y' },
      ctx
    );

    expect(result.recipe).toBe('data-table');
    expect(result.category).toBe('Large Cap');
    expect(result.period).toBe('1y');
    expect(result.total_schemes).toBe(6);
    expect(result.top_5).toHaveLength(5);
    expect(result.bottom_5).toHaveLength(5);
    // Top performer should be Gamma (20% return)
    expect(result.top_5[0].scheme_name).toBe('Scheme Gamma');
    expect(result.top_5[0].return_pct).toBe(20);
    // Bottom performer should be Zeta (-10% return)
    expect(result.bottom_5[0].scheme_name).toBe('Scheme Zeta');
    expect(result.bottom_5[0].return_pct).toBe(-10);
    // Average return: (10 + 5 + 20 + -5 + 15 + -10) / 6 = 5.83
    expect(result.avg_return).toBeCloseTo(5.83, 1);
  });

  test('(b) returns empty for category with no schemes', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_category_performance } = await import('../functions/get-category-performance');
    const result = await get_category_performance(
      { category: 'Nonexistent Category' },
      ctx
    );

    expect(result.total_schemes).toBe(0);
    expect(result.top_5).toHaveLength(0);
    expect(result.bottom_5).toHaveLength(0);
    expect(result.avg_return).toBe(0);
  });

  test('(c) handles schemes missing period start NAV', async () => {
    const partialData = [
      { scheme_code: 'S1', scheme_name: 'Fund A', nav_current: 100, nav_period_start: null },
      { scheme_code: 'S2', scheme_name: 'Fund B', nav_current: 110, nav_period_start: 100 },
    ];
    const queryFn: MockQueryFn = async () => ({ rows: partialData });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_category_performance } = await import('../functions/get-category-performance');
    const result = await get_category_performance(
      { category: 'Large Cap' },
      ctx
    );

    // Only Fund B should be included (Fund A has no period start NAV)
    expect(result.total_schemes).toBe(1);
    expect(result.top_5[0].scheme_name).toBe('Fund B');
    expect(result.top_5[0].return_pct).toBe(10);
  });
});
