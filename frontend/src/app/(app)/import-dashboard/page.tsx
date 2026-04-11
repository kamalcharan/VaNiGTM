'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { useAuth } from '@/context/auth-provider';
import { VdfStatusBadge, VdfLoader, VdfProactiveCard, VdfEmptyState, VdfButton, VdfStatCard, type BadgeVariant } from '@/components/vdf';
import d from '@/styles/data.module.css';
import s from './dashboard-page.module.css';

/* ── Types ─────────────────────────────────────────── */

interface Session {
  id: number; import_type: string; status: string;
  total_records: number; processed_records: number;
  successful_records: number; failed_records: number; duplicate_records: number;
  original_filename: string | null; created_at: string;
  staging_completed_at: string | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
}

interface StagingRecord {
  id: number; row_number: number; processing_status: string;
  mapped_data: Record<string, any>; raw_data: Record<string, any>;
  error_messages: string[] | null; warnings: string[] | null;
  created_record_id: string | null; processed_at: string | null;
}

interface RecordsResponse { records: StagingRecord[]; page: number; limit: number; total: number; total_pages: number; }

const STATUS_MAP: Record<string, { label: string; color: BadgeVariant }> = {
  completed: { label: 'Completed', color: 'success' },
  completed_with_errors: { label: 'With Errors', color: 'warning' },
  processing: { label: 'Processing', color: 'info' },
  staged: { label: 'Staged', color: 'info' },
  pending: { label: 'Pending', color: 'muted' },
  failed: { label: 'Failed', color: 'danger' },
  success: { label: 'Added', color: 'success' },
  duplicate: { label: 'Duplicate', color: 'muted' },  // already tracked — rejected, no action
};

const ALIAS_STATUS_MAP: Record<string, { label: string; color: BadgeVariant }> = {
  created: { label: 'Created', color: 'success' },
  exists:  { label: 'Exists',  color: 'muted' },
  failed:  { label: 'Failed',  color: 'danger' },
};

function timeAgo(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return 'Just now'; if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`;
}

const COLS_BY_TYPE: Record<string, string[]> = {
  scheme:   ['scheme_code', 'scheme_name', 'amc', 'category'],
  bookmark: ['scheme_code', 'scheme_name', 'amc'],
  default:  ['scheme_code', 'scheme_name', 'amc'],
};

/* ── Component ─────────────────────────────────────── */

export default function ImportDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [records, setRecords] = useState<RecordsResponse | null>(null);
  const [recordFilter, setRecordFilter] = useState<string>('all');
  const [recordPage, setRecordPage] = useState(1);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [drawerRecord, setDrawerRecord] = useState<StagingRecord | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [deletingStaging, setDeletingStaging] = useState(false);
  const [typeFilter, setTypeFilter] = useState<'all' | 'bookmark'>('all');
  const [sessionsFetched, setSessionsFetched] = useState(false);

  // Fetch sessions
  const fetchSessions = useCallback(async (type: 'all' | 'bookmark' = 'all') => {
    setLoadingSessions(true);
    setSessionsFetched(false);
    try {
      const qs = type !== 'all' ? `?type=${type}` : '';
      const data = await apiFetch<{ sessions: Session[] }>({ ...API.etl.sessions, path: API.etl.sessions.path + qs });
      setSessions(data.sessions || []);
      setSelectedSession(data.sessions?.length > 0 ? data.sessions[0] : null);
    } catch (err) {
      console.error('[ImportDashboard] Failed to load sessions:', err);
      setSessions([]);
      showToast({ message: (err as ApiError).message || 'Failed to load import sessions', type: 'error' });
    } finally {
      setLoadingSessions(false);
      setSessionsFetched(true);
    }
  }, []); // eslint-disable-line

  useEffect(() => { fetchSessions(typeFilter); }, [fetchSessions, typeFilter]);

  function handleTypeFilter(t: 'all' | 'bookmark') {
    setTypeFilter(t);
    setSelectedSession(null);
    setRecords(null);
  }

  // Fetch records
  const fetchRecords = useCallback(async () => {
    if (!selectedSession) { setRecords(null); return; }
    setLoadingRecords(true);
    try {
      const qs = `?status=${recordFilter}&page=${recordPage}&limit=50`;
      const data = await apiFetch<RecordsResponse>({ ...API.etl.records, path: API.etl.records.path.replace(':id', String(selectedSession.id)) + qs });
      setRecords(data);
    } catch (err) {
      setRecords(null);
      showToast({ message: (err as ApiError).message || 'Failed to load records', type: 'error' });
    }
    finally { setLoadingRecords(false); }
  }, [selectedSession, recordFilter, recordPage]);

  useEffect(() => { fetchRecords(); }, [fetchRecords]);

  function handleSelectSession(sess: Session) { setSelectedSession(sess); setRecordFilter('all'); setRecordPage(1); }

  async function handleReprocess() {
    if (!selectedSession || reprocessing) return; setReprocessing(true);
    try {
      const data = await apiFetch<any>({ ...API.etl.reprocess, path: API.etl.reprocess.path.replace(':id', String(selectedSession.id)) });
      showToast({ message: `Reprocessed: ${data.successful || 0} passed, ${data.failed || 0} failed`, type: data.failed > 0 ? 'warning' : 'success' });
      fetchSessions(); fetchRecords();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setReprocessing(false); }
  }

  async function handleDeleteStaging() {
    if (!selectedSession || deletingStaging) return;
    if (!confirm('Permanently delete staging data? You won\'t be able to reprocess.')) return;
    setDeletingStaging(true);
    try {
      await apiFetch<any>({ ...API.etl.deleteStaging, path: API.etl.deleteStaging.path.replace(':id', String(selectedSession.id)) });
      showToast({ message: 'Staging deleted', type: 'success' });
      setRecords(null); fetchSessions();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setDeletingStaging(false); }
  }

  // VaNi analysis
  const isFinished = selectedSession ? ['completed', 'completed_with_errors'].includes(selectedSession.status) : false;
  const vaniMsg = selectedSession
    ? !isFinished
      ? 'Processing import...'
      : selectedSession.failed_records > 0
      ? `Import completed with ${selectedSession.failed_records} failure${selectedSession.failed_records > 1 ? 's' : ''}. Review failed records and reprocess, or check field mappings.`
      : selectedSession.duplicate_records > 0 && selectedSession.successful_records > 0
      ? `Import complete. ${selectedSession.successful_records.toLocaleString()} new bookmarks added, ${selectedSession.duplicate_records.toLocaleString()} already in your watchlist.`
      : selectedSession.duplicate_records > 0 && selectedSession.successful_records === 0
      ? `All ${selectedSession.duplicate_records.toLocaleString()} bookmarks are already in your watchlist — no new additions.`
      : `Import perfect. All ${selectedSession.total_records.toLocaleString()} records processed successfully.`
    : null;

  const initials = user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  if (loadingSessions && !sessionsFetched) return <VdfLoader message="Loading import history" hint="Fetching sessions" />;

  return (
    <div className={s.page}>
      {/* Breadcrumb */}
      <div className={s.breadcrumb}>
        <div className={s.breadcrumbLeft}>
          <h1 className={d.pageTitle} style={{ fontSize: '1.1rem' }}>Import Dashboard</h1>
          {selectedSession && (
            <>
              <span className={s.breadcrumbSep}>/</span>
              <span className={s.breadcrumbSession}>
                Import #{(selectedSession as any).tenant_seq ?? selectedSession.id}
                <span className={s.breadcrumbSessionId}>· Session {selectedSession.id}</span>
                {selectedSession.original_filename ? ` · ${selectedSession.original_filename}` : ''}
              </span>
            </>
          )}
        </div>
        <div className={s.breadcrumbRight}>
          <div className={s.userBadge}>{initials}</div>
          <button className={d.pageBtn} onClick={() => router.push('/import')}
            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)', borderColor: 'var(--color-primary)', fontWeight: 700 }}>
            + New Import
          </button>
        </div>
      </div>

      <div className={s.grid}>
        {/* ═══ SIDEBAR ═══ */}
        <aside className={s.sidebar}>
          {/* Type filter tabs */}
          <div className={s.sidebarFilters}>
            {(['all', 'bookmark'] as const).map(t => (
              <button key={t} className={typeFilter === t ? s.filterTabActive : s.filterTab}
                onClick={() => handleTypeFilter(t)}>
                {t === 'all' ? 'All' : 'Bookmark'}
              </button>
            ))}
          </div>
          {sessions.length === 0 && sessionsFetched ? (
            <div className={s.sidebarEmpty}>
              <div className={s.sidebarEmptyIcon}>📭</div>
              <div className={s.sidebarEmptyText}>No imports yet</div>
            </div>
          ) : sessions.map(sess => (
            <div key={sess.id} className={selectedSession?.id === sess.id ? s.sessionCardActive : s.sessionCard}
              onClick={() => handleSelectSession(sess)}>
              <div>
                <div className={s.sessionCardLabel}>
                  Import #{(sess as any).tenant_seq ?? sess.id}
                  <span className={s.sessionIdBadge}>ID {sess.id}</span>
                </div>
                <div className={s.sessionCardFile}>{sess.original_filename || `${sess.import_type} import`}</div>
                <div className={s.sessionCardMeta}>{timeAgo(sess.created_at)} {'\u00B7'} {sess.import_type}</div>
              </div>
            </div>
          ))}
          <div className={s.sidebarLink} onClick={() => router.push('/import')}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16"><path d="M12 5v14M5 12h14" /></svg>
            <span>New Import</span>
          </div>
        </aside>

        {/* ═══ MAIN ═══ */}
        <main className={s.main}>
          {!selectedSession ? (
            <VdfEmptyState
              icon="📂"
              title={sessions.length === 0 ? 'No imports yet' : 'Select an import'}
              description={sessions.length === 0
                ? 'Your import history will appear here. Start by importing your bookmark list.'
                : 'Choose an import session from the sidebar to review records.'}
              action={sessions.length === 0
                ? <VdfButton variant="primary" onClick={() => router.push('/import')}>Start First Import</VdfButton>
                : undefined}
            />
          ) : (
            <>
              {/* Stat cards */}
              <div className={s.statsGrid}>
                <VdfStatCard value={selectedSession.total_records} label="Total Records" />
                <VdfStatCard
                  value={selectedSession.successful_records}
                  label="Successful"
                  accent="success"
                  pct={selectedSession.total_records > 0
                    ? `${Math.round((selectedSession.successful_records / selectedSession.total_records) * 100)}%`
                    : undefined}
                />
                <VdfStatCard
                  value={selectedSession.failed_records}
                  label="Failed"
                  accent={selectedSession.failed_records > 0 ? 'danger' : 'default'}
                />
                <VdfStatCard
                  value={selectedSession.duplicate_records}
                  label="Duplicates"
                />
              </div>

              {/* VaNi Hero Card */}
              {vaniMsg && (
                <VdfProactiveCard
                  label="VaNi Post-Import Analysis"
                  message={vaniMsg}
                  ctaLabel={selectedSession.failed_records > 0 ? `Reprocess ${selectedSession.failed_records} Failed` : undefined}
                  onCta={selectedSession.failed_records > 0 ? handleReprocess : undefined}
                  ctaLoading={reprocessing}
                />
              )}

              {/* Table card */}
              <div className={s.tableCard}>
                <div className={s.tableToolbar}>
                  <div className={s.filterTabs}>
                    {[
                      { key: 'all', label: 'All' },
                      { key: 'success', label: `New (${selectedSession.successful_records - selectedSession.duplicate_records})` },
                      { key: 'duplicate', label: `Duplicate (${selectedSession.duplicate_records})` },
                      { key: 'failed', label: `Failed (${selectedSession.failed_records})` },
                    ].map(f => (
                      <button key={f.key} className={`${s.filterTab} ${recordFilter === f.key ? s.filterTabActive : ''}`}
                        onClick={() => { setRecordFilter(f.key); setRecordPage(1); }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <button style={{ color: 'var(--color-danger)', fontSize: '0.72rem', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                    onClick={handleDeleteStaging} disabled={deletingStaging}>
                    {'\u{1F5D1}'} {deletingStaging ? 'Deleting...' : 'Delete Staging'}
                  </button>
                </div>

                <div className={s.tableScrollArea}>
                  {loadingRecords ? (
                    <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-muted)' }}>Loading records...</div>
                  ) : !records || records.records.length === 0 ? (
                    <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-muted)' }}>
                      {records?.total === 0 ? 'No records match this filter' : 'Staging data may have been deleted'}
                    </div>
                  ) : (
                    <table className={d.table}>
                      <thead>
                        <tr>
                          <th>Row</th>
                          <th>Scheme Code</th>
                          <th>Scheme Name</th>
                          {selectedSession.import_type !== 'bookmark' && <th>AMC</th>}
                          {selectedSession.import_type === 'bookmark' && <th>Alias</th>}
                          <th>Status</th>
                          <th style={{ textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.records.map(rec => {
                          const st = STATUS_MAP[rec.processing_status] || STATUS_MAP.pending;
                          const schemeCode = rec.mapped_data?.scheme_code;
                          const aliasStatus = rec.mapped_data?._alias_status as string | undefined;
                          const aliasName = rec.mapped_data?._alias_name as string | undefined;
                          const aliasBadge = aliasStatus ? (ALIAS_STATUS_MAP[aliasStatus] || ALIAS_STATUS_MAP.exists) : null;
                          return (
                            <tr key={rec.id} style={{ cursor: 'pointer' }} onClick={() => setDrawerRecord(rec)}>
                              <td style={{ color: 'var(--color-muted)', fontWeight: 500 }}>{rec.row_number}</td>
                              <td className={d.tdMono} style={{ fontSize: '0.72rem' }}>{schemeCode || '\u2014'}</td>
                              <td style={{ fontWeight: 600 }}>{rec.mapped_data?.scheme_name || '\u2014'}</td>
                              {selectedSession.import_type !== 'bookmark' && (
                                <td style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{rec.mapped_data?.amc || '\u2014'}</td>
                              )}
                              {selectedSession.import_type === 'bookmark' && (
                                <td>
                                  {aliasBadge ? (
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <VdfStatusBadge label={aliasBadge.label} variant={aliasBadge.color} size="sm" />
                                      {aliasName && <span style={{ fontSize: '0.68rem', color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{aliasName}</span>}
                                    </div>
                                  ) : (
                                    <span style={{ color: 'var(--color-muted)', fontSize: '0.72rem' }}>—</span>
                                  )}
                                </td>
                              )}
                              <td><VdfStatusBadge label={st.label} variant={st.color} size="sm" /></td>
                              <td style={{ textAlign: 'center' }}>
                                <button className={s.viewBtn} onClick={e => { e.stopPropagation(); setDrawerRecord(rec); }}>
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  )}
                </div>

                {records && records.total_pages > 1 && (
                  <div className={d.pagination}>
                    <button className={d.pageBtn} disabled={recordPage <= 1} onClick={() => setRecordPage(1)}>First</button>
                    <button className={d.pageBtn} disabled={recordPage <= 1} onClick={() => setRecordPage(p => p - 1)}>Prev</button>
                    <span className={d.pageInfo}>Page {recordPage} / {records.total_pages} {'\u00B7'} {records.total.toLocaleString()} records</span>
                    <button className={d.pageBtn} disabled={recordPage >= records.total_pages} onClick={() => setRecordPage(p => p + 1)}>Next</button>
                    <button className={d.pageBtn} disabled={recordPage >= records.total_pages} onClick={() => setRecordPage(records.total_pages)}>Last</button>
                  </div>
                )}
              </div>
            </>
          )}
        </main>
      </div>

      {/* ═══ RECORD DRAWER ═══ */}
      {drawerRecord && (
        <>
          <div className={s.drawerOverlay} onClick={() => setDrawerRecord(null)} />
          <div className={s.drawer}>
            <div className={s.drawerHeader}>
              <div className={s.drawerTitle}>Scheme Preview</div>
              <button className={s.drawerClose} onClick={() => setDrawerRecord(null)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>

            {/* Staging data card */}
            <div className={s.drawerCard}>
              <div className={s.drawerCardLabel}>Staging Data</div>
              <div className={s.drawerCardTitle}>{drawerRecord.mapped_data?.scheme_name || 'Unknown Scheme'}</div>
              <div className={s.drawerCardMeta}>
                Code: {drawerRecord.mapped_data?.scheme_code || '\u2014'}
                {drawerRecord.mapped_data?.category && (
                  <>{' \u00B7 '}Category: {drawerRecord.mapped_data.category}</>
                )}
              </div>
            </div>

            {/* Status */}
            <div className={s.drawerSection}>
              <div className={s.drawerSectionTitle}>Import Status</div>
              <VdfStatusBadge label={(STATUS_MAP[drawerRecord.processing_status] || STATUS_MAP.pending).label}
                variant={(STATUS_MAP[drawerRecord.processing_status] || STATUS_MAP.pending).color} />
            </div>

            {/* Diagnostic */}
            <div className={s.drawerSection}>
              <div className={s.drawerSectionTitle}>Diagnostic</div>
              {drawerRecord.error_messages && drawerRecord.error_messages.length > 0 ? (
                <div className={`${s.drawerDiagnostic} ${s.diagWarning}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <span>{drawerRecord.error_messages[0]}</span>
                </div>
              ) : drawerRecord.processing_status === 'duplicate' ? (
                <div className={`${s.drawerDiagnostic} ${s.diagInfo}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <span>Already in your watchlist — no action taken.</span>
                </div>
              ) : drawerRecord.processing_status === 'success' ? (
                <div className={`${s.drawerDiagnostic} ${s.diagInfo}`} style={{ color: 'var(--color-success)', background: 'color-mix(in srgb, var(--color-success) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-success) 12%, transparent)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><polyline points="20 6 9 17 4 12" /></svg>
                  <span>Added to watchlist. Download NAV data to begin tracking.</span>
                </div>
              ) : null}
              {/* Alias status — bookmark imports only */}
              {drawerRecord.mapped_data?._alias_status && (() => {
                const a = ALIAS_STATUS_MAP[drawerRecord.mapped_data._alias_status] || ALIAS_STATUS_MAP.exists;
                const name = drawerRecord.mapped_data?._alias_name;
                return (
                  <div className={`${s.drawerDiagnostic} ${s.diagInfo}`} style={{ marginTop: 8,
                    color: a.color === 'success' ? 'var(--color-success)' : a.color === 'danger' ? 'var(--color-danger)' : 'var(--color-muted)',
                    background: a.color === 'success' ? 'color-mix(in srgb, var(--color-success) 8%, transparent)' : a.color === 'danger' ? 'color-mix(in srgb, var(--color-danger) 8%, transparent)' : 'color-mix(in srgb, var(--color-muted) 8%, transparent)',
                    border: `1px solid color-mix(in srgb, var(--color-${a.color === 'success' ? 'success' : a.color === 'danger' ? 'danger' : 'muted'}) 12%, transparent)`,
                  }}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M7 7H4a2 2 0 00-2 2v9a2 2 0 002 2h16a2 2 0 002-2V9a2 2 0 00-2-2h-3" /><polyline points="16 3 12 7 8 3" /></svg>
                    <span>Alias {a.label.toLowerCase()}{name ? `: "${name}"` : ''}</span>
                  </div>
                );
              })()}
              {!drawerRecord.error_messages?.length && drawerRecord.processing_status !== 'success' && drawerRecord.processing_status !== 'duplicate' && !drawerRecord.mapped_data?._alias_status && (
                <div className={`${s.drawerDiagnostic} ${s.diagInfo}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
                  <span>Pending processing.</span>
                </div>
              )}
            </div>

            {/* Action */}
            {drawerRecord.mapped_data?.scheme_code && (
              <button className={d.pageBtn} onClick={() => router.push(`/global-nav/${drawerRecord.mapped_data.scheme_code}`)}
                style={{ width: '100%', padding: 12, background: 'var(--color-primary)', color: 'var(--color-primary-fg)', borderColor: 'var(--color-primary)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                View Scheme Dashboard
              </button>
            )}

            {/* Raw data */}
            <div className={s.drawerSection} style={{ marginTop: 16 }}>
              <div className={s.drawerSectionTitle}>Mapped Data</div>
              <pre className={s.drawerJson}>{JSON.stringify(drawerRecord.mapped_data, null, 2)}</pre>
            </div>

            <div className={s.drawerSection}>
              <div className={s.drawerSectionTitle}>Raw Data</div>
              <pre className={s.drawerJson}>{JSON.stringify(drawerRecord.raw_data, null, 2)}</pre>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
