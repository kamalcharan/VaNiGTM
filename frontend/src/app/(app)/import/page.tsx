'use client';

import { useState, useCallback } from 'react';
import { apiFetch, getAccessToken } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
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
  duration_ms: number;
}

/* ── Import type cards ─────────────────────────────── */

const IMPORT_TYPES: { id: ImportType; label: string; desc: string; icon: string; enabled: boolean }[] = [
  { id: 'scheme', label: 'Scheme Master', desc: 'AMFI scheme database — codes, ISINs, categories, NAV names', icon: '\u{1F4CA}', enabled: true },
  { id: 'customer', label: 'Customers', desc: 'Client contacts — PAN, mobile, email, addresses', icon: '\u{1F465}', enabled: false },
  { id: 'transaction', label: 'Transactions', desc: 'Purchases, redemptions, SIPs, switches, dividends', icon: '\u{1F4C4}', enabled: false },
  { id: 'bookmark', label: 'Bookmarks', desc: 'Tracked scheme codes and ISINs', icon: '\u{1F516}', enabled: false },
];

/* ── Main Component ────────────────────────────────── */

export default function ImportPage() {
  const { showToast } = useToast();

  const [step, setStep] = useState<Step>('type');
  const [importType, setImportType] = useState<ImportType>('scheme');
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [headerInfo, setHeaderInfo] = useState<HeaderInfo | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mappingAnimated, setMappingAnimated] = useState(false);

  /* ── Step 1: Type Selection ──────────────────────── */

  function handleTypeSelect(type: ImportType) {
    setImportType(type);
    setStep('upload');
  }

  /* ── Step 2: File Upload ─────────────────────────── */

  async function handleFileUpload(file: File) {
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('import_type', importType);

      const baseUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin;
      const token = getAccessToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      else headers['X-Dev-Tenant-Id'] = 'dev-tenant';

      const res = await fetch(`${baseUrl}/api/v1/etl/upload`, {
        method: 'POST',
        headers,
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
    if (!fileInfo) return;
    setLoading(true);
    try {
      const session = await apiFetch<SessionInfo>(API.etl.createSession, {
        body: { file_id: fileInfo.file_id, import_type: importType, field_mappings: mapping },
      });
      setSessionInfo(session);
      setStep('processing');

      // Immediately trigger processing
      const processResult = await apiFetch<ProcessResult>(API.etl.process, {
        pathParams: { id: String(session.session_id) },
      });
      setResult(processResult);
      setStep('results');
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
  }

  /* ── VaNi insights for results ───────────────────── */

  function getVaniInsights(): string[] {
    if (!result || !headerInfo) return [];
    const insights: string[] = [];

    if (result.successful > 0 && result.failed === 0) {
      insights.push(`All ${result.successful.toLocaleString()} records processed successfully.`);
    }
    if (result.duplicate > 0) {
      insights.push(`${result.duplicate.toLocaleString()} existing schemes updated with latest data.`);
    }
    if (result.failed > 0) {
      insights.push(`${result.failed} records failed \u2014 check error details below.`);
    }
    const newSchemes = result.successful - result.duplicate;
    if (newSchemes > 0) {
      insights.push(`${newSchemes.toLocaleString()} new schemes added to the database.`);
    }
    if (result.duration_ms) {
      const seconds = (result.duration_ms / 1000).toFixed(1);
      insights.push(`Processed ${result.processed.toLocaleString()} rows in ${seconds}s via PostgreSQL RPC.`);
    }
    return insights;
  }

  /* ── Render ──────────────────────────────────────── */

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerLeft}>
          <h1 className={s.title}>Import Data</h1>
          <p className={s.subtitle}>Bring your data into ProKey</p>
        </div>
        {step !== 'type' && step !== 'results' && (
          <button className={s.cancelBtn} onClick={handleReset}>Cancel</button>
        )}
      </div>

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
          <div className={s.vaniHint}>
            <span className={s.vaniIcon}>{'\u2728'}</span>
            <span>Choose the data type you want to import. Scheme Master is the foundation \u2014 import it first.</span>
          </div>
          <div className={s.typeGrid}>
            {IMPORT_TYPES.map((t) => (
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
          <div className={s.vaniHint}>
            <span className={s.vaniIcon}>{'\u{1F4C1}'}</span>
            <span>Upload your <strong>{IMPORT_TYPES.find((t) => t.id === importType)?.label}</strong> file. Supports .xlsx, .xls, and .csv (max 10MB).</span>
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
          <div className={s.vaniHint}>
            <span className={s.vaniIcon}>{'\u{1F9E0}'}</span>
            <span>
              Detected <strong>{headerInfo.total_rows.toLocaleString()}</strong> rows with <strong>{headerInfo.headers.length}</strong> columns.
              {' '}Field mapping auto-applied \u2014 review and confirm.
            </span>
          </div>

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
              {sessionInfo?.total_records.toLocaleString()} rows staged. Running <code>process_scheme_import_with_timing()</code>...
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
            <div className={s.statCard}>
              <span className={s.statValue}>{result.processed.toLocaleString()}</span>
              <span className={s.statLabel}>Total Processed</span>
            </div>
            <div className={`${s.statCard} ${s.statSuccess}`}>
              <span className={s.statValue}>{(result.successful - result.duplicate).toLocaleString()}</span>
              <span className={s.statLabel}>New Records</span>
            </div>
            <div className={`${s.statCard} ${s.statDuplicate}`}>
              <span className={s.statValue}>{result.duplicate.toLocaleString()}</span>
              <span className={s.statLabel}>Updated (Duplicate)</span>
            </div>
            {result.failed > 0 && (
              <div className={`${s.statCard} ${s.statFailed}`}>
                <span className={s.statValue}>{result.failed.toLocaleString()}</span>
                <span className={s.statLabel}>Failed</span>
              </div>
            )}
          </div>

          {/* VaNi insights */}
          <div className={s.insightsCard}>
            <div className={s.insightsHeader}>
              <span className={s.vaniIcon}>{'\u2728'}</span>
              <span>VaNi Insights</span>
            </div>
            {getVaniInsights().map((insight, i) => (
              <div key={i} className={s.insightRow}>
                <span className={s.insightDot} />
                <span>{insight}</span>
              </div>
            ))}
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
  );
}
