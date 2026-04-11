'use client';

import { useState, useMemo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfEmptyState, VdfButton, VdfStatusBadge,
  VdfCard, VdfSearchBar, VdfStatCard, VdfModal, VdfPersonRow,
  VdfPageHeader,
} from '@/components/vdf';
import s from './clients.module.css';
import d from '@/styles/data.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Client {
  id: number;
  client_uid: string;
  client_no: string | null;
  contact_no: string | null;
  ext_ref_id: string | null;
  pan: string | null;
  dob: string | null;
  risk_profile: string | null;
  onboarding_status: string;
  is_bookmarked: boolean;
  prefix: string;
  name: string;
  primary_mobile: string | null;
  primary_email: string | null;
}

interface ClientsData { clients: Client[]; total: number; }

interface BookmarkReason {
  id: number;
  reason_code: string;
  reason_label: string;
  display_order: number;
}

interface ReasonsData { reasons: BookmarkReason[]; }

interface StatsData {
  total_clients: number;
  active_clients: number;
  pending_onboarding: number;
  bookmarked: number;
  recent_30_days: number;
  family_count: number;
  families_members: number;
}

type RiskFilter  = 'all' | 'conservative' | 'moderate' | 'aggressive';
type ViewMode    = 'row' | 'grid';

/* ── Constants ───────────────────────────────────────── */

const PAGE_SIZE = 25;

const RISK_PILLS = [
  { id: 'all',          label: 'All' },
  { id: 'conservative', label: 'Conservative' },
  { id: 'moderate',     label: 'Moderate' },
  { id: 'aggressive',   label: 'Aggressive' },
];

const RISK_COLORS: Record<string, string> = {
  conservative: 'var(--color-info)',
  moderate:     'var(--color-warning)',
  aggressive:   'var(--color-danger)',
};

const STATUS_VARIANT: Record<string, 'success' | 'warning' | 'muted' | 'danger'> = {
  completed:   'success',
  in_progress: 'warning',
  pending:     'muted',
  cancelled:   'danger',
};

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, var(--color-primary), color-mix(in srgb, var(--color-primary) 60%, #000))',
  'linear-gradient(135deg, var(--color-accent), color-mix(in srgb, var(--color-accent) 60%, #000))',
  'linear-gradient(135deg, var(--color-info), color-mix(in srgb, var(--color-info) 60%, #000))',
  'linear-gradient(135deg, var(--color-warning), color-mix(in srgb, var(--color-warning) 60%, #000))',
  'linear-gradient(135deg, var(--color-success), color-mix(in srgb, var(--color-success) 60%, #000))',
  'linear-gradient(135deg, var(--color-danger), color-mix(in srgb, var(--color-danger) 60%, #000))',
];

function avatarGradient(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) & 0xffff;
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length];
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ── Bookmark Icon ───────────────────────────────────── */

function BookmarkIcon({ filled, size = 16 }: { filled: boolean; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor" strokeWidth="1.5" width={size} height={size}>
      <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
    </svg>
  );
}

/* ── Component ───────────────────────────────────────── */

export default function ClientsPage() {
  const router       = useRouter();
  const queryClient  = useQueryClient();
  const { showToast } = useToast();

  /* ── View & filter state ─────────────────────────── */
  const [viewMode,       setViewMode]       = useState<ViewMode>('row');
  const [search,         setSearch]         = useState('');
  const [activeSearch,   setActiveSearch]   = useState('');
  const [riskFilter,     setRiskFilter]     = useState<RiskFilter>('all');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);
  const [recentOnly,     setRecentOnly]     = useState(false);
  const [inFamily,       setInFamily]       = useState(false);
  const [page,           setPage]           = useState(1);
  const [bookmarkingId,  setBookmarkingId]  = useState<number | null>(null);

  /* ── Bookmark modal state ────────────────────────── */
  const [bookmarkTarget,   setBookmarkTarget]   = useState<Client | null>(null);
  const [selectedReasonId, setSelectedReasonId] = useState<number | null>(null);
  const [customReason,     setCustomReason]     = useState('');

  /* ── Stats query ─────────────────────────────────── */
  const { data: statsData } = useSkillQuery<StatsData>('client-skill', 'get_stats', {});
  const stats = statsData?.data;

  /* ── Bookmark reasons (fetched once, cached) ─────── */
  const { data: reasonsData } = useSkillQuery<ReasonsData>(
    'client-skill', 'get_bookmark_reasons', {},
    { staleTime: 5 * 60 * 1000 }
  );
  const bookmarkReasons = reasonsData?.data?.reasons ?? [];

  /* ── Clients query ───────────────────────────────── */
  const skillParams = useMemo(() => ({
    filters: {
      search:          activeSearch || undefined,
      risk_profile:    riskFilter === 'all' ? undefined : riskFilter,
      bookmarked_only: bookmarkedOnly || undefined,
      recent_only:     recentOnly || undefined,
      in_family:       inFamily || undefined,
    },
    limit:  PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }), [activeSearch, riskFilter, bookmarkedOnly, recentOnly, inFamily, page]);

  const { data, isLoading, isError, error } = useSkillQuery<ClientsData>(
    'client-skill', 'get_clients', skillParams
  );

  const clients    = data?.data?.clients ?? [];
  const total      = data?.data?.total   ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  /* ── Bookmark mutations ──────────────────────────── */
  const addBookmark    = useSkillMutation('client-skill', 'add_bookmark');
  const removeBookmark = useSkillMutation('client-skill', 'remove_bookmark');

  const invalidateAfterBookmark = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['skill', 'client-skill', 'get_clients'] });
    queryClient.invalidateQueries({ queryKey: ['skill', 'client-skill', 'get_stats'] });
  }, [queryClient]);

  /* ── Bookmark button handler ─────────────────────
     Removing → immediate (no modal needed).
     Adding   → open reason picker modal.
  ─────────────────────────────────────────────────── */
  const handleBookmarkClick = useCallback((client: Client, e: React.MouseEvent) => {
    e.stopPropagation();
    if (bookmarkingId === client.id) return;

    if (client.is_bookmarked) {
      // Remove immediately — no modal
      setBookmarkingId(client.id);
      removeBookmark.mutateAsync({ client_id: client.id })
        .then(() => {
          showToast({ message: `${client.name} removed from bookmarks`, type: 'info' });
          invalidateAfterBookmark();
        })
        .catch((err: any) => {
          showToast({ message: err.message || 'Failed to remove bookmark', type: 'error' });
        })
        .finally(() => setBookmarkingId(null));
    } else {
      // Open reason picker modal
      setBookmarkTarget(client);
      setSelectedReasonId(null);
      setCustomReason('');
    }
  }, [bookmarkingId, removeBookmark, showToast, invalidateAfterBookmark]);

  /* ── Bookmark modal: save ─────────────────────────── */
  const handleBookmarkSave = useCallback(async () => {
    if (!bookmarkTarget) return;
    if (!selectedReasonId) {
      showToast({ message: 'Please select a reason', type: 'warning' });
      return;
    }
    const isOther = bookmarkReasons.find(r => r.id === selectedReasonId)?.reason_code === 'OTHER';
    if (isOther && !customReason.trim()) {
      showToast({ message: 'Please enter a custom note for "Other"', type: 'warning' });
      return;
    }

    setBookmarkingId(bookmarkTarget.id);
    try {
      await addBookmark.mutateAsync({
        client_id:     bookmarkTarget.id,
        reason_id:     !isOther ? selectedReasonId : undefined,
        custom_reason: isOther ? customReason.trim() : undefined,
      });
      showToast({ message: `${bookmarkTarget.name} bookmarked`, type: 'success' });
      invalidateAfterBookmark();
      setBookmarkTarget(null);
    } catch (err: any) {
      showToast({ message: err.message || 'Bookmark failed', type: 'error' });
    } finally {
      setBookmarkingId(null);
    }
  }, [bookmarkTarget, selectedReasonId, customReason, bookmarkReasons, addBookmark, showToast, invalidateAfterBookmark]);

  const handleBookmarkModalClose = useCallback(() => {
    setBookmarkTarget(null);
    setSelectedReasonId(null);
    setCustomReason('');
  }, []);

  /* ── Search handlers ─────────────────────────────── */
  const triggerSearch = useCallback(() => {
    setActiveSearch(search);
    setPage(1);
  }, [search]);

  const handleSearchChange = useCallback((v: string) => {
    setSearch(v);
    if (!v) { setActiveSearch(''); setPage(1); }
  }, []);

  const handleRiskChange = useCallback((id: string) => {
    setRiskFilter(id as RiskFilter);
    setPage(1);
  }, []);

  /* ── Loading / error ─────────────────────────────── */
  if (isLoading) return <VdfLoader overlay message="Loading clients…" />;
  if (isError) return (
    <div className={s.page}>
      <p style={{ color: 'var(--color-danger)', padding: '16px' }}>
        Failed to load clients — {error?.message ?? 'Unknown error'}
      </p>
    </div>
  );

  /* ── Bookmark addon for toolbar ──────────────────── */
  const bookmarkAddon = (
    <button
      className={`${s.bookmarkToggle} ${bookmarkedOnly ? s.active : ''}`}
      onClick={() => { setBookmarkedOnly(v => !v); setRecentOnly(false); setInFamily(false); setPage(1); }}
      title="Bookmarked only"
    >
      <BookmarkIcon filled={bookmarkedOnly} />
    </button>
  );

  /* ── View mode toggle ─────────────────────────────── */
  const viewToggle = (
    <div className={s.viewToggle}>
      <button
        className={`${s.viewBtn} ${viewMode === 'row' ? s.viewBtnActive : ''}`}
        onClick={() => setViewMode('row')}
        title="Row view"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <rect x="0" y="2" width="16" height="3" rx="1" />
          <rect x="0" y="6.5" width="16" height="3" rx="1" />
          <rect x="0" y="11" width="16" height="3" rx="1" />
        </svg>
      </button>
      <button
        className={`${s.viewBtn} ${viewMode === 'grid' ? s.viewBtnActive : ''}`}
        onClick={() => setViewMode('grid')}
        title="Grid view"
      >
        <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
          <rect x="0"  y="0"  width="7" height="7" rx="1.5" />
          <rect x="9"  y="0"  width="7" height="7" rx="1.5" />
          <rect x="0"  y="9"  width="7" height="7" rx="1.5" />
          <rect x="9"  y="9"  width="7" height="7" rx="1.5" />
        </svg>
      </button>
    </div>
  );

  /* ── Pagination ──────────────────────────────────── */
  const pagination = totalPages > 1 && (
    <div className={d.pagination}>
      <button
        className={d.pageBtn}
        onClick={() => setPage(p => p - 1)}
        disabled={page === 1}
      >← Prev</button>
      <span className={d.pageInfo}>
        Page {page} of {totalPages} · {total.toLocaleString()} clients
      </span>
      <button
        className={d.pageBtn}
        onClick={() => setPage(p => p + 1)}
        disabled={page >= totalPages}
      >Next →</button>
    </div>
  );

  /* ── Render ──────────────────────────────────────── */
  return (
    <div className={s.page}>

      <VdfPageHeader
        eyebrow="CLIENT REGISTRY"
        title="Clients"
        meta={<><strong>{(stats?.total_clients ?? total).toLocaleString()}</strong> total</>}
      />

      {/* Stats */}
      {stats && (
        <div className={s.statsRow}>
          <VdfStatCard
            value={stats.total_clients}
            label="Total clients"
            accent="default"
            onClick={() => {
              setBookmarkedOnly(false); setRecentOnly(false); setInFamily(false);
              setRiskFilter('all'); setActiveSearch(''); setSearch(''); setPage(1);
            }}
            active={!bookmarkedOnly && !recentOnly && !inFamily && riskFilter === 'all' && !activeSearch}
          />
          <VdfStatCard
            value={stats.bookmarked}
            label="Bookmarked"
            accent="warning"
            onClick={() => { setBookmarkedOnly(v => !v); setRecentOnly(false); setInFamily(false); setPage(1); }}
            active={bookmarkedOnly}
          />
          <VdfStatCard
            value={stats.recent_30_days}
            label="New this month"
            accent="success"
            onClick={() => { setRecentOnly(v => !v); setBookmarkedOnly(false); setInFamily(false); setPage(1); }}
            active={recentOnly}
          />
          <VdfStatCard
            value={stats.family_count}
            label={`Famil${stats.family_count === 1 ? 'y' : 'ies'} · ${stats.families_members} members`}
            accent="info"
            onClick={() => { setInFamily(v => !v); setBookmarkedOnly(false); setRecentOnly(false); setPage(1); }}
            active={inFamily}
          />
        </div>
      )}

      {/* Toolbar */}
      <div className={s.toolbar}>
        <VdfSearchBar
          value={search}
          onChange={handleSearchChange}
          onSearch={triggerSearch}
          placeholder="Search by name, PAN, or reference code…"
          pills={RISK_PILLS}
          activePill={riskFilter}
          onPillChange={handleRiskChange}
          addon={bookmarkAddon}
        />
        {viewToggle}
      </div>

      <div className={s.listContent}>

      {/* ── Empty state ── */}
      {clients.length === 0 && (
        <VdfEmptyState
          title="No clients found"
          description={activeSearch || riskFilter !== 'all' || bookmarkedOnly
            ? 'Try clearing your filters.'
            : 'Import a customer file or convert a contact to get started.'}
          action={
            <VdfButton variant="outline" size="sm" onClick={() => router.push('/contacts')}>
              Go to Contacts
            </VdfButton>
          }
        />
      )}

      {/* ── ROW VIEW ── */}
      {clients.length > 0 && viewMode === 'row' && (
        <>
          <div className={s.cardList}>
            {clients.map(client => (
              <VdfPersonRow
                key={client.id}
                avatarInitials={initials(client.name)}
                avatarGradient={avatarGradient(client.name)}
                name={client.name}
                prefix={client.prefix}
                nameBadges={<>
                  {client.client_no && <span className={s.clientNoBadge}>{client.client_no}</span>}
                  {client.ext_ref_id && <span className={s.extRefBadge}>{client.ext_ref_id}</span>}
                </>}
                subLine={<>
                  {client.primary_email && <span className={s.contactLine}>{client.primary_email}</span>}
                  {client.primary_mobile && <span className={s.contactLineSub}>{client.primary_mobile}</span>}
                </>}
                trailing={<>
                  {client.risk_profile ? (
                    <span
                      className={s.riskPill}
                      style={{ color: RISK_COLORS[client.risk_profile], borderColor: RISK_COLORS[client.risk_profile] }}
                    >
                      {client.risk_profile}
                    </span>
                  ) : (
                    <span className={s.noRisk}>—</span>
                  )}
                  <VdfStatusBadge
                    label={client.onboarding_status.replace('_', ' ')}
                    variant={STATUS_VARIANT[client.onboarding_status] ?? 'muted'}
                    size="sm"
                  />
                  <button
                    className={`${s.bmBtn} ${client.is_bookmarked ? s.bmBtnActive : ''}`}
                    onClick={(e) => handleBookmarkClick(client, e)}
                    disabled={bookmarkingId === client.id}
                    title={client.is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
                  >
                    <BookmarkIcon filled={client.is_bookmarked} size={14} />
                  </button>
                </>}
                highlighted={client.is_bookmarked}
                onClick={() => router.push(`/clients/${client.id}`)}
              />
            ))}
          </div>
          {pagination}
        </>
      )}

      {/* ── GRID VIEW ── */}
      {clients.length > 0 && viewMode === 'grid' && (
        <>
          <div className={s.grid}>
            {clients.map(client => (
              <VdfCard
                key={client.id}
                hoverLift
                accentColor={client.risk_profile ? RISK_COLORS[client.risk_profile] : undefined}
                onClick={() => router.push(`/clients/${client.id}`)}
              >
                {client.risk_profile && (
                  <div
                    className={s.riskFold}
                    style={{ borderBottomColor: RISK_COLORS[client.risk_profile] }}
                    title={client.risk_profile}
                  />
                )}

                {client.is_bookmarked && (
                  <div className={s.bookmarkRibbon}>
                    <BookmarkIcon filled size={10} />
                  </div>
                )}

                <div className={s.cardHead}>
                  <div className={s.avatar} style={{ background: avatarGradient(client.name) }}>
                    {initials(client.name)}
                  </div>
                  <div className={s.cardHeadText}>
                    <div className={s.cardName}>{client.prefix} {client.name}</div>
                    <div className={s.refId}>
                      {client.client_no && (
                        <span className={s.clientNoBadge}>{client.client_no}</span>
                      )}
                      {client.ext_ref_id && (
                        <>
                          <span className={s.refBadge}>ID</span>
                          <span className={s.refValue}>{client.ext_ref_id}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className={s.cardMeta}>
                  {client.pan && (
                    <span className={s.metaItem}>
                      <span className={s.metaLabel}>PAN</span>
                      {client.pan.slice(0, 5)}•••{client.pan.slice(-2)}
                    </span>
                  )}
                  {client.dob && (
                    <span className={s.metaItem}>
                      <span className={s.metaLabel}>DOB</span>
                      {new Date(client.dob).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })}
                    </span>
                  )}
                </div>

                <div className={s.cardFooter}>
                  <VdfStatusBadge
                    label={client.onboarding_status.replace('_', ' ')}
                    variant={STATUS_VARIANT[client.onboarding_status] ?? 'muted'}
                    size="sm"
                  />
                  <button
                    className={`${s.bmBtn} ${client.is_bookmarked ? s.bmBtnActive : ''}`}
                    onClick={(e) => handleBookmarkClick(client, e)}
                    disabled={bookmarkingId === client.id}
                    title={client.is_bookmarked ? 'Remove bookmark' : 'Bookmark'}
                  >
                    <BookmarkIcon filled={client.is_bookmarked} size={14} />
                  </button>
                </div>
              </VdfCard>
            ))}
          </div>
          {pagination}
        </>
      )}

      </div>

      {/* ── Bookmark reason modal ─────────────────────── */}
      <VdfModal
        isOpen={!!bookmarkTarget}
        onClose={handleBookmarkModalClose}
        title="Bookmark Client"
        subtitle={bookmarkTarget ? `Select a reason for bookmarking ${bookmarkTarget.prefix} ${bookmarkTarget.name}` : undefined}
        width="sm"
        footer={
          <>
            <VdfButton variant="ghost" size="sm" onClick={handleBookmarkModalClose}>
              Cancel
            </VdfButton>
            <VdfButton
              variant="primary"
              size="sm"
              onClick={handleBookmarkSave}
              disabled={bookmarkingId !== null || !selectedReasonId}
            >
              {bookmarkingId !== null ? 'Saving…' : 'Save Bookmark'}
            </VdfButton>
          </>
        }
      >
        <div className={s.reasonSelectWrap}>
          <label className={s.reasonSelectLabel}>Reason</label>
          <select
            className={s.reasonSelect}
            value={selectedReasonId ?? ''}
            onChange={e => {
              const val = e.target.value;
              setSelectedReasonId(val ? Number(val) : null);
              setCustomReason('');
            }}
          >
            <option value="">— Select a reason —</option>
            {bookmarkReasons.map(reason => (
              <option key={reason.id} value={reason.id}>
                {reason.reason_label}
              </option>
            ))}
          </select>
        </div>

        {/* Notes / custom reason — shown when OTHER is selected */}
        {(bookmarkReasons.find(r => r.id === selectedReasonId)?.reason_code === 'OTHER') && (
          <div className={s.customReasonWrap}>
            <label className={s.customReasonLabel}>Custom note</label>
            <textarea
              className={s.customReasonInput}
              value={customReason}
              onChange={e => setCustomReason(e.target.value)}
              placeholder="Describe the reason…"
              rows={2}
              maxLength={200}
            />
          </div>
        )}
      </VdfModal>
    </div>
  );
}
