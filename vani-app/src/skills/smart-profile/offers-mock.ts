/**
 * Offers in mock mode — in memory, same rules as the server: a half-written
 * offer is storable; readiness is judged, not enforced, on save; only an
 * explicit confirm stamps confirmed_at. Spread into lib/mock-transport only —
 * these functions are REAL on the API, so they never enter lib/preview.ts.
 */
import type { Offer, OffersResult } from './useOffers';

const MIN = 12;
const OFFERS: Offer[] = [];

function problemsOf(offers: Offer[]): string[] {
  if (!offers.length) return ['No offers defined.'];
  const out: string[] = [];
  for (const o of offers) {
    const where = o.name || o.id;
    for (const f of ['name', 'one_line', 'who_for', 'problem', 'price_band', 'proof'] as const) {
      const v = o[f]; if (!v.trim()) out.push(`${where}: ${f} is empty`); else if (v.trim().length < MIN) out.push(`${where}: ${f} is too short to score against ("${v.trim()}")`);
    }
    for (const f of ['what_we_do', 'signals', 'disqualifiers'] as const) {
      if (!o[f].length) out.push(`${where}: ${f} is empty — fit scoring has nothing to match on`);
      else if (o[f].some((x) => x.trim().length < MIN)) out.push(`${where}: ${f} contains an entry too short to be useful`);
    }
  }
  return out;
}
const ready = (o: Offer) => problemsOf([o]).length === 0;
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);

export const OFFERS_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'research-skill.get_offers': (): OffersResult => {
    const offers = OFFERS.map((o) => ({ ...o, is_ready: ready(o) }));
    return { offers, problems: problemsOf(offers), ready: offers.length > 0 && problemsOf(offers).length === 0 };
  },
};

export const OFFERS_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'research-skill.save_offer': (p) => {
    const name = String(p.name ?? '').trim(); if (!name) throw new Error('An offer needs a name.');
    const key = String(p.offer_key ?? '').trim() || slug(name);
    const list = (v: unknown) => Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [];
    const i = OFFERS.findIndex((o) => o.id === key);
    const base: Offer = i >= 0 ? OFFERS[i] : { id: key, name, one_line: '', who_for: '', problem: '', what_we_do: [], signals: [], disqualifiers: [], price_band: '', proof: '', commitment: 'project', source: 'human', confirmed_at: new Date().toISOString(), is_ready: false };
    const next: Offer = { ...base, name, one_line: String(p.one_line ?? base.one_line), who_for: String(p.who_for ?? base.who_for), problem: String(p.problem ?? base.problem),
      what_we_do: p.what_we_do ? list(p.what_we_do) : base.what_we_do, signals: p.signals ? list(p.signals) : base.signals, disqualifiers: p.disqualifiers ? list(p.disqualifiers) : base.disqualifiers,
      price_band: String(p.price_band ?? base.price_band), proof: String(p.proof ?? base.proof), commitment: (p.commitment as Offer['commitment']) ?? base.commitment };
    if (i >= 0) OFFERS[i] = next; else OFFERS.push(next);
    return { offer_key: key, recipe: 'offer-card' };
  },
  'profile-skill.generate_offers': () => {
    const drafts: Offer[] = [
      { id: 'contract-audit', name: 'Contract audit', one_line: 'Two weeks, your top 50 contracts, a leakage number you can act on.', who_for: 'Heads of procurement at 200–800 bed hospitals', problem: 'Renewals missed and vendor penalties never claimed because contracts live in spreadsheets.',
        what_we_do: ['Read every contract and renewal date', 'Find penalties you are entitled to and have not claimed', 'One number: what leakage costs you a year'], signals: ['AMC visit logs in spreadsheets', 'tender notices mentioning annual maintenance contracts', 'a contracts officer being hired'],
        disqualifiers: ['fewer than 50 vendor contracts', 'procurement run by a parent trust'], price_band: 'Fixed fee, under a lakh', proof: 'Three hospitals found 3–5% of contract value in the first audit.', commitment: 'entry', source: 'agent', confirmed_at: null, is_ready: false },
      { id: 'ledgerline-platform', name: 'Ledgerline platform', one_line: 'Every contract, every renewal, every SLA — in one place.', who_for: 'Multi-site hospital groups with central procurement', problem: 'Nobody sees a renewal coming, and SLA penalties are never enforced.',
        what_we_do: ['Contract lifecycle from tender to renewal', 'SLA and AMC tracking with reminders', 'Vendor compliance evidence in one file'], signals: ['group procurement across sites', 'NABH renewal citing contract governance'], disqualifiers: ['single site under 200 beds'],
        price_band: 'Annual subscription per site', proof: '', commitment: 'project', source: 'agent', confirmed_at: null, is_ready: false },
    ];
    const drafted: { offer_key: string; name: string }[] = [];
    for (const d of drafts) if (!OFFERS.some((o) => o.id === d.id)) { OFFERS.push(d); drafted.push({ offer_key: d.id, name: d.name }); }
    return { drafted };
  },
  'profile-skill.confirm_offer': (p) => {
    const o = OFFERS.find((x) => x.id === String(p.offer_key)); if (!o) throw new Error('OFFER_NOT_FOUND');
    o.confirmed_at = new Date().toISOString(); return { success: true };
  },
};
