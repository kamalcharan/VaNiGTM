'use client';
/**
 * Past imports, and the rows a load held for a person.
 *
 * The old import dashboard's one job that survives: a row that would CHANGE
 * a record you already hold is never written silently — it is held, with a
 * per-field diff and a recommendation from the quality model, and a person
 * decides. Accept the recommendations in one go, or take/keep per field.
 * Campaign-locked rows are never swept up by the bulk accept (a changed email
 * mid-sequence misdirects outreach already sent), so they need a per-row
 * decision here.
 */
import { useState } from 'react';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { formatDateTime } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import s from '../audience.module.css';
import { useImportSessions, useResolve, useStagedRows } from '../useImport';
import type { ImportSession, StagedRow } from '../mock-data';

const STATUS: Record<string, { label: string; tone: 'ok' | 'warn' | 'dim' | 'bad' }> = {
  completed: { label: 'landed', tone: 'ok' }, completed_with_errors: { label: 'landed, some failed', tone: 'warn' },
  needs_review: { label: 'rows held for review', tone: 'warn' }, staged: { label: 'staged, not landed', tone: 'dim' },
  processing: { label: 'landing…', tone: 'dim' }, failed: { label: 'failed', tone: 'bad' },
};

function Review({ session }: { session: ImportSession }) {
  const q = useStagedRows(session.id, 'conflict');
  const { acceptRecommended, decide, busy } = useResolve();
  const [choice, setChoice] = useState<Record<string, Record<string, 'take' | 'keep'>>>({});
  const pick = (row: StagedRow, field: string) => choice[String(row.id)]?.[field] ?? row.field_diff?.[field]?.recommended ?? 'keep';
  return (
    <DataBoundary query={q} label="held rows" skeleton={<SkeletonRows rows={2} lines={2} />}
      isEmpty={(d: { records: StagedRow[] } | undefined) => !d?.records?.length}
      empty="Nothing held. Every row of this import landed or was refused with a reason.">
      {(d: { records: StagedRow[] }) => (
        <div style={{ marginTop: 10 }}>
          <p className={s.hint}>{d.records.length} {d.records.length === 1 ? 'row' : 'rows'} would change something you already hold. Per field: what you have, what the file says, and what the quality model recommends. Nothing is written until you decide.</p>
          <div className={s.list}>
            {d.records.map((r) => (
              <div key={r.id} className={`${s.row} ${s.rowNoTick}`}>
                <div>
                  <div className={s.name}>{String(r.mapped_data.name ?? `row ${r.row_number}`)}<small>row {r.row_number} · {r.conflict_kind === 'in_file' ? 'twice in this file' : 'already in your prospects'}</small></div>
                  {r.campaign_locked && <div className={s.meta}><span className={`${s.chip} ${s.chipWarn}`}>campaign-locked — per-row decision only</span></div>}
                  <div className={s.map} style={{ gridTemplateColumns: 'minmax(70px, 110px) minmax(0, 1fr) minmax(0, 1fr) max-content', marginTop: 8 }}>
                    {Object.entries(r.field_diff ?? {}).map(([f, dfx]) => (
                      <div key={f} style={{ display: 'contents' }}>
                        <span className={s.mapA}>{f}</span>
                        <span className={s.mapA} title="what you hold">{dfx.existing == null || dfx.existing === '' ? '—' : String(dfx.existing)}</span>
                        <span className={s.mapB} title={dfx.reason}>{String(dfx.incoming)}</span>
                        <span className={s.seg} style={{ minWidth: 'max-content', whiteSpace: 'nowrap' }}>
                          <button type="button" aria-pressed={pick(r, f) === 'keep'} onClick={() => setChoice((c) => ({ ...c, [String(r.id)]: { ...(c[String(r.id)] ?? {}), [f]: 'keep' } }))} disabled={busy}>keep</button>
                          <button type="button" aria-pressed={pick(r, f) === 'take'} onClick={() => setChoice((c) => ({ ...c, [String(r.id)]: { ...(c[String(r.id)] ?? {}), [f]: 'take' } }))} disabled={busy}>take</button>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <span />
              </div>
            ))}
          </div>
          <div className={s.actions} style={{ marginTop: 12 }}>
            <button type="button" className={s.primary} disabled={busy}
              onClick={() => void decide(session.id, d.records.map((r) => ({ staging_id: r.id, fields: Object.fromEntries(Object.keys(r.field_diff ?? {}).map((f) => [f, pick(r, f)])) })))}>
              Apply my decisions
            </button>
            <button type="button" className={s.quiet} disabled={busy} onClick={() => void acceptRecommended(session.id)}>Accept every recommendation</button>
            <span className={s.hint}>"take" writes the file's value onto your record; "keep" leaves yours.</span>
          </div>
        </div>
      )}
    </DataBoundary>
  );
}

export function ImportsPanel() {
  const q = useImportSessions();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <DataBoundary query={q} label="past imports" skeleton={<SkeletonRows rows={2} />}
      isEmpty={(d: { sessions: ImportSession[] } | undefined) => !d?.sessions?.length}
      empty="No imports yet. Your first list lands above.">
      {(d: { sessions: ImportSession[] }) => (
        <div style={{ marginTop: 14 }}>
          <div className={s.subh}>Past imports</div>
          <div className={s.list} style={{ marginTop: 6 }}>
            {d.sessions.map((ss) => {
              const st = STATUS[ss.status] ?? { label: ss.status, tone: 'dim' as const };
              const isOpen = open === String(ss.id);
              return (
                <div key={ss.id} className={`${s.row} ${s.rowNoTick}`}>
                  <div>
                    <div className={s.name}>{ss.original_filename ?? `import #${ss.tenant_seq}`}<small>#{ss.tenant_seq} · {formatDateTime(ss.created_at)}</small></div>
                    <div className={s.why}>{ss.total_records} rows · {ss.successful_records} landed · {ss.duplicate_records} already here · {ss.failed_records} failed{ss.orphan_records ? ` · ${ss.orphan_records} orphaned` : ''}</div>
                    {isOpen && <Review session={ss} />}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span className={`${u.tag} ${st.tone === 'ok' ? u.tagOk : st.tone === 'warn' ? u.tagWarn : st.tone === 'bad' ? u.tagBad : u.tagDim}`}>{st.label}</span>
                    {ss.status === 'needs_review' && <button type="button" className={s.quiet} style={{ padding: '4px 10px', fontSize: 12 }} onClick={() => setOpen(isOpen ? null : String(ss.id))}>{isOpen ? 'Close' : 'Review held rows'}</button>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </DataBoundary>
  );
}
