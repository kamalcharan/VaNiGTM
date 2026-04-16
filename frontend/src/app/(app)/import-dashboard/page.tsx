'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { List, Database, Users, ArrowLeftRight, Bookmark } from 'lucide-react';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { useAuth } from '@/context/auth-provider';
import { VdfStatusBadge, VdfLoader, VdfProactiveCard, VdfEmptyState, VdfButton, VdfStatCard, VdfPageHeader, type BadgeVariant } from '@/components/vdf';
import d from '@/styles/data.module.css';
import s from './dashboard-page.module.css';

/* ── Types ─────────────────────────────────────────── */

interface Session {
  id: number; import_type: string; status: string;
  total_records: number; processed_records: number;
  successful_records: number; failed_records: number; duplicate_records: number;
  orphan_records: number;
  original_filename: string | null; created_at: string;
  staging_completed_at: string | null;
  processing_started_at: string | null;
  processing_completed_at: string | null;
  txn_date_min: string | null;
  txn_date_max: string | null;
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
  orphan:   { label: 'Orphan',    color: 'warning' },
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

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ── Column definitions — one entry per import type ─── */

type ColKind = 'row' | 'data' | 'alias' | 'status' | 'action';

interface ColDef {
  header: string;
  kind: ColKind;
  key?: string;   // mapped_data field for kind='data'
  mono?: boolean;
  bold?: boolean;
  muted?: boolean;
}

const COL_DEFS: Record<string, ColDef[]> = {
  scheme: [
    { header: '#',            kind: 'row' },
    { header: 'Scheme Code',  kind: 'data', key: 'scheme_code',  mono: true },
    { header: 'Scheme Name',  kind: 'data', key: 'scheme_name',  bold: true },
    { header: 'AMC',          kind: 'data', key: 'amc',          muted: true },
    { header: 'Category',     kind: 'data', key: 'category',     muted: true },
    { header: 'Status',       kind: 'status' },
    { header: '',             kind: 'action' },
  ],
  customer: [
    { header: '#',            kind: 'row' },
    { header: 'External ID',  kind: 'data', key: 'external_id',  mono: true },
    { header: 'PAN',          kind: 'data', key: 'pan',          mono: true },
    { header: 'Full Name',    kind: 'data', key: 'name',         bold: true },
    { header: 'Mobile',       kind: 'data', key: 'mobile',       muted: true },
    { header: 'Email',        kind: 'data', key: 'email',        muted: true },
    { header: 'Status',       kind: 'status' },
    { header: '',             kind: 'action' },
  ],
  transaction: [
    { header: '#',            kind: 'row' },
    { header: 'Customer',     kind: 'data', key: 'customer_name',  bold: true },
    { header: 'Scheme',       kind: 'data', key: 'scheme_name',    muted: true },
    { header: 'Type',         kind: 'data', key: 'txn_code',       mono: true },
    { header: 'Amount',       kind: 'data', key: 'amount',         mono: true },
    { header: 'Date',         kind: 'data', key: 'txn_date',       muted: true },
    { header: 'Folio',        kind: 'data', key: 'folio_number',   mono: true },
    { header: 'Status',       kind: 'status' },
    { header: '',             kind: 'action' },
  ],
  bookmark: [
    { header: '#',            kind: 'row' },
    { header: 'Scheme Code',  kind: 'data', key: 'scheme_code',  mono: true },
    { header: 'Scheme Name',  kind: 'data', key: 'scheme_name',  bold: true },
    { header: 'Alias',        kind: 'alias' },
    { header: 'Status',       kind: 'status' },
    { header: '',             kind: 'action' },
  ],
};

/* ── Drawer config — per import type ────────────────── */

interface DrawerConf {
  title: string;
  getHeading: (md: Record<string, any>) => string;
  getMeta:    (md: Record<string, any>) => string;
}

const DRAWER_CONF: Record<string, DrawerConf> = {
  scheme: {
    title:      'Scheme Record',
    getHeading: (md) => md.scheme_name || 'Unknown Scheme',
    getMeta:    (md) => [md.scheme_code && `Code: ${md.scheme_code}`, md.category && `Category: ${md.category}`].filter(Boolean).join(' · '),
  },
  customer: {
    title:      'Customer Record',
    getHeading: (md) => md.name || md.full_name || 'Unknown Customer',
    getMeta:    (md) => [md.pan && `PAN: ${md.pan}`, md.external_id && `Ext. ID: ${md.external_id}`].filter(Boolean).join(' · '),
  },
  transaction: {
    title:      'Transaction Record',
    getHeading: (md) => md.customer_name || md.scheme_name || md.scheme_code || 'Unknown Transaction',
    getMeta:    (md) => [md.txn_code, md.amount && `₹${md.amount}`, md.txn_date].filter(Boolean).join(' · '),
  },
  bookmark: {
    title:      'Bookmark Record',
    getHeading: (md) => md.scheme_name || md.scheme_code || 'Unknown Scheme',
    getMeta:    (md) => `Code: ${md.scheme_code || '—'}`,
  },
};

const DEFAULT_DRAWER_CONF: DrawerConf = DRAWER_CONF.bookmark;

/* ── Editable fields per import type ───────────────── */

const EDIT_FIELDS: Record<string, Array<{ key: string; label: string; type?: 'text' | 'date' }>> = {
  transaction: [
    { key: 'customer_name', label: 'Customer Name' },
    { key: 'vendor_code',   label: 'Vendor Code' },
    { key: 'scheme_name',   label: 'Scheme Name' },
    { key: 'txn_code',      label: 'Txn Type' },
    { key: 'txn_date',      label: 'Txn Date', type: 'date' },
    { key: 'amount',        label: 'Amount' },
  ],
  customer: [
    { key: 'name',        label: 'Full Name' },
    { key: 'pan',         label: 'PAN' },
    { key: 'external_id', label: 'External ID' },
    { key: 'mobile',      label: 'Mobile' },
    { key: 'email',       label: 'Email' },
  ],
  scheme: [
    { key: 'scheme_code', label: 'Scheme Code' },
    { key: 'scheme_name', label: 'Scheme Name' },
  ],
  bookmark: [
    { key: 'scheme_code', label: 'Scheme Code' },
    { key: 'scheme_name', label: 'Scheme Name' },
  ],
};

/* ── Sidebar type filter list ───────────────────────── */

const TYPE_FILTERS = [
  { key: 'all',         label: 'All',          icon: <List          size={14} /> },
  { key: 'scheme',      label: 'Schemes',      icon: <Database      size={14} /> },
  { key: 'customer',    label: 'Customers',    icon: <Users         size={14} /> },
  { key: 'transaction', label: 'Transactions', icon: <ArrowLeftRight size={14} /> },
  { key: 'bookmark',    label: 'Bookmarks',    icon: <Bookmark      size={14} /> },
];

/* ── Component ─────────────────────────────────────── */

export default function ImportDashboardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user } = useAuth();

  const [allSessions, setAllSessions] = useState<Session[]>([]);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [records, setRecords] = useState<RecordsResponse | null>(null);
  const [recordFilter, setRecordFilter] = useState<string>('all');
  const [recordPage, setRecordPage] = useState(1);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [drawerRecord, setDrawerRecord] = useState<StagingRecord | null>(null);
  const [reprocessing, setReprocessing] = useState(false);
  const [deletingStaging, setDeletingStaging] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sessionsFetched, setSessionsFetched] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editedData, setEditedData] = useState<Record<string, any>>({});
  const [patchingRecord, setPatchingRecord] = useState(false);
  const [reprocessingId, setReprocessingId] = useState<number | null>(null);
  const [recordsVersion, setRecordsVersion] = useState(0);
  const [syncingStats, setSyncingStats] = useState(false);

  // Derived: filtered session list + per-type counts (client-side — no re-fetch on filter change)
  const sessions = useMemo(() =>
    typeFilter === 'all' ? allSessions : allSessions.filter(s => s.import_type === typeFilter),
    [allSessions, typeFilter]
  );

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: allSessions.length };
    for (const s of allSessions) counts[s.import_type] = (counts[s.import_type] || 0) + 1;
    return counts;
  }, [allSessions]);

  // Fetch sessions — always fetches all; filtering is client-side
  const fetchSessions = useCallback(async () => {
    setLoadingSessions(true);
    setSessionsFetched(false);
    try {
      const data = await apiFetch<{ sessions: Session[] }>(API.etl.sessions);
      setAllSessions(data.sessions || []);
      // Keep current selection if still present, else auto-select first
      setSelectedSession(prev =>
        prev && data.sessions?.find((s: Session) => s.id === prev.id)
          ? prev
          : (data.sessions?.length ?? 0) > 0 ? data.sessions![0] : null
      );
    } catch (err) {
      console.error('[ImportDashboard] Failed to load sessions:', err);
      setAllSessions([]);
      showToast({ message: (err as ApiError).message || 'Failed to load import sessions', type: 'error' });
    } finally {
      setLoadingSessions(false);
      setSessionsFetched(true);
    }
  }, []); // eslint-disable-line

  useEffect(() => { fetchSessions(); }, [fetchSessions]);

  function handleTypeFilter(t: string) {
    const filtered = t === 'all' ? allSessions : allSessions.filter(s => s.import_type === t);
    setTypeFilter(t);
    setSelectedSession(filtered.length > 0 ? filtered[0] : null);
    setRecords(null);
  }

  // Fetch records — cancelled-flag pattern prevents stale responses on rapid selection changes
  const refreshRecords = useCallback(() => setRecordsVersion(v => v + 1), []);

  useEffect(() => {
    if (!selectedSession) { setRecords(null); return; }
    let cancelled = false;
    setLoadingRecords(true);
    const path = API.etl.records.path.replace(':id', String(selectedSession.id))
      + `?status=${recordFilter}&page=${recordPage}&limit=50`;
    apiFetch<RecordsResponse>({ ...API.etl.records, path })
      .then(data  => { if (!cancelled) setRecords(data); })
      .catch(err  => { if (!cancelled) { setRecords(null); showToast({ message: (err as ApiError).message || 'Failed to load records', type: 'error' }); } })
      .finally(() => { if (!cancelled) setLoadingRecords(false); });
    return () => { cancelled = true; };
  }, [selectedSession?.id, recordFilter, recordPage, recordsVersion]); // eslint-disable-line

  function handleSelectSession(sess: Session) { setSelectedSession(sess); setRecordFilter('all'); setRecordPage(1); }

  async function handleReprocess() {
    if (!selectedSession || reprocessing) return; setReprocessing(true);
    try {
      const data = await apiFetch<any>({ ...API.etl.reprocess, path: API.etl.reprocess.path.replace(':id', String(selectedSession.id)) });
      showToast({ message: `Reprocessed: ${data.successful || 0} passed, ${data.failed || 0} failed`, type: data.failed > 0 ? 'warning' : 'success' });
      fetchSessions(); refreshRecords();
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
      setRecords(null); setRecordsVersion(0); fetchSessions();
    } catch (err) { showToast({ message: (err as ApiError).message || 'Failed', type: 'error' }); }
    finally { setDeletingStaging(false); }
  }

  async function handleSyncStats() {
    if (!selectedSession || syncingStats) return;
    setSyncingStats(true);
    try {
      const data = await apiFetch<{ session: Partial<Session> }>({ ...API.etl.syncStats, path: API.etl.syncStats.path.replace(':id', String(selectedSession.id)) });
      // Patch the selected session in-place with corrected counters
      setSelectedSession(prev => prev ? { ...prev, ...data.session } : prev);
      setAllSessions(prev => prev.map(s => s.id === selectedSession.id ? { ...s, ...data.session } : s));
      showToast({ message: 'Session stats synced from staging data', type: 'success' });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Sync failed', type: 'error' });
    } finally {
      setSyncingStats(false);
    }
  }

  async function handlePatchRecord() {
    if (!selectedSession || !drawerRecord || patchingRecord) return;
    setPatchingRecord(true);
    setReprocessingId(drawerRecord.id);
    try {
      const path = API.etl.patchRecord.path
        .replace(':id', String(selectedSession.id))
        .replace(':recordId', String(drawerRecord.id));
      const data = await apiFetch<{ record: StagingRecord }>({ ...API.etl.patchRecord, path }, { body: { mapped_data: editedData } });
      setDrawerRecord(data.record);
      setEditMode(false);
      const st = data.record.processing_status;
      showToast({ message: st === 'success' ? 'Record reprocessed successfully' : `Reprocessed — status: ${st}`, type: st === 'success' ? 'success' : 'warning' });
      refreshRecords();
      fetchSessions();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to reprocess record', type: 'error' });
    } finally {
      setPatchingRecord(false);
      setReprocessingId(null);
    }
  }

  // VaNi analysis
  const isFinished = selectedSession ? ['completed', 'completed_with_errors'].includes(selectedSession.status) : false;
  const orphanCount = selectedSession?.orphan_records ?? 0;
  const vaniMsg = selectedSession
    ? !isFinished
      ? 'Processing import...'
      : selectedSession.failed_records > 0
      ? `Import completed with ${selectedSession.failed_records} failure${selectedSession.failed_records > 1 ? 's' : ''}. Review failed records and reprocess, or check field mappings.`
      : orphanCount > 0
      ? `Import complete with ${orphanCount} orphan record${orphanCount > 1 ? 's' : ''}. These transactions could not be matched to any client — verify your client list and reprocess.`
      : selectedSession.duplicate_records > 0 && selectedSession.successful_records > 0
      ? `Import complete. ${selectedSession.successful_records.toLocaleString()} records added, ${selectedSession.duplicate_records.toLocaleString()} already present.`
      : selectedSession.duplicate_records > 0 && selectedSession.successful_records === 0
      ? `All ${selectedSession.duplicate_records.toLocaleString()} records already present — no new additions.`
      : `Import perfect. All ${selectedSession.total_records.toLocaleString()} records processed successfully.`
    : null;

  const initials = user?.name?.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || '?';

  if (loadingSessions && !sessionsFetched) return <VdfLoader message="Loading import history" hint="Fetching sessions" />;

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="DATA IMPORT"
        title="Import Dashboard"
        meta={selectedSession ? (
          <>
            <strong>Import #{(selectedSession as any).tenant_seq ?? selectedSession.id}</strong>
            {selectedSession.original_filename && ` · ${selectedSession.original_filename}`}
            {selectedSession.import_type === 'transaction' && selectedSession.txn_date_max && (
              <> · Txn range: <strong>{fmtDate(selectedSession.txn_date_min)}</strong> – <strong>{fmtDate(selectedSession.txn_date_max)}</strong></>
            )}
          </>
        ) : undefined}
        actions={<>
          <div className={s.userBadge}>{initials}</div>
          <VdfButton variant="primary" size="sm" onClick={() => router.push('/import')}>+ New Import</VdfButton>
        </>}
      />

      <div className={s.grid}>
        {/* ═══ SIDEBAR ═══ */}
        <aside className={s.sidebar}>
          {/* Type filter list */}
          <div className={s.typeFilterList}>
            {TYPE_FILTERS.map(f => (
              <button
                key={f.key}
                className={`${s.typeFilterItem} ${typeFilter === f.key ? s.typeFilterItemActive : ''}`}
                onClick={() => handleTypeFilter(f.key)}
              >
                <span className={s.typeFilterIcon}>{f.icon}</span>
                <span className={s.typeFilterLabel}>{f.label}</span>
                <span className={s.typeFilterCount}>{typeCounts[f.key] ?? 0}</span>
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
                {selectedSession.import_type === 'transaction' && (
                  <VdfStatCard
                    value={selectedSession.orphan_records ?? 0}
                    label="Orphans"
                    accent={(selectedSession.orphan_records ?? 0) > 0 ? 'warning' : 'default'}
                  />
                )}
              </div>

              {/* VaNi Hero Card */}
              {vaniMsg && (
                <VdfProactiveCard
                  label="VaNi Post-Import Analysis"
                  message={vaniMsg}
                  ctaLabel={selectedSession.failed_records > 0 || orphanCount > 0
                    ? `Reprocess ${selectedSession.failed_records + orphanCount} Record${selectedSession.failed_records + orphanCount > 1 ? 's' : ''}`
                    : undefined}
                  onCta={selectedSession.failed_records > 0 || orphanCount > 0 ? handleReprocess : undefined}
                  ctaLoading={reprocessing}
                />
              )}

              {/* Table card */}
              <div className={s.tableCard}>
                <div className={s.tableToolbar}>
                  <div className={s.filterTabs}>
                    {[
                      { key: 'all',       label: 'All' },
                      { key: 'pending',   label: 'Pending', show: true },
                      { key: 'success',   label: `New (${selectedSession.successful_records - selectedSession.duplicate_records})` },
                      { key: 'duplicate', label: `Duplicate (${selectedSession.duplicate_records})` },
                      { key: 'failed',    label: `Failed (${selectedSession.failed_records})` },
                      ...(selectedSession.import_type === 'transaction'
                        ? [{ key: 'orphan', label: `Orphan (${selectedSession.orphan_records ?? 0})` }]
                        : []),
                    ].map(f => (
                      <button key={f.key} className={`${s.filterTab} ${recordFilter === f.key ? s.filterTabActive : ''}`}
                        onClick={() => { setRecordFilter(f.key); setRecordPage(1); }}>
                        {f.label}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    {/* Show Sync when session is completed but counters look wrong */}
                    {selectedSession.total_records > 0 &&
                      selectedSession.successful_records + selectedSession.failed_records + selectedSession.duplicate_records + (selectedSession.orphan_records ?? 0) === 0 && (
                      <button style={{ color: 'var(--color-warning)', fontSize: '0.72rem', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}
                        onClick={handleSyncStats} disabled={syncingStats} title="Session counters are out of sync — click to recount from staging">
                        ⚠ {syncingStats ? 'Syncing...' : 'Sync Stats'}
                      </button>
                    )}
                    <button style={{ color: 'var(--color-danger)', fontSize: '0.72rem', fontWeight: 700, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}
                      onClick={handleDeleteStaging} disabled={deletingStaging}>
                      {'\u{1F5D1}'} {deletingStaging ? 'Deleting...' : 'Delete Staging'}
                    </button>
                  </div>
                </div>

                <div className={s.tableScrollArea}>
                  {loadingRecords ? (
                    <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-muted)' }}>Loading records...</div>
                  ) : !records || records.records.length === 0 ? (
                    <div style={{ padding: 48, textAlign: 'center', color: 'var(--color-muted)' }}>
                      {records?.total === 0 ? 'No records match this filter' : 'Staging data may have been deleted'}
                    </div>
                  ) : (() => {
                    const cols = COL_DEFS[selectedSession.import_type] ?? COL_DEFS.scheme;
                    return (
                      <table className={d.table}>
                        <thead>
                          <tr>
                            {cols.map((col, ci) => (
                              <th key={ci} style={col.kind === 'action' ? { textAlign: 'center' } : undefined}>
                                {col.header}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {records.records.map(rec => {
                            const md = rec.mapped_data || {};
                            const st = STATUS_MAP[rec.processing_status] || STATUS_MAP.pending;
                            return (
                              <tr key={rec.id}
                                style={{ cursor: 'pointer', ...(rec.id === reprocessingId ? { background: 'color-mix(in srgb, var(--color-info) 8%, transparent)' } : {}) }}
                                onClick={() => { setDrawerRecord(rec); setEditMode(false); setEditedData(rec.mapped_data || {}); }}>
                                {cols.map((col, ci) => {
                                  if (col.kind === 'row') return (
                                    <td key={ci} style={{ color: 'var(--color-muted)', fontWeight: 500 }}>{rec.row_number}</td>
                                  );
                                  if (col.kind === 'data') {
                                    const val = col.key ? (md[col.key] ?? '—') : '—';
                                    return (
                                      <td key={ci}
                                        className={col.mono ? d.tdMono : undefined}
                                        style={{ fontSize: col.mono ? '0.72rem' : undefined, fontWeight: col.bold ? 600 : undefined, color: col.muted ? 'var(--color-muted)' : undefined }}>
                                        {val === null || val === undefined ? '—' : String(val)}
                                      </td>
                                    );
                                  }
                                  if (col.kind === 'alias') {
                                    const aliasStatus = md._alias_status as string | undefined;
                                    const aliasName   = md._alias_name   as string | undefined;
                                    const ab = aliasStatus ? (ALIAS_STATUS_MAP[aliasStatus] || ALIAS_STATUS_MAP.exists) : null;
                                    return (
                                      <td key={ci}>
                                        {ab ? (
                                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                            <VdfStatusBadge label={ab.label} variant={ab.color} size="sm" />
                                            {aliasName && <span style={{ fontSize: '0.68rem', color: 'var(--color-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 140 }}>{aliasName}</span>}
                                          </div>
                                        ) : <span style={{ color: 'var(--color-muted)', fontSize: '0.72rem' }}>—</span>}
                                      </td>
                                    );
                                  }
                                  if (col.kind === 'status') return (
                                    <td key={ci}><VdfStatusBadge label={st.label} variant={st.color} size="sm" /></td>
                                  );
                                  if (col.kind === 'action') return (
                                    <td key={ci} style={{ textAlign: 'center' }}>
                                      <button className={s.viewBtn} onClick={e => { e.stopPropagation(); setDrawerRecord(rec); }}>
                                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                                      </button>
                                    </td>
                                  );
                                  return null;
                                })}
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    );
                  })()}
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
      {drawerRecord && (() => {
        const conf = DRAWER_CONF[selectedSession?.import_type ?? ''] ?? DEFAULT_DRAWER_CONF;
        const md   = drawerRecord.mapped_data || {};
        const canEdit = ['failed', 'orphan', 'pending'].includes(drawerRecord.processing_status);
        const editFields = EDIT_FIELDS[selectedSession?.import_type ?? ''] || [];
        return (
        <>
          <div className={s.drawerOverlay} onClick={() => { setDrawerRecord(null); setEditMode(false); }} />
          <div className={s.drawer}>

            {/* Header with optional Edit toggle */}
            <div className={s.drawerHeader}>
              <div className={s.drawerTitle}>{conf.title} <span style={{ fontSize: '0.65rem', fontWeight: 500, color: 'var(--color-muted)', marginLeft: 6 }}>Row {drawerRecord.row_number}</span></div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                {canEdit && (
                  <button
                    onClick={() => { setEditMode(e => !e); if (!editMode) setEditedData({ ...md }); }}
                    style={{ padding: '4px 12px', fontSize: '0.72rem', fontWeight: 700, borderRadius: 6, border: '1px solid var(--color-border)', background: editMode ? 'var(--color-primary)' : 'transparent', color: editMode ? 'var(--color-primary-fg)' : 'var(--color-muted)', cursor: 'pointer', transition: 'all 200ms' }}
                  >
                    {editMode ? 'View' : 'Edit'}
                  </button>
                )}
                <button className={s.drawerClose} onClick={() => { setDrawerRecord(null); setEditMode(false); }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
            </div>

            {/* Identity card — view mode OR edit form */}
            {editMode && editFields.length > 0 ? (
              <div className={s.drawerCard}>
                <div className={s.drawerCardLabel}>Edit Mapped Data</div>
                {editFields.map(f => (
                  <div key={f.key} style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--color-muted)', marginBottom: 4 }}>{f.label}</div>
                    <input
                      type={f.type || 'text'}
                      value={editedData[f.key] ?? ''}
                      onChange={e => setEditedData(prev => ({ ...prev, [f.key]: e.target.value }))}
                      style={{ width: '100%', padding: '7px 10px', borderRadius: 6, border: '1px solid var(--color-border)', background: 'var(--color-bg)', color: 'var(--color-fg)', fontSize: '0.8rem', fontFamily: 'inherit', boxSizing: 'border-box', outline: 'none' }}
                    />
                  </div>
                ))}
                <button
                  onClick={handlePatchRecord}
                  disabled={patchingRecord}
                  style={{ width: '100%', marginTop: 8, padding: '10px', background: 'var(--color-primary)', color: 'var(--color-primary-fg)', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.82rem', cursor: patchingRecord ? 'not-allowed' : 'pointer', opacity: patchingRecord ? 0.6 : 1, transition: 'opacity 200ms' }}
                >
                  {patchingRecord ? 'Processing...' : 'Save & Reprocess'}
                </button>
              </div>
            ) : (
              <div className={s.drawerCard}>
                <div className={s.drawerCardLabel}>Staging Data</div>
                <div className={s.drawerCardTitle}>{conf.getHeading(md)}</div>
                <div className={s.drawerCardMeta}>{conf.getMeta(md)}</div>
              </div>
            )}

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
              ) : drawerRecord.processing_status === 'orphan' ? (
                <div className={`${s.drawerDiagnostic} ${s.diagWarning}`} style={{ color: 'var(--color-warning)', background: 'color-mix(in srgb, var(--color-warning) 8%, transparent)', border: '1px solid color-mix(in srgb, var(--color-warning) 12%, transparent)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <span>No matching client found — client may not be imported yet. Import clients first, then reprocess.</span>
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
      );
      })()}
    </div>
  );
}
