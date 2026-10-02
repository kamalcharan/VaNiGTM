'use client';
/**
 * Settings → Tokens (release 3; D-Q12, S18).
 *
 * This workspace's model budget: a daily and a monthly base that never rise,
 * then a top-up balance spent after them. Every model call this workspace's
 * work makes counts, whichever model served it. When base and top-up are
 * both spent, calls stop — and say so — until the day resets or a top-up is
 * added. Admin tenants add top-ups here, for any workspace.
 */
import { useState } from 'react';
import { DataBoundary, InlineLoader, SkeletonRows } from '@/platform/feedback';
import { formatDate, formatDateTime } from '@/lib/format';
import { useAuth } from '@/context/auth-provider';
import { IS_LIVE } from '@/lib/live-transport';
import u from '@/platform/shell/ui.module.css';
import f from './settings.module.css';
import s from './model-provider.module.css';
import sc from '@/skills/scoring/scoring.module.css';
import { useAddTopup, useTokens, useTopups, type Budget, type TopupRow } from '@/skills/tenant/useTenant';

const n = (v: number | null | undefined) => (typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('en-US') : '—');

export default function TokensSettings() {
  const { tenant } = useAuth();
  const isAdmin = !IS_LIVE || tenant?.is_admin === true;
  const q = useTokens();
  return (
    <div>
      <h2 className={f.h2}>Tokens</h2>
      <p className={u.lede}>
        Every model call your work makes counts here — reading sites, enriching, researching, drafting — whichever model answered it.
        The daily and monthly limits do not rise; a top-up is spent after them.
      </p>
      <DataBoundary query={q} label="your token budget" skeleton={<SkeletonRows rows={4} />}>
        {(d) => (
          <>
            <BudgetCard b={d.budget} />
            <section className={u.card} style={{ marginTop: 16 }}>
              <div className={u.cardHead}>Last 30 days<span className={u.cardMeta}>UTC days</span></div>
              <div className={s.body}>
                {d.days.length === 0 ? <p className={s.note}>Nothing spent yet. Usage appears here the first time an agent runs for this workspace — start with the Smart Profile.</p> : (
                  <table className={s.rows}><tbody>
                    {d.days.map((x) => <tr key={x.day}><th>{formatDate(x.day)}</th><td>{n(x.tokens)} tokens</td></tr>)}
                  </tbody></table>
                )}
              </div>
            </section>
            {d.ledger.length > 0 && (
              <section className={u.card} style={{ marginTop: 16 }}>
                <div className={u.cardHead}>Top-up ledger<span className={u.cardMeta}>+ added · − drawn after the base</span></div>
                <div className={s.body}>
                  <table className={s.rows}><tbody>
                    {d.ledger.map((l, i) => (
                      <tr key={i}><th>{formatDateTime(l.created_at)}</th>
                        <td>{l.tokens > 0 ? '+' : '−'}{n(Math.abs(l.tokens))} · {l.reason}{l.by_name ? ` — ${l.by_name}` : ''}{l.run_id ? ` · run ${l.run_id}` : ''}</td></tr>
                    ))}
                  </tbody></table>
                </div>
              </section>
            )}
          </>
        )}
      </DataBoundary>
      {isAdmin && <AdminTopups />}
    </div>
  );
}

function Meter({ label, used, limit, source }: { label: string; used: number; limit: number | null; source: string }) {
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  return (
    <div>
      <p className={s.note}><strong>{label}</strong> · {n(used)} of {n(limit)}{source === 'tenant' ? ' (your own limit)' : ''}</p>
      <div className={sc.stack}><i className={sc.s_strong} style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

function BudgetCard({ b }: { b: Budget }) {
  if (!b.capped) {
    return (
      <section className={u.card}><div className={u.cardHead}>Budget<span className={`${u.tag} ${u.tagDim}`}>Your own model</span></div>
        <div className={s.body}><p className={s.note}>This workspace runs on its own model key, so it is not capped — you pay your provider directly. Usage is still counted: {n(b.used_today)} tokens today, {n(b.used_this_month)} this month.</p></div>
      </section>
    );
  }
  const out = (b.remaining ?? 0) <= 0;
  return (
    <section className={u.card}>
      <div className={u.cardHead}>Budget<span className={`${u.tag} ${out ? u.tagBad : u.tagOk}`}>{out ? 'Spent — calls stop' : `${n(b.remaining)} left`}</span></div>
      <div className={s.body}>
        <Meter label="Today" used={b.used_today} limit={b.daily_limit} source={b.daily_source} />
        <Meter label="This month" used={b.used_this_month} limit={b.monthly_limit} source={b.monthly_source} />
        <p className={s.note}><strong>Top-up balance:</strong> {n(b.topup_balance)} tokens — spent only once today's or this month's limit is used.</p>
        {out && <p className={s.note}>Nothing is left today. Calls are refused before anything is sent, with the numbers. The day resets at 00:00 UTC (05:30 IST); an admin can add a top-up sooner.</p>}
      </div>
    </section>
  );
}

function AdminTopups() {
  const q = useTopups(true);
  const add = useAddTopup();
  const [tenantId, setTenantId] = useState('');
  const [amount, setAmount] = useState('500000');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  return (
    <section className={u.card} style={{ marginTop: 16 }}>
      <div className={u.cardHead}>Top-ups — every workspace<span className={`${u.tag} ${u.tagWarn}`}>Admin</span></div>
      <DataBoundary query={q} label="top-ups" skeleton={<SkeletonRows rows={3} />}>
        {(d) => (
          <div className={s.body}>
            <table className={s.rows}>
              <thead><tr><th>Workspace</th><td>Added</td><td>Drawn</td><td>Balance</td><td>Last top-up</td></tr></thead>
              <tbody>{d.tenants.map((t: TopupRow) => (
                <tr key={t.tenant_id}><th>{t.name}</th><td>{n(t.added)}</td><td>{n(t.drawn)}</td><td>{n(t.balance)}</td><td>{t.last_topup_at ? formatDate(t.last_topup_at) : '—'}</td></tr>
              ))}</tbody>
            </table>
            <div className={sc.weights}>
              <label className={sc.weight}>Workspace
                <select value={tenantId} onChange={(e) => { setTenantId(e.target.value); setConfirm(false); }}>
                  <option value="">Choose…</option>
                  {d.tenants.map((t: TopupRow) => <option key={t.tenant_id} value={t.tenant_id}>{t.name}</option>)}
                </select>
              </label>
              <label className={sc.weight}>Tokens<input type="number" min={1} step={1000} value={amount} onChange={(e) => { setAmount(e.target.value); setConfirm(false); }} /></label>
              <label className={sc.weight}>Reason<input type="text" maxLength={200} value={reason} placeholder="e.g. pilot, October" onChange={(e) => setReason(e.target.value)} /></label>
            </div>
            {!confirm ? (
              <div className={s.actions}>
                <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={!tenantId || !(Number(amount) >= 1)} onClick={() => setConfirm(true)}>Add top-up</button>
              </div>
            ) : (
              <div className={s.actions}>
                <span className={s.note}>Add <strong>{n(Number(amount))}</strong> tokens to <strong>{d.tenants.find((t: TopupRow) => t.tenant_id === tenantId)?.name}</strong>? It lets that workspace spend Vikuna's model budget beyond its limits, and it is kept in the ledger.</span>
                <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={add.isPending}
                  onClick={async () => { const r = await add.mutate({ tenant_id: tenantId, tokens: Number(amount), reason }); if (r) { setConfirm(false); setReason(''); } }}>
                  {add.isPending ? <InlineLoader size="sm" message="Adding…" /> : 'Yes, add it'}
                </button>
                <button type="button" className={s.btn} onClick={() => setConfirm(false)}>Cancel</button>
              </div>
            )}
          </div>
        )}
      </DataBoundary>
    </section>
  );
}
