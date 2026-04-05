'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { useAuth } from '@/context/auth-provider';
import { VdfStatusBadge, VdfLoader, type BadgeVariant } from '@/components/vdf';
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
  success: { label: 'Success', color: 'success' },
  duplicate: { label: 'Updated', color: 'info' },
};

function timeAgo(iso: string): string {
  const h = Math.floor((Date.now() - new Date(iso).getTime()) / 3600000);
  if (h < 1) return 'Just now'; if (h < 24) return `${h}h ago`; return `${Math.floor(h / 24)}d ago`;
}

const SCHEME_COLS = ['scheme_code', 'scheme_name', 'amc', 'category'];

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
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [drawerRecord, setDrawerRecord] = useState<StagingRecord | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [deletingStaging, setDeletingStaging] = useState(false);

  // Fetch sessions
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    try {
      const data = await apiFetch<{ sessions: Session[] }>(API.etl.sessions);
      setSessions(data.sessions || []);
      if (data.sessions?.length > 0 && !selectedSession) setSelectedSession(data.sessions[0]);
    } catch (err) { console.error('[ImportDashboard] Failed to load sessions:', err); setSessions([]); }
    finally { setLoadingSessions(false); }
  }, []); // eslint-disable-line

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  // Fetch records
  const fetchRecords = useCallback(async () => {
    if (!selectedSession) { setRecords(null); return; }
    setLoadingRecords(true);
    try {
      const qs = `?status=${recordFilter}&page=${recordPage}&limit=50`;
      const data = await apiFetch<RecordsResponse>({ ...API.etl.records, path: API.etl.records.path.replace(':id', String(selectedSession.id)) + qs });
      setRecords(data);
    } catch { setRecords(null); }
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

  // Compute speed
  const speed = selectedSession?.processing_started_at && selectedSession?.processing_completed_at
    ? Math.round(selectedSession.total_records / ((new Date(selectedSession.processing_completed_at).getTime() - new Date(selectedSession.processing_started_at).getTime()) / 1000))
    : null;

  // VaNi analysis
  const vaniMsg = selectedSession
    ? selectedSession.failed_records > 0
      ? `Import completed with ${selectedSession.failed_records} failures. Review failed records and reprocess, or check field mappings.`
      : selectedSession.successful_records === selectedSession.total_records
      ? `Import perfect. All ${selectedSession.total_records.toLocaleString()} records processed. Cross-referencing with NAV database for operational health.`
      : 'Import in progress...'
    : null;

  const initials = user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  if (loadingSessions) return <VdfLoader message="Loading import history" hint="Fetching sessions" />;

  return (
    <div className={s.page}>
      {/* Breadcrumb */}
      <div className={s.breadcrumb}>
        <div className={s.breadcrumbLeft}>
          <h1 className={d.pageTitle} style={{ fontSize: '1.1rem' }}>Import Dashboard</h1>
          {selectedSession && (
            <>
              <span className={s.breadcrumbSep}>/</span>
              <span className={s.breadcrumbSession}>Session #{selectedSession.id}: {selectedSession.original_filename || 'Unknown'}</span>
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
          {sessions.map(sess => (
            <div key={sess.id} className={selectedSession?.id === sess.id ? s.sessionCardActive : s.sidebarLink}
              onClick={() => handleSelectSession(sess)}>
              <div>
                <div className={s.sessionCardLabel}>Session #{sess.id}</div>
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
            <VdfLoader message="No sessions" hint="Click New Import to start" />
          ) : (
            <>
              {/* Stat cards (bottom-border accent) */}
              <div className={s.statsGrid}>
                <div className={s.statCardAccent}>
                  <div className={s.statCardLabel}>Total Records</div>
                  <div className={s.statCardValue}>{selectedSession.total_records.toLocaleString()}</div>
                </div>
                <div className={`${s.statCardAccent} ${s.stSuccess}`}>
                  <div className={s.statCardLabel}>Successful</div>
                  <div className={`${s.statCardValue} ${s.statCardValueSuccess}`}>
                    {selectedSession.successful_records.toLocaleString()}
                    {selectedSession.total_records > 0 && (
                      <span className={s.statCardPct}>{Math.round((selectedSession.successful_records / selectedSession.total_records) * 100)}%</span>
                    )}
                  </div>
                </div>
                <div className={`${s.statCardAccent} ${s.stDanger}`}>
                  <div className={s.statCardLabel}>Failed</div>
                  <div className={`${s.statCardValue} ${selectedSession.failed_records === 0 ? s.statCardValueMuted : ''}`}>
                    {selectedSession.failed_records.toLocaleString()}
                  </div>
                </div>
                <div className={`${s.statCardAccent} ${s.stMuted}`}>
                  <div className={s.statCardLabel}>Speed</div>
                  <div className={s.statCardValue}>
                    {speed ? speed.toLocaleString() : '\u2014'}
                    {speed && <span className={s.statCardUnit}>row/s</span>}
                  </div>
                </div>
              </div>

              {/* VaNi Hero Card */}
              {vaniMsg && (
                <div className={s.vaniHero}>
                  <div className={s.vaniHeroContent}>
                    <div className={s.vaniHeroIcon}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" /></svg>
                    </div>
                    <div>
                      <div className={s.vaniHeroTitle}>VaNi Post-Import Analysis</div>
                      <div className={s.vaniHeroText}>{vaniMsg}</div>
                      {selectedSession.failed_records > 0 && (
                        <div className={s.vaniHeroActions}>
                          <button className={d.pageBtn} onClick={handleReprocess} disabled={reprocessing}
                            style={{ background: 'var(--color-primary)', color: 'var(--color-primary-fg)', borderColor: 'var(--color-primary)', fontWeight: 700 }}>
                            {reprocessing ? 'Reprocessing...' : `Reprocess ${selectedSession.failed_records} Failed`}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className={s.vaniHeroWatermark}>{'\u26A1'}</div>
                </div>
              )}

              {/* Table card */}
              <div className={s.tableCard}>
                <div className={s.tableToolbar}>
                  <div className={s.filterTabs}>
                    {[
                      { key: 'all', label: 'All' },
                      { key: 'success', label: `New (${selectedSession.successful_records - selectedSession.duplicate_records})` },
                      { key: 'duplicate', label: `Updated (${selectedSession.duplicate_records})` },
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
                          <th>AMC</th>
                          <th>Status</th>
                          <th style={{ textAlign: 'right' }}>Operational Health</th>
                          <th style={{ textAlign: 'center' }}>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {records.records.map(rec => {
                          const st = STATUS_MAP[rec.processing_status] || STATUS_MAP.pending;
                          // Operational health: does this scheme have NAV data?
                          const schemeCode = rec.mapped_data?.scheme_code;
                          return (
                            <tr key={rec.id} style={{ cursor: 'pointer' }} onClick={() => setDrawerRecord(rec)}>
                              <td style={{ color: 'var(--color-muted)', fontWeight: 500 }}>{rec.row_number}</td>
                              <td className={d.tdMono} style={{ fontSize: '0.72rem' }}>{schemeCode || '\u2014'}</td>
                              <td style={{ fontWeight: 600 }}>{rec.mapped_data?.scheme_name || '\u2014'}</td>
                              <td style={{ fontSize: '0.72rem', color: 'var(--color-muted)' }}>{rec.mapped_data?.amc || '\u2014'}</td>
                              <td><VdfStatusBadge label={st.label} variant={st.color} size="sm" /></td>
                              <td style={{ textAlign: 'right' }}>
                                <span className={`${s.healthBadge} ${s.healthNoNav}`}>No NAV Data</span>
                              </td>
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
                {' \u00B7 '}Category: {drawerRecord.mapped_data?.category || '\u2014'}
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
              ) : (
                <div className={`${s.drawerDiagnostic} ${s.diagInfo}`}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><circle cx="12" cy="12" r="10" /><polyline points="16 12 12 8 8 12" /><line x1="12" y1="16" x2="12" y2="8" /></svg>
                  <span>This scheme may be missing from the NAV database. Download NAV data to complete tracking.</span>
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
