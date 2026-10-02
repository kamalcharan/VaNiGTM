/**
 * The readiness score, pure: the weights and levels agreed on 2026-10-02
 * (D-Q4, D-Q5), the two gates (Complete for Qualified, Exit for Campaign-ready),
 * and a tenant's own part weights changing the score but never the levels.
 */
import { checkLevelBounds, checkPartWeights, computeScore, type ScoreProfile } from '../score';

const V1: ScoreProfile = {
  scope: 'platform', version: 1, platformVersion: 1,
  partWeights: { identity: 20, firmographics: 20, digital: 10, contact: 20, people: 15, research: 10, signals: 5 },
  itemWeights: {
    identity: { name: 4, anchor: 8, location: 4, type: 4 },
    firmographics: { industry: 10, size: 4, description: 4, founded: 2 },
    digital: { domain: 4, site_verified: 3, social: 3 },
    contact: { email: 8, phone: 6, address: 6 },
    people: { named: 8, titled: 7 }, research: { brief: 10 }, signals: { signal: 5 },
  },
  levelBounds: { identified: 20, qualified: 40, reachable: 60, campaign_ready: 75, strong: 90 },
};

// The prototype's Kavya Lab, after enrichment: 18 + 16 + 8 + 14 = 56 on the pool side.
const kavya = {
  name: 'Kavya Lab Instruments Pvt Ltd', pin: '500055', city: 'Hyderabad', state_code: 'TG', is_individual: false,
  industry_id: 7, employees_band: '11-50', description: 'Makes HPLC columns and lab consumables for QC labs across India.',
  domain_normalized: 'kavyalab.example', domain_status: 'found', linkedin_url: 'https://linkedin.com/company/kavya',
  role_emails: ['sales@kavyalab.example'], phone: '+91 40 1234 5678', address_line: 'Plot 4, IDA', complete: true,
};

describe('computeScore', () => {
  it('a bare name scores Raw, and says nothing it cannot evidence', () => {
    const r = computeScore({ name: 'Sri Lakshmi Traders' }, V1);
    expect(r.score).toBe(4);
    expect(r.level).toBe('raw');
    expect(r.parts.find((p) => p.key === 'identity')!.items.find((i) => i.key === 'anchor')!.evidence).toBe('');
  });

  it('scores each part from its items, with the evidence that earned them', () => {
    const r = computeScore(kavya, V1, { pool: true });
    const part = (k: string) => r.parts.find((p) => p.key === k)!;
    expect(part('identity').earned).toBe(20);        // name + domain anchor + location + company
    expect(part('firmographics').earned).toBe(18);   // no year founded
    expect(part('digital').earned).toBe(10);
    expect(part('contact').earned).toBe(20);
    expect(part('people').measured).toBe(false);     // tenant-side on a pool company
    expect(r.score).toBe(68);
    expect(r.level).toBe('reachable');
    expect(part('identity').items.find((i) => i.key === 'anchor')!.evidence).toBe('domain kavyalab.example');
  });

  it('Qualified and above need the Complete test passed', () => {
    const r = computeScore({ ...kavya, complete: false }, V1, { pool: true });
    expect(r.score).toBe(68);
    expect(r.level).toBe('identified');
    expect(r.level_reason).toMatch(/Complete test/);
  });

  it('Campaign-ready needs the Exit gate — nothing can pass it before P7, and the level says so', () => {
    const tenantSide = { ...kavya, year_founded: 2004, people_named: 2, people_titled: 2, researched: true };
    const r = computeScore(tenantSide, V1);
    expect(r.score).toBe(95);
    expect(r.level).toBe('reachable');
    expect(r.level_reason).toMatch(/Exit gate/);
    expect(computeScore({ ...tenantSide, exit_gate: true }, V1).level).toBe('strong');
  });

  it("a tenant's own part weights change the score, never the levels", () => {
    const own: ScoreProfile = { ...V1, scope: 'tenant', version: 3,
      partWeights: { identity: 10, firmographics: 10, digital: 30, contact: 30, people: 10, research: 10, signals: 0 } };
    const r = computeScore(kavya, own, { pool: true });
    expect(r.score).toBe(79);                         // 10 + 9 + 30 + 30
    expect(r.profile).toEqual({ scope: 'tenant', version: 3, platform_version: 1 });
    expect(r.level).toBe('reachable');                // ≥ 75, but no Exit gate
  });
});

describe('profile validation', () => {
  it('part weights: all seven, whole numbers, adding up to 100', () => {
    expect(checkPartWeights(V1.partWeights)).toEqual([]);
    expect(checkPartWeights({ ...V1.partWeights, signals: 10 })).toEqual(['the parts add up to 105; they must add up to 100']);
    expect(checkPartWeights({ ...V1.partWeights, extra: 0 })).toEqual(['unknown parts: extra']);
    expect(checkPartWeights({ ...V1.partWeights, people: 7.5 })[0]).toMatch(/whole number/);
  });

  it('level boundaries: increasing, within 1–100', () => {
    expect(checkLevelBounds(V1.levelBounds)).toEqual([]);
    expect(checkLevelBounds({ ...V1.levelBounds, reachable: 30 })).toEqual(['reachable must start above qualified']);
  });
});
