'use client';
/**
 * /agents/gtm/imports — the retired /import-dashboard, ported whole
 * (2026-09-26), minus the MFD import types this product never had.
 *
 * A reference surface (a noun): every import on the left; the chosen one on
 * the right, row by row. What the retired page did and this keeps:
 *   sidebar filtered by what the file was to you · stat cards · VaNi's
 *   post-import reading with a retry when rows failed · held rows with
 *   "apply recommended to all" · the table by state (all · pending · new ·
 *   already held · needs your call · failed) with paging · re-count when the
 *   counters do not add up · land rows that were staged but never landed ·
 *   delete staging behind an in-page confirmation that says what is lost ·
 *   a drawer for one row: what it is, its state, the diagnostic, a per-field
 *   keep/take decision on a held row, editing a failed row and re-queueing
 *   it, and the mapped and raw data in full.
 *
 * The retired page had an Edit form only for MFD types, so a failed GTM row
 * could never be corrected in place. It can here.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { formatDateTime, formatRelative } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import s from '../imports.module.css';
import { useImportSessions, useLoads, useResolve, useSessionActions, useStagedRows } from '@/skills/gtm-audience/useImport';
import type { ImportSession, SourceLoad, StagedRow } from '@/skills/gtm-audience/mock-data';

const STATUS: Record<string, { label: string; cls: string }> = {
  completed: { label: 'landed', cls: 'tagOk' }, completed_with_errors: { label: 'landed, some failed', cls: 'tagWarn' },
  needs_review: { label: 'rows need your call', cls: 'tagWarn' }, staged: { label: 'staged, not landed', cls: 'tagDim' },
  processing: { label: 'landing…', cls: 'tagDim' }, pending: { label: 'pending', cls: 'tagDim' }, failed: { label: 'failed', cls: 'tagBad' }, cancelled: { label: 'cancelled', cls: 'tagDim' },
};
const ROW: Record<string, { label: string; cls: string }> = {
  success: { label: 'added', cls: 'tagOk' }, duplicate: { label: 'already held', cls: 'tagDim' }, conflict: { label: 'needs your call', cls: 'tagWarn' },
  failed: { label: 'failed', cls: 'tagBad' }, pending: { label: 'pending', cls: 'tagDim' }, orphan: { label: 'orphan', cls: 'tagWarn' }, processing: { label: 'landing…', cls: 'tagDim' }, skipped: { label: 'skipped', cls: 'tagDim' },
};
const REL: { key: string; label: string }[] = [
  { key: 'all', label: 'All imports' }, { key: 'contacts', label: 'My contacts' }, { key: 'customers', label: 'My customers' }, { key: 'dataset', label: 'Common pool' },
];
const TABS = [
  { key: 'all', label: 'All' }, { key: 'pending', label: 'Pending' }, { key: 'success', label: 'New' }, { key: 'duplicate', label: 'Already held' }, { key: 'conflict', label: 'Needs your call' }, { key: 'failed', label: 'Failed' },
];

const co = (r: StagedRow): Record<string, unknown> => ((r.mapped_data?.company as Record<string, unknown> | undefined) ?? r.mapped_data ?? {});
const people = (r: StagedRow): Record<string, unknown>[] => ((r.mapped_data?.people as Record<string, unknown>[] | undefined) ?? []);
const str = (v: unknown) => (v == null || v === '' ? null : String(v));
const EDITABLE: [string, string][] = [['name', 'Company name'], ['website', 'Website'], ['domain', 'Domain'], ['email', 'Company email'], ['phone', 'Company phone'], ['city', 'City'], ['state', 'State'], ['industry_raw', 'Industry']];

function Drawer({ session, row, onClose }: { session: ImportSession; row: StagedRow; onClose: () => void }) {
  const { decide, busy: resolving } = useResolve();
  const { patchRecord, busy } = useSessionActions();
  const [edit, setEdit] = useState(false);
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...co(row) }));
  const [choice, setChoice] = useState<Record<string, 'keep' | 'take'>>({});
  const c = co(row);
  const st = ROW[row.processing_status] ?? { label: row.processing_status, cls: 'tagDim' };
  const canEdit = ['failed', 'pending', 'orphan'].includes(row.processing_status);
  const ppl = people(row);
  return (
    <>
      <div className={s.overlay} onClick={onClose} />
      <aside className={s.drawer} role="dialog" aria-label={`Row ${row.row_number}`}>
        <div className={s.dHead}>
          <span className={s.dTitle}>Imported row · row {row.row_number}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            {canEdit && <button type="button" className={s.quiet} onClick={() => { setEdit((v) => !v); setDraft({ ...co(row) }); }}>{edit ? 'View' : 'Edit'}</button>}
            <button type="button" className={s.dClose} onClick={onClose} aria-label="Close">×</button>
          </div>
        </div>

        {edit ? (
          <div className={s.dCard}>
            <div className={s.dSecTitle} style={{ marginBottom: 10 }}>Edit the company fields, then re-queue</div>
            <div className={s.editGrid}>
              {EDITABLE.map(([k, l]) => (
                <label key={k}><span className={s.lbl}>{l}</span><input className={s.input} value={str(draft[k]) ?? ''} onChange={(e) => setDraft((d) => ({ ...d, [k]: e.target.value }))} /></label>
              ))}
            </div>
            <p className={s.muted} style={{ fontSize: 'var(--fs-ui)', lineHeight: 1.55, margin: '10px 0' }}>Saving resets this row to pending. Then land the staged rows from the toolbar and it is processed with the corrected values.</p>
            <button type="button" className={s.primary} disabled={busy} onClick={async () => { const r = await patchRecord(session.id, row.id, { ...row.mapped_data, company: draft }); if (r) { setEdit(false); onClose(); } }}>{busy ? 'Saving…' : 'Save and re-queue'}</button>
          </div>
        ) : (
          <div className={s.dCard}>
            <div className={s.dSecTitle}>Staged data</div>
            <div className={s.dName}>{str(c.name) ?? str(ppl[0]?.full_name) ?? '(no company name)'}</div>
            <div className={s.dMeta}>{[str(c.domain_normalized) ?? str(c.website), str(c.city), ppl.length ? `${ppl.length} ${ppl.length === 1 ? 'person' : 'people'}` : null].filter(Boolean).join(' · ') || '—'}</div>
          </div>
        )}

        <div className={s.dSec}>
          <div className={s.dSecTitle}>Import status</div>
          <div><span className={`${u.tag} ${u[st.cls]}`}>{st.label}</span>{row.processed_at && <span className={s.muted} style={{ fontSize: 'var(--fs-md)', marginLeft: 8 }}>{formatDateTime(row.processed_at)}</span>}</div>
        </div>

        <div className={s.dSec}>
          <div className={s.dSecTitle}>Diagnostic</div>
          {row.error_messages?.length ? row.error_messages.map((m, i) => <div key={i} className={`${s.diag} ${s.diagBad}`}>⚠ {m}</div>)
            : row.processing_status === 'duplicate' ? <div className={`${s.diag} ${s.diagInfo}`}>ⓘ Already held — this row said nothing new, so nothing was written.</div>
            : row.processing_status === 'success' ? <div className={`${s.diag} ${s.diagOk}`}>✓ Added{row.created_record_id ? ` as record ${row.created_record_id}` : ''}. It is under Companies and, if it named people, under People.</div>
            : row.processing_status === 'conflict' ? null
            : <div className={`${s.diag} ${s.diagInfo}`}>ⓘ Pending — not yet landed. Land the staged rows from the toolbar.</div>}
          {(row.warnings?.length ?? 0) > 0 && row.warnings!.map((w, i) => <div key={i} className={`${s.diag} ${s.diagWarn}`}>{w}</div>)}

          {row.processing_status === 'conflict' && row.field_diff && (
            <div>
              <div className={s.diagWarn + ' ' + s.diag} style={{ marginBottom: 8 }}>This row would change a record you already hold{row.conflict_kind === 'in_file' ? ' — and appears twice in this file' : ''}. Nothing was written. Per field: keep yours or take the file&rsquo;s.</div>
              {row.campaign_locked && <div className={`${s.diag} ${s.diagWarn}`} style={{ marginBottom: 8 }}>This contact is in a running campaign. Changing what a sequence sends to can misdirect outreach already sent, so this row is never decided in bulk.</div>}
              {Object.entries(row.field_diff).map(([f, d]) => {
                const pick = choice[f] ?? d.recommended;
                return (
                  <div key={f} className={s.field}>
                    <div className={s.fieldK}><b>{f.replace(/_/g, ' ')}</b> — {d.reason}</div>
                    <div className={s.choices}>
                      <button type="button" className={s.choice} aria-pressed={pick === 'keep'} onClick={() => setChoice((p) => ({ ...p, [f]: 'keep' }))}>Keep: {str(d.existing) ?? '—'}{d.recommended === 'keep' ? ' · suggested' : ''}</button>
                      <button type="button" className={s.choice} aria-pressed={pick === 'take'} onClick={() => setChoice((p) => ({ ...p, [f]: 'take' }))}>Use new: {str(d.incoming) ?? '—'}{d.recommended === 'take' ? ' · suggested' : ''}</button>
                    </div>
                  </div>
                );
              })}
              <button type="button" className={s.primary} style={{ marginTop: 12 }} disabled={resolving}
                onClick={async () => { const fields = Object.fromEntries(Object.entries(row.field_diff!).map(([f, d]) => [f, choice[f] ?? d.recommended])) as Record<string, 'keep' | 'take'>; const r = await decide(session.id, [{ staging_id: row.id, fields }]); if (r) onClose(); }}>
                {resolving ? 'Applying…' : 'Apply this decision'}
              </button>
            </div>
          )}
        </div>

        <div className={s.dSec}><div className={s.dSecTitle}>Mapped data</div><pre className={s.json}>{JSON.stringify(row.mapped_data, null, 2)}</pre></div>
        <div className={s.dSec}><div className={s.dSecTitle}>Raw data — the row as the file had it</div><pre className={s.json}>{JSON.stringify(row.raw_data ?? {}, null, 2)}</pre></div>
      </aside>
    </>
  );
}

function SessionView({ session, load }: { session: ImportSession; load: SourceLoad | undefined }) {
  const [tab, setTab] = useState('all');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState<StagedRow | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => { setTab('all'); setPage(1); setOpen(null); setConfirmDelete(false); }, [session.id]);
  const rows = useStagedRows(session.id, tab, page, 50);
  const held = useStagedRows(session.id, 'conflict', 1, 1);
  const heldCount = held.data?.data?.total ?? 0;
  const { acceptRecommended, busy: resolving } = useResolve();
  const act = useSessionActions();

  const finished = ['completed', 'completed_with_errors', 'needs_review'].includes(session.status);
  const total = session.total_records;
  const counted = session.successful_records + session.failed_records + session.duplicate_records + (session.orphan_records ?? 0) + heldCount;
  const outOfSync = finished && total > 0 && counted < total;
  const vani = !finished
    ? session.status === 'staged' ? 'Staged and ready. Nothing has been written yet — land the rows from the toolbar.' : session.status === 'failed' ? `Landing failed${session.error_summary ? `: ${session.error_summary}` : ''}. The rows are still staged; fix the cause and land them again.` : 'Landing…'
    : session.status === 'needs_review' ? `${session.successful_records.toLocaleString()} imported. ${heldCount ? `${heldCount} ${heldCount === 1 ? 'row' : 'rows'} would` : 'Some rows would'} change records you already hold — held for your decision, nothing overwritten.`
    : session.failed_records > 0 ? `Landed with ${session.failed_records} failure${session.failed_records === 1 ? '' : 's'}. Open a failed row to see why; fix it in place and retry, or fix the file and add it again.`
    : session.duplicate_records > 0 && session.successful_records > 0 ? `Landed. ${session.successful_records.toLocaleString()} added, ${session.duplicate_records.toLocaleString()} already held.`
    : session.duplicate_records > 0 ? `All ${session.duplicate_records.toLocaleString()} rows were already held — nothing new.`
    : `Every one of the ${total.toLocaleString()} rows landed.`;
  const pct = total ? Math.round((session.successful_records / total) * 100) : null;

  return (
    <div className={s.main}>
      <div className={s.meta}>
        <b>Import #{session.tenant_seq ?? session.id}</b>
        {session.original_filename && <span>{session.original_filename}</span>}
        <span>{formatDateTime(session.created_at)}</span>
        {session.relationship && <span>{REL.find((r) => r.key === session.relationship)?.label ?? session.relationship}</span>}
        {session.destination === 'universe_companies' && <span className={`${u.tag} ${u.tagWarn}`}>common pool</span>}
        {load && <span>delivery: <b>{load.label}</b>{load.as_of ? ` · as of ${load.as_of}` : ' · undated'}{load.tags.length ? ` · ${load.tags.map((t) => t.label).join(', ')}` : ''}</span>}
        <span className={`${u.tag} ${u[(STATUS[session.status] ?? { cls: 'tagDim' }).cls]}`}>{(STATUS[session.status] ?? { label: session.status }).label}</span>
      </div>

      <div className={s.stats}>
        <div className={s.stat}><div className={s.statK}>Rows</div><div className={s.statV}>{total.toLocaleString()}</div></div>
        <div className={`${s.stat} ${s.statOk}`}><div className={s.statK}>Added</div><div className={s.statV}>{session.successful_records.toLocaleString()}{pct != null && <small>{pct}%</small>}</div></div>
        <div className={s.stat}><div className={s.statK}>Already held</div><div className={s.statV}>{session.duplicate_records.toLocaleString()}</div></div>
        <div className={`${s.stat} ${heldCount ? s.statWarn : ''}`}><div className={s.statK}>Need your call</div><div className={s.statV}>{heldCount.toLocaleString()}</div></div>
        <div className={`${s.stat} ${session.failed_records ? s.statBad : ''}`}><div className={s.statK}>Failed</div><div className={s.statV}>{session.failed_records.toLocaleString()}</div></div>
      </div>

      <div className={s.vani}>
        <div className={s.vaniMsg}><span className={s.vaniLbl}>VaNi · after this import</span>{vani}</div>
        {session.failed_records > 0 && <button type="button" className={s.quiet} disabled={act.busy} onClick={() => void act.retryFailed(session.id)}>{act.busy ? 'Retrying…' : `Retry ${session.failed_records} failed ${session.failed_records === 1 ? 'row' : 'rows'}`}</button>}
      </div>

      {heldCount > 0 && (
        <div className={`${s.card} ${s.cardPad}`} style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div>
            <div className={s.bold} style={{ marginBottom: 3 }}>{heldCount} {heldCount === 1 ? 'row needs' : 'rows need'} your call</div>
            <div className={s.muted} style={{ fontSize: 'var(--fs-ui)', maxWidth: 620, lineHeight: 1.55 }}>These would change records you already hold. Nothing was overwritten. VaNi ranked each field by how fresh and how complete each side is — you decide. Contacts in a running campaign are never decided in bulk.</div>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className={s.primary} disabled={resolving} onClick={() => void acceptRecommended(session.id)}>{resolving ? 'Applying…' : 'Apply recommended to all'}</button>
            <button type="button" className={s.quiet} onClick={() => { setTab('conflict'); setPage(1); }}>Decide per row</button>
          </div>
        </div>
      )}

      <div className={s.card}>
        <div className={s.bar}>
          <div className={s.tabs} role="tablist">
            {TABS.map((t) => {
              const n = t.key === 'success' ? session.successful_records : t.key === 'duplicate' ? session.duplicate_records : t.key === 'failed' ? session.failed_records : t.key === 'conflict' ? heldCount : null;
              if (t.key === 'conflict' && !heldCount) return null;
              return <button key={t.key} type="button" className={s.tab} role="tab" aria-pressed={tab === t.key} onClick={() => { setTab(t.key); setPage(1); }}>{t.label}{n != null ? ` (${n})` : ''}</button>;
            })}
          </div>
          <div className={s.tools}>
            {outOfSync && <button type="button" className={`${s.link} ${s.linkWarn}`} disabled={act.busy} onClick={() => void act.syncStats(session.id)} title="The counters do not add up to the row count — recount from the staged rows">⚠ Recount</button>}
            {['staged', 'completed_with_errors', 'failed'].includes(session.status) && <button type="button" className={s.primary} disabled={act.busy} onClick={() => void act.processStaged(session.id)}>{act.busy ? 'Landing…' : `Land the staged rows →`}</button>}
            <button type="button" className={`${s.link} ${s.linkBad}`} disabled={act.busy || session.status === 'processing'} onClick={() => setConfirmDelete((v) => !v)}>Delete staging</button>
          </div>
        </div>
        {confirmDelete && (
          <div className={s.confirm}>
            <div><b>Delete the staged rows of this import?</b> {total.toLocaleString()} staged rows from {session.original_filename ?? 'this import'} are removed permanently. What already landed stays — only the staging copy goes, and this import can no longer be reprocessed, retried or reviewed row by row.</div>
            {session.status === 'staged' && <div className={s.confirmWarn}>These rows have not been landed yet. Deleting now discards them entirely.</div>}
            {heldCount > 0 && <div className={s.confirmWarn}>{heldCount} {heldCount === 1 ? 'row is' : 'rows are'} still waiting on your decision. Deleting now discards {heldCount === 1 ? 'it' : 'them'}.</div>}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className={s.danger} disabled={act.busy} onClick={async () => { const r = await act.deleteStaging(session.id); if (r) setConfirmDelete(false); }}>{act.busy ? 'Deleting…' : 'Yes, delete the staged rows'}</button>
              <button type="button" className={s.quiet} onClick={() => setConfirmDelete(false)}>Keep them</button>
            </div>
          </div>
        )}
        <DataBoundary query={rows} label="rows" skeleton={<div className={s.cardPad}><SkeletonRows rows={5} /></div>}
          isEmpty={(d) => !d?.records?.length}
          empty={tab === 'all' ? 'No staged rows. Staging was deleted, or the import never staged anything.' : 'No rows in this state.'}>
          {(d) => (
            <>
              <div className={s.tableWrap}>
                <table className={s.table}>
                  <thead><tr><th>#</th><th>Company</th><th>Domain</th><th>Location</th><th>Industry</th><th>People</th><th>Status</th></tr></thead>
                  <tbody>
                    {d.records.map((r) => {
                      const c = co(r); const st = ROW[r.processing_status] ?? { label: r.processing_status, cls: 'tagDim' };
                      return (
                        <tr key={String(r.id)} onClick={() => setOpen(r)}>
                          <td className={s.num}>{r.row_number}</td>
                          <td className={s.bold}>{str(c.name) ?? <span className={s.muted}>(no company name)</span>}</td>
                          <td className={s.mono}>{str(c.domain_normalized) ?? str(c.domain) ?? str(c.website) ?? '—'}</td>
                          <td className={s.muted}>{[str(c.city), str(c.state)].filter(Boolean).join(', ') || '—'}</td>
                          <td className={s.muted}>{str(c.industry_raw) ?? '—'}</td>
                          <td className={s.num}>{people(r).length || '—'}</td>
                          <td><span className={`${u.tag} ${u[st.cls]}`}>{st.label}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {d.total_pages > 1 && (
                <div className={s.pager}>
                  <button type="button" className={s.link} disabled={page <= 1} onClick={() => setPage(1)}>First</button>
                  <button type="button" className={s.link} disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                  <span>Page {page} / {d.total_pages} · {d.total.toLocaleString()} rows</span>
                  <button type="button" className={s.link} disabled={page >= d.total_pages} onClick={() => setPage((p) => p + 1)}>Next</button>
                  <button type="button" className={s.link} disabled={page >= d.total_pages} onClick={() => setPage(d.total_pages)}>Last</button>
                </div>
              )}
            </>
          )}
        </DataBoundary>
      </div>

      {open && <Drawer session={session} row={open} onClose={() => setOpen(null)} />}
    </div>
  );
}

export default function ImportsDashboard() {
  const params = useSearchParams();
  const wanted = params?.get('session') ?? null;
  const q = useImportSessions();
  const loads = useLoads('mine');
  const [rel, setRel] = useState('all');
  const [picked, setPicked] = useState<string | null>(wanted);
  useEffect(() => { if (wanted) setPicked(wanted); }, [wanted]);

  const all = useMemo(() => q.data?.data?.sessions ?? [], [q.data]);
  const list = useMemo(() => (rel === 'all' ? all : all.filter((x) => (x.relationship ?? 'contacts') === rel)), [all, rel]);
  const counts = useMemo(() => { const c: Record<string, number> = { all: all.length }; for (const x of all) { const k = x.relationship ?? 'contacts'; c[k] = (c[k] ?? 0) + 1; } return c; }, [all]);
  const session = list.find((x) => String(x.id) === picked) ?? list[0] ?? null;
  const load = session?.load_id != null ? loads.data?.data?.loads.find((l) => String(l.id) === String(session.load_id)) : undefined;

  return (
    <div>
      <div className={u.eyebrow}>// GTM · IMPORTS</div>
      <h1 className={u.h1}>Every import, row by row</h1>
      <p className={u.lede}>What landed, what was already here, what needs your call and what failed — with the reason, the row as the file had it, and the fix. A reference surface: bringing a new list is <Link href="/agents/gtm/import">Import a list</Link>; the landed companies are under <Link href="/agents/gtm/companies">Companies</Link>.</p>

      <div className={s.grid}>
        <aside className={s.side}>
          <div className={s.filters}>
            {REL.map((r) => ((counts[r.key] ?? 0) > 0 || r.key === 'all') && (
              <button key={r.key} type="button" className={s.filter} aria-pressed={rel === r.key} onClick={() => { setRel(r.key); setPicked(null); }}>{r.label}<span className={s.filterN}>{counts[r.key] ?? 0}</span></button>
            ))}
          </div>
          <DataBoundary query={q} label="imports" skeleton={<SkeletonRows rows={3} lines={2} />} isEmpty={(d) => !d?.sessions?.length}
            empty="No imports yet. Your first list lands from Import a list, and every load after it is listed here.">
            {() => (
              <>
                {list.map((x) => {
                  const st = STATUS[x.status] ?? { label: x.status, cls: 'tagDim' };
                  return (
                    <button key={String(x.id)} type="button" className={`${s.sess} ${session && String(session.id) === String(x.id) ? s.sessOn : ''}`} onClick={() => setPicked(String(x.id))}>
                      <div className={s.sessLabel}>Import #{x.tenant_seq ?? x.id}<span className={s.sessId}>ID {x.id}</span></div>
                      <div className={s.sessFile}>{x.original_filename ?? `${x.import_type} import`}</div>
                      <div className={s.sessMeta}>{formatRelative(x.created_at)} · {REL.find((r) => r.key === (x.relationship ?? 'contacts'))?.label ?? x.relationship}{x.destination === 'universe_companies' ? ' · pool' : ''}</div>
                      <div style={{ marginTop: 6 }}><span className={`${u.tag} ${u[st.cls]}`}>{st.label}</span></div>
                    </button>
                  );
                })}
                {list.length === 0 && <div className={s.sideEmpty}>Nothing of that kind yet.</div>}
              </>
            )}
          </DataBoundary>
          <Link href="/agents/gtm/import" className={s.sideLink}>+ New import</Link>
        </aside>

        {session ? <SessionView session={session} load={load} /> : (
          <div className={`${s.card} ${s.empty}`}>
            {q.isSuccess && all.length === 0 ? <>No imports yet. <Link href="/agents/gtm/import">Bring your first list →</Link></> : 'Choose an import on the left.'}
          </div>
        )}
      </div>
    </div>
  );
}
