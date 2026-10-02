/** Mock-mode answers for the tenant skill (no .env.local). */
import type { TokensView, TopupRow } from './useTenant';

let balance = 1_475_700;
const tenants: TopupRow[] = [
  { tenant_id: '00000000-0000-4000-8000-000000000001', name: 'Vikuna Technologies', slug: 'vikuna', added: 1_500_000, drawn: 24_300, balance: 1_475_700, last_topup_at: '2026-10-02T09:00:00.000Z' },
  { tenant_id: '00000000-0000-4000-8000-000000000002', name: 'Analytica Labs', slug: 'analytica', added: 500_000, drawn: 500_000, balance: 0, last_topup_at: '2026-09-15T09:00:00.000Z' },
];
const tokens = (): TokensView => ({
  budget: { capped: true, daily_limit: 100_000, used_today: 100_000, monthly_limit: 2_000_000, used_this_month: 1_224_300, topup_balance: balance, remaining: balance, daily_source: 'platform', monthly_source: 'platform' },
  days: [{ day: '2026-10-02', tokens: 124_300 }, { day: '2026-10-01', tokens: 88_100 }, { day: '2026-09-30', tokens: 64_900 }],
  ledger: [
    { tokens: -24_300, reason: "drawn: the day's or month's base was used", created_at: '2026-10-02T14:00:00.000Z', run_id: '412', by_name: null },
    { tokens: 1_500_000, reason: 'top-up: pilot', created_at: '2026-10-02T09:00:00.000Z', run_id: null, by_name: 'Charan' },
  ],
});

export const TENANT_MOCK_READS: Record<string, (p: Record<string, unknown>) => unknown> = {
  'tenant.tokens': () => tokens(),
  'tenant.topups': () => ({ tenants }),
};
export const TENANT_MOCK_WRITES: Record<string, (p: Record<string, unknown>) => unknown> = {
  'tenant.add_topup': (p) => {
    const n = Number(p.tokens);
    if (!Number.isInteger(n) || n < 1) throw new Error('A top-up must be a whole number of tokens, at least 1.');
    const t = tenants.find((x) => x.tenant_id === p.tenant_id);
    if (!t) throw new Error('No such tenant.');
    t.added += n; t.balance += n; t.last_topup_at = new Date().toISOString();
    if (t.slug === 'vikuna') balance = t.balance;
    return { tenant_id: t.tenant_id, balance: t.balance };
  },
};
