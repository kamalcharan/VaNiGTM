'use client';
/**
 * The tenant's own list, as one step: upload → confirm the mapping → land.
 *
 * Station 2 of G1 in the upload posture, and the whole of /agents/gtm/import.
 * The mapping is the human's: VaNi suggests a field per column, the person
 * corrects it, and that assignment is what staging obeys. A column can be the
 * company's or one of up to three people at the company (the ETL's qualified
 * keys — person.1.full_name and so on), so a directory with representatives
 * per row lands companies AND people in one pass.
 */
import { useRef, useState } from 'react';
import Link from 'next/link';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useHeaders, useLand, useUpload, type Uploaded } from '../useImport';
import { COMPANY_FIELDS, PERSON_FIELDS, type HeadersInfo, type LandingResult } from '../mock-data';
import s from '../audience.module.css';

/** Upload → confirm the mapping → land. The whole import, as one step. */
export function ImportBox({ onLanded }: { onLanded: () => void }) {
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
          <p className={s.why} style={{ marginTop: 8 }}><b>{file?.filename}</b>: {result.successful} landed · {result.duplicate} already here · {result.conflict} held for review · {result.failed} failed · {result.duration_ms} ms{result.conflict ? ' — held rows are under Past imports, below.' : ''} Landed rows are on the hot list above and under <Link href="/agents/gtm/companies">Companies</Link>.</p>
          <div className={s.actions} style={{ marginTop: 10 }}><button type="button" className={s.quiet} onClick={() => { setFile(null); setResult(null); }}>Add another list</button></div>
        </>
      ) : file && info ? (
        <>
          <p className={s.hint} style={{ marginTop: 8 }}>{info.filename} · {info.total_rows} rows · {info.headers.length} columns. VaNi's guess per column; change any that is wrong. A column mapped to nothing is kept on the record, not lost. Columns for a person (name, title, email, mobile) land them in People, attached to the company.</p>
          <div className={s.map}>
            {info.headers.map((h) => (
              <div key={h} style={{ display: 'contents' }}>
                <span className={s.mapA} title={String(info.sample_rows[0]?.[h] ?? '')}>{h}</span><span className={s.mapArr}>→</span>
                <select className={s.mapB} style={{ background: 'var(--bg2)', border: '1px solid var(--line2)', borderRadius: 6, padding: '3px 6px', font: 'inherit', fontSize: 12 }}
                  value={map[h] ?? ''} onChange={(e) => setMapping({ ...map, [h]: e.target.value })} disabled={isLanding}>
                  <option value="">— keep, do not map —</option>
                  <optgroup label="The company">{COMPANY_FIELDS.map((f) => <option key={f} value={`company.${f}`}>company.{f}</option>)}</optgroup>
                  {[1, 2, 3].map((slot) => <optgroup key={slot} label={`Person ${slot} at the company`}>{PERSON_FIELDS.map((f) => <option key={f} value={`person.${slot}.${f}`}>person.{slot}.{f}</option>)}</optgroup>)}
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

