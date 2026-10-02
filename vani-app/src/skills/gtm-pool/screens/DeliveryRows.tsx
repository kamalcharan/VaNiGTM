'use client';
/**
 * /agents/gtm/pool/deliveries/[id] — one delivery's companies by state, each
 * with how far it is through the Complete test (prototype screen 2). A row
 * opens the company: its checks, the decision it needs, its sources.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import s from '../pool.module.css';
import { useDeliveries, useDeliveryRows, type RowState } from '../usePool';
import { CompanyPanel } from './CompanyPanel';
import { PoolCrumbs, PoolGate, useIsPoolAdmin } from './PoolParts';

const PAGE = 50;
const STATE_TAG: Record<string, string> = { complete: u.tagOk, candidate: u.tagDim, enriching: u.tagDim, held: u.tagWarn, junk: u.tagBad };
const STATE_LABEL: Record<string, string> = { complete: 'in pool', candidate: 'waiting', enriching: 'enriching', held: 'held', junk: 'junk' };

export default function DeliveryRows({ loadId }: { loadId: string }) {
  const isAdmin = useIsPoolAdmin();
  const [state, setState] = useState<RowState>('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => { setPage(1); }, [state]);
  const all = useDeliveries(isAdmin);
  const q = useDeliveryRows(loadId, state, page, PAGE);
  if (!isAdmin) return <PoolGate title="A delivery's rows" />;

  const l = all.data?.data?.deliveries?.find((x) => x.id === loadId);
  const tabs: Array<[RowState, string, number | undefined]> = [
    ['all', 'All', l ? l.waiting + l.held + l.junk + l.complete : undefined], ['waiting', 'Waiting for Complete', l?.waiting],
    ['held', 'Held', l?.held], ['duplicate', 'Possible duplicate', l?.duplicates], ['junk', 'Junk', l?.junk],
    ['complete', 'In pool', l?.complete], ['unmatched', 'Not yet matched', l?.unmatched],
  ];
  const total = q.data?.data?.total ?? 0;
  const last = Math.max(1, Math.ceil(total / PAGE));

  return (
    <div className={s.wrap}>
      <div>
        <div className={u.eyebrow}>// GTM · SHARED DATA · ADMIN</div>
        <h1 className={u.h1}>{l?.label ?? `Delivery #${loadId}`}</h1>
        <PoolCrumbs on="delivery" />
      </div>
      <section className={s.section}>
        <div className={s.secBody}>
          <div className={s.tabs} role="tablist">
            {tabs.map(([key, label, n]) => (
              <button key={key} type="button" role="tab" aria-selected={state === key} className={`${s.tab} ${state === key ? s.tabOn : ''}`} onClick={() => setState(key)}>
                {label}{n !== undefined && <span className={s.tabN}>{n.toLocaleString()}</span>}
              </button>
            ))}
          </div>
          <DataBoundary query={q} label="rows" skeleton={<SkeletonRows rows={6} lines={2} />} isEmpty={(d) => !d?.rows?.length}
            empty={state === 'unmatched' ? 'Every row of this delivery is matched to a company.'
              : state === 'all' ? 'No company has been made from this delivery yet. Go back to the pool and press "Match unmatched rows now".'
              : 'No company of this delivery is in that state.'}>
            {(d) => (
              <>
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead><tr><th>Company</th><th>Location</th><th>As delivered</th><th>{d.state === 'unmatched' ? '' : 'Complete'}</th><th>{d.state === 'unmatched' ? '' : 'State'}</th></tr></thead>
                    <tbody>
                      {d.rows.map((r) => (
                        <tr key={r.source_row_id} onClick={() => r.company_id && setOpen(r.company_id)} style={{ cursor: r.company_id ? 'pointer' : 'default' }}>
                          <td><div className={s.name}>{r.name}</div>{r.domain_normalized && <span className={s.mono}>{r.domain_normalized}</span>}</td>
                          <td className={s.muted}>{[r.city, r.state_code, r.pin].filter(Boolean).join(', ') || '—'}</td>
                          <td className={s.muted}>{r.industry_raw ? `“${r.industry_raw}”` : '—'}</td>
                          <td>{r.passed != null && (
                            <>
                              <span className={s.progress}>{r.passed} of {r.total_checks}</span>
                              <div className={s.open}>{(r.open ?? []).map((k) => <span key={k.key} className={`${u.tag} ${k.status === 'pending' ? u.tagDim : u.tagWarn}`}>{k.label}</span>)}</div>
                            </>
                          )}</td>
                          <td>{r.lifecycle_state && <span className={`${u.tag} ${STATE_TAG[r.lifecycle_state] ?? u.tagDim}`}>{STATE_LABEL[r.lifecycle_state] ?? r.lifecycle_state}</span>}
                            {r.needs_review && r.duplicate_of_id && <span className={`${u.tag} ${u.tagWarn}`} style={{ marginLeft: 4 }}>duplicate?</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {last > 1 && (
                  <div className={s.pager}>
                    <button type="button" className={s.link} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Previous</button>
                    <span>Page {page} of {last} · {total.toLocaleString()} rows</span>
                    <button type="button" className={s.link} disabled={page >= last} onClick={() => setPage((p) => p + 1)}>Next →</button>
                  </div>
                )}
              </>
            )}
          </DataBoundary>
        </div>
      </section>
      <p className={s.muted} style={{ fontSize: 'var(--fs-sm)' }}><Link href="/agents/gtm/pool">← Back to sources & deliveries</Link></p>
      {open && <CompanyPanel companyId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
