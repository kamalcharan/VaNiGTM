/**
 * Tests for SKILL.md parser (skill-loader)
 */

import * as path from 'path';
import { parseSkillMd, discoverSkillDirs, loadAllSkills } from '../skill-loader';

const SKILLS_ROOT = path.resolve(__dirname, '../../skills');

describe('parseSkillMd', () => {
  it('parses portfolio-skill SKILL.md frontmatter', () => {
    const skill = parseSkillMd(path.join(SKILLS_ROOT, 'portfolio-skill/SKILL.md'));
    expect(skill.name).toBe('portfolio-skill');
    expect(skill.version).toBe('1.0.0');
    expect(skill.tier).toBe('starter');
    expect(skill.default_recipe).toBe('portfolio-view');
  });

  it('parses portfolio-skill functions', () => {
    const skill = parseSkillMd(path.join(SKILLS_ROOT, 'portfolio-skill/SKILL.md'));
    const fnNames = skill.functions.map((f) => f.name);
    expect(fnNames).toContain('get_holdings');
    expect(fnNames).toContain('get_allocation');
    expect(fnNames).toContain('calc_xirr');
    expect(fnNames).toContain('get_portfolio_summary');
  });

  it('parses function parameters correctly', () => {
    const skill = parseSkillMd(path.join(SKILLS_ROOT, 'portfolio-skill/SKILL.md'));
    const getHoldings = skill.functions.find((f) => f.name === 'get_holdings');
    expect(getHoldings).toBeDefined();
    expect(getHoldings!.parameters.length).toBeGreaterThan(0);
    expect(getHoldings!.parameters[0].name).toBe('client_id');
    expect(getHoldings!.parameters[0].required).toBe(true);
    expect(getHoldings!.parameters[0].type).toBe('number');
  });

  it('parses optional parameters', () => {
    const skill = parseSkillMd(path.join(SKILLS_ROOT, 'portfolio-skill/SKILL.md'));
    const calcXirr = skill.functions.find((f) => f.name === 'calc_xirr');
    expect(calcXirr).toBeDefined();
    const schemeCode = calcXirr!.parameters.find((p) => p.name === 'scheme_code');
    expect(schemeCode).toBeDefined();
    expect(schemeCode!.required).toBe(false);
  });

  it('extracts default_recipe from returns', () => {
    const skill = parseSkillMd(path.join(SKILLS_ROOT, 'portfolio-skill/SKILL.md'));
    const getHoldings = skill.functions.find((f) => f.name === 'get_holdings');
    expect(getHoldings!.default_recipe).toBe('portfolio-view');
  });

  it('parses client-skill with complex parameter types', () => {
    const skill = parseSkillMd(path.join(SKILLS_ROOT, 'client-skill/SKILL.md'));
    expect(skill.name).toBe('client-skill');
    expect(skill.tier).toBe('starter');
    const getClients = skill.functions.find((f) => f.name === 'get_clients');
    expect(getClients).toBeDefined();
    // The filters param is optional, object type
    const filters = getClients!.parameters.find((p) => p.name === 'filters');
    expect(filters).toBeDefined();
    expect(filters!.required).toBe(false);
    expect(filters!.type).toBe('object');
  });

  it('parses professional-tier skills', () => {
    const skill = parseSkillMd(path.join(SKILLS_ROOT, 'planning-skill/SKILL.md'));
    expect(skill.tier).toBe('professional');
    expect(skill.functions.length).toBeGreaterThanOrEqual(4);
  });

  it('handles functions with no parameters', () => {
    const skill = parseSkillMd(path.join(SKILLS_ROOT, 'alert-skill/SKILL.md'));
    const briefing = skill.functions.find((f) => f.name === 'generate_daily_briefing');
    expect(briefing).toBeDefined();
    expect(briefing!.parameters.length).toBe(0);
  });
});

describe('discoverSkillDirs', () => {
  it('finds all skill directories', () => {
    const dirs = discoverSkillDirs(SKILLS_ROOT);
    expect(dirs.length).toBe(8);
    const names = dirs.map((d) => path.basename(d));
    expect(names).toContain('portfolio-skill');
    expect(names).toContain('client-skill');
    expect(names).toContain('market-skill');
    expect(names).toContain('planning-skill');
    expect(names).toContain('alert-skill');
    expect(names).toContain('comms-skill');
    expect(names).toContain('import-skill');
    expect(names).toContain('report-skill');
  });

  it('returns empty array for non-existent directory', () => {
    const dirs = discoverSkillDirs('/tmp/nonexistent');
    expect(dirs).toEqual([]);
  });
});

describe('loadAllSkills', () => {
  it('loads all 8 KI-Prime skills', () => {
    const skills = loadAllSkills(SKILLS_ROOT);
    expect(skills.length).toBe(8);
  });

  it('every skill has at least one function', () => {
    const skills = loadAllSkills(SKILLS_ROOT);
    for (const skill of skills) {
      expect(skill.functions.length).toBeGreaterThan(0);
    }
  });

  it('all skills have valid tier values', () => {
    const skills = loadAllSkills(SKILLS_ROOT);
    const validTiers = ['starter', 'professional', 'enterprise'];
    for (const skill of skills) {
      expect(validTiers).toContain(skill.tier);
    }
  });
});
