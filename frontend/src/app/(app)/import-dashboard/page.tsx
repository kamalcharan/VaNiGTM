'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { FullPageLoader } from '@/components/loader';
import s from './dashboard-page.module.css';

/* ── Types ─────────────────────────────────────────── */

type ImportType = 'scheme' | 'customer' | 'transaction' | 'bookmark' | 'all';

interface Session {
  id: number;
  import_type: string;
  status: string;
  total_records: number;
  processed_records: number;
  successful_records: number;
  failed_records: number;
  duplicate_records: number;
  original_filename: string | null;
  created_at: string;
  staging_completed_at: string | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
}

interface StagingRecord {
  id: number;
  row_number: number;
  processing_status: string;
  mapped_data: Record<string, any>;
  raw_data: Record<string, any>;
  error_messages: string[] | null;
  warnings: string[] | null;
  created_record_id: string | null;
  processed_at: string | null;
}

interface RecordsResponse {
  records: StagingRecord[];
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

/* ── Constants ─────────────────────────────────────── */

const IMPORT_TYPES: { id: ImportType; label: string; icon: string }[] = [
  { id: 'all', label: 'All Types', icon: '\u{1F4CB}' },
  { id: 'scheme', label: 'Schemes', icon: '\u{1F4CA}' },
  { id: 'customer', label: 'Customers', icon: '\u{1F465}' },
  { id: 'transaction', label: 'Transactions', icon: '\u{1F4C4}' },
  { id: 'bookmark', label: 'Bookmarks', icon: '\u{1F516}' },
];

const STATUS_MAP: Record<string, { color: string; label: string }> = {
  // Session statuses
  completed: { color: 'success', label: 'Completed' },
  completed_with_errors: { color: 'warning', label: 'With Errors' },
  processing: { color: 'info', label: 'Processing' },
  staged: { color: 'info', label: 'Staged' },
  pending: { color: 'muted', label: 'Pending' },
  failed: { color: 'danger', label: 'Failed' },
  cancelled: { color: 'muted', label: 'Cancelled' },
  // Staging record statuses
  success: { color: 'success', label: 'Success' },
  duplicate: { color: 'info', label: 'Updated' },
  skipped: { color: 'muted', label: 'Skipped' },
};

const RECORD_FILTERS = ['all', 'success', 'failed', 'duplicate', 'pending'] as const;

const SCHEME_COLUMNS = ['scheme_code', 'scheme_name', 'amc', 'category', 'scheme_type'];

/* ── Helpers ───────────────────────────────────────── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

function successRate(sess: Session): number {
  if (sess.total_records === 0) return 0;
  return Math.round(((sess.successful_records + sess.duplicate_records) / sess.total_records) * 100);
}

/* ── Main Component ────────────────────────────────── */

export default function ImportDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();

  // State
  const [selectedType, setSelectedType] = useState<ImportType>('all');
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [records, setRecords] = useState<RecordsResponse | null>(null);
  const [recordFilter, setRecordFilter] = useState<string>('all');
  const [recordPage, setRecordPage] = useState(1);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [reprocessing, setReprocessing] = useState(false);
  const [deletingStaging, setDeletingStaging] = useState(false);
  const [viewRecord, setViewRecord] = useState<StagingRecord | null>(null);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const params = selectedType !== 'all' ? `?type=${selectedType}` : '';
      const data = await apiFetch<{ sessions: Session[] }>({
        ...API.etl.sessions,
        path: API.etl.sessions.path + params,
      });
      setSessions(data.sessions || []);

      // Auto-select first session if none selected
      if (data.sessions?.length > 0 && !selectedSession) {
        setSelectedSession(data.sessions[0]);
      }
    } catch {
      setSessions([]);
    } finally {
      setLoadingSessions(false);
    }
  }, [selectedType]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    fetchSessions();
    setSelectedSession(null);
  }, [selectedType]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch records when session or filter changes
  const fetchRecords = useCallback(async () => {
    if (!selectedSession) { setRecords(null); return; }
    setLoadingRecords(true);
    try {
      const qs = `?status=${recordFilter}&page=${recordPage}&limit=50`;
      const data = await apiFetch<RecordsResponse>({
        ...API.etl.records,
        path: API.etl.records.path.replace(':id', String(selectedSession.id)) + qs,
      });
      setRecords(data);
    } catch {
      setRecords(null);
    } finally {
      setLoadingRecords(false);
    }
  }, [selectedSession, recordFilter, recordPage]);

  useEffect(() => {
    fetchRecords();
  }, [fetchRecords]);

  // Select session
  function handleSelectSession(sess: Session) {
    setSelectedSession(sess);
    setRecordFilter('all');
    setRecordPage(1);
  }

  // Reprocess failed
  async function handleReprocess() {
    if (!selectedSession || reprocessing) return;
    setReprocessing(true);
    try {
      const data = await apiFetch<any>({
        ...API.etl.reprocess,
        path: API.etl.reprocess.path.replace(':id', String(selectedSession.id)),
      });
      showToast({
        message: `Reprocessed: ${data.successful || 0} passed, ${data.failed || 0} failed`,
        type: data.failed > 0 ? 'warning' : 'success',
      });
      fetchSessions();
      fetchRecords();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Reprocess failed', type: 'error' });
    } finally {
      setReprocessing(false);
    }
  }

  // Delete staging
  async function handleDeleteStaging() {
    if (!selectedSession || deletingStaging) return;
    if (!confirm('This will permanently delete all staging data for this session. You will not be able to reprocess failed records. Continue?')) return;
    setDeletingStaging(true);
    try {
      await apiFetch<any>({
        ...API.etl.deleteStaging,
        path: API.etl.deleteStaging.path.replace(':id', String(selectedSession.id)),
      });
      showToast({ message: 'Staging data deleted', type: 'success' });
      setRecords(null);
      fetchSessions();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Delete failed', type: 'error' });
    } finally {
      setDeletingStaging(false);
    }
  }

  // Get display columns based on import type
  function getColumns(): string[] {
    if (selectedSession?.import_type === 'scheme') return SCHEME_COLUMNS;
    return ['field1', 'field2', 'field3']; // Generic fallback
  }

  /* ── VaNi Insights for selected session ───────────── */

  function getSessionInsights(): { icon: string; text: string }[] {
    if (!selectedSession) return [];
    const ss = selectedSession;
    const insights: { icon: string; text: string }[] = [];
    const rate = successRate(ss);

    // Overall health
    if (rate === 100) {
      insights.push({ icon: '\u{1F389}', text: 'Perfect import \u2014 every record processed successfully.' });
    } else if (rate >= 95) {
      insights.push({ icon: '\u2705', text: `${rate}% success rate \u2014 excellent data quality.` });
    } else if (rate >= 80) {
      insights.push({ icon: '\u{1F7E1}', text: `${rate}% success rate. ${ss.failed_records} records need attention.` });
    } else if (rate > 0) {
      insights.push({ icon: '\u26A0\uFE0F', text: `Only ${rate}% success rate. Review the failed records \u2014 there may be a systemic mapping issue.` });
    }

    // Duplicates insight
    if (ss.duplicate_records > 0) {
      const dupPct = Math.round((ss.duplicate_records / ss.total_records) * 100);
      if (dupPct > 80) {
        insights.push({ icon: '\u{1F504}', text: `${dupPct}% were updates to existing records. This looks like a refresh import rather than a first-time load.` });
      } else if (dupPct > 0) {
        insights.push({ icon: '\u{1F504}', text: `${ss.duplicate_records.toLocaleString()} existing records updated with latest data.` });
      }
    }

    // New records
    const newRecords = ss.successful_records - ss.duplicate_records;
    if (newRecords > 0) {
      insights.push({ icon: '\u2728', text: `${newRecords.toLocaleString()} new records added to the database.` });
    }

    // Failed records
    if (ss.failed_records > 0) {
      insights.push({ icon: '\u{1F527}', text: `${ss.failed_records} records failed. Click "Reprocess" after fixing source data, or filter by "Failed" to review individual errors.` });
    }

    // Timing
    if (ss.processing_started_at && ss.processing_completed_at) {
      const durationMs = new Date(ss.processing_completed_at).getTime() - new Date(ss.processing_started_at).getTime();
      const seconds = (durationMs / 1000).toFixed(1);
      const rowsPerSec = Math.round(ss.total_records / (durationMs / 1000));
      insights.push({ icon: '\u26A1', text: `Processed ${ss.total_records.toLocaleString()} rows in ${seconds}s (${rowsPerSec.toLocaleString()} rows/sec) via PostgreSQL RPC.` });
    }

    // Staging age warning
    const age = daysSince(ss.created_at);
    const daysLeft = Math.max(0, 45 - age);
    if (daysLeft <= 7 && daysLeft > 0) {
      insights.push({ icon: '\u23F3', text: `Staging data expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}. Delete staging or reprocess failed records before it\u2019s auto-purged.` });
    }

    return insights;
  }

  /* ── Render ──────────────────────────────────────── */

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div>
          <h1 className={s.title}>Import Dashboard</h1>
          <p className={s.subtitle}>Track and manage all your data imports</p>
        </div>
        <button className={s.newBtn} onClick={() => router.push('/import')}>
          + New Import
        </button>
      </div>

      <div className={s.layout}>
        {/* ═══ LEFT PANEL ═══ */}
        <div className={s.leftPanel}>
          {/* Type selector */}
          <div className={s.typeSelector}>
            {IMPORT_TYPES.map((t) => (
              <button
                key={t.id}
                className={`${s.typeBtn} ${selectedType === t.id ? s.typeBtnActive : ''}`}
                onClick={() => setSelectedType(t.id)}
              >
                <span className={s.typeIcon}>{t.icon}</span>
                <span>{t.label}</span>
              </button>
            ))}
          </div>

          {/* Sessions list */}
          <div className={s.sessionsHeader}>
            <span className={s.sessionsTitle}>Sessions</span>
            <button className={s.refreshBtn} onClick={fetchSessions} title="Refresh">
              {'\u21BB'}
            </button>
          </div>

          <div className={s.sessionsList}>
            {loadingSessions ? (
              <div className={s.sessionsEmpty}>Loading...</div>
            ) : sessions.length === 0 ? (
              <div className={s.sessionsEmpty}>
                <div>No sessions found</div>
                <div className={s.sessionsHint}>
                  {selectedType !== 'all'
                    ? `No ${selectedType} imports yet. Click "+ New Import" to start.`
                    : 'Import your first dataset to see it here.'}
                </div>
              </div>
            ) : (
              sessions.map((sess) => {
                const rate = successRate(sess);
                const statusInfo = STATUS_MAP[sess.status] || STATUS_MAP.pending;
                const isSelected = selectedSession?.id === sess.id;

                return (
                  <div
                    key={sess.id}
                    className={`${s.sessionCard} ${isSelected ? s.sessionCardActive : ''}`}
                    onClick={() => handleSelectSession(sess)}
                  >
                    <div className={s.sessionCardHeader}>
                      <span className={s.sessionId}>#{sess.id}</span>
                      <span className={`${s.statusBadge} ${s[`st_${statusInfo.color}`]}`}>
                        {statusInfo.label}
                      </span>
                    </div>
                    {sess.original_filename && (
                      <div className={s.sessionFile}>
                        {'\u{1F4C4}'} {sess.original_filename}
                      </div>
                    )}
                    <div className={s.progressBar}>
                      <div
                        className={`${s.progressFill} ${rate >= 80 ? s.progGood : rate >= 50 ? s.progWarn : s.progBad}`}
                        style={{ width: `${rate}%` }}
                      />
                    </div>
                    <div className={s.sessionStats}>
                      <span>{sess.total_records.toLocaleString()} total</span>
                      <span className={s.statOk}>{'\u2713'}{sess.successful_records.toLocaleString()}</span>
                      <span className={s.statFail}>{'\u2717'}{sess.failed_records.toLocaleString()}</span>
                      <span className={s.statDup}>{'\u26A0'}{sess.duplicate_records.toLocaleString()}</span>
                    </div>
                    <div className={s.sessionTime}>{timeAgo(sess.created_at)}</div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* ═══ RIGHT PANEL ═══ */}
        <div className={s.rightPanel}>
          {!selectedSession ? (
            <div className={s.emptyDetail}>
              <div className={s.emptyIcon}>{'\u{1F4CA}'}</div>
              <h2 className={s.emptyTitle}>No Session Selected</h2>
              <p className={s.emptyDesc}>Select an import type and choose a session from the sidebar to view detailed metrics, records, and VaNi insights.</p>
              {sessions.length === 0 && (
                <div className={s.vaniHint}>
                  <span>{'\u2728'}</span>
                  <span>No imports yet. Start with <strong>Scheme Master</strong> \u2014 it\u2019s the foundation for everything else (portfolios, NAV tracking, transactions).</span>
                </div>
              )}
            </div>
          ) : (
            <>
              {/* Info bar */}
              <div className={s.infoBar}>
                <div className={s.infoLeft}>
                  <span className={s.infoSessionId}>Session #{selectedSession.id}</span>
                  <span className={`${s.statusBadge} ${s[`st_${(STATUS_MAP[selectedSession.status] || STATUS_MAP.pending).color}`]}`}>
                    {(STATUS_MAP[selectedSession.status] || STATUS_MAP.pending).label}
                  </span>
                  {selectedSession.original_filename && (
                    <span className={s.infoFile}>{selectedSession.original_filename}</span>
                  )}
                </div>
                <div className={s.infoRight}>
                  <span className={s.infoAge}>
                    {daysSince(selectedSession.created_at)}d old
                    {' \u00B7 '}
                    deletes in {Math.max(0, 45 - daysSince(selectedSession.created_at))}d
                  </span>
                </div>
              </div>

              {/* Metrics */}
              <div className={s.metrics}>
                <div className={s.metricCard}>
                  <span className={s.metricValue}>{selectedSession.total_records.toLocaleString()}</span>
                  <span className={s.metricLabel}>Total Records</span>
                </div>
                <div className={`${s.metricCard} ${s.mcSuccess}`}>
                  <span className={s.metricValue}>{selectedSession.successful_records.toLocaleString()}</span>
                  <span className={s.metricLabel}>Successful</span>
                  <span className={s.metricPct}>
                    {selectedSession.total_records > 0 ? Math.round((selectedSession.successful_records / selectedSession.total_records) * 100) : 0}%
                  </span>
                </div>
                <div className={`${s.metricCard} ${s.mcFailed}`}>
                  <span className={s.metricValue}>{selectedSession.failed_records.toLocaleString()}</span>
                  <span className={s.metricLabel}>Failed</span>
                  <span className={s.metricPct}>
                    {selectedSession.total_records > 0 ? Math.round((selectedSession.failed_records / selectedSession.total_records) * 100) : 0}%
                  </span>
                </div>
                <div className={`${s.metricCard} ${s.mcDuplicate}`}>
                  <span className={s.metricValue}>{selectedSession.duplicate_records.toLocaleString()}</span>
                  <span className={s.metricLabel}>Updated</span>
                  <span className={s.metricPct}>
                    {selectedSession.total_records > 0 ? Math.round((selectedSession.duplicate_records / selectedSession.total_records) * 100) : 0}%
                  </span>
                </div>
              </div>

              {/* VaNi Insights */}
              {getSessionInsights().length > 0 && (
                <div className={s.insightsCard}>
                  <div className={s.insightsHeader}>
                    <span>{'\u2728'}</span>
                    <span>VaNi Analysis</span>
                  </div>
                  {getSessionInsights().map((insight, i) => (
                    <div key={i} className={s.insightRow}>
                      <span className={s.insightIcon}>{insight.icon}</span>
                      <span>{insight.text}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Filter bar */}
              <div className={s.filterBar}>
                <div className={s.filters}>
                  {RECORD_FILTERS.map((f) => (
                    <button
                      key={f}
                      className={`${s.filterBtn} ${recordFilter === f ? s.filterBtnActive : ''}`}
                      onClick={() => { setRecordFilter(f); setRecordPage(1); }}
                    >
                      {f === 'all' ? 'All' : f.charAt(0).toUpperCase() + f.slice(1)}
                    </button>
                  ))}
                </div>
                <div className={s.filterActions}>
                  {selectedSession.failed_records > 0 && (
                    <button className={s.reprocessBtn} onClick={handleReprocess} disabled={reprocessing}>
                      {reprocessing ? 'Reprocessing...' : `\u{1F504} Reprocess ${selectedSession.failed_records} Failed`}
                    </button>
                  )}
                  {selectedSession.status !== 'processing' && selectedSession.status !== 'pending' && (
                    <button className={s.deleteBtn} onClick={handleDeleteStaging} disabled={deletingStaging}>
                      {deletingStaging ? 'Deleting...' : '\u{1F5D1} Delete Staging'}
                    </button>
                  )}
                </div>
              </div>

              {/* Records table */}
              {loadingRecords ? (
                <div className={s.tableLoading}>Loading records...</div>
              ) : !records || records.records.length === 0 ? (
                <div className={s.tableEmpty}>
                  {records?.total === 0 ? 'No records match this filter' : 'Staging data may have been deleted'}
                </div>
              ) : (
                <>
                  <div className={s.tableWrap}>
                    <table className={s.table}>
                      <thead>
                        <tr>
                          <th className={s.thSticky}>Row</th>
                          {getColumns().map((col) => (
                            <th key={col}>{col.replace(/_/g, ' ')}</th>
                          ))}
                          <th>Status</th>
                          <th>Error / Warning</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.records.map((rec) => {
                          const statusInfo = STATUS_MAP[rec.processing_status] || STATUS_MAP.pending;
                          return (
                            <tr key={rec.id} className={s.tableRow} onClick={() => setViewRecord(rec)}>
                              <td className={s.tdSticky}>{rec.row_number}</td>
                              {getColumns().map((col) => (
                                <td key={col} className={s.tdData}>
                                  {rec.mapped_data?.[col] !== undefined ? String(rec.mapped_data[col]).slice(0, 40) : '\u2014'}
                                </td>
                              ))}
                              <td>
                                <span className={`${s.statusBadgeSm} ${s[`st_${statusInfo.color}`]}`}>
                                  {statusInfo.label}
                                </span>
                              </td>
                              <td className={s.tdError}>
                                {rec.error_messages?.[0] || rec.warnings?.[0] || ''}
                              </td>
                              <td>
                                <button
                                  className={s.viewBtn}
                                  onClick={(e) => { e.stopPropagation(); setViewRecord(rec); }}
                                >
                                  {'\u{1F441}'}
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Pagination */}
                  {records.total_pages > 1 && (
                    <div className={s.pagination}>
                      <button className={s.pageBtn} disabled={recordPage <= 1} onClick={() => setRecordPage(1)}>First</button>
                      <button className={s.pageBtn} disabled={recordPage <= 1} onClick={() => setRecordPage(p => p - 1)}>Prev</button>
                      <span className={s.pageInfo}>
                        Page {recordPage} of {records.total_pages} {'\u00B7'} {records.total.toLocaleString()} records
                      </span>
                      <button className={s.pageBtn} disabled={recordPage >= records.total_pages} onClick={() => setRecordPage(p => p + 1)}>Next</button>
                      <button className={s.pageBtn} disabled={recordPage >= records.total_pages} onClick={() => setRecordPage(records.total_pages)}>Last</button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ═══ RECORD DETAIL MODAL ═══ */}
      {viewRecord && (
        <div className={s.modalOverlay} onClick={() => setViewRecord(null)}>
          <div className={s.modalCard} onClick={(e) => e.stopPropagation()}>
            <div className={s.modalHeader}>
              <h3 className={s.modalTitle}>Row #{viewRecord.row_number}</h3>
              <button className={s.modalClose} onClick={() => setViewRecord(null)}>{'\u2715'}</button>
            </div>

            <div className={s.modalSection}>
              <div className={s.modalSectionTitle}>Status</div>
              <span className={`${s.statusBadge} ${s[`st_${(STATUS_MAP[viewRecord.processing_status] || STATUS_MAP.pending).color}`]}`}>
                {(STATUS_MAP[viewRecord.processing_status] || STATUS_MAP.pending).label}
              </span>
              {viewRecord.processed_at && (
                <span className={s.modalMeta}> Processed {timeAgo(viewRecord.processed_at)}</span>
              )}
            </div>

            {viewRecord.error_messages && viewRecord.error_messages.length > 0 && (
              <div className={s.modalSection}>
                <div className={`${s.modalSectionTitle} ${s.textDanger}`}>Errors</div>
                <ul className={s.errorList}>
                  {viewRecord.error_messages.map((err, i) => <li key={i}>{err}</li>)}
                </ul>
              </div>
            )}

            {viewRecord.warnings && viewRecord.warnings.length > 0 && (
              <div className={s.modalSection}>
                <div className={`${s.modalSectionTitle} ${s.textWarning}`}>Warnings</div>
                <ul className={s.warningList}>
                  {viewRecord.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

            <div className={s.modalSection}>
              <div className={s.modalSectionTitle}>Mapped Data</div>
              <pre className={s.jsonBlock}>{JSON.stringify(viewRecord.mapped_data, null, 2)}</pre>
            </div>

            <div className={s.modalSection}>
              <div className={s.modalSectionTitle}>Raw Data</div>
              <pre className={s.jsonBlock}>{JSON.stringify(viewRecord.raw_data, null, 2)}</pre>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
