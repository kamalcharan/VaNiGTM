'use client';
/**
 * The import — the retired /import wizard, ported whole (2026-09-26).
 *
 * Five steps, as before: what is this data to you → upload → review what
 * VaNi found, say how current the delivery is and tag it, confirm the mapping
 * → processing → results with VaNi's reading of them. The reduced "upload →
 * mapping → land" box that stood in for this dropped the relationship, the
 * common-pool option, the detection findings, the delivery date, the tags,
 * the preview, the results and the staged-but-not-landed case. Charan,
 * 2026-09-26: "it is missing many things from retired items". All of it is
 * here now, on the console's stepper, inputs and hooks.
 *
 * Nothing is inferred that the person must declare (the relationship), and
 * nothing the detector found is hidden (its reasons are shown so a person can
 * disagree). A row the file has and the mapping does not name is KEPT as extra
 * data on the record — nothing from the file is discarded.
 */
import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { VdfInput, VdfWizard } from '@/platform/vdf';
import { useAuth } from '@/context/auth-provider';
import { IS_LIVE } from '@/lib/live-transport';
import { formatDate } from '@/lib/format';
import { COMPANY_TARGETS, PERSON_SLOTS, PERSON_TARGETS, type ExtractionPlan, type HeadersInfo, type LandingResult, type Relationship } from '../mock-data';
import { useCreateTag, useHeaders, useLand, useTags, useUpload, type LandOutcome, type Uploaded } from '../useImport';
import a from '../audience.module.css';
import s from '../import.module.css';

type Step = 'type' | 'upload' | 'mapping' | 'processing' | 'results';
const STEPS: { id: Step; label: string }[] = [
  { id: 'type', label: 'What is it' }, { id: 'upload', label: 'Upload' }, { id: 'mapping', label: 'Review' }, { id: 'processing', label: 'Landing' }, { id: 'results', label: 'Results' },
];

/**
 * The three uploads, by what the data MEANS to the tenant. Deliberately not
 * "people vs companies" — a file is commonly both, and which it is gets
 * detected from the columns rather than declared here.
 */
const RELATIONSHIPS: { id: Relationship; label: string; desc: string; icon: string; adminOnly: boolean }[] = [
  { id: 'contacts', label: 'My contacts', desc: 'People and companies you know but have not sold to yet', icon: '◯', adminOnly: false },
  { id: 'customers', label: 'My customers', desc: 'Who already buys from you — the ground truth for your ideal customer', icon: '◆', adminOnly: false },
  { id: 'dataset', label: 'Common pool dataset', desc: 'A directory delivery shared across tenants — FTCCI, federations, associations', icon: '⛁', adminOnly: true },
];

/** The detector's suggestions arrive unqualified (`name`, `job_title`); qualify them so the select can pre-pick, and so an untouched mapping goes up in the same shape as an edited one. */
function qualify(header: string, field: string, plan: ExtractionPlan | null | undefined): string {
  if (!field || field.includes('.')) return field;
  const owner = plan?.entities.find((e) => header in e.columns);
  return owner?.kind === 'person' ? `person.1.${field}` : `company.${field}`;
}

function Vani({ children }: { children: ReactNode }) {
  return <div className={s.vani}><span className={s.vaniMark} aria-hidden>✦</span><div>{children}</div></div>;
}

export interface ImportWizardProps {
  /** Start on a step 1 answer — the pool page passes 'dataset'. */
  relationship?: Relationship;
  /** Hide the relationship step's other choices (the pool page is one destination). */
  fixedRelationship?: boolean;
  onLanded?: (r: LandingResult) => void;
  /** Where "see them" points after landing. */
  landedHref?: string;
}

export function ImportWizard({ relationship: preset, fixedRelationship, onLanded, landedHref }: ImportWizardProps) {
  const { tenant } = useAuth();
  const isAdmin = !IS_LIVE || tenant?.is_admin === true;
  const [step, setStep] = useState<Step>(preset && fixedRelationship ? 'upload' : 'type');
  const [relationship, setRelationship] = useState<Relationship>(preset ?? 'contacts');
  const [file, setFile] = useState<Uploaded | null>(null);
  const [mapping, setMapping] = useState<Record<string, string> | null>(null);
  const [asOf, setAsOf] = useState('');
  const [region, setRegion] = useState('');
  const [sourceCode, setSourceCode] = useState('upload');
  const [tagIds, setTagIds] = useState<number[]>([]);
  const [newTag, setNewTag] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [outcome, setOutcome] = useState<LandOutcome | null>(null);

  const { upload, isUploading } = useUpload();
  const headers = useHeaders(file?.file_id ?? null);
  const tags = useTags(step === 'mapping' || step === 'upload');
  const { createTag, busy: tagBusy } = useCreateTag();
  const { land, isStaging, isLanding } = useLand();
  const inputRef = useRef<HTMLInputElement>(null);

  const info = headers.data?.data;
  const plan = info?.extraction_plan ?? null;
  const map = mapping ?? Object.fromEntries(Object.entries(info?.suggested_mapping ?? {}).map(([h, f]) => [h, qualify(h, f, plan)]));
  const hasName = Object.values(map).some((v) => v === 'company.name');
  const idx = STEPS.findIndex((x) => x.id === step);
  const done = new Set(STEPS.slice(0, idx).map((x) => x.id));

  function reset() {
    setStep(preset && fixedRelationship ? 'upload' : 'type'); setFile(null); setMapping(null); setAsOf(''); setRegion(''); setTagIds([]); setNewTag(''); setOutcome(null);
  }

  async function pick(f: File | undefined) {
    if (!f) return;
    const u = await upload(f);
    if (u) { setFile(u); setMapping(null); setStep('mapping'); }
  }
  function onDrop(e: DragEvent) { e.preventDefault(); setDragOver(false); void pick(e.dataTransfer.files?.[0]); }

  async function confirm() {
    if (!file || !info) return;
    setStep('processing');
    const r = await land({
      file_id: file.file_id, filename: file.filename, relationship,
      mapping: Object.fromEntries(Object.entries(map).filter(([, v]) => v)),
      extraction_plan: info.extraction_plan, tag_ids: tagIds, load_as_of: asOf || null,
      ...(relationship === 'dataset' ? { source_code: sourceCode.trim() || 'upload', load_region: region.trim() || null } : {}),
    });
    if (!r) { setStep('mapping'); return; }   // staging itself refused — the toast said why; nothing was written
    setOutcome(r);
    setStep('results');
    if (r.result) onLanded?.(r.result);
  }

  async function addTag() {
    const label = newTag.trim(); if (!label) return;
    // A platform tag is visible to every tenant, so only offer it for the shared pool; the server re-checks the JWT regardless.
    const r = await createTag(label, relationship === 'dataset' && isAdmin);
    if (r?.tag) { setTagIds((p) => (p.includes(r.tag!.id) ? p : [...p, r.tag!.id])); setNewTag(''); }
  }

  const rel = RELATIONSHIPS.find((r) => r.id === relationship)!;
  const where = relationship === 'dataset' ? 'the common pool' : relationship === 'customers' ? 'your customers' : 'your prospects';
  const seeHref = landedHref ?? (relationship === 'dataset' ? '/agents/gtm/pool' : '/agents/gtm/companies');

  return (
    <div className={s.wrap}>
      <div className={s.head}>
        <div className={s.stepper} style={{ flex: 1 }}><VdfWizard steps={STEPS} currentIndex={idx} completedSteps={done} /></div>
        {step !== 'type' && step !== 'results' && step !== 'processing' && <button type="button" className={s.cancel} onClick={reset}>Cancel</button>}
      </div>

      {step === 'type' && (
        <div className={`${s.step} ${s.wrap}`}>
          <Vani>Tell VaNi what this data is to you. Whether the file holds people, companies or both is worked out from the columns — you only confirm it.</Vani>
          <div className={s.types}>
            {RELATIONSHIPS.filter((r) => !r.adminOnly || isAdmin).map((r) => (
              <button key={r.id} type="button" className={s.type} aria-pressed={relationship === r.id} onClick={() => { setRelationship(r.id); setStep('upload'); }}>
                <span className={s.typeIcon} aria-hidden>{r.icon}</span>
                <span className={s.typeName}>{r.label}</span>
                <span className={s.typeDesc}>{r.desc}</span>
                {r.adminOnly && <span className={s.typeBadge}>Admin</span>}
              </button>
            ))}
          </div>
          {!isAdmin && <p className={a.hint}>A common-pool dataset — a directory shared across every tenant — can only be loaded by Vikuna&rsquo;s admin tenant.</p>}
        </div>
      )}

      {step === 'upload' && (
        <div className={`${s.step} ${s.wrap}`}>
          <Vani>Upload your <b>{rel.label}</b> file. Supports .xlsx, .xls and .csv, up to 10&nbsp;MB. The same file cannot be imported twice — identical bytes are not a delivery — but a refreshed file is, and its row-level clashes are settled in review.</Vani>
          <label className={`${s.drop} ${dragOver ? s.dropOn : ''} ${isUploading ? s.dropBusy : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }} onDragLeave={() => setDragOver(false)} onDrop={onDrop}>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" style={{ display: 'none' }} disabled={isUploading} onChange={(e) => void pick(e.target.files?.[0])} />
            {isUploading ? (
              <div className={s.dropIn}><div className={s.spin} /><span className={s.dropText}>Uploading and reading the columns…</span></div>
            ) : (
              <div className={s.dropIn}>
                <svg className={s.dropIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="44" height="44" aria-hidden><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
                <span className={s.dropText}>Drop your file here or <strong>browse</strong></span>
                <span className={s.dropHint}>.xlsx · .xls · .csv · max 10 MB</span>
              </div>
            )}
          </label>
          {!fixedRelationship && <div className={s.actions}><button type="button" className={a.quiet} onClick={() => setStep('type')}>Back</button></div>}
        </div>
      )}

      {step === 'mapping' && file && (
        <div className={`${s.step} ${s.wrap}`}>
          {!info ? (
            headers.isError ? <Vani><b>Could not read the columns.</b> {headers.error?.message}</Vani> : <Vani>Reading the columns of {file.filename}…</Vani>
          ) : (
            <>
              <Vani>Detected <b>{info.total_rows.toLocaleString()} rows</b> with <b>{info.headers.length} columns</b> in {info.filename}. VaNi&rsquo;s guess per column is applied below — review and confirm.</Vani>

              {plan && (
                <section className={s.section}>
                  <h3 className={s.sectionTitle}>What VaNi found in this file</h3>
                  <p className={s.sectionDesc}>{plan.entities.length === 0 ? 'Nothing recognisable yet — map the columns below before importing.' : 'Confirm this is right. One file often carries both companies and the people at them.'}</p>
                  {plan.entities.length > 0 && (
                    <div className={s.found}>
                      {plan.entities.map((e) => (
                        <div key={e.kind} className={s.foundCard}>
                          <div className={s.foundKind}>{e.kind === 'company' ? 'Companies' : 'People'} · {(info.row_estimates?.[e.kind] ?? info.total_rows).toLocaleString()}</div>
                          <div className={s.foundWhy}>{e.reasons.join(' ')}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {plan.entities.length === 0 && <div className={s.noteBox}>No column identified either a company or a person. Nothing will be imported until the columns below are mapped by hand.</div>}
                  {plan.notes.map((n, i) => <div key={i} className={s.noteBox}>{n}</div>)}
                  {plan.unresolved_columns.length > 0 && (
                    <div className={s.noteBox}><b>VaNi could not guess {plan.unresolved_columns.length} column{plan.unresolved_columns.length === 1 ? '' : 's'}</b> — {plan.unresolved_columns.map((u) => u.header).join(', ')}. Assign them below if they matter; a directory&rsquo;s three representative columns usually live here. Anything you leave unassigned is still <b>kept as extra data</b> on the record — nothing from your file is discarded.</div>
                  )}
                </section>
              )}

              <section className={s.section}>
                <h3 className={s.sectionTitle}>About this delivery</h3>
                <p className={s.sectionDesc}>How current is this data, and what should it be grouped under? Freshness is a scored quality component — an undated load is treated as older, not as current.</p>
                <div className={s.fields}>
                  <VdfInput label="Data is current as of" type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} hint="Leave blank if unknown — it will be scored as less fresh." />
                  {relationship === 'dataset' && (
                    <>
                      <VdfInput label="Covers (region)" value={region} onChange={(e) => setRegion(e.target.value)} placeholder="Telangana" hint="Shown as provenance on every row." />
                      <VdfInput label="Publisher code" value={sourceCode} onChange={(e) => setSourceCode(e.target.value)} placeholder="upload" hint="A registered gt_data_sources code — ftcci, or upload." />
                    </>
                  )}
                </div>
                {(tags.data?.data?.tags?.length ?? 0) > 0 && (
                  <div className={s.tagRow}>
                    {tags.data!.data!.tags.map((t) => (
                      <label key={t.id} className={s.tag}>
                        <input type="checkbox" checked={tagIds.includes(t.id)} onChange={() => setTagIds((p) => (p.includes(t.id) ? p.filter((x) => x !== t.id) : [...p, t.id]))} />
                        {t.label}{t.is_platform && <small>shared</small>}
                      </label>
                    ))}
                  </div>
                )}
                {tags.isError && <p className={a.hint}>Could not load tags — you can still import without them. {tags.error?.message}</p>}
                <div className={s.addTag}>
                  <VdfInput label="Add a tag" value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="FTCCI Telangana" onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); void addTag(); } }} />
                  <button type="button" className={a.quiet} onClick={() => void addTag()} disabled={!newTag.trim() || tagBusy}>{tagBusy ? 'Adding…' : 'Add'}</button>
                </div>
              </section>

              <div className={s.map}>
                <div className={s.mapHead}><span>Column in the file</span><span /><span>Maps to</span><span>Sample value</span></div>
                {info.headers.map((h) => {
                  const target = map[h] ?? '';
                  const sample = info.sample_rows[0]?.[h];
                  const sampleStr = sample == null || sample === '' ? '—' : String(sample);
                  return (
                    <div key={h} className={s.mapRow}>
                      <span className={s.mapSrc}>{h}</span>
                      <span className={s.mapArr}>{target ? '→' : '·'}</span>
                      <select className={`${s.mapSel} ${target ? s.mapSelOn : ''}`} value={target} onChange={(e) => setMapping({ ...map, [h]: e.target.value })} disabled={isStaging || isLanding} aria-label={`Field for ${h}`}>
                        <option value="">Keep as extra data (not imported into a field)</option>
                        <optgroup label="The company">{COMPANY_TARGETS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</optgroup>
                        {PERSON_SLOTS.map((slot) => <optgroup key={slot} label={`Person ${slot} at the company`}>{PERSON_TARGETS.map(([f, l]) => <option key={f} value={`person.${slot}.${f}`}>{l}</option>)}</optgroup>)}
                      </select>
                      <span className={s.mapSample} title={sampleStr}>{sampleStr.length > 40 ? `${sampleStr.slice(0, 40)}…` : sampleStr}</span>
                    </div>
                  );
                })}
              </div>

              <details className={s.preview}>
                <summary>Preview the first {Math.min(5, info.sample_rows.length)} rows</summary>
                <div className={s.previewTable}>
                  <table><thead><tr>{info.headers.map((h) => <th key={h}>{h}</th>)}</tr></thead>
                    <tbody>{info.sample_rows.slice(0, 5).map((row, i) => <tr key={i}>{info.headers.map((h) => <td key={h}>{row[h] == null ? '' : String(row[h]).slice(0, 30)}</td>)}</tr>)}</tbody></table>
                </div>
              </details>

              <div className={s.actions}>
                <button type="button" className={a.quiet} onClick={() => { setFile(null); setStep('upload'); }} disabled={isStaging || isLanding}>Back</button>
                <button type="button" className={a.primary} onClick={() => void confirm()} disabled={isStaging || isLanding || !hasName}>
                  {isStaging ? 'Staging…' : `Confirm and land ${info.total_rows.toLocaleString()} rows →`}
                </button>
                {!hasName && <span className={a.hint}>Map one column to Company name first.</span>}
              </div>
            </>
          )}
        </div>
      )}

      {step === 'processing' && (
        <div className={`${s.step} ${s.proc}`}>
          <div className={s.spin} />
          <h3 className={s.procTitle}>VaNi is landing your import</h3>
          <p className={s.procDesc}>{isStaging ? `Staging ${info?.total_rows.toLocaleString() ?? ''} rows…` : 'Rows staged. Landing each one, holding any that would change a record you already hold.'}</p>
          <div className={s.procBar}><div className={s.procFill} /></div>
        </div>
      )}

      {step === 'results' && outcome && (() => {
        const r = outcome.result;
        const stagedOnly = !r;
        const warn = stagedOnly || (r && (r.failed > 0 || r.conflict > 0));
        const insights: string[] = [];
        if (stagedOnly) insights.push(`Your ${outcome.session.total_records.toLocaleString()} rows are staged and nothing is lost. Landing them failed: ${outcome.landing_error}. Open Imports and land the staged rows once the cause is fixed.`);
        else {
          if (r.landed?.companies) insights.push(`${r.landed.companies.toLocaleString()} ${r.landed.companies === 1 ? 'company' : 'companies'} added to ${where}.`);
          if (r.landed?.people) insights.push(`${r.landed.people.toLocaleString()} ${r.landed.people === 1 ? 'person' : 'people'} added, with ${r.landed.channels.toLocaleString()} email and phone channels.`);
          if (r.duplicate) insights.push(`${r.duplicate.toLocaleString()} ${r.duplicate === 1 ? 'row' : 'rows'} said nothing new — already held, so skipped.`);
          if (r.conflict) insights.push(`${r.conflict.toLocaleString()} ${r.conflict === 1 ? 'row' : 'rows'} would change something you already hold. Nothing was overwritten — decide under Imports.`);
          if (r.campaign_locked) insights.push(`${r.campaign_locked} of those belong to contacts in a running campaign, so they need an explicit decision rather than a bulk accept.`);
          if (r.failed) insights.push(`${r.failed} ${r.failed === 1 ? 'row' : 'rows'} could not be imported — open them under Imports to see why.`);
          if (r.duration_ms) insights.push(`Processed ${r.processed.toLocaleString()} rows in ${(r.duration_ms / 1000).toFixed(1)}s.`);
          if (asOf) insights.push(`Scored as current as of ${formatDate(asOf)}.`);
        }
        return (
          <div className={`${s.step} ${s.wrap}`}>
            <div className={`${s.banner} ${warn ? s.bannerWarn : s.bannerOk}`}>
              <span className={s.bannerIcon} aria-hidden>{stagedOnly ? '⏸' : warn ? '⚠' : '✓'}</span>
              <div>
                <div className={s.bannerTitle}>{stagedOnly ? 'Staged, not yet imported' : r.conflict ? 'Imported — some rows need your call' : r.failed ? 'Completed with errors' : 'Import successful'}</div>
                <div className={s.bannerDesc}>{stagedOnly ? `${outcome.session.total_records.toLocaleString()} rows from ${file?.filename} are staged and safe. Nothing has been written yet.` : `${r.processed.toLocaleString()} rows processed from ${file?.filename}${r.landed ? ` — ${r.landed.companies.toLocaleString()} companies, ${r.landed.people.toLocaleString()} people.` : '.'}`}</div>
              </div>
            </div>
            {r && (
              <div className={s.stats}>
                <div className={s.stat}><div className={s.statK}>Processed</div><div className={s.statV}>{r.processed.toLocaleString()}</div></div>
                <div className={`${s.stat} ${s.statOk}`}><div className={s.statK}>New records</div><div className={s.statV}>{r.successful.toLocaleString()}</div></div>
                <div className={`${s.stat} ${s.statInfo}`}><div className={s.statK}>Already held</div><div className={s.statV}>{r.duplicate.toLocaleString()}</div></div>
                {r.conflict > 0 && <div className={`${s.stat} ${s.statWarn}`}><div className={s.statK}>Need your call</div><div className={s.statV}>{r.conflict.toLocaleString()}</div></div>}
                {r.failed > 0 && <div className={`${s.stat} ${s.statBad}`}><div className={s.statK}>Failed</div><div className={s.statV}>{r.failed.toLocaleString()}</div></div>}
              </div>
            )}
            <div className={s.insights}><b>VaNi&rsquo;s reading</b><ul>{insights.map((t, i) => <li key={i}>{t}</li>)}</ul></div>
            <div className={s.actions}>
              <button type="button" className={a.quiet} onClick={reset}>Import another file</button>
              <Link href={`/agents/gtm/imports?session=${encodeURIComponent(String(outcome.session.session_id))}`} className={a.primary} style={{ textDecoration: 'none' }}>Open in Imports →</Link>
              {r && r.successful > 0 && <Link href={seeHref}>See the landed rows →</Link>}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
