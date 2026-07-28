'use client';

import { useState, useCallback, type ReactNode } from 'react';
import { Database, Users, ArrowLeftRight, Bookmark } from 'lucide-react';
import { apiFetch, getAccessToken } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { VdfInsightsCard, VdfStatCard, VdfPageHeader, VdfInput, VdfCheckbox } from '@/components/vdf';
import { useAuth } from '@/context/auth-provider';
import { formatDate } from '@/lib/format';
import s from './import-page.module.css';

/* ── Types ─────────────────────────────────────────── */

// MFD-era types. 'customer' is the legacy client import; the GTM imports all
// go up as 'company' and are distinguished by `relationship` below.
type ImportType = 'scheme' | 'customer' | 'transaction' | 'bookmark' | 'company';
type Step = 'type' | 'upload' | 'mapping' | 'processing' | 'results';

/**
 * What the TENANT says this data is to them. No file can state it, so it is
 * declared here and never inferred. Orthogonal to the ENTITIES (people /
 * companies) the backend detector finds inside the file.
 */
type Relationship = 'contacts' | 'customers' | 'dataset';

interface DetectedEntity {
  kind: 'company' | 'person';
  columns: Record<string, string>;
  reasons: string[];
  per_row: number;
}

interface ExtractionPlan {
  entities: DetectedEntity[];
  unresolved_columns: { header: string; sample: string | null; reason: string }[];
  confidence: 'high' | 'low';
  notes: string[];
}

interface Tag {
  id: number;
  label: string;
  slug: string;
  is_platform: boolean;
}

interface PriorLoad {
  id: number;
  label: string;
  as_of: string | null;
  loaded_at: string;
}

interface FileInfo {
  file_id: number;
  filename: string;
  size: number;
  prior_load?: PriorLoad | null;
}

interface HeaderInfo {
  headers: string[];
  sample_rows: Record<string, any>[];
  total_rows: number;
  suggested_mapping: Record<string, string>;
  extraction_plan?: ExtractionPlan;
  row_estimates?: Record<string, number>;
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
  /** Rows held because they would change a record already held. */
  conflict?: number;
  /** Of those, how many belong to a contact in a running campaign. */
  campaign_locked?: number;
  orphans: number;
  duration_ms: number;
  landed?: { companies: number; people: number; channels: number };
}

/* ── Import type cards ─────────────────────────────── */

/**
 * The three uploads, by what the data MEANS to the tenant.
 *
 * Deliberately not "people vs companies" — a file is commonly both, and which
 * it is gets detected from the columns rather than declared here.
 */
const RELATIONSHIPS: {
  id: Relationship;
  label: string;
  desc: string;
  icon: ReactNode;
  adminOnly: boolean;
}[] = [
  {
    id: 'contacts',
    label: 'My contacts',
    desc: 'People and companies you know but have not sold to yet',
    icon: <Users size={22} />,
    adminOnly: false,
  },
  {
    id: 'customers',
    label: 'My customers',
    desc: 'Who already buys from you — the ground truth for your ideal customer',
    icon: <Bookmark size={22} />,
    adminOnly: false,
  },
  {
    id: 'dataset',
    label: 'Common pool dataset',
    desc: 'A directory delivery shared across tenants — FTCCI, federations, associations',
    icon: <Database size={22} />,
    adminOnly: true,
  },
];

/* ── Main Component ────────────────────────────────── */

export default function ImportPage() {
  const { showToast } = useToast();
  const { tenant, isAdmin } = useAuth();

  const [step, setStep] = useState<Step>('type');
  const [importType, setImportType] = useState<ImportType>('company');
  const [relationship, setRelationship] = useState<Relationship>('contacts');
  const [asOf, setAsOf] = useState('');
  const [tags, setTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);
  const [newTagLabel, setNewTagLabel] = useState('');
  const [stagingOnly, setStagingOnly] = useState(false);
  const [fileInfo, setFileInfo] = useState<FileInfo | null>(null);
  const [headerInfo, setHeaderInfo] = useState<HeaderInfo | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [mappingAnimated, setMappingAnimated] = useState(false);
  const [lookupMethod, setLookupMethod] = useState<'iwell_code' | 'customer_name' | 'both'>('iwell_code');

  /* ── Step 1: What is this data? ──────────────────── */

  async function handleRelationshipSelect(rel: Relationship) {
    setRelationship(rel);
    setImportType('company');
    setStep('upload');

    // Tags describe the delivery, so they are picked once the file is chosen.
    // Loading them here keeps the review step from waiting on a round trip.
    try {
      const res = await apiFetch<{ tags: Tag[] }>(API.etl.tags);
      setTags(res.tags || []);
    } catch {
      // Tags are optional metadata — a failure here must not block the import,
      // but it is surfaced rather than swallowed.
      showToast({ message: 'Could not load tags — you can still import without them.', type: 'error' });
    }
  }

  async function handleCreateTag() {
    const label = newTagLabel.trim();
    if (!label) return;
    try {
      const res = await apiFetch<{ tag: Tag | null }>(API.etl.createTag, {
        // A platform tag is visible to every tenant, so only offer it for the
        // shared pool. The backend re-checks against the JWT regardless.
        body: { label, is_platform: relationship === 'dataset' && isAdmin },
      });
      if (res.tag) {
        setTags((prev) => (prev.some((t) => t.id === res.tag!.id) ? prev : [...prev, res.tag!]));
        setSelectedTagIds((prev) => (prev.includes(res.tag!.id) ? prev : [...prev, res.tag!.id]));
      }
      setNewTagLabel('');
    } catch (err: any) {
      showToast({ message: err.message || 'Could not create tag', type: 'error' });
    }
  }

  function toggleTag(id: number) {
    setSelectedTagIds((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
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
        // Standard ETL pipeline. `relationship` is what the tenant declared;
        // `extraction_plan` is what the detector found and the human accepted.
        // The admin gate on the shared pool is re-checked server-side from the
        // JWT — this only decides what to ask for.
        const session = await apiFetch<SessionInfo>(API.etl.createSession, {
          body: {
            file_id: fileInfo.file_id,
            import_type: importType,
            field_mappings: mapping,
            relationship,
            extraction_plan: headerInfo?.extraction_plan ?? null,
            destination: relationship === 'dataset' ? 'universe_companies' : 'prospects',
            tag_ids: selectedTagIds,
            load_label: fileInfo.filename,
            load_as_of: asOf || null,
            ...(importType === 'transaction' ? { customer_lookup_method: lookupMethod } : {}),
          },
        });
        setSessionInfo(session);
        setStep('processing');

        // Staging and landing are ONE action from here on. The user confirmed
        // the import; they are not asked to come back and press go again.
        try {
          const processResult = await apiFetch<ProcessResult>(API.etl.process, {
            pathParams: { id: String(session.session_id) },
          });
          setResult(processResult);
          setStep('results');
        } catch (processErr: any) {
          // The rows ARE staged — that work is not lost, and saying
          // "Processing failed" with nothing else is what made a half-done
          // import look like a total one.
          setStagingOnly(true);
          setResult({
            session_id: session.session_id,
            status: 'staged',
            processed: session.total_records,
            successful: 0, failed: 0, duplicate: 0, conflict: 0,
            orphans: 0, duration_ms: 0,
          });
          setStep('results');
          showToast({
            message: `${session.total_records.toLocaleString()} rows are staged and safe. Landing them failed: ${processErr.message}`,
            type: 'error',
          });
        }
      }
    } catch (err: any) {
      showToast({ message: err.message || 'Import failed', type: 'error' });
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
    setSelectedTagIds([]);
    setAsOf('');
    setNewTagLabel('');
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
        insights.push(`Processed ${result.processed.toLocaleString()} rows in ${(result.duration_ms / 1000).toFixed(1)}s via VaNi.`);
      }

    } else if (importType === 'company') {
      if (stagingOnly) {
        insights.push('Your rows are staged and nothing is lost. Open the import dashboard to retry landing them.');
        return insights;
      }
      if (result.landed) {
        if (result.landed.companies > 0) {
          insights.push(`${result.landed.companies.toLocaleString()} companies added to ${relationship === 'dataset' ? 'the common pool' : relationship === 'customers' ? 'your customers' : 'your prospects'}.`);
        }
        if (result.landed.people > 0) {
          insights.push(`${result.landed.people.toLocaleString()} people added, with ${result.landed.channels.toLocaleString()} email and phone channels.`);
        }
      }
      if (result.duplicate > 0) {
        insights.push(`${result.duplicate.toLocaleString()} row${result.duplicate !== 1 ? 's' : ''} said nothing new — already held, so skipped.`);
      }
      if ((result.conflict ?? 0) > 0) {
        insights.push(`${result.conflict!.toLocaleString()} row${result.conflict !== 1 ? 's' : ''} would change something you already hold. Nothing was overwritten — decide in the import dashboard.`);
      }
      if ((result.campaign_locked ?? 0) > 0) {
        insights.push(`${result.campaign_locked} of those belong to contacts in a running campaign, so they need an explicit decision rather than a bulk accept.`);
      }
      if (result.failed > 0) {
        insights.push(`${result.failed} row${result.failed !== 1 ? 's' : ''} could not be imported — open them to see why.`);
      }
      if (result.duration_ms) {
        insights.push(`Processed ${result.processed.toLocaleString()} rows in ${(result.duration_ms / 1000).toFixed(1)}s.`);
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
        insights.push(`Processed ${result.processed.toLocaleString()} rows in ${(result.duration_ms / 1000).toFixed(1)}s via VaNi.`);
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
        insights.push(`Processed ${result.processed.toLocaleString()} rows in ${(result.duration_ms / 1000).toFixed(1)}s via VaNi.`);
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

      {/* ── STEP 1: What is this data? ──────────────── */}
      {step === 'type' && (
        <div className={s.stepContent}>
          <div style={{ marginBottom: 24 }}>
            <VdfInsightsCard insights={[{
              icon: '✨',
              text: 'Tell VaNi what this data is to you. Whether the file holds people, companies or both is worked out from the columns — you only confirm it.',
            }]} />
          </div>
          <div className={s.typeGrid}>
            {RELATIONSHIPS.filter((r) => !r.adminOnly || isAdmin).map((r) => (
              <button
                key={r.id}
                className={s.typeCard}
                onClick={() => handleRelationshipSelect(r.id)}
              >
                <span className={s.typeIcon}>{r.icon}</span>
                <span className={s.typeName}>{r.label}</span>
                <span className={s.typeDesc}>{r.desc}</span>
                {r.adminOnly && <span className={s.typeBadge}>Admin</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── STEP 2: Upload ──────────────────────────── */}
      {step === 'upload' && (
        <div className={s.stepContent}>
          <div style={{ marginBottom: 24 }}>
            <VdfInsightsCard insights={[{ icon: '📁', text: `Upload your ${RELATIONSHIPS.find((r) => r.id === relationship)?.label || ''} file. Supports .xlsx, .xls, and .csv (max 10MB).` }]} />
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

          {/* Re-delivery: identical content is already loaded. Said out loud so
              importing it again is a deliberate act, not an accident. */}
          {fileInfo?.prior_load && (
            <div className={s.platformHint}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14" style={{ flexShrink: 0 }}>
                <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>
                <strong>This is a re-delivery.</strong> The same file content was loaded as
                {' '}&ldquo;{fileInfo.prior_load.label}&rdquo; on {formatDate(fileInfo.prior_load.loaded_at)}.
                Importing it again is fine — rows that clash with what you already
                hold will be held for your decision rather than overwritten.
              </span>
            </div>
          )}

          {/* What the detector found. Reasons are shown because the user has to
              be able to disagree with it — that is the override half of the
              ruling, and it cannot work if the reasoning is hidden. */}
          {headerInfo.extraction_plan && (
            <div className={s.lookupSection}>
              <div className={s.lookupTitle}>What VaNi found in this file</div>
              <div className={s.lookupDesc}>
                {headerInfo.extraction_plan.entities.length === 0
                  ? 'Nothing recognisable yet — map the columns below before importing.'
                  : 'Confirm this is right. One file often carries both companies and the people at them.'}
              </div>

              <div className={s.lookupGrid}>
                {headerInfo.extraction_plan.entities.map((e) => (
                  <div key={e.kind} className={s.lookupOption} style={{ cursor: 'default' }}>
                    <span className={s.lookupOptionLabel}>
                      {e.kind === 'company' ? 'Companies' : 'People'}
                      {' · '}
                      {(headerInfo.row_estimates?.[e.kind] ?? headerInfo.total_rows).toLocaleString()}
                    </span>
                    <span className={s.lookupOptionDesc}>{e.reasons.join(' ')}</span>
                  </div>
                ))}
              </div>

              {headerInfo.extraction_plan.notes.map((n, i) => (
                <div key={i} className={s.lookupNote}>{n}</div>
              ))}

              {headerInfo.extraction_plan.unresolved_columns.length > 0 && (
                <div className={s.lookupNote}>
                  <strong>
                    {headerInfo.extraction_plan.unresolved_columns.length} column
                    {headerInfo.extraction_plan.unresolved_columns.length !== 1 ? 's' : ''} could not be placed
                  </strong>{' '}
                  and will be kept with the row but not imported into a field:{' '}
                  {headerInfo.extraction_plan.unresolved_columns.map((u) => u.header).join(', ')}.
                </div>
              )}
            </div>
          )}

          {/* Freshness and tags belong to the DELIVERY, so they are asked once
              here rather than per row. as_of is a scored quality component —
              an undated load is treated as older, not as current. */}
          <div className={s.lookupSection}>
            <div className={s.lookupTitle}>About this delivery</div>
            <div className={s.lookupDesc}>
              How current is this data, and what should it be grouped under?
            </div>

            <div style={{ maxWidth: 280, marginBottom: 16 }}>
              <VdfInput
                label="Data is current as of"
                type="date"
                value={asOf}
                onChange={(e) => setAsOf(e.target.value)}
                hint="Leave blank if unknown — it will be scored as less fresh."
              />
            </div>

            {tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, marginBottom: 12 }}>
                {tags.map((t) => (
                  <VdfCheckbox
                    key={t.id}
                    checked={selectedTagIds.includes(t.id)}
                    onChange={() => toggleTag(t.id)}
                    label={t.is_platform ? `${t.label} (shared)` : t.label}
                  />
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', maxWidth: 420 }}>
              <div style={{ flex: 1 }}>
                <VdfInput
                  label="Add a tag"
                  value={newTagLabel}
                  onChange={(e) => setNewTagLabel(e.target.value)}
                  placeholder="FTCCI Telangana"
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); handleCreateTag(); } }}
                />
              </div>
              <button className={s.backBtn} onClick={handleCreateTag} disabled={!newTagLabel.trim()}>
                Add
              </button>
            </div>
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
            <h2 className={s.processingTitle}>VaNi is processing your import</h2>
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
          {/* The banner states what actually happened. Held rows are NOT a
              failure \u2014 nothing was overwritten and the work is not lost \u2014 so
              they never get the error treatment. */}
          <div className={`${s.resultBanner} ${
            stagingOnly || result.failed > 0 || (result.conflict ?? 0) > 0
              ? s.resultBannerWarn : s.resultBannerOk
          }`}>
            <span className={s.resultBannerIcon}>
              {stagingOnly ? '\u23F8\uFE0F' : (result.failed > 0 || (result.conflict ?? 0) > 0) ? '\u26A0\uFE0F' : '\u2705'}
            </span>
            <div>
              <div className={s.resultBannerTitle}>
                {stagingOnly
                  ? 'Staged, not yet imported'
                  : (result.conflict ?? 0) > 0
                  ? 'Imported \u2014 some rows need your call'
                  : result.failed > 0
                  ? 'Completed with errors'
                  : 'Import successful'}
              </div>
              <div className={s.resultBannerDesc}>
                {stagingOnly
                  ? `${result.processed.toLocaleString()} rows from ${fileInfo?.filename} are staged and safe. Nothing has been written yet.`
                  : `${result.processed.toLocaleString()} records processed from ${fileInfo?.filename}`}
                {result.landed && !stagingOnly && (
                  <> \u2014 {result.landed.companies.toLocaleString()} companies, {result.landed.people.toLocaleString()} people.</>
                )}
              </div>
            </div>
          </div>

          {/* Stats cards */}
          <div className={s.resultStats}>
            <VdfStatCard value={result.processed} label="Total Processed" />
            <VdfStatCard value={result.successful} label={importType === 'transaction' ? 'Imported' : 'New Records'} accent="success" />
            <VdfStatCard value={result.duplicate} label="Duplicates Skipped" accent="info" />
            {(result.conflict ?? 0) > 0 && (
              <VdfStatCard value={result.conflict ?? 0} label="Need Your Call" accent="warning" />
            )}
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
              View Import Dashboard →
            </button>
          </div>
        </div>
      )}

      </div>
    </div>
  );
}
