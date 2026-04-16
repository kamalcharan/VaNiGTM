'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { Database, Users, ArrowLeftRight, Bookmark } from 'lucide-react';
import { apiFetch, getAccessToken } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfInsightsCard, VdfStatCard, VdfPageHeader } from '@/components/vdf';
import { useAuth } from '@/context/auth-provider';
import s from './import-page.module.css';

/* ── Types ─────────────────────────────────────────── */

type ImportType = 'scheme' | 'customer' | 'transaction' | 'bookmark';
type Step = 'type' | 'upload' | 'mapping' | 'processing' | 'results';

interface FileInfo {
  file_id: number;
  filename: string;
  size: number;
}

interface HeaderInfo {
  headers: string[];
  sample_rows: Record<string, any>[];
  total_rows: number;
  suggested_mapping: Record<string, string>;
}

interface SessionInfo {
  session_id: number;
  status: string;
  total_records: number;
}

interface ProcessResult {
  session_id: number;
  status: string;
  processed: number;
  successful: number;
  failed: number;
  duplicate: number;
  orphans: number;
  duration_ms: number;
}

/* ── Import type cards ─────────────────────────────── */

const IMPORT_TYPES: { id: ImportType; label: string; desc: string; icon: ReactNode; enabled: boolean }[] = [
  { id: 'scheme',      label: 'Scheme Master', desc: 'AMFI scheme database — codes, ISINs, categories, NAV names',   icon: <Database size={22} />,       enabled: true  },
  { id: 'customer',    label: 'Customers',     desc: 'Client contacts — externalid, PAN, mobile, email, addresses',  icon: <Users size={22} />,          enabled: true  },
  { id: 'transaction', label: 'Transactions',  desc: 'Purchases, redemptions, SIPs, switches, dividends',            icon: <ArrowLeftRight size={22} />, enabled: true  },
  { id: 'bookmark',    label: 'Bookmarks',     desc: 'Tracked scheme codes and ISINs — bulk add to My NAV',          icon: <Bookmark size={22} />,       enabled: true  },
];

/* ── Main Component ────────────────────────────────── */

export default function ImportPage() {
  const { showToast } = useToast();
  const { isAdmin, tenant } = useAuth();

  const [step, setStep] = useState<Step>('type');
  // Default to 'scheme' for admins, 'bookmark' for non-admins
  const [importType, setImportType] = useState<ImportType>(() => isAdmin ? 'scheme' : 'bookmark');
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [headerInfo, setHeaderInfo] = useState<HeaderInfo | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mappingAnimated, setMappingAnimated] = useState(false);
  const [lookupMethod, setLookupMethod] = useState<'iwell_code' | 'customer_name' | 'both'>('iwell_code');

  /* ── Step 1: Type Selection ──────────────────────── */

  function handleTypeSelect(type: ImportType) {
    setImportType(type);
    setStep('upload');
  }

  /* ── Step 2: File Upload ─────────────────────────── */

  async function handleFileUpload(file: File) {
    if (loading) return; // Prevent concurrent uploads
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('import_type', importType);

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
      const token = getAccessToken();
      const reqHeaders: Record<string, string> = {};
      if (token) reqHeaders['Authorization'] = `Bearer ${token}`;

      const res = await fetch(`${baseUrl}/api/v1/etl/upload`, {
        method: 'POST',
        headers: reqHeaders,
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'Upload failed');
      }

      const data = await res.json();
      setFileInfo(data);

      // Auto-detect headers
      const headers = await apiFetch<HeaderInfo>(API.etl.headers, {
        pathParams: { fileId: String(data.file_id) },
      });
      setHeaderInfo(headers);
      setMapping(headers.suggested_mapping || {});

      // Animate into mapping step
      setStep('mapping');
      setTimeout(() => setMappingAnimated(true), 100);
    } catch (err: any) {
      showToast({ message: err.message || 'Upload failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFileUpload(file);
  }

  function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) handleFileUpload(file);
  }

  /* ── Step 3: Confirm Mapping ─────────────────────── */

  async function handleConfirmMapping() {
    if (!fileInfo || loading) return; // Prevent double-submit
    setLoading(true);
    try {
      if (importType === 'bookmark') {
        // Bookmark import: reuses existing bulk upsert + alias seed in nav.routes.ts.
        // No ETL staging/session needed — direct bulk insert.
        setSessionInfo({ session_id: 0, status: 'processing', total_records: headerInfo?.total_rows || 0 });
        setStep('processing');
        const processResult = await apiFetch<ProcessResult>(API.nav.bookmarkImport, {
          body: { file_id: fileInfo.file_id, field_mappings: mapping },
        });
        setResult(processResult);
        setStep('results');
      } else {
        // Standard ETL pipeline (scheme master, customer, transaction)
        const session = await apiFetch<SessionInfo>(API.etl.createSession, {
          body: {
            file_id: fileInfo.file_id,
            import_type: importType,
            field_mappings: mapping,
            ...(importType === 'transaction' ? { customer_lookup_method: lookupMethod } : {}),
          },
        });
        setSessionInfo(session);
        setStep('processing');

        // Immediately trigger processing
        const processResult = await apiFetch<ProcessResult>(API.etl.process, {
          pathParams: { id: String(session.session_id) },
        });
        setResult(processResult);
        setStep('results');
      }
    } catch (err: any) {
      showToast({ message: err.message || 'Processing failed', type: 'error' });
      setStep('mapping');
    } finally {
      setLoading(false);
    }
  }

  /* ── Step navigation ─────────────────────────────── */

  const STEPS: { id: Step; label: string; num: number }[] = [
    { id: 'type', label: 'Select Type', num: 1 },
    { id: 'upload', label: 'Upload File', num: 2 },
    { id: 'mapping', label: 'Review Mapping', num: 3 },
    { id: 'processing', label: 'Processing', num: 4 },
    { id: 'results', label: 'Results', num: 5 },
  ];

  const currentStepIndex = STEPS.findIndex((st) => st.id === step);

  function handleReset() {
    setStep('type');
    setFileInfo(null);
    setHeaderInfo(null);
    setMapping({});
    setSessionInfo(null);
    setResult(null);
    setMappingAnimated(false);
    setLookupMethod('iwell_code');
  }

  /* ── VaNi insights for results ───────────────────── */

  function getVaniInsights(): string[] {
    if (!result || !headerInfo) return [];
    const insights: string[] = [];

    if (importType === 'bookmark') {
      if (result.successful > 0) {
        insights.push(`${result.successful.toLocaleString()} scheme${result.successful !== 1 ? 's' : ''} added to My NAV.`);
      }
      if (result.duplicate > 0) {
        insights.push(`${result.duplicate.toLocaleString()} scheme${result.duplicate !== 1 ? 's were' : ' was'} already in My NAV — skipped.`);
      }
      if (result.failed > 0) {
        insights.push(`${result.failed} row${result.failed !== 1 ? 's' : ''} could not be matched to a scheme — check codes/ISINs.`);
      }
      if (result.successful > 0) {
        insights.push('Aliases auto-seeded — your imported schemes are now matchable by name during future imports.');
        insights.push('Go to My NAV to download NAV data and calculate metrics for your new bookmarks.');
      }

    } else if (importType === 'transaction') {
      if (result.successful > 0) {
        insights.push(`${result.successful.toLocaleString()} transaction${result.successful !== 1 ? 's' : ''} imported successfully.`);
      }
      if (result.duplicate > 0) {
        insights.push(`${result.duplicate.toLocaleString()} duplicate${result.duplicate !== 1 ? 's' : ''} skipped — already present in the transaction ledger.`);
      }
      if (result.failed > 0) {
        insights.push(`${result.failed} row${result.failed !== 1 ? 's' : ''} failed — check error details in the import dashboard. Common causes: unknown scheme name, invalid transaction type code.`);
      }
      if (result.orphans > 0) {
        const platformLabel = tenant?.ext_ref_type_code
          ? { CAMS: 'CAMS Code', KFINTECH: 'KFintech Code', IWELL: 'IWell Code', BSE_STAR: 'BSE StarMF Code', CUSTOM: 'Custom Code' }[tenant.ext_ref_type_code] ?? 'vendor code'
          : 'vendor code';
        insights.push(`${result.orphans} row${result.orphans !== 1 ? 's' : ''} could not be matched to a client — no ${platformLabel}, PAN, or name match. Set the ${platformLabel} on the client's Vendor Code tab, then reprocess from the import dashboard.`);
      }
      if (result.successful > 0) {
        insights.push('Portfolio holdings have been updated. New scheme appearances generated Pulse alerts for your review.');
        insights.push('Go to any client\'s Transactions tab to verify the imported data.');
      }
      if (result.duration_ms) {
        insights.push(`Processed ${result.processed.toLocaleString()} rows in ${(result.duration_ms / 1000).toFixed(1)}s via PostgreSQL RPC.`);
      }

    } else if (importType === 'customer') {
      if (result.successful > 0 && result.failed === 0) {
        insights.push(`All ${result.successful.toLocaleString()} clients imported successfully.`);
      } else if (result.successful > 0) {
        insights.push(`${result.successful.toLocaleString()} client${result.successful !== 1 ? 's' : ''} imported successfully.`);
      }
      if (result.duplicate > 0) {
        insights.push(`${result.duplicate.toLocaleString()} client${result.duplicate !== 1 ? 's were' : ' was'} already in the system (matched by externalid) — skipped.`);
      }
      if (result.failed > 0) {
        insights.push(`${result.failed} row${result.failed !== 1 ? 's' : ''} failed — check error details below. Common causes: missing name, invalid date format.`);
      }
      if (result.successful > 0) {
        insights.push('Family linkages are stored as raw references. Run "Resolve Families" from the import dashboard to group family members together.');
        insights.push('Go to Contacts to view your imported clients.');
      }
      if (result.duration_ms) {
        insights.push(`Processed ${result.processed.toLocaleString()} rows in ${(result.duration_ms / 1000).toFixed(1)}s via PostgreSQL RPC.`);
      }

    } else {
      // scheme / generic
      if (result.successful > 0 && result.failed === 0) {
        insights.push(`All ${result.successful.toLocaleString()} records processed successfully.`);
      }
      if (result.duplicate > 0) {
        insights.push(`${result.duplicate.toLocaleString()} existing records updated with latest data.`);
      }
      if (result.failed > 0) {
        insights.push(`${result.failed} records failed — check error details below.`);
      }
      const newRecords = result.successful - result.duplicate;
      if (newRecords > 0) insights.push(`${newRecords.toLocaleString()} new records added to the database.`);
      if (result.duration_ms) {
        insights.push(`Processed ${result.processed.toLocaleString()} rows in ${(result.duration_ms / 1000).toFixed(1)}s via PostgreSQL RPC.`);
      }
    }

    return insights;
  }

  /* ── Render ──────────────────────────────────────── */

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="DATA IMPORT"
        title="Import Data"
        actions={step !== 'type' && step !== 'results' ? (
          <button className={s.cancelBtn} onClick={handleReset}>Cancel</button>
        ) : undefined}
      />

      <div className={s.body}>

      {/* Step progress */}
      <div className={s.stepper}>
        {STEPS.map((st, i) => (
          <div key={st.id} className={`${s.stepItem} ${i <= currentStepIndex ? s.stepDone : ''} ${i === currentStepIndex ? s.stepActive : ''}`}>
            <div className={s.stepDot}>
              {i < currentStepIndex ? '\u2713' : st.num}
            </div>
            <span className={s.stepLabel}>{st.label}</span>
            {i < STEPS.length - 1 && <div className={s.stepLine} />}
          </div>
        ))}
      </div>

      {/* ── STEP 1: Type Selection ──────────────────── */}
      {step === 'type' && (
        <div className={s.stepContent}>
          <div style={{ marginBottom: 24 }}>
            <VdfInsightsCard insights={[{ icon: '✨', text: 'Choose the data type you want to import. Scheme Master is the foundation — import it first.' }]} />
          </div>
          <div className={s.typeGrid}>
            {IMPORT_TYPES.filter((t) => t.id !== 'scheme' || isAdmin).map((t) => (
              <button
                key={t.id}
                className={`${s.typeCard} ${!t.enabled ? s.typeDisabled : ''}`}
                onClick={() => t.enabled && handleTypeSelect(t.id)}
                disabled={!t.enabled}
              >
                <span className={s.typeIcon}>{t.icon}</span>
                <span className={s.typeName}>{t.label}</span>
                <span className={s.typeDesc}>{t.desc}</span>
                {!t.enabled && <span className={s.typeBadge}>Coming soon</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: Upload ──────────────────────────── */}
      {step === 'upload' && (
        <div className={s.stepContent}>
          <div style={{ marginBottom: 24 }}>
            <VdfInsightsCard insights={[{ icon: '📁', text: `Upload your ${IMPORT_TYPES.find((t) => t.id === importType)?.label || ''} file. Supports .xlsx, .xls, and .csv (max 10MB).` }]} />
          </div>
          <label
            className={`${s.dropZone} ${dragOver ? s.dropZoneActive : ''} ${loading ? s.dropZoneLoading : ''}`}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={handleDrop}
          >
            <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileInput} className={s.fileInput} disabled={loading} />
            {loading ? (
              <div className={s.dropContent}>
                <div className={s.spinner} />
                <span className={s.dropText}>Uploading & analyzing...</span>
              </div>
            ) : (
              <div className={s.dropContent}>
                <svg className={s.dropIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
                  <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
                  <polyline points="17 8 12 3 7 8" />
                  <line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className={s.dropText}>Drop your file here or <strong>browse</strong></span>
                <span className={s.dropHint}>.xlsx, .xls, .csv \u2022 Max 10MB</span>
              </div>
            )}
          </label>
        </div>
      )}

      {/* ── STEP 3: Mapping Review ──────────────────── */}
      {step === 'mapping' && headerInfo && (
        <div className={s.stepContent}>
          <div style={{ marginBottom: 24 }}>
            <VdfInsightsCard insights={[{ icon: '🧠', text: `Detected ${headerInfo.total_rows.toLocaleString()} rows with ${headerInfo.headers.length} columns. Field mapping auto-applied — review and confirm.` }]} />
          </div>

          {/* P3b: Transaction import — show which platform column maps to vendor_code */}
          {importType === 'transaction' && tenant?.ext_ref_type_code && (
            <div className={s.platformHint}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                <strong>Platform:</strong>{' '}
                {{ CAMS: 'CAMS', KFINTECH: 'KFintech', IWELL: 'InvestWell', BSE_STAR: 'BSE StarMF', CUSTOM: 'Custom' }[tenant.ext_ref_type_code] ?? tenant.ext_ref_type_code}
                {' '}— your client code column (e.g.{' '}
                {{ CAMS: '"CAMS CODE"', KFINTECH: '"KFINTECH CODE"', IWELL: '"IWELL CODE"', BSE_STAR: '"BSE CODE"', CUSTOM: '"CLIENT CODE"' }[tenant.ext_ref_type_code] ?? '"CLIENT CODE"'}
                ) maps to <code>vendor_code</code> and is used as the primary client identifier during import.
              </span>
            </div>
          )}

          {/* Customer Lookup Method — transaction imports only */}
          {importType === 'transaction' && (() => {
            const vendorLabel = tenant?.ext_ref_type_code
              ? ({ CAMS: 'CAMS Code', KFINTECH: 'KFintech Code', IWELL: 'InvestWell Code', BSE_STAR: 'BSE StarMF Code', CUSTOM: 'Client Code' } as Record<string, string>)[tenant.ext_ref_type_code] ?? 'Client Code'
              : 'Client Code';
            const opts: { value: 'iwell_code' | 'customer_name' | 'both'; label: string; desc: string }[] = [
              { value: 'iwell_code',     label: `${vendorLabel} Only`,          desc: `Match using ${vendorLabel} from the CSV — fastest, most precise` },
              { value: 'customer_name', label: 'Customer Name',                desc: 'Match by name; use PAN as tiebreaker for duplicates' },
              { value: 'both',          label: `${vendorLabel} + Name Fallback`, desc: `Try ${vendorLabel} first, fall back to name if not found` },
            ];
            return (
              <div className={s.lookupSection}>
                <div className={s.lookupTitle}>Customer Lookup Method</div>
                <div className={s.lookupDesc}>Choose how transaction records are matched to customers</div>
                <div className={s.lookupGrid}>
                  {opts.map((opt) => (
                    <button
                      key={opt.value}
                      className={`${s.lookupOption} ${lookupMethod === opt.value ? s.lookupOptionSelected : ''}`}
                      onClick={() => setLookupMethod(opt.value)}
                    >
                      {lookupMethod === opt.value && <span className={s.lookupOptionCheck}>✓</span>}
                      <span className={s.lookupOptionLabel}>{opt.label}</span>
                      <span className={s.lookupOptionDesc}>{opt.desc}</span>
                    </button>
                  ))}
                </div>
                {lookupMethod === 'customer_name' && (
                  <div className={s.lookupNote}>
                    Name matching requires an exact match after removing salutations (Mr, Mrs, Dr, etc.).
                    If multiple customers share the same name, PAN is used as a tiebreaker.
                    Records without PAN will fail if duplicates are found.
                  </div>
                )}
              </div>
            );
          })()}

          {/* Mapping table */}
          <div className={s.mappingCard}>
            <div className={s.mappingHeader}>
              <span>Excel Column</span>
              <span />
              <span>Maps To</span>
              <span>Sample Value</span>
            </div>
            {headerInfo.headers.map((header, i) => {
              const target = mapping[header] || '';
              const sample = headerInfo.sample_rows[0]?.[header];
              const sampleStr = sample instanceof Date
                ? sample.toLocaleDateString()
                : sample !== undefined && sample !== null ? String(sample) : '\u2014';

              // P3b: annotate the vendor_code field with the tenant's platform label
              const isPlatformKey = importType === 'transaction' && target === 'vendor_code';
              const platformLabel = isPlatformKey && tenant?.ext_ref_type_code
                ? ({ CAMS: 'CAMS Code', KFINTECH: 'KFintech Code', IWELL: 'IWell Code', BSE_STAR: 'BSE StarMF Code', CUSTOM: 'Custom Code' } as Record<string, string>)[tenant.ext_ref_type_code]
                : null;

              return (
                <div
                  key={header}
                  className={`${s.mappingRow} ${mappingAnimated ? s.mappingRowVisible : ''}`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className={s.mappingSource}>{header}</span>
                  <span className={s.mappingArrow}>{target ? '\u2192' : '\u00B7'}</span>
                  <span className={`${s.mappingTarget} ${target ? s.mappingMapped : s.mappingUnmapped}`}>
                    {target || 'unmapped'}
                    {platformLabel && <span className={s.mappingPlatformTag}>{platformLabel}</span>}
                  </span>
                  <span className={s.mappingSample}>{sampleStr.length > 40 ? sampleStr.slice(0, 40) + '...' : sampleStr}</span>
                </div>
              );
            })}
          </div>

          {/* Preview rows */}
          <details className={s.previewDetails}>
            <summary className={s.previewSummary}>Preview first {Math.min(5, headerInfo.sample_rows.length)} rows</summary>
            <div className={s.previewTable}>
              <table>
                <thead>
                  <tr>
                    {headerInfo.headers.map((h) => <th key={h}>{h}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {headerInfo.sample_rows.slice(0, 5).map((row, i) => (
                    <tr key={i}>
                      {headerInfo.headers.map((h) => (
                        <td key={h}>{row[h] !== undefined && row[h] !== null ? String(row[h]).slice(0, 30) : ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>

          <div className={s.actions}>
            <button className={s.backBtn} onClick={() => setStep('upload')}>Back</button>
            <button className={s.confirmBtn} onClick={handleConfirmMapping} disabled={loading}>
              {loading ? 'Staging...' : `Confirm & Process ${headerInfo.total_rows.toLocaleString()} rows \u2192`}
            </button>
          </div>
        </div>
      )}

      {/* ── STEP 4: Processing ──────────────────────── */}
      {step === 'processing' && (
        <div className={s.stepContent}>
          <div className={s.processingCard}>
            <div className={s.processingSpinner} />
            <h2 className={s.processingTitle}>Processing via PostgreSQL RPC</h2>
            <p className={s.processingDesc}>
              {sessionInfo?.total_records.toLocaleString()} rows staged. Running{' '}
              <code>
                {importType === 'transaction' ? 'ki_process_txn_import_session()'
                  : importType === 'customer' ? 'process_customer_import_with_timing()'
                  : 'process_scheme_import_with_timing()'}
              </code>...
            </p>
            <div className={s.processingBar}>
              <div className={s.processingFill} />
            </div>
          </div>
        </div>
      )}

      {/* ── STEP 5: Results ─────────────────────────── */}
      {step === 'results' && result && (
        <div className={s.stepContent}>
          {/* Status banner */}
          <div className={`${s.resultBanner} ${result.failed > 0 ? s.resultBannerWarn : s.resultBannerOk}`}>
            <span className={s.resultBannerIcon}>
              {result.failed > 0 ? '\u26A0\uFE0F' : '\u2705'}
            </span>
            <div>
              <div className={s.resultBannerTitle}>
                {result.failed > 0 ? 'Completed with errors' : 'Import successful'}
              </div>
              <div className={s.resultBannerDesc}>
                {result.processed.toLocaleString()} records processed from {fileInfo?.filename}
              </div>
            </div>
          </div>

          {/* Stats cards */}
          <div className={s.resultStats}>
            <VdfStatCard value={result.processed} label="Total Processed" />
            <VdfStatCard value={result.successful} label={importType === 'transaction' ? 'Imported' : 'New Records'} accent="success" />
            <VdfStatCard value={result.duplicate} label="Duplicates Skipped" accent="info" />
            {result.orphans > 0 && (
              <VdfStatCard value={result.orphans} label="Unmatched (Orphan)" accent="warning" />
            )}
            {result.failed > 0 && (
              <VdfStatCard value={result.failed} label="Failed" accent="danger" />
            )}
          </div>

          {/* VaNi insights */}
          <div style={{ marginBottom: 24 }}>
            <VdfInsightsCard
              title="VaNi Insights"
              insights={getVaniInsights().map(text => ({ icon: '•', text }))}
            />
          </div>

          {/* Actions */}
          <div className={s.actions}>
            <button className={s.backBtn} onClick={handleReset}>Import Another File</button>
            <button className={s.confirmBtn} onClick={() => window.location.href = '/import-dashboard'}>
              View Import Dashboard \u2192
            </button>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
