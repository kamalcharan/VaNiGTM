'use client';
/**
 * The enrichment workbench — prototype p2c-pool-enrich.html, tab 1, at the top
 * of the common pool page. VaNi proposes the slice worth reading next; the
 * admin decides. Then the pool by level, Qualified or better, websites, today's
 * record limit, what is missing and what fills it, the deliveries, the runs.
 */
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { formatDate } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import e from '../enrich.module.css';
import { fmt, runHref, sliceHref, useWorkbench, type RunSummary, type Workbench as Wb } from '../useEnrich';
import { LevelLegend, LevelStack } from './EnrichParts';

const RUN_TAG: Record<RunSummary['status'], [string, string]> = {
  queued: ['queued', u.tagDim], running: ['running', u.tagWarn], finished: ['finished', u.tagOk],
  stopped: ['stopped', u.tagWarn], failed: ['failed', u.tagBad], withdrawn: ['withdrawn', u.tagDim],
};

function Suggestion({ d }: { d: Wb }) {
  const s = d.suggestion;
  if (!s) {
    return (
      <div className={e.agent}><div className={e.av}>V</div><div>
        <h3 className={e.h3}>VaNi: &quot;Every company with a website has been read, or no delivery has one yet. Add a delivery below — companies without a website wait for domain lookup (E5).&quot;</h3>
        <div className={e.actions}><a className={e.btn} href="#deliveries">Go to deliveries ↓</a></div>
      </div></div>
    );
  }
  return (
    <div className={e.agent}><div className={e.av}>V</div><div>
      <h3 className={e.h3}>VaNi: &quot;{fmt(s.eligible)} {s.delivery_label} companies have a website but no industry or contact page read yet. Reading their sites would move most of them out of Identified. Start with {fmt(s.records)} to measure the cost?&quot;</h3>
      <div className={e.actions}>
        <Link className={`${e.btn} ${e.btnPrimary}`} href={sliceHref({ delivery: s.delivery, records: s.records })}>Set up that run →</Link>
        <Link className={e.btn} href={sliceHref({})}>Pick another slice</Link>
      </div>
    </div></div>
  );
}

function Runs({ runs }: { runs: RunSummary[] }) {
  const router = useRouter();
  if (!runs.length) {
    return (
      <div className={e.empty}>
        <p>No enrichment run yet. Start with 100 companies — the run measures the real cost per company before you commit to more.</p>
        <Link className={`${e.btn} ${e.btnPrimary} ${e.btnSm}`} href={sliceHref({})}>Set up a run</Link>
      </div>
    );
  }
  return (
    <div className={e.tableWrap}><table className={e.table}>
      <thead><tr><th>Run</th><th>Slice</th><th className={e.num}>Companies</th><th>Status</th><th className={e.num}>Average</th></tr></thead>
      <tbody>
        {runs.map((r) => (
          <tr key={r.event_id} className={e.rowLink} onClick={() => router.push(runHref(r.event_id))}>
            <td><Link href={runHref(r.event_id)}>#{r.run_no}</Link> <span className={e.muted}>· {formatDate(r.created_at)}</span></td>
            <td>{r.delivery_label}</td>
            <td className={e.num}>{fmt(r.records)}</td>
            <td><span className={`${u.tag} ${RUN_TAG[r.status][1]}`}>{RUN_TAG[r.status][0]}</span></td>
            <td className={e.num}>{r.before_avg != null ? `${fmt(r.before_avg)} → ${r.after_avg != null ? fmt(r.after_avg) : '…'}` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

export function Workbench() {
  const q = useWorkbench();
  return (
    <DataBoundary query={q} label="the enrichment workbench" skeleton={<SkeletonRows rows={4} lines={2} />}>
      {(d) => (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Suggestion d={d} />
          <div className={e.grid}>
            <div className={`${e.card} ${e.wide}`}>
              <div className={e.headRow}><h2 className={e.h2} style={{ margin: 0 }}>Common pool · {fmt(d.total)} companies</h2><span className={e.muted}>Platform default v{d.profile.version} · company side only</span></div>
              {d.total > 0 ? <><LevelStack levels={d.levels} style={{ margin: '8px 0' }} /><LevelLegend levels={d.levels} /></>
                : <p className={e.muted}>The pool has no companies yet — add a delivery below and match it.</p>}
              <div className={e.grid3} style={{ marginTop: 14 }}>
                <div><div className={e.eyebrow}>Qualified or better</div><div className={e.big}>{fmt(d.qualified_plus)} <small>of {fmt(d.total)}</small></div><p className={e.muted}>Pass Complete. A tenant can research these.</p></div>
                <div><div className={e.eyebrow}>Have a website</div><div className={e.big}>{fmt(d.with_website)}</div><p className={e.muted}>{fmt(d.website_from_email)} of them found from a work email.</p></div>
                <div><div className={e.eyebrow}>Today&apos;s record limit</div><div className={e.big}>{fmt(d.limit.left)} <small>left</small></div><p className={e.muted}>ENRICH_POOL_DAILY_RECORDS · not anyone&apos;s tokens</p></div>
              </div>
            </div>
            <div className={e.card}>
              <h2 className={e.h2}>What&apos;s missing, and what fills it</h2>
              <div className={e.tableWrap}><table className={e.table}>
                <thead><tr><th>Gap</th><th className={e.num}>Companies</th><th>Filled by</th><th /></tr></thead>
                <tbody>
                  {d.gaps.map((g) => (
                    <tr key={g.key}>
                      <td>{g.label}</td><td className={e.num}>{fmt(g.companies)}</td>
                      <td><span className={`${u.tag} ${g.enrich ? u.tagOk : u.tagDim}`}>{g.filled_by}</span></td>
                      <td>{g.enrich && g.companies > 0 && <Link className={`${e.btn} ${e.btnSm}`} href={sliceHref({ ...g.enrich, delivery: d.suggestion?.delivery })}>Enrich</Link>}</td>
                    </tr>
                  ))}
                </tbody>
              </table></div>
              <p className={e.note}>&quot;Company or individual&quot; and &quot;Industry&quot; are two of the eight Complete checks — they are why most of the pool sits at Identified.</p>
            </div>
            <div className={e.card} id="deliveries">
              <h2 className={e.h2}>Deliveries</h2>
              {d.deliveries.length ? (
                <div className={e.tableWrap}><table className={e.table}>
                  <thead><tr><th>Delivery</th><th className={e.num}>Companies</th><th className={e.num}>Qualified+</th><th>Last refreshed</th></tr></thead>
                  <tbody>
                    {d.deliveries.map((x) => (
                      <tr key={x.id}>
                        <td><Link href={`/agents/gtm/pool/deliveries/${x.id}`}>{x.label}</Link></td>
                        <td className={e.num}>{fmt(x.companies)}</td>
                        <td className={e.num}>{x.qualified_pct}%</td>
                        <td>{x.as_of ? formatDate(x.as_of) : 'undated'} · delivery</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              ) : <div className={e.empty}><p>No delivery yet. Add one under &quot;Deliveries&quot; below — a directory imported as a common-pool dataset.</p></div>}
              <h2 className={e.h2} style={{ marginTop: 14 }}>Runs</h2>
              <Runs runs={d.runs} />
            </div>
          </div>
        </div>
      )}
    </DataBoundary>
  );
}
