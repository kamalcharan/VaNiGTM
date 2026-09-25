'use client';
/**
 * Station 2 — the hot list, and where it comes from.
 *
 * GTM proposes before the tenant brings anything: the hot list comes from
 * global data (the pool, or a source the platform connects). The tenant's own
 * list adds to it through the real ETL — upload, a mapping the human
 * confirms, land — and lands in gt_prospects, which is what the rows here
 * are read from. When nothing has been fed the screen says so and offers the
 * road that works; it never shows an empty hot list with a spinner (rule 12).
 */
import { useRef, useState } from 'react';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useAudienceWrites, useHotList } from '../useAudience';
import { useHeaders, useLand, useUpload, type Uploaded } from '../useImport';
import { COMPANY_FIELDS, type HeadersInfo, type HotList, type HotRow, type LandingResult } from '../mock-data';
import s from '../audience.module.css';
import { ImportsPanel } from './ImportsPanel';

function SourceChip({ src }: { src: HotList['sources'][number] }) {
  const cls = src.state === 'connected' ? (src.id === 'mine' ? s.chipMine : s.chipPool) : src.state === 'not_connected' && src.id === 'pool' ? s.chipBad : '';
  const text = src.state === 'connected' ? `${src.label} · ${src.rows} rows` : src.state === 'not_built' ? `${src.label} · not built` : `${src.label} · not yet fed`;
  return <span className={`${s.chip} ${cls}`}>{text}</span>;
}

export function RowCard({ r, children, onTick, on, off }: { r: HotRow; children?: React.ReactNode; onTick?: () => void; on?: boolean; off?: boolean }) {
  return (
    <div className={`${s.row} ${onTick ? '' : s.rowNoTick} ${on ? s.rowOn : ''} ${off ? s.rowOff : ''}`}>
      {onTick && <button type="button" className={s.tick} aria-pressed={!!on} onClick={onTick} disabled={!r.has_domain} title={r.has_domain ? undefined : 'No domain — cannot be researched'}>✓</button>}
      <div>
        <div className={s.name}>{r.name}<small>{r.ref}{r.city ? ` · ${r.city}` : ''}{r.size_label ? ` · ${r.size_label}` : ''}</small></div>
        <div className={s.why}>{r.why}</div>
        <div className={s.meta}>
          <span className={`${s.chip} ${r.source === 'pool' ? s.chipPool : s.chipMine}`}>{r.source_label}</span>
          {r.also_mine && <span className={`${s.chip} ${s.chipMine}`}>also on your list</span>}
          {r.fresh_label && <span>fresh · {r.fresh_label}</span>}
          {r.duplicate && <span className={`${s.chip} ${s.chipWarn}`}>possible duplicate</span>}
          {!r.has_domain && <span className={`${s.chip} ${s.chipWarn}`}>no domain</span>}
          {r.research_status && <span className={`${s.chip} ${s.chipPool}`}>research · {r.research_status}</span>}
        </div>
      </div>
      {children ?? <span />}
    </div>
  );
}

/** Upload → confirm the mapping → land. The whole import, as one step. */
function ImportBox({ onLanded }: { onLanded: () => void }) {
  const { upload, isUploading } = useUpload();
  const [file, setFile] = useState<Uploaded | null>(null);
  const [mapping, setMapping] = useState<Record<string, string> | null>(null);
  const [result, setResult] = useState<LandingResult | null>(null);
  const headers = useHeaders(file?.file_id ?? null);
  const { land, isLanding } = useLand();
  const inputRef = useRef<HTMLInputElement>(null);
  const info = headers.data?.data;
  const map = mapping ?? info?.suggested_mapping ?? {};

  async function pick(f: File | undefined) { if (!f) return; const u = await upload(f); if (u) { setFile(u); setMapping(null); setResult(null); } }

  return (
    <div className={s.up}>
      <div className={s.upHead}><b>Add your own list</b><span className={s.hint}>.xlsx / .xls / .csv — mapped before anything lands</span></div>
      {result ? (
        <>
          <p className={s.why} style={{ marginTop: 8 }}><b>{file?.filename}</b>: {result.successful} landed · {result.duplicate} already here · {result.conflict} held for review · {result.failed} failed · {result.duration_ms} ms{result.conflict ? ' — held rows are under Past imports, below.' : ''}</p>
          <div className={s.actions} style={{ marginTop: 10 }}><button type="button" className={s.quiet} onClick={() => { setFile(null); setResult(null); }}>Add another list</button></div>
        </>
      ) : file && info ? (
        <>
          <p className={s.hint} style={{ marginTop: 8 }}>{info.filename} · {info.total_rows} rows · {info.headers.length} columns. VaNi's guess per column; change any that is wrong. A column mapped to nothing is kept on the record, not lost.</p>
          <div className={s.map}>
            {info.headers.map((h) => (
              <div key={h} style={{ display: 'contents' }}>
                <span className={s.mapA} title={String(info.sample_rows[0]?.[h] ?? '')}>{h}</span><span className={s.mapArr}>→</span>
                <select className={s.mapB} style={{ background: 'var(--bg2)', border: '1px solid var(--line2)', borderRadius: 6, padding: '3px 6px', font: 'inherit', fontSize: 12 }}
                  value={map[h] ?? ''} onChange={(e) => setMapping({ ...map, [h]: e.target.value })} disabled={isLanding}>
                  <option value="">— keep, do not map —</option>
                  {COMPANY_FIELDS.map((f) => <option key={f} value={`company.${f}`}>company.{f}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div className={s.actions} style={{ marginTop: 12 }}>
            <button type="button" className={s.primary} disabled={isLanding || !Object.values(map).some((v) => v === 'company.name' || v === 'name')}
              onClick={async () => { const r = await land({ file_id: file.file_id, filename: file.filename, mapping: Object.fromEntries(Object.entries(map).filter(([, v]) => v)), extraction_plan: info.extraction_plan }); if (r) { setResult(r); onLanded(); } }}>
              {isLanding ? 'Landing…' : `Land ${info.total_rows} rows`}
            </button>
            <button type="button" className={s.quiet} onClick={() => setFile(null)} disabled={isLanding}>Cancel</button>
            {!Object.values(map).some((v) => v === 'company.name' || v === 'name') && <span className={s.hint}>Map one column to company.name first.</span>}
          </div>
        </>
      ) : file ? (
        <DataBoundary query={headers} label="the file's columns" skeleton={<SkeletonRows rows={2} />}>{(_d: HeadersInfo) => <span />}</DataBoundary>
      ) : (
        <div className={s.actions} style={{ marginTop: 10 }}>
          <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} onChange={(e) => void pick(e.target.files?.[0])} />
          <button type="button" className={s.quiet} onClick={() => inputRef.current?.click()} disabled={isUploading}>{isUploading ? 'Uploading…' : 'Choose a spreadsheet'}</button>
          <button type="button" className={s.quiet} disabled title="Not built — Settings → Data">Connect my Apollo / Clay</button>
          <span className={s.chip}>own provider · not built</span>
        </div>
      )}
    </div>
  );
}

export function BringStep() {
  const q = useHotList();
  const w = useAudienceWrites();
  return (
    <DataBoundary query={q} label="hot list" skeleton={<SkeletonRows rows={5} lines={2} />}>
      {(d: HotList) => {
        const fed = d.pool_state === 'fed';
        const mine = d.rows.filter((r) => r.source === 'mine').length;
        const importBox = <><ImportBox onLanded={() => void q.refetch()} /><ImportsPanel /></>;
        if (!d.rows.length) {
          return (
            <div className={s.card}>
              <div className={s.eyebrow}>// BUILD THE AUDIENCE · 1 OF 4</div>
              <h1 className={s.h}>I have no companies for you yet</h1>
              <p className={s.sub}>The hot list opens from our global data — and for your market it has never been fed. That is the truth today, so it is the screen today: bring a list, or connect a source.</p>
              <div className={s.chips}>{d.sources.map((src) => <SourceChip key={src.id} src={src} />)}</div>
              {importBox}
            </div>
          );
        }
        return (
          <div className={s.card}>
            <div className={s.eyebrow}>// BUILD THE AUDIENCE · 1 OF 4</div>
            <h1 className={s.h}>{fed ? `${d.rows.length} companies look like your buyer` : `${d.rows.length} companies from your list`}</h1>
            <p className={s.sub}>
              {fed ? 'From our global data, matched on your vocabulary and your buyer, with your own list merged in. Each row says where it came from and how fresh it is.' : 'From what you brought. Nothing from the pool — it has not been fed for your market.'}
              {mine && fed ? ' Where a company was already here, it is one row with both sources.' : ''}
            </p>
            <div className={s.chips}>{d.sources.map((src) => <SourceChip key={src.id} src={src} />)}</div>
            <div className={s.list}>{d.rows.map((r) => <RowCard key={r.id} r={r} />)}</div>
            {importBox}
            <div className={s.actions}>
              <button type="button" className={s.primary} onClick={() => void w.advance('find')} disabled={w.busy}>Pick who to research →</button>
            </div>
          </div>
        );
      }}
    </DataBoundary>
  );
}
