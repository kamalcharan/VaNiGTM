/**
 * Risk classes (AGENTS.md §6a): declared in SKILL.md, enforced by the
 * executor before any handler runs.
 */
import path from 'path';
import { loadAllSkills } from '../skill-loader';
import { SkillRegistry, riskRefusal } from '../skill-registry';

const skills = loadAllSkills(path.join(__dirname, '../../skills'));

// Functions not yet classified. The number may only go DOWN: a new function
// arrives with its class, and classifying an old one lowers this.
const UNCLASSIFIED_CEILING = 134;

describe('risk classes', () => {
  it('the loader reads "- Risk: Rn" from a function block', () => {
    const pool = skills.find((s) => s.name === 'pool-skill')!;
    const risk = Object.fromEntries(pool.functions.map((f) => [f.name, f.risk]));
    expect(risk).toEqual({
      sources: 'R0', deliveries: 'R0', delivery_rows: 'R0', company: 'R0', industries: 'R0',
      decide: 'R2', retire_delivery: 'R2', resolve: 'R2',
    });
  });

  it('the class is the ceiling: R2 admin only, R3/R4 need an approval that does not exist yet, R5 never', () => {
    expect(riskRefusal(undefined, {})).toBeNull();
    expect(riskRefusal('R0', {})).toBeNull();
    expect(riskRefusal('R1', {})).toBeNull();
    expect(riskRefusal('R2', { is_admin: true })).toBeNull();
    expect(riskRefusal('R2', { is_admin: false })).toMatch(/^RISK_R2_ADMIN_ONLY/);
    expect(riskRefusal('R3', { is_admin: true })).toMatch(/^RISK_R3_NEEDS_APPROVAL: this action spends money/);
    expect(riskRefusal('R4', { is_admin: true })).toMatch(/^RISK_R4_NEEDS_APPROVAL: this action reaches a person/);
    expect(riskRefusal('R5', { is_admin: true })).toMatch(/^RISK_R5_FORBIDDEN/);
  });

  it('the executor refuses BEFORE the handler runs', async () => {
    const reg = new SkillRegistry();
    let ran = false;
    reg.register({ name: 't', version: '1', description: '', tier: 'starter', default_recipe: '',
      functions: [{ name: 'write_shared', description: '', parameters: [], returns: '', risk: 'R2' }] } as any);
    reg.registerHandler('t', 'write_shared', async () => { ran = true; return {}; });
    const out = await reg.execute('t', 'write_shared', {}, { is_admin: false } as any);
    expect(out).toMatchObject({ success: false });
    expect(out.error).toMatch(/RISK_R2_ADMIN_ONLY/);
    expect(ran).toBe(false);
    expect((await reg.execute('t', 'write_shared', {}, { is_admin: true } as any)).success).toBe(true);
    expect(ran).toBe(true);
  });

  it('the unclassified list does not grow', () => {
    const unclassified = skills.flatMap((s) => s.functions.filter((f) => !f.risk).map((f) => `${s.name}.${f.name}`));
    expect(unclassified.length).toBeLessThanOrEqual(UNCLASSIFIED_CEILING);
  });
});
