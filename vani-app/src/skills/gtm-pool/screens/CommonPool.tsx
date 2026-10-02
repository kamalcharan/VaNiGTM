'use client';
/**
 * /agents/gtm/pool — the common pool, admin tenants only. The retired
 * /common-pool page (RecordsPage, scope 'pool'), ported (2026-09-26), plus
 * the two things it pointed elsewhere for: the deliveries behind the rows
 * (prospect-skill.get_loads) and the door to add one (the import wizard in
 * its common-pool posture).
 *
 * What the rows ARE is said up front, as before: source rows, one per record
 * per delivery, kept exactly as the file supplied them. Rows sharing an
 * identifier are flagged, never merged silently — the merge engine is not
 * built, and this page does not pretend it is.
 *
 * gt_universe_company_sources has no tenant_id, so the gate is the whole
 * protection: the nav entry is adminOnly, this screen says "admin tenants
 * only" plainly rather than showing an empty table, and get_records /
 * get_loads refuse a non-admin before the query runs.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-provider';
import { IS_LIVE } from '@/lib/live-transport';
import { useSkillQuery } from '@/lib/useSkill';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { formatDate } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import s from '../pool.module.css';
import { useQueryClient } from '@tanstack/react-query';
import { ImportWizard } from '@/skills/gtm-audience/screens/ImportWizard';
import type { RecordRow } from '@/skills/gtm-audience/mock-data';
import { PoolCrumbs, PoolDeliveries, PoolSources, PoolStates } from './PoolParts';

/** A pool row: what the view carries beyond the list columns. */
interface PoolRecord extends RecordRow {
  website?: string | null; email?: string | null; phone?: string | null; address_line?: string | null; pin?: string | null; country?: string | null;
  revenue_band?: string | null; linkedin_url?: string | null; year_founded?: number | null; description?: string | null; source_as_of?: string | null;
  resolved?: boolean | null; raw?: Record<string, unknown> | null;
}
interface Facets { industries: { value: string; count: number }[]; tags: { id: number; label: string; count: number }[]; with_domain: number; without_domain: number; }
interface Stats { total: number; loads: number; resolved: number; avg_completeness: string | number | null; avg_validity: string | number | null; with_rejected_fields: number; with_domain: number; undated: number; duplicates: number; }
interface PoolList { records: PoolRecord[]; total: number; page: number; limit: number; stats: Stats; facets: Facets; }

const pct = (v: string | number | null | undefined) => (v == null ? '—' : `${Math.round(Number(v) * 100)}%`);
const PAGE = 50;

function Field({ k, v }: { k: string; v: unknown }) {
  if (v == null || v === '') return null;
  return <div className={s.field}><span className={s.fk}>{k}</span><span className={s.fv}>{String(v)}</span></div>;
}

function Detail({ r, onClose }: { r: PoolRecord; onClose: () => void }) {
  const raw = Object.entries(r.raw ?? {}).filter(([, v]) => v != null && v !== '');
  return (
    <>
      <div className={s.overlay} onClick={onClose} />
      <aside className={s.drawer} role="dialog" aria-label={r.name}>
        <div className={s.dHead}>
          <div><div className={s.dName}>{r.name}</div><div className={s.dMeta}>{r.ref} · {r.source_label ?? 'delivery unknown'}{r.freshness && r.freshness !== 'unknown' ? ` · ${r.freshness}` : ''}</div></div>
          <button type="button" className={s.dClose} onClick={onClose} aria-label="Close">×</button>
        </div>
        <div>
          <Field k="Domain" v={r.domain_normalized} /><Field k="Website" v={r.website} /><Field k="Email" v={r.email} /><Field k="Phone" v={r.phone} /><Field k="Address" v={r.address_line} />
          <Field k="Location" v={[r.city, r.state_code, r.pin, r.country].filter(Boolean).join(', ')} /><Field k="Industry" v={r.industry_raw} /><Field k="Employees" v={r.employees_band} /><Field k="Revenue" v={r.revenue_band} />
          <Field k="Year founded" v={r.year_founded} /><Field k="LinkedIn" v={r.linkedin_url} /><Field k="Description" v={r.description} />
          <Field k="Completeness" v={`${pct(r.completeness)} of tracked fields populated`} /><Field k="Validity" v={`${pct(r.validity)} of populated fields passed validation`} />
          <Field k="As of" v={r.source_as_of ? formatDate(r.source_as_of) : 'undated — scored as less fresh'} />
          <Field k="Shares an identifier" v={r.duplicate ? 'yes — flagged, not merged' : null} />
          <Field k="Matched to a company" v={r.resolved ? 'yes — open its delivery to see the company and its checks' : 'not yet — "Match unmatched rows now" on the pool page'} />
          {r.tags.length > 0 && <Field k="Tags" v={r.tags.map((t) => t.label).join(', ')} />}
        </div>
        <div className={s.dSecTitle}>The row as the file had it</div>
        {raw.length ? <div>{raw.map(([k, v]) => <Field key={k} k={k} v={v} />)}</div> : <p className={s.muted} style={{ fontSize: 'var(--fs-ui)' }}>The source row was not kept for this record.</p>}
      </aside>
    </>
  );
}

export default function CommonPool() {
  const { tenant } = useAuth();
  const isAdmin = !IS_LIVE || tenant?.is_admin === true;
  const [search, setSearch] = useState('');
  const [industry, setIndustry] = useState('');
  const [tagId, setTagId] = useState('');
  const [domain, setDomain] = useState('');
  const [dupes, setDupes] = useState(false);
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<PoolRecord | null>(null);
  const [adding, setAdding] = useState(false);
  useEffect(() => { setPage(1); }, [search, industry, tagId, domain, dupes]);

  const params = useMemo(() => ({
    scope: 'pool', page, limit: PAGE,
    ...(search.trim() ? { search: search.trim() } : {}), ...(industry ? { industry } : {}), ...(tagId ? { tag_id: Number(tagId) } : {}),
    ...(domain ? { domain } : {}), ...(dupes ? { only_duplicates: true } : {}),
  }), [search, industry, tagId, domain, dupes, page]);
  const q = useSkillQuery<PoolList>('prospect-skill', 'get_records', params, { enabled: isAdmin });
  const qc = useQueryClient();
  const stats = q.data?.data?.stats;
  const facets = q.data?.data?.facets;
  const total = q.data?.data?.total ?? 0;
  const lastPage = Math.max(1, Math.ceil(total / PAGE));

  if (!isAdmin) {
    return (
      <div>
        <div className={u.eyebrow}>// GTM · SHARED DATA</div>
        <h1 className={u.h1}>Common pool</h1>
        <div className={s.gate}>
          <span className={u.cardMeta}>ADMIN TENANTS ONLY</span>
          <div className={s.gateH}>This is not yours to see — and that is by design</div>
          <p className={s.gateP}>The common pool holds directory data shared across every tenant, fed by Vikuna. You draw on it through the hot list in <Link href="/agents/gtm/audience">Build the audience</Link>; your own records are under <Link href="/agents/gtm/companies">Companies</Link>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <div>
        <div className={u.eyebrow}>// GTM · SHARED DATA · ADMIN</div>
        <h1 className={u.h1}>Common pool</h1>
        <PoolCrumbs on="pool" />
        <p className={u.lede}>The directory data every tenant draws on. Fed here by importing a delivery as a common-pool dataset; read by tenants through the hot list, never written by them.</p>
      </div>

      <PoolStates />
      <PoolSources />

      <section className={s.section}>
        <header className={s.secHead}>
          <div><h2 className={s.secTitle}>Deliveries</h2><p className={s.secWhat}>One row per dataset delivered — the unit of provenance, freshness and rollback — with its companies counted by state. Open one to see why each company is or is not in the pool. Retiring a delivery keeps its rows and re-tests every company it fed.</p></div>
          <button type="button" className={s.quiet} onClick={() => setAdding((v) => !v)}>{adding ? 'Close' : '+ Add a delivery'}</button>
        </header>
        <div className={s.secBody}>
          {adding && <div style={{ marginBottom: 16 }}><ImportWizard relationship="dataset" fixedRelationship landedHref="/agents/gtm/pool" onLanded={() => { void qc.invalidateQueries({ queryKey: ['skill', 'pool-skill'] }); void q.refetch(); }} /></div>}
          <PoolDeliveries />
        </div>
      </section>

      <section className={s.section}>
        <header className={s.secHead}><div><h2 className={s.secTitle}>Source rows</h2><p className={s.secWhat}>The raw layer under the companies: every row each delivery contributed, kept exactly as the file supplied it, with its quality as two numbers — fill rate and validity, never blended. A company is derived from these rows field by field; the row itself is never edited.</p></div></header>
        <div className={s.secBody}>
          {stats && (
            <div className={s.stats}>
              <div className={s.stat}><div className={s.statK}>Source rows</div><div className={s.statV}>{stats.total.toLocaleString()}</div></div>
              <div className={`${s.stat} ${s.statInfo}`}><div className={s.statK}>Deliveries</div><div className={s.statV}>{stats.loads.toLocaleString()}</div></div>
              <div className={s.stat}><div className={s.statK}>Avg completeness</div><div className={s.statV}>{pct(stats.avg_completeness)}</div></div>
              <div className={`${s.stat} ${Number(stats.avg_validity ?? 1) < 1 ? s.statWarn : ''}`}><div className={s.statK}>Avg validity</div><div className={s.statV}>{pct(stats.avg_validity)}</div></div>
              <div className={`${s.stat} ${stats.duplicates ? s.statWarn : ''}`}><div className={s.statK}>Share an identifier</div><div className={s.statV}>{stats.duplicates.toLocaleString()}</div></div>
              <div className={s.stat}><div className={s.statK}>Matched to a company</div><div className={s.statV}>{stats.resolved.toLocaleString()}</div></div>
            </div>
          )}
          {stats && stats.with_rejected_fields > 0 && (
            <div className={s.note}><b>{stats.with_rejected_fields.toLocaleString()}</b> {stats.with_rejected_fields === 1 ? 'record has' : 'records have'} a field that was populated but failed validation — a spreadsheet-mangled range, or a literal like <code>undefined+</code>. Rejected at import rather than stored, which is why validity sits below 100%.</div>
          )}
          <div style={{ height: 12 }} />
          <div className={s.tools}>
            <input className={s.search} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, domain, city, industry…" />
            <button type="button" className={`${u.tag} ${dupes ? u.tagWarn : u.tagDim}`} aria-pressed={dupes} onClick={() => setDupes((v) => !v)} style={{ cursor: 'pointer', font: 'inherit', fontSize: 'var(--fs-sm)' }}>Possible duplicates{stats?.duplicates ? ` (${stats.duplicates})` : ''}</button>
            <select className={s.select} value={industry} onChange={(e) => setIndustry(e.target.value)}><option value="">All industries</option>{(facets?.industries ?? []).map((i) => <option key={i.value} value={i.value}>{i.value} ({i.count})</option>)}</select>
            <select className={s.select} value={tagId} onChange={(e) => setTagId(e.target.value)}><option value="">All tags</option>{(facets?.tags ?? []).map((t) => <option key={t.id} value={String(t.id)}>{t.label} ({t.count})</option>)}</select>
            <select className={s.select} value={domain} onChange={(e) => setDomain(e.target.value)}><option value="">Any domain</option><option value="has">Has a domain ({facets?.with_domain ?? 0})</option><option value="none">No domain ({facets?.without_domain ?? 0})</option></select>
            <span className={s.count}>{q.data?.data ? `${total.toLocaleString()} ${total === 1 ? 'row' : 'rows'}` : ''}</span>
          </div>
          <DataBoundary query={q} label="source rows" skeleton={<SkeletonRows rows={6} lines={2} />} isEmpty={(d) => !d?.records?.length}
            empty={search || industry || tagId || domain || dupes ? 'Nothing matches that filter.' : 'The pool is empty. Add a delivery above and its rows land here.'}>
            {(d) => (
              <>
                <div className={s.tableWrap}>
                  <table className={s.table}>
                    <thead><tr><th>Company</th><th>Domain</th><th>Location</th><th>Industry</th><th>Quality</th><th>Delivery</th><th>Tags</th></tr></thead>
                    <tbody>
                      {d.records.map((r) => (
                        <tr key={String(r.id)} onClick={() => setOpen(r)}>
                          <td><div className={s.name}>{r.name}</div>{r.duplicate && <span className={`${u.tag} ${u.tagWarn}`}>shares an identifier</span>}</td>
                          <td className={s.mono}>{r.domain_normalized ?? <span className={s.muted}>—</span>}</td>
                          <td className={s.muted}>{[r.city, r.state_code].filter(Boolean).join(', ') || '—'}</td>
                          <td className={s.muted}>{r.industry_raw ?? '—'}</td>
                          <td><span className={`${s.q} ${Number(r.validity ?? 1) < 1 ? s.qBad : ''}`}>{pct(r.completeness)} full · {pct(r.validity)} valid</span></td>
                          <td className={s.muted} style={{ fontSize: 'var(--fs-md)' }}>{r.source_label ?? '—'}{r.freshness && r.freshness !== 'unknown' ? ` · ${r.freshness}` : ' · undated'}</td>
                          <td>{r.tags.map((t) => <span key={t.id} className={`${u.tag} ${u.tagDim}`} style={{ marginRight: 4 }}>{t.label}</span>)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {lastPage > 1 && (
                  <div className={s.pager}>
                    <button type="button" className={s.link} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>← Previous</button>
                    <span>Page {page} of {lastPage} · {total.toLocaleString()} rows</span>
                    <button type="button" className={s.link} disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>Next →</button>
                  </div>
                )}
              </>
            )}
          </DataBoundary>
        </div>
      </section>

      {open && <Detail r={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
