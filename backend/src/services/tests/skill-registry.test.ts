/**
 * Tests for SkillRegistry — registration, handler lookup, execution
 */

import * as path from 'path';
import { SkillRegistry, buildRegistry } from '../skill-registry';
import type { SkillDefinition, SkillHandler, SkillContext } from '../types';

const SKILLS_ROOT = path.resolve(__dirname, '../../skills');

/** Minimal mock SkillContext for testing */
function mockCtx(): SkillContext {
  return {
    tenant_id: 'test-tenant-001',
    db: {
      query: async () => ({ rows: [] }),
      transaction: async <T>(fn: (tx: any) => Promise<T>) => fn({ query: async () => ({ rows: [] }), transaction: async () => { throw new Error('nested'); } }),
    },
  };
}

describe('SkillRegistry', () => {
  it('registers and retrieves a skill', () => {
    const registry = new SkillRegistry();
    const skill: SkillDefinition = {
      name: 'test-skill',
      version: '1.0.0',
      description: 'Test',
      tier: 'starter',
      default_recipe: 'test-recipe',
      functions: [],
    };
    registry.register(skill);
    expect(registry.getSkill('test-skill')).toBe(skill);
    expect(registry.skills.size).toBe(1);
  });

  it('registers and retrieves handlers', () => {
    const registry = new SkillRegistry();
    const handler: SkillHandler = async () => ({ ok: true });
    registry.registerHandler('test-skill', 'test_fn', handler);
    expect(registry.getHandler('test-skill', 'test_fn')).toBe(handler);
    expect(registry.getHandler('test-skill', 'missing_fn')).toBeUndefined();
  });

  it('executes a registered handler', async () => {
    const registry = new SkillRegistry();
    registry.register({
      name: 'math-skill',
      version: '1.0.0',
      description: 'Test math',
      tier: 'starter',
      default_recipe: 'result',
      functions: [{ name: 'add', description: 'Add two numbers', parameters: [], returns: 'sum' }],
    });
    registry.registerHandler('math-skill', 'add', async (params) => ({
      sum: (params.a as number) + (params.b as number),
      recipe: 'result',
    }));

    const result = await registry.execute('math-skill', 'add', { a: 2, b: 3 }, mockCtx());
    expect(result.success).toBe(true);
    expect(result.data.sum).toBe(5);
    expect(result.recipe).toBe('result');
  });

  it('returns error for missing handler', async () => {
    const registry = new SkillRegistry();
    const result = await registry.execute('missing', 'fn', {}, mockCtx());
    expect(result.success).toBe(false);
    expect(result.error).toContain('No handler');
  });

  it('catches handler errors gracefully', async () => {
    const registry = new SkillRegistry();
    registry.register({
      name: 'broken-skill',
      version: '1.0.0',
      description: 'Throws',
      tier: 'starter',
      default_recipe: '',
      functions: [{ name: 'crash', description: 'Crash', parameters: [], returns: '' }],
    });
    registry.registerHandler('broken-skill', 'crash', async () => {
      throw new Error('Intentional test error');
    });

    const result = await registry.execute('broken-skill', 'crash', {}, mockCtx());
    expect(result.success).toBe(false);
    expect(result.error).toBe('Intentional test error');
  });

  it('filters skills by tier (wildcard)', () => {
    const registry = new SkillRegistry();
    registry.register({
      name: 's1', version: '1.0.0', description: '', tier: 'starter', default_recipe: '', functions: [],
    });
    registry.register({
      name: 's2', version: '1.0.0', description: '', tier: 'professional', default_recipe: '', functions: [],
    });

    const all = registry.getSkillsForTier('enterprise', { skills: ['*'] });
    expect(all.length).toBe(2);
  });

  it('filters skills by tier (specific list)', () => {
    const registry = new SkillRegistry();
    registry.register({
      name: 's1', version: '1.0.0', description: '', tier: 'starter', default_recipe: '', functions: [],
    });
    registry.register({
      name: 's2', version: '1.0.0', description: '', tier: 'professional', default_recipe: '', functions: [],
    });

    const filtered = registry.getSkillsForTier('starter', { skills: ['s1'] });
    expect(filtered.length).toBe(1);
    expect(filtered[0].name).toBe('s1');
  });

  it('produces a summary', () => {
    const registry = new SkillRegistry();
    registry.register({
      name: 'demo', version: '1.0.0', description: '', tier: 'starter', default_recipe: '',
      functions: [{ name: 'fn1', description: '', parameters: [], returns: '' }],
    });
    registry.registerHandler('demo', 'fn1', async () => ({}));
    const summary = registry.summary();
    expect(summary.skills).toBe(1);
    expect(summary.handlers).toBe(1);
    expect(summary.details[0]).toContain('demo');
  });
});

describe('buildRegistry', () => {
  it('discovers and loads all KI-Prime skills', async () => {
    const registry = await buildRegistry(SKILLS_ROOT);
    expect(registry.skills.size).toBe(8);
  });

  it('imports function handlers from skills with functions/ dir', async () => {
    const registry = await buildRegistry(SKILLS_ROOT);
    // portfolio-skill has 4 function files
    expect(registry.getHandler('portfolio-skill', 'get_holdings')).toBeDefined();
    expect(registry.getHandler('portfolio-skill', 'get_allocation')).toBeDefined();
    expect(registry.getHandler('portfolio-skill', 'calc_xirr')).toBeDefined();
    expect(registry.getHandler('portfolio-skill', 'get_portfolio_summary')).toBeDefined();
  });

  it('imports client-skill handlers', async () => {
    const registry = await buildRegistry(SKILLS_ROOT);
    expect(registry.getHandler('client-skill', 'get_clients')).toBeDefined();
    expect(registry.getHandler('client-skill', 'get_client_profile')).toBeDefined();
    expect(registry.getHandler('client-skill', 'get_risk_profile')).toBeDefined();
  });

  it('imports market-skill handlers', async () => {
    const registry = await buildRegistry(SKILLS_ROOT);
    expect(registry.getHandler('market-skill', 'get_nav')).toBeDefined();
    expect(registry.getHandler('market-skill', 'search_schemes')).toBeDefined();
  });

  it('handles skills without functions/ dir gracefully', async () => {
    // alert-skill, comms-skill, report-skill may not have function files
    const registry = await buildRegistry(SKILLS_ROOT);
    // Should still have the skill registered even if no handlers
    expect(registry.getSkill('alert-skill')).toBeDefined();
    expect(registry.getSkill('comms-skill')).toBeDefined();
    expect(registry.getSkill('report-skill')).toBeDefined();
  });
});
