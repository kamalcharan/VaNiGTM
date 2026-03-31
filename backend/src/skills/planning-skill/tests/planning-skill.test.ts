/**
 * KI-29: Planning Skill — Unit Tests
 *
 * Tests verify:
 * (a) correct data for valid input
 * (b) empty result for non-existent entity
 * (c) zero rows when querying with wrong tenant_id
 */

import { SkillContext, QueryResult } from '../../../shared/types';
import {
  inflateTarget,
  calcFinalCorpus,
  calcProbability,
  monthsRemaining,
  findRequiredSip,
  projectCorpus,
  defaultInflation,
  monthlyRate,
} from '../functions/planning-math';

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
const GOAL_ID = 5;

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------

const goalRows = [
  {
    id: 5,
    name: 'Retirement',
    type: 'retirement',
    target_amount: 50000000,
    target_date: '2045-01-01',
    current_corpus: 5000000,
    monthly_sip: 50000,
    inflation_rate: 6,
    expected_return: 12,
    probability: 0.72,
    status: 'active',
    linked_schemes: ['INF123', 'INF456'],
    notes: null,
    created_at: '2023-01-01T00:00:00Z',
    updated_at: '2026-03-01T00:00:00Z',
  },
  {
    id: 6,
    name: 'Child Education',
    type: 'education',
    target_amount: 10000000,
    target_date: '2035-06-01',
    current_corpus: 1000000,
    monthly_sip: 20000,
    inflation_rate: 10,
    expected_return: 12,
    probability: 0.55,
    status: 'active',
    linked_schemes: [],
    notes: 'IIT prep',
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
  },
];

const singleGoalRow = goalRows[0];

// ---------------------------------------------------------------------------
// Tests: planning-math utilities
// ---------------------------------------------------------------------------

describe('planning-math', () => {
  test('inflateTarget correctly compounds', () => {
    // ₹10L at 6% for 10 years = ₹10L * 1.06^10 ≈ ₹17.91L
    const result = inflateTarget(1000000, 6, 10);
    expect(result).toBeCloseTo(1790847.7, 0);
  });

  test('monthlyRate converts annual to monthly', () => {
    // 12% annual → ~0.949% monthly
    const mr = monthlyRate(12);
    expect(mr).toBeCloseTo(0.00949, 4);
  });

  test('calcFinalCorpus with SIP', () => {
    // ₹0 starting, ₹10000/month SIP, 12% return, 12 months
    const result = calcFinalCorpus(0, 10000, 12, 12);
    expect(result).toBeGreaterThan(120000); // Must be more than just contributions
    expect(result).toBeLessThan(150000);
  });

  test('calcFinalCorpus with existing corpus and no SIP', () => {
    // ₹100000 at 12% for 12 months
    const result = calcFinalCorpus(100000, 0, 12, 12);
    expect(result).toBeCloseTo(112000, -2); // ~₹1,12,000
  });

  test('calcProbability caps at 1.0', () => {
    expect(calcProbability(2000000, 1000000)).toBe(1.0);
    expect(calcProbability(500000, 1000000)).toBe(0.5);
    expect(calcProbability(0, 1000000)).toBe(0);
  });

  test('calcProbability handles zero target', () => {
    expect(calcProbability(100, 0)).toBe(1.0);
  });

  test('monthsRemaining returns correct count', () => {
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 2);
    const result = monthsRemaining(futureDate.toISOString().slice(0, 10));
    expect(result).toBe(24);
  });

  test('monthsRemaining returns 0 for past dates', () => {
    expect(monthsRemaining('2020-01-01')).toBe(0);
  });

  test('findRequiredSip returns 0 when corpus already meets target', () => {
    const sip = findRequiredSip(10000000, 12, 120, 5000000);
    expect(sip).toBe(0);
  });

  test('findRequiredSip finds correct SIP via binary search', () => {
    // Target ₹10L in 60 months at 12%, starting from 0
    const sip = findRequiredSip(0, 12, 60, 1000000);
    expect(sip).toBeGreaterThan(0);
    // Verify: the SIP should actually reach the target
    const projected = calcFinalCorpus(0, sip, 12, 60);
    expect(projected).toBeGreaterThanOrEqual(1000000 - 1);
  });

  test('projectCorpus generates monthly array', () => {
    const projections = projectCorpus(100000, 10000, 12, 6);
    expect(projections).toHaveLength(7); // month 0 through 6
    expect(projections[0].month).toBe(0);
    expect(projections[0].corpus).toBe(100000);
    expect(projections[0].growth).toBe(0);
    expect(projections[6].month).toBe(6);
    expect(projections[6].corpus).toBeGreaterThan(160000);
    expect(projections[6].contributions).toBe(100000 + 6 * 10000);
  });

  test('defaultInflation returns correct rates by goal type', () => {
    expect(defaultInflation('education')).toBe(10);
    expect(defaultInflation('retirement')).toBe(6);
    expect(defaultInflation('house')).toBe(6);
    expect(defaultInflation('custom')).toBe(6);
  });
});

// ---------------------------------------------------------------------------
// Tests: get_goals
// ---------------------------------------------------------------------------

describe('get_goals', () => {
  test('(a) returns all goals for valid client', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: goalRows });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_goals } = await import('../functions/get-goals');
    const result = await get_goals({ client_id: CLIENT_ID }, ctx);

    expect(result.recipe).toBe('goal-dashboard');
    expect(result.goals).toHaveLength(2);
    expect(result.goals[0].name).toBe('Retirement');
    expect(result.goals[0].target_amount).toBe(50000000);
    expect(result.goals[0].probability).toBe(0.72);
    expect(result.goals[1].name).toBe('Child Education');
    expect(result.goals[1].inflation_rate).toBe(10);
  });

  test('(b) returns empty goals for non-existent client', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { get_goals } = await import('../functions/get-goals');
    const result = await get_goals({ client_id: CLIENT_MISSING }, ctx);

    expect(result.goals).toHaveLength(0);
    expect(result.recipe).toBe('goal-dashboard');
  });

  test('(c) returns zero rows with wrong tenant_id', async () => {
    const queryFn: MockQueryFn = async (_sql, params) => {
      if (params?.$tenant_id === TENANT_WRONG) return { rows: [] };
      return { rows: goalRows };
    };
    const ctx = createMockContext(TENANT_WRONG, queryFn);

    const { get_goals } = await import('../functions/get-goals');
    const result = await get_goals({ client_id: CLIENT_ID }, ctx);

    expect(result.goals).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Tests: calc_goal_gap
// ---------------------------------------------------------------------------

describe('calc_goal_gap', () => {
  test('(a) returns gap analysis for valid goal', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [singleGoalRow] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { calc_goal_gap } = await import('../functions/calc-goal-gap');
    const result = await calc_goal_gap(
      { client_id: CLIENT_ID, goal_id: GOAL_ID },
      ctx
    );

    expect(result).not.toBeNull();
    expect(result!.recipe).toBe('goal-deep-dive');
    expect(result!.goal_name).toBe('Retirement');
    expect(result!.current_corpus).toBe(5000000);
    expect(result!.current_sip).toBe(50000);
    expect(result!.target_amount_inflated).toBeGreaterThan(50000000); // Inflated
    expect(result!.projected_corpus).toBeGreaterThan(0);
    expect(result!.months_remaining).toBeGreaterThan(0);
    expect(result!.required_sip).toBeGreaterThanOrEqual(0);
    expect(result!.sip_deficit).toBeGreaterThanOrEqual(0);
  });

  test('(b) returns null for non-existent goal', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { calc_goal_gap } = await import('../functions/calc-goal-gap');
    const result = await calc_goal_gap(
      { client_id: CLIENT_ID, goal_id: 99999 },
      ctx
    );

    expect(result).toBeNull();
  });

  test('(c) returns null with wrong tenant_id', async () => {
    const queryFn: MockQueryFn = async (_sql, params) => {
      if (params?.$tenant_id === TENANT_WRONG) return { rows: [] };
      return { rows: [singleGoalRow] };
    };
    const ctx = createMockContext(TENANT_WRONG, queryFn);

    const { calc_goal_gap } = await import('../functions/calc-goal-gap');
    const result = await calc_goal_gap(
      { client_id: CLIENT_ID, goal_id: GOAL_ID },
      ctx
    );

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: project_goal
// ---------------------------------------------------------------------------

describe('project_goal', () => {
  test('(a) returns projections for valid goal', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [singleGoalRow] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { project_goal } = await import('../functions/project-goal');
    const result = await project_goal(
      { client_id: CLIENT_ID, goal_id: GOAL_ID },
      ctx
    );

    expect(result).not.toBeNull();
    expect(result!.recipe).toBe('goal-deep-dive');
    expect(result!.projections.length).toBeGreaterThan(0);
    expect(result!.projections[0].month).toBe(0);
    expect(result!.projections[0].corpus).toBe(5000000);
    expect(result!.final_corpus).toBeGreaterThan(5000000);
    expect(result!.probability).toBeGreaterThan(0);
    expect(typeof result!.target_met).toBe('boolean');
  });

  test('(a) applies scenario overrides', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [singleGoalRow] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { project_goal } = await import('../functions/project-goal');

    // Higher SIP should increase final corpus
    const baseResult = await project_goal(
      { client_id: CLIENT_ID, goal_id: GOAL_ID },
      ctx
    );
    const scenarioResult = await project_goal(
      {
        client_id: CLIENT_ID,
        goal_id: GOAL_ID,
        scenario: { sip_amount: 100000, additional_lumpsum: 1000000 },
      },
      ctx
    );

    expect(scenarioResult!.final_corpus).toBeGreaterThan(baseResult!.final_corpus);
    expect(scenarioResult!.probability).toBeGreaterThanOrEqual(baseResult!.probability);
  });

  test('(b) returns null for non-existent goal', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { project_goal } = await import('../functions/project-goal');
    const result = await project_goal(
      { client_id: CLIENT_ID, goal_id: 99999 },
      ctx
    );

    expect(result).toBeNull();
  });

  test('(c) returns null with wrong tenant_id', async () => {
    const queryFn: MockQueryFn = async (_sql, params) => {
      if (params?.$tenant_id === TENANT_WRONG) return { rows: [] };
      return { rows: [singleGoalRow] };
    };
    const ctx = createMockContext(TENANT_WRONG, queryFn);

    const { project_goal } = await import('../functions/project-goal');
    const result = await project_goal(
      { client_id: CLIENT_ID, goal_id: GOAL_ID },
      ctx
    );

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: suggest_sip_increase
// ---------------------------------------------------------------------------

describe('suggest_sip_increase', () => {
  test('(a) returns correct SIP suggestion for target probability', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [singleGoalRow] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { suggest_sip_increase } = await import('../functions/suggest-sip-increase');
    const result = await suggest_sip_increase(
      { client_id: CLIENT_ID, goal_id: GOAL_ID, target_probability: 0.9 },
      ctx
    );

    expect(result).not.toBeNull();
    expect(result!.recipe).toBe('suggestion');
    expect(result!.current_sip).toBe(50000);
    expect(result!.required_sip).toBeGreaterThanOrEqual(result!.current_sip);
    expect(result!.increase_amount).toBeGreaterThanOrEqual(0);
    expect(result!.new_probability).toBeGreaterThanOrEqual(0.85); // Should be near target
  });

  test('(b) returns null for non-existent goal', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { suggest_sip_increase } = await import('../functions/suggest-sip-increase');
    const result = await suggest_sip_increase(
      { client_id: CLIENT_ID, goal_id: 99999, target_probability: 0.9 },
      ctx
    );

    expect(result).toBeNull();
  });

  test('(c) returns null with wrong tenant_id', async () => {
    const queryFn: MockQueryFn = async (_sql, params) => {
      if (params?.$tenant_id === TENANT_WRONG) return { rows: [] };
      return { rows: [singleGoalRow] };
    };
    const ctx = createMockContext(TENANT_WRONG, queryFn);

    const { suggest_sip_increase } = await import('../functions/suggest-sip-increase');
    const result = await suggest_sip_increase(
      { client_id: CLIENT_ID, goal_id: GOAL_ID, target_probability: 0.9 },
      ctx
    );

    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tests: create_goal
// ---------------------------------------------------------------------------

describe('create_goal', () => {
  test('(a) creates goal and returns computed probability', async () => {
    const queryFn: MockQueryFn = async (sql, params) => {
      // Verify tenant_id is passed
      expect(params?.$tenant_id).toBe(TENANT_A);
      expect(params?.$client_id).toBe(CLIENT_ID);
      expect(params?.$type).toBe('retirement');
      return { rows: [{ id: 42 }] };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { create_goal } = await import('../functions/create-goal');
    const result = await create_goal(
      {
        client_id: CLIENT_ID,
        params: {
          name: 'Retirement Fund',
          type: 'retirement',
          target_amount: 50000000,
          target_date: '2050-01-01',
        },
      },
      ctx
    );

    expect(result.recipe).toBe('goal-dashboard');
    expect(result.goal_id).toBe(42);
    expect(result.name).toBe('Retirement Fund');
    expect(result.target_amount).toBe(50000000);
    expect(result.monthly_sip_needed).toBeGreaterThan(0);
    expect(result.probability).toBeGreaterThan(0);
    expect(result.probability).toBeLessThanOrEqual(1);
  });

  test('(a) uses correct default inflation by goal type', async () => {
    const insertedParams: Record<string, unknown>[] = [];
    const queryFn: MockQueryFn = async (_sql, params) => {
      insertedParams.push(params || {});
      return { rows: [{ id: 43 }] };
    };
    const ctx = createMockContext(TENANT_A, queryFn);

    const { create_goal } = await import('../functions/create-goal');

    // Education goal should use 10% inflation
    await create_goal(
      {
        client_id: CLIENT_ID,
        params: {
          name: 'IIT Fund',
          type: 'education',
          target_amount: 10000000,
          target_date: '2040-01-01',
        },
      },
      ctx
    );

    expect(insertedParams[0].$inflation_rate).toBe(10);
  });

  test('(b) handles DB returning no rows gracefully', async () => {
    const queryFn: MockQueryFn = async () => ({ rows: [] });
    const ctx = createMockContext(TENANT_A, queryFn);

    const { create_goal } = await import('../functions/create-goal');
    const result = await create_goal(
      {
        client_id: CLIENT_ID,
        params: {
          name: 'Test Goal',
          type: 'custom',
          target_amount: 1000000,
          target_date: '2030-01-01',
        },
      },
      ctx
    );

    expect(result.goal_id).toBe(0); // No ID returned
    expect(result.monthly_sip_needed).toBeGreaterThan(0);
  });

  test('(c) passes tenant_id from context to INSERT', async () => {
    let capturedTenantId: unknown;
    const queryFn: MockQueryFn = async (_sql, params) => {
      capturedTenantId = params?.$tenant_id;
      return { rows: [{ id: 44 }] };
    };
    const ctx = createMockContext(TENANT_WRONG, queryFn);

    const { create_goal } = await import('../functions/create-goal');
    await create_goal(
      {
        client_id: CLIENT_ID,
        params: {
          name: 'Test',
          type: 'custom',
          target_amount: 1000000,
          target_date: '2030-01-01',
        },
      },
      ctx
    );

    // Verify it uses the ctx.tenant_id, not some hardcoded value
    expect(capturedTenantId).toBe(TENANT_WRONG);
  });
});
