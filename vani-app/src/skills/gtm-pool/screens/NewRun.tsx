'use client';
/**
 * /agents/gtm/pool/enrich — set up an enrichment run (prototype
 * p2c-pool-enrich.html, tab 2): which companies, what the run does to each,
 * and the estimate — records against today's limit, tokens, how many companies
 * each model can take on today's quota, the time. "Start the run" rebuilds the
 * estimate from the quota left at that moment, on the server.
 */
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import s from '../pool.module.css';
import e from '../enrich.module.css';
import { fmt, runHref, useEnrichEstimate, useEnrichWrites, useWorkbench, type Slice } from '../useEnrich';
import { PoolGate, useIsPoolAdmin } from './PoolParts';

const SIZES = [100, 500];

export default function NewRun() {
  const isAdmin = useIsPoolAdmin();
  const sp = useSearchParams();
  const router = useRouter();
  const [slice, setSlice] = useState<Slice>({
    delivery: sp.get('delivery') || 'all',
    raw_or_identified: sp.get('raw_or_identified') !== '0',
    industry_missing: sp.get('industry_missing') === '1',
  });
  const [records, setRecords] = useState<number>(Number(sp.get('records')) || 100);
  const wb = useWorkbench(isAdmin);
  const est = useEnrichEstimate(slice, records, isAdmin);
  const { start } = useEnrichWrites();
  const deliveries = wb.data?.data?.deliveries ?? [];
  const matched = est.data?.data?.matched ?? 0;
  const sizes = useMemo(() => [...SIZES.filter((n) => n < matched), matched].filter((n, i, a) => n > 0 && a.indexOf(n) === i), [matched]);
  if (!isAdmin) return <PoolGate title="Enrich the pool" />;

  const toggle = (k: 'raw_or_identified' | 'industry_missing') => setSlice((x) => ({ ...x, [k]: !x[k] }));
  const go = async () => {
    const r = await start.mutate({ ...slice, records: Math.min(records, matched) });
    if (r) router.push(runHref(r.event_id));
  };

  return (
    <div className={s.wrap}>
      <div>
        <div className={u.eyebrow}>// GTM · SHARED DATA · ADMIN</div>
        <h1 className={u.h1}>New enrichment run</h1>
        <nav className={s.crumbs}><Link href="/agents/gtm/pool">← Common pool</Link></nav>
      </div>
      <div className={e.grid}>
        <div className={e.card}>
          <div className={e.eyebrow}>1 · Which companies</div>
          <div className={e.chips}>
            {deliveries.map((d) => (
              <button key={d.id} type="button" className={`${e.chip} ${slice.delivery === d.id ? e.chipOn : ''}`} aria-pressed={slice.delivery === d.id} onClick={() => setSlice((x) => ({ ...x, delivery: d.id }))}>{d.label}</button>
            ))}
            <button type="button" className={`${e.chip} ${slice.delivery === 'all' ? e.chipOn : ''}`} aria-pressed={slice.delivery === 'all'} onClick={() => setSlice((x) => ({ ...x, delivery: 'all' }))}>All deliveries</button>
          </div>
          <div className={e.chips}>
            <button type="button" className={`${e.chip} ${e.chipOn}`} disabled title="E5: v1 reads only companies that already have a website">Has a website</button>
            <button type="button" className={`${e.chip} ${slice.raw_or_identified ? e.chipOn : ''}`} aria-pressed={slice.raw_or_identified} onClick={() => toggle('raw_or_identified')}>Raw or Identified</button>
            <button type="button" className={`${e.chip} ${slice.industry_missing ? e.chipOn : ''}`} aria-pressed={slice.industry_missing} onClick={() => toggle('industry_missing')}>Industry missing</button>
          </div>
          <DataBoundary query={est} label="the slice" skeleton={<SkeletonRows rows={1} />} isEmpty={(d) => !d?.matched}
            empty="No company in this slice is waiting to be read — every one with a website has been read by a run that still stands. Pick another delivery or filter.">
            {(d) => (
              <p style={{ fontSize: 'var(--fs-lg)' }}><b>{fmt(d.matched)}</b> match. <b>This run: </b>
                <span className={`${e.chips} ${e.inline}`}>
                  {sizes.map((n) => (
                    <button key={n} type="button" className={`${e.chip} ${Math.min(records, d.matched) === n ? e.chipOn : ''}`} onClick={() => setRecords(n)}>{n === d.matched && n > 100 ? `All ${fmt(n)}` : fmt(n)}</button>
                  ))}
                </span>
              </p>
            )}
          </DataBoundary>
          <div className={e.eyebrow} style={{ marginTop: 6 }}>2 · What it does to each</div>
          <div className={e.tableWrap}><table className={e.table}>
            <thead><tr><th>Step</th><th>Who</th><th>Cost</th></tr></thead>
            <tbody>
              <tr><td>Check the website is live (and not a parked page)</td><td><span className={`${u.tag} ${u.tagOk}`}>code</span></td><td>free</td></tr>
              <tr><td>Read About, Contact and Products pages</td><td><span className={`${u.tag} ${u.tagOk}`}>code</span></td><td>free</td></tr>
              <tr><td>What it does, its industry, company or individual, B2B/B2C, size hints</td><td><span className={`${u.tag} ${u.tagDim}`}>route HIGH</span></td><td>~{fmt(est.data?.data?.estimate?.per_company.high)} tokens</td></tr>
              <tr><td>Company emails, phones, LinkedIn / X links</td><td><span className={`${u.tag} ${u.tagDim}`}>route LOW</span></td><td>~{fmt(est.data?.data?.estimate?.per_company.low)} tokens</td></tr>
            </tbody>
          </table></div>
          {est.data?.data?.estimate && <p className={e.muted} style={{ marginTop: 6 }}>{est.data.data.estimate.per_company.measured ? 'Tokens per company measured on earlier runs.' : 'Tokens per company are the planned ceiling until the first run measures them.'}</p>}
        </div>

        <div className={e.card}>
          <div className={e.eyebrow}>3 · Estimate</div>
          <DataBoundary query={est} label="the estimate" skeleton={<SkeletonRows rows={5} />} isEmpty={(d) => !d?.estimate}
            empty="Nothing to estimate — the slice is empty.">
            {(d) => {
              const x = d.estimate!;
              const over = x.records > x.limit.left;
              return (
                <>
                  <div className={e.row}><span>Records</span><span><b>{fmt(x.records)}</b> of today&apos;s {fmt(x.limit.left)}</span></div>
                  <div className={e.row}><span>Model tokens</span><span>≈ {fmt(x.tokens)} (not charged to any tenant)</span></div>
                  {x.providers.map((p) => (
                    <div key={p.code} className={e.row}><span>{p.code} · {p.model}</span><span>{p.text}</span></div>
                  ))}
                  {x.unplaced > 0 && <div className={`${e.row} ${e.warnRow}`}><span>No model left today</span><span>≈ {fmt(x.unplaced)} companies would wait — the run stops when the models run out</span></div>}
                  <div className={e.row}><span>Time</span><span>{x.minutes != null ? `≈ ${fmt(x.minutes)} minutes` : 'measured after the first run'}</span></div>
                  <div className={e.decision}>
                    <h3 className={e.h3}>What this run writes</h3>
                    <p>Facts read from each company&apos;s own site, as an <b>enrichment</b> source — ranked below what a delivery said, labelled with the page, model and confidence. The whole run can be withdrawn later; nothing is overwritten.</p>
                    {over && <p style={{ color: 'var(--bad)', marginTop: 8 }}>Only {fmt(x.limit.left)} of today&apos;s {fmt(x.limit.daily)} records are left. Pick a smaller run, or start tomorrow.</p>}
                    <div className={e.actions}>
                      <button type="button" className={`${e.btn} ${e.btnPrimary}`} disabled={start.isPending || over || !x.records} onClick={() => void go()}>{start.isPending ? 'Starting…' : 'Start the run'}</button>
                      <Link className={e.btn} href="/agents/gtm/pool">Cancel</Link>
                    </div>
                  </div>
                  <p className={e.note}>The free models&apos; limits are the bottleneck, not your record limit. The estimate is rebuilt from the real quota left when you press Start.</p>
                </>
              );
            }}
          </DataBoundary>
        </div>
      </div>
    </div>
  );
}
