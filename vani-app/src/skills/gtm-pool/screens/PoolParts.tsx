'use client';
/**
 * The common pool's P1-B surfaces (prototype documents/prototypes/p1-sources.html):
 * the admin gate, the crumbs between the three pool pages, the pool's state
 * strip and sources table, and the deliveries with their rows counted by state.
 */
import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-provider';
import { IS_LIVE } from '@/lib/live-transport';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { formatDate } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import s from '../pool.module.css';
import { useDeliveries, usePoolWrites, useSources, type Delivery } from '../usePool';

export function useIsPoolAdmin() {
  const { tenant } = useAuth();
  return !IS_LIVE || tenant?.is_admin === true;
}

export function PoolGate({ title }: { title: string }) {
  return (
    <div>
      <div className={u.eyebrow}>// GTM · SHARED DATA</div>
      <h1 className={u.h1}>{title}</h1>
      <div className={s.gate}>
        <span className={u.cardMeta}>ADMIN TENANTS ONLY</span>
        <div className={s.gateH}>This is not yours to see — and that is by design</div>
        <p className={s.gateP}>The common pool holds directory data shared across every tenant, fed by Vikuna. You draw on it through the hot list in <Link href="/agents/gtm/audience">Build the audience</Link>; your own records are under <Link href="/agents/gtm/companies">Companies</Link>.</p>
      </div>
    </div>
  );
}

export function PoolCrumbs({ on }: { on: 'pool' | 'delivery' | 'industries' }) {
  return (
    <nav className={s.crumbs} aria-label="Common pool">
      {on === 'pool' ? <span className={s.crumbOn}>Sources & deliveries</span> : <Link href="/agents/gtm/pool">Sources & deliveries</Link>}
      <span className={s.muted}>·</span>
      {on === 'industries' ? <span className={s.crumbOn}>Industry master</span> : <Link href="/agents/gtm/pool/industries">Industry master</Link>}
    </nav>
  );
}

export function PoolStates() {
  const q = useSources();
  const { resolve } = usePoolWrites();
  return (
    <section className={s.section}>
      <header className={s.secHead}>
        <div><h2 className={s.secTitle}>The pool, by state</h2>
          <p className={s.secWhat}>A company reaches the core pool only when it passes all eight Complete checks; everything else is staging, visible here with its reason. Junk is a state, never a deletion; duplicates are flagged, never merged.</p></div>
        <button type="button" className={s.quiet} disabled={resolve.isPending} onClick={() => void resolve.mutate({})}>{resolve.isPending ? 'Queuing…' : 'Match unmatched rows now'}</button>
      </header>
      <div className={s.secBody}>
        <DataBoundary query={q} label="pool" skeleton={<SkeletonRows rows={1} lines={2} />}>
          {(d) => (
            <>
              <div className={s.stats}>
                <div className={`${s.stat} ${s.statOk}`}><div className={s.statK}>In the pool</div><div className={s.statV}>{d.pool.complete.toLocaleString()}</div></div>
                <div className={s.stat}><div className={s.statK}>Waiting for Complete</div><div className={s.statV}>{(d.pool.candidate + d.pool.enriching).toLocaleString()}</div></div>
                <div className={`${s.stat} ${d.pool.held ? s.statWarn : ''}`}><div className={s.statK}>Held — needs a person</div><div className={s.statV}>{d.pool.held.toLocaleString()}</div></div>
                <div className={s.stat}><div className={s.statK}>Junk</div><div className={s.statV}>{d.pool.junk.toLocaleString()}</div></div>
              </div>
              {d.pool.complete === 0 && (d.pool.candidate + d.pool.held) > 0 && (
                <p className={s.note} style={{ marginTop: 10 }}>Nothing has passed Complete yet, and that is expected: most companies wait on an <b>industry</b> mapped to the master and a <b>company-or-individual</b> decision, which enrichment (P2–P3) supplies. Open a delivery to see each company's checks, or decide the held ones now.</p>
              )}
            </>
          )}
        </DataBoundary>
      </div>
    </section>
  );
}

export function PoolSources() {
  const q = useSources();
  return (
    <section className={s.section}>
      <header className={s.secHead}><div><h2 className={s.secTitle}>Sources</h2>
        <p className={s.secWhat}>Licence and "may enter pool" decide where a source's rows may land: a source that may not feed the pool lands in Vikuna's own copy only. Tier decides which source wins a field when two disagree.</p></div></header>
      <div className={s.secBody}>
        <DataBoundary query={q} label="sources" skeleton={<SkeletonRows rows={4} />} isEmpty={(d) => !d?.sources?.length}
          empty="No data sources are registered — migration 264 seeds them. Run the migrations on the VPS (deploy.txt, step 2).">
          {(d) => (
            <div className={s.tableWrap}>
              <table className={s.table}>
                <thead><tr><th>Source</th><th>Kind</th><th>Licence</th><th>May enter pool</th><th>Tier</th><th>Deliveries</th><th>Rows staged</th><th>In pool</th></tr></thead>
                <tbody>
                  {d.sources.map((x) => (
                    <tr key={x.id}>
                      <td><div className={s.name}>{x.name}</div><span className={s.mono}>{x.code}</span></td>
                      <td className={s.muted}>{x.kind}</td>
                      <td className={s.mono}>{x.licence_class ?? '—'}</td>
                      <td>{x.may_enter_pool ? <span className={`${u.tag} ${u.tagOk}`}>yes</span> : <span className={`${u.tag} ${u.tagDim}`}>no</span>}</td>
                      <td className={s.mono}>{x.tier}</td>
                      <td className={s.mono}>{x.deliveries}{x.retired_deliveries ? <span className={s.muted}> (+{x.retired_deliveries} retired)</span> : ''}</td>
                      <td className={s.mono}>{x.rows_staged.toLocaleString()}</td>
                      <td className={s.mono}>{x.in_pool.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DataBoundary>
      </div>
    </section>
  );
}

function DeliveryCard({ l }: { l: Delivery }) {
  const { retire } = usePoolWrites();
  const [confirming, setConfirming] = useState(false);
  const chip = (n: number, label: string, cls: string) => n > 0 ? <span className={`${u.tag} ${cls}`}>{label} {n.toLocaleString()}</span> : null;
  return (
    <div className={s.load}>
      <div>
        <div className={s.loadName}>{l.label}</div>
        <div className={s.loadMeta}><span>{l.source_name}</span>{l.region && <span>· {l.region}</span>}<span>· {l.as_of ? `as of ${formatDate(l.as_of)}` : 'undated'}</span><span>· loaded {formatDate(l.loaded_at)}</span>{l.status !== 'active' && <span className={`${u.tag} ${u.tagBad}`}>{l.status}</span>}</div>
        <div className={s.progress} style={{ marginTop: 6 }}>{l.staged.toLocaleString()} staged · {l.source_rows.toLocaleString()} source rows{l.unmatched ? ` · ${l.unmatched.toLocaleString()} not yet matched` : ''}</div>
        {confirming && (
          <div className={s.confirm}>
            Retiring keeps every row but stops this delivery counting: each company it fed is re-derived from its other sources and re-tested, and any that relied on it alone leave the pool. It can only be undone on the API.
            <div className={s.decisionRow} style={{ marginTop: 8 }}>
              <button type="button" className={`${s.btn} ${s.btnBad}`} disabled={retire.isPending} onClick={async () => { await retire.mutate({ load_id: l.id }); setConfirming(false); }}>{retire.isPending ? 'Retiring…' : 'Retire this delivery'}</button>
              <button type="button" className={s.btn} disabled={retire.isPending} onClick={() => setConfirming(false)}>Keep it</button>
            </div>
          </div>
        )}
      </div>
      <div className={s.states}>
        {chip(l.waiting, 'Waiting', u.tagDim)}{chip(l.held, 'Held', u.tagWarn)}{chip(l.duplicates, 'Duplicate', u.tagWarn)}
        {chip(l.junk, 'Junk', u.tagBad)}{chip(l.complete, 'In pool', u.tagOk)}
      </div>
      <div className={s.loadTags}>
        <Link className={s.quiet} href={`/agents/gtm/pool/deliveries/${l.id}`}>Open rows →</Link>
        {l.status === 'active' && l.load_kind === 'delivery' && !confirming && <button type="button" className={s.link} onClick={() => setConfirming(true)}>Retire…</button>}
      </div>
    </div>
  );
}

export function PoolDeliveries() {
  const q = useDeliveries();
  return (
    <DataBoundary query={q} label="deliveries" skeleton={<SkeletonRows rows={2} lines={2} />} isEmpty={(d) => !d?.deliveries?.length}
      empty="The pool has had no deliveries yet. Add one above — a directory imported as a common-pool dataset — and its rows are matched into companies here.">
      {(d) => <div className={s.loads}>{d.deliveries.map((l) => <DeliveryCard key={l.id} l={l} />)}</div>}
    </DataBoundary>
  );
}
