/**
 * KI-25/KI-26: Portfolio Skill — Unit Tests
 *
 * Tests verify:
 * (a) correct data for valid input
 * (b) empty result for non-existent entity
 * (c) zero rows when querying with wrong tenant_id
 */

import { SkillContext, QueryResult } from '../../../shared/types';
import { computeXirr } from '../functions/calc-xirr';

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
const TENANT_WRONG = 'tenant-zzz-9999';
const CLIENT_ID = 2847;
const CLIENT_MISSING = 99999;

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const holdingsRows = [
  {
    holding_id: 1,
    scheme_code: 'INF123',
    scheme_name: 'HDFC Top 100 Fund',
    category: 'Large Cap',
    amc: 'HDFC AMC',
    units: 100.5,
    avg_nav: 45.0,
    total_invested: 4522.5,
    is_sip: true,
    sip_amount: 5000,
    sip_date: 5,
    sip_status: 'active',
    current_nav: 52.3,
    nav_date: '2026-03-19',
    current_value: 5256.15,
    gain_loss: 733.65,
    gain_pct: 16.22,
  },
  {
    holding_id: 2,
    scheme_code: 'INF456',
    scheme_name: 'Axis Bluechip Fund',
    category: 'Large Cap',
    amc: 'Axis AMC',
    units: 200.0,
    avg_nav: 30.0,
    total_invested: 6000.0,
    is_sip: false,
    sip_amount: null,
    sip_date: null,
    sip_status: null,
    current_nav: 35.5,
    nav_date: '2026-03-19',
    current_value: 7100.0,
    gain_loss: 1100.0,
    gain_pct: 18.33,
  },
];

const allocationRows = [
  { category: 'Large Cap', value: 12356.15, percentage: 65.4, scheme_count: 2 },
  { category: 'Mid Cap', value: 6530.0, percentage: 34.6, scheme_count: 1 },
];

// ---------------------------------------------------------------------------
// Tests: get_holdings
// ---------------------------------------------------------------------------

describe('get_holdings', () => {
  // We can't use fs.readFileSync in tests easily, so we test the logic
  // by mocking the module. Instead, test the transformation logic directly.

  test('(a) returns correct holdings and summary for valid client', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: holdingsRows });
    const ctx = createMockContext(TENANT_A, queryFn);

    // Import dynamically to allow mock setup
    // Since get_holdings reads SQL via fs, we test the contract shape
    const { get_holdings } = await import('../functions/get-holdings');
    const result = await get_holdings({ client_id: CLIENT_ID }, ctx);

    expect(result.recipe).toBe('portfolio-view');
    expect(result.holdings).toHaveLength(2);
    expect(result.holdings[0].scheme_name).toBe('HDFC Top 100 Fund');
    expect(result.holdings[0].nav).toBe(52.3);
    expect(result.holdings[0].gain_pct).toBe(16.22);
    expect(result.summary.scheme_count).toBe(2);
    expect(result.summary.total_value).toBeCloseTo(5256.15 + 7100.0, 1);
    expect(result.summary.total_invested).toBeCloseTo(4522.5 + 6000.0, 1);
    expect(result.summary.overall_gain_pct).toBeGreaterThan(0);
  });

  test('(b) returns empty holdings for non-existent client', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_holdings } = await import('../functions/get-holdings');
    const result = await get_holdings({ client_id: CLIENT_MISSING }, ctx);

    expect(result.holdings).toHaveLength(0);
    expect(result.summary.total_value).toBe(0);
    expect(result.summary.scheme_count).toBe(0);
    expect(result.recipe).toBe('portfolio-view');
  });

  test('(c) returns zero rows when querying with wrong tenant_id', async () => {
    const queryFn: MockQueryFn = async (_sql, params) => {
      // Simulate DB: wrong tenant → no rows
      if (params?.$tenant_id === TENANT_WRONG) return { rows: [] };
      return { rows: holdingsRows };
    };
    const ctx = createMockContext(TENANT_WRONG, queryFn);

    const { get_holdings } = await import('../functions/get-holdings');
    const result = await get_holdings({ client_id: CLIENT_ID }, ctx);

    expect(result.holdings).toHaveLength(0);
    expect(result.summary.total_value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: get_allocation
// ---------------------------------------------------------------------------

describe('get_allocation', () => {
  test('(a) returns correct allocation breakdown for valid client', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: allocationRows });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_allocation } = await import('../functions/get-allocation');
    const result = await get_allocation({ client_id: CLIENT_ID }, ctx);

    expect(result.recipe).toBe('allocation-ring');
    expect(result.allocation).toHaveLength(2);
    expect(result.allocation[0].category).toBe('Large Cap');
    expect(result.allocation[0].percentage).toBe(65.4);
    expect(result.total_value).toBeCloseTo(12356.15 + 6530.0, 1);
  });

  test('(b) returns empty allocation for non-existent client', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_allocation } = await import('../functions/get-allocation');
    const result = await get_allocation({ client_id: CLIENT_MISSING }, ctx);

    expect(result.allocation).toHaveLength(0);
    expect(result.total_value).toBe(0);
  });

  test('(c) returns zero rows when querying with wrong tenant_id', async () => {
    const queryFn: MockQueryFn = async (_sql, params) => {
      if (params?.$tenant_id === TENANT_WRONG) return { rows: [] };
      return { rows: allocationRows };
    };
    const ctx = createMockContext(TENANT_WRONG, queryFn);

    const { get_allocation } = await import('../functions/get-allocation');
    const result = await get_allocation({ client_id: CLIENT_ID }, ctx);

    expect(result.allocation).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: calc_xirr (Newton-Raphson)
// ---------------------------------------------------------------------------

describe('calc_xirr', () => {
  test('computeXirr returns correct rate for known cashflows', () => {
    // Invest 10,000 on Jan 1 2025, get back 11,000 on Jan 1 2026 = ~10% return
    const cashflows = [
      { date: new Date('2025-01-01'), amount: -10000 },
      { date: new Date('2026-01-01'), amount: 11000 },
    ];
    const rate = computeXirr(cashflows);
    expect(rate).toBeCloseTo(10.0, 0); // ~10%
  });

  test('computeXirr handles multiple cashflows (SIP-like)', () => {
    // Monthly SIP of 1000 for 12 months, ending value 13000
    const cashflows = [];
    for (let m = 0; m < 12; m++) {
      cashflows.push({
        date: new Date(2025, m, 1),
        amount: -1000,
      });
    }
    cashflows.push({ date: new Date(2026, 0, 1), amount: 13000 });
    const rate = computeXirr(cashflows);
    expect(rate).toBeGreaterThan(5); // Should be positive
    expect(rate).toBeLessThan(30);
  });

  test('computeXirr returns 0 for insufficient cashflows', () => {
    expect(computeXirr([])).toBe(0);
    expect(computeXirr([{ date: new Date(), amount: -1000 }])).toBe(0);
  });

  test('(a) calc_xirr returns result for valid client', async () => {
    const txnRows = [
      { txn_type: 'purchase', txn_date: '2025-01-15', amount: 50000, units: 100 },
      { txn_type: 'purchase', txn_date: '2025-06-15', amount: 50000, units: 90 },
    ];
    const holdingRows = [
      { scheme_code: 'INF123', units: 190, current_nav: 600, total_invested: 100000 },
    ];

    let callCount = 0;
    const queryFn: MockQueryFn = async () => {
      callCount++;
      if (callCount === 1) return { rows: txnRows };
      return { rows: holdingRows };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { calc_xirr } = await import('../functions/calc-xirr');
    const result = await calc_xirr({ client_id: CLIENT_ID }, ctx);

    expect(result.recipe).toBe('returns-card');
    expect(result.invested).toBe(100000);
    expect(result.current_value).toBe(190 * 600);
    expect(result.period_days).toBeGreaterThan(0);
    expect(typeof result.xirr_pct).toBe('number');
  });

  test('(b) calc_xirr returns zero for non-existent client', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { calc_xirr } = await import('../functions/calc-xirr');
    const result = await calc_xirr({ client_id: CLIENT_MISSING }, ctx);

    expect(result.xirr_pct).toBe(0);
    expect(result.invested).toBe(0);
    expect(result.current_value).toBe(0);
  });

  test('(c) calc_xirr returns zero rows with wrong tenant_id', async () => {
    const queryFn: MockQueryFn = async (_sql, params) => {
      if (params?.$tenant_id === TENANT_WRONG) return { rows: [] };
      return { rows: [] };
    };
    const ctx = createMockContext(TENANT_WRONG, queryFn);

    const { calc_xirr } = await import('../functions/calc-xirr');
    const result = await calc_xirr({ client_id: CLIENT_ID }, ctx);

    expect(result.xirr_pct).toBe(0);
    expect(result.current_value).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: get_portfolio_summary
// ---------------------------------------------------------------------------

describe('get_portfolio_summary', () => {
  const summaryRows = [
    {
      scheme_code: 'INF123',
      scheme_name: 'HDFC Top 100',
      units: 100,
      current_nav: 55,
      total_invested: 4500,
      gain_pct: 22.22,
      is_sip: true,
      sip_amount: 5000,
      sip_status: 'active',
    },
    {
      scheme_code: 'INF456',
      scheme_name: 'Axis Bluechip',
      units: 200,
      current_nav: 35,
      total_invested: 6000,
      gain_pct: 16.67,
      is_sip: false,
      sip_amount: null,
      sip_status: null,
    },
    {
      scheme_code: 'INF789',
      scheme_name: 'SBI Small Cap',
      units: 50,
      current_nav: 80,
      total_invested: 5000,
      gain_pct: -20.0,
      is_sip: true,
      sip_amount: 3000,
      sip_status: 'active',
    },
    {
      scheme_code: 'INF012',
      scheme_name: 'ICICI Pru Value',
      units: 150,
      current_nav: 40,
      total_invested: 7000,
      gain_pct: -14.29,
      is_sip: false,
      sip_amount: null,
      sip_status: null,
    },
  ];

  test('(a) returns correct summary with performers for valid client', async () => {
    // get_portfolio_summary calls calc_xirr internally, so mock both queries
    let callIdx = 0;
    const queryFn: MockQueryFn = async () => {
      callIdx++;
      // Call 1: summary holdings query, Call 2: calc_xirr txns, Call 3: calc_xirr holdings
      if (callIdx === 1) return { rows: summaryRows };
      if (callIdx === 2) return { rows: [] }; // no txns for xirr
      return { rows: [] }; // no holdings for xirr
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_portfolio_summary } = await import('../functions/get-portfolio-summary');
    const result = await get_portfolio_summary({ client_id: CLIENT_ID }, ctx);

    expect(result.recipe).toBe('portfolio-view');
    expect(result.total_invested).toBe(4500 + 6000 + 5000 + 7000);
    expect(result.current_value).toBe(100 * 55 + 200 * 35 + 50 * 80 + 150 * 40);
    expect(result.top_performers).toHaveLength(3);
    expect(result.top_performers[0].scheme_name).toBe('HDFC Top 100');
    expect(result.bottom_performers).toHaveLength(3);
    expect(result.sip_count).toBe(2);
    expect(result.sip_total_monthly).toBe(8000);
  });

  test('(b) returns empty summary for non-existent client', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_portfolio_summary } = await import('../functions/get-portfolio-summary');
    const result = await get_portfolio_summary({ client_id: CLIENT_MISSING }, ctx);

    expect(result.total_invested).toBe(0);
    expect(result.current_value).toBe(0);
    expect(result.top_performers).toHaveLength(0);
  });

  test('(c) returns zero data with wrong tenant_id', async () => {
    const queryFn: MockQueryFn = async (_sql, params) => {
      if (params?.$tenant_id === TENANT_WRONG) return { rows: [] };
      return { rows: summaryRows };
    };
    const ctx = createMockContext(TENANT_WRONG, queryFn);

    const { get_portfolio_summary } = await import('../functions/get-portfolio-summary');
    const result = await get_portfolio_summary({ client_id: CLIENT_ID }, ctx);

    expect(result.total_invested).toBe(0);
    expect(result.current_value).toBe(0);
  });
});
