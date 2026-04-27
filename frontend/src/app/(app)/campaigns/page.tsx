'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfEmptyState, VdfButton, VdfStatusBadge,
  VdfSearchBar, VdfInput, VdfDrawer, VdfPageHeader, VdfToggleGroup,
} from '@/components/vdf';
import s from './campaigns.module.css';
import f from '@/styles/forms.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Campaign {
  id: number;
  campaign_no: string;
  name: string;
  description: string | null;
  status: string;
  target_industries: string[];
  product_name: string | null;
  sender_name: string | null;
  launched_at: string | null;
  created_at: string;
  persona_count: number;
}

interface CampaignsData {
  campaigns: Campaign[];
  total: number;
}

interface StatsData {
  total: number;
  draft: number;
  active: number;
  paused: number;
  completed: number;
}

type StatusFilter = 'all' | 'draft' | 'active' | 'paused' | 'completed';

const PAGE_SIZE = 24;

const STATUS_PILLS = [
  { id: 'all',       label: 'All' },
  { id: 'draft',     label: 'Draft' },
  { id: 'active',    label: 'Active' },
  { id: 'paused',    label: 'Paused' },
  { id: 'completed', label: 'Completed' },
];

const STATUS_BADGE_MAP: Record<string, { label: string; variant: 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  draft:     { label: 'Draft',     variant: 'muted' },
  active:    { label: 'Active',    variant: 'success' },
  paused:    { label: 'Paused',    variant: 'warning' },
  completed: { label: 'Completed', variant: 'info' },
  archived:  { label: 'Archived',  variant: 'muted' },
};

const INDUSTRY_OPTIONS = [
  { id: 'Financial Services',  icon: '🏦' },
  { id: 'Insurance',           icon: '🛡️' },
  { id: 'Wealth Management',   icon: '💎' },
  { id: 'Banking',             icon: '🏛️' },
  { id: 'Technology',          icon: '💻' },
  { id: 'Healthcare',          icon: '🏥' },
  { id: 'Real Estate',         icon: '🏢' },
  { id: 'Education',           icon: '🎓' },
  { id: 'Manufacturing',       icon: '🏭' },
];

/* ── Component ───────────────────────────────────────── */

export default function CampaignsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch]           = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage]               = useState(1);

  // Drawer state
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [newName, setNewName]         = useState('');
  const [newDesc, setNewDesc]         = useState('');
  const [newProduct, setNewProduct]   = useState('');
  const [newProductUrl, setNewProductUrl] = useState('');
  const [newSenderName, setNewSenderName] = useState('');
  const [newSenderEmail, setNewSenderEmail] = useState('');
  const [newIndustries, setNewIndustries] = useState<string[]>([]);

  function handleSearch(v: string) {
    setSearch(v);
    if (!v) { setDebouncedSearch(''); setPage(1); }
  }

  function triggerSearch() {
    setDebouncedSearch(search);
    setPage(1);
  }

  const skillParams = useMemo(() => ({
    search: debouncedSearch || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
    limit:  PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  }), [debouncedSearch, statusFilter, page]);

  /* ── Queries ─────────────────────────────────────────── */

  const { data, isLoading, isError, error } = useSkillQuery<CampaignsData>(
    'campaign-skill', 'get_campaigns', skillParams
  );

  const { data: statsData } = useSkillQuery<StatsData>(
    'campaign-skill', 'get_stats', {}
  );

  const { mutate: createCampaign, isPending: creating } = useSkillMutation(
    'campaign-skill', 'create_campaign',
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skill', 'campaign-skill'] });
        showToast({ message: 'Campaign created.', type: 'success' });
        closeDrawer();
      },
      onError: (err) => showToast({ message: err.message || 'Failed to create campaign', type: 'error' }),
    }
  );

  /* ── Drawer ──────────────────────────────────────────── */

  function openDrawer() {
    setNewName(''); setNewDesc(''); setNewProduct(''); setNewProductUrl('');
    setNewSenderName(''); setNewSenderEmail(''); setNewIndustries([]);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function handleCreate() {
    if (!newName.trim()) { showToast({ message: 'Campaign name is required', type: 'error' }); return; }
    createCampaign({
      name:              newName.trim(),
      description:       newDesc.trim() || undefined,
      product_name:      newProduct.trim() || undefined,
      product_url:       newProductUrl.trim() || undefined,
      target_industries: newIndustries.length ? newIndustries : undefined,
      sender_name:       newSenderName.trim() || undefined,
      sender_email:      newSenderEmail.trim() || undefined,
    });
  }

  function toggleIndustry(id: string) {
    setNewIndustries(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  }

  function handleStatusFilter(id: string) {
    setStatusFilter(id as StatusFilter);
    setPage(1);
  }

  /* ── Data ────────────────────────────────────────────── */

  const campaigns  = data?.data?.campaigns ?? [];
  const total      = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const stats      = statsData?.data ?? { total: 0, draft: 0, active: 0, paused: 0, completed: 0 };

  if (isLoading) return <VdfLoader overlay message="Loading campaigns…" />;
  if (isError) return (
    <div className={s.page}>
      <p style={{ color: 'var(--color-danger)', padding: '16px' }}>
        Failed to load campaigns — {error?.message ?? 'Unknown error'}
      </p>
    </div>
  );

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="GO-TO-MARKET"
        title="Campaigns"
        titleEm={String(stats.total)}
        actions={
          <VdfButton variant="primary" size="sm" onClick={openDrawer}>
            + New Campaign
          </VdfButton>
        }
      />

      {/* ── Stats row ──────────────────────────────────── */}
      <div className={s.statsRow}>
        {[
          { label: 'Total',     value: stats.total },
          { label: 'Draft',     value: stats.draft },
          { label: 'Active',    value: stats.active },
          { label: 'Paused',    value: stats.paused },
          { label: 'Completed', value: stats.completed },
        ].map((st) => (
          <div key={st.label} className={s.statCard}>
            <span className={s.statValue}>{st.value}</span>
            <span className={s.statLabel}>{st.label}</span>
          </div>
        ))}
      </div>

      {/* ── Toolbar ────────────────────────────────────── */}
      <div className={s.toolbar}>
        <VdfSearchBar
          value={search}
          onChange={handleSearch}
          onSearch={triggerSearch}
          placeholder="Search campaigns…"
        />
        <VdfToggleGroup
          options={STATUS_PILLS}
          value={statusFilter}
          onChange={handleStatusFilter}
        />
      </div>

      {/* ── Campaign list ──────────────────────────────── */}
      <div className={s.listContent}>
        {campaigns.length === 0 ? (
          <VdfEmptyState
            title="No campaigns yet"
            description="Create your first GTM campaign to start reaching prospects."
            action={<VdfButton variant="primary" size="sm" onClick={openDrawer}>+ New Campaign</VdfButton>}
          />
        ) : (
          <div className={s.cardList}>
            {campaigns.map((c) => {
              const badge = STATUS_BADGE_MAP[c.status] ?? STATUS_BADGE_MAP.draft;
              return (
                <div
                  key={c.id}
                  className={s.campaignCard}
                  onClick={() => router.push(`/campaigns/${c.id}`)}
                >
                  <div className={s.cardHeader}>
                    <div>
                      <span className={s.campaignNo}>{c.campaign_no}</span>
                      <div className={s.campaignName}>{c.name}</div>
                    </div>
                    <VdfStatusBadge label={badge.label} variant={badge.variant} />
                  </div>

                  {c.description && (
                    <div className={s.campaignDesc}>{c.description}</div>
                  )}

                  {c.target_industries.length > 0 && (
                    <div className={s.industryTags}>
                      {c.target_industries.slice(0, 3).map((ind) => (
                        <span key={ind} className={s.industryTag}>{ind}</span>
                      ))}
                      {c.target_industries.length > 3 && (
                        <span className={s.industryTag}>+{c.target_industries.length - 3}</span>
                      )}
                    </div>
                  )}

                  <div className={s.cardMeta}>
                    <span className={s.metaChip}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                        <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" /><circle cx="12" cy="7" r="4" />
                      </svg>
                      {c.persona_count} persona{c.persona_count !== 1 ? 's' : ''}
                    </span>
                    {c.product_name && (
                      <span className={s.metaChip}>{c.product_name}</span>
                    )}
                    <span className={s.metaChip}>
                      {new Date(c.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* ── Pagination ─────────────────────────────────── */}
        {totalPages > 1 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, padding: '20px 0' }}>
            <VdfButton variant="ghost" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
              Prev
            </VdfButton>
            <span style={{ fontSize: '0.8rem', color: 'var(--color-muted)', alignSelf: 'center' }}>
              {page} / {totalPages}
            </span>
            <VdfButton variant="ghost" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              Next
            </VdfButton>
          </div>
        )}
      </div>

      {/* ── Create Campaign Drawer ───────────────────────── */}
      <VdfDrawer
        isOpen={drawerOpen}
        onClose={closeDrawer}
        title="New Campaign"
        width={520}
        footer={
          <>
            <VdfButton variant="ghost" size="sm" onClick={closeDrawer} disabled={creating}>Cancel</VdfButton>
            <VdfButton variant="primary" size="sm" onClick={handleCreate} disabled={creating}>
              {creating ? 'Creating…' : 'Create Campaign'}
            </VdfButton>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className={s.fieldGroup}>
            <label className={f.label}>Campaign Name *</label>
            <input className={f.input} value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Q2 MFD Outreach" />
          </div>

          <div className={s.fieldGroup}>
            <label className={f.label}>Description</label>
            <textarea className={f.input} rows={3} value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Brief description of this campaign's goal…" style={{ resize: 'vertical' }} />
          </div>

          <div className={s.fieldRow}>
            <div className={s.fieldGroup}>
              <label className={f.label}>Product Name</label>
              <input className={f.input} value={newProduct} onChange={e => setNewProduct(e.target.value)} placeholder="e.g. ProKey" />
            </div>
            <div className={s.fieldGroup}>
              <label className={f.label}>Product URL</label>
              <input className={f.input} value={newProductUrl} onChange={e => setNewProductUrl(e.target.value)} placeholder="https://…" />
            </div>
          </div>

          <div className={s.fieldRow}>
            <div className={s.fieldGroup}>
              <label className={f.label}>Sender Name</label>
              <input className={f.input} value={newSenderName} onChange={e => setNewSenderName(e.target.value)} placeholder="e.g. Kamal Charan" />
            </div>
            <div className={s.fieldGroup}>
              <label className={f.label}>Sender Email</label>
              <input className={f.input} value={newSenderEmail} onChange={e => setNewSenderEmail(e.target.value)} placeholder="email@domain.com" />
            </div>
          </div>

          <div className={s.fieldGroup}>
            <label className={f.label}>Target Industries</label>
            <div className={s.industryGrid}>
              {INDUSTRY_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={newIndustries.includes(opt.id) ? s.industryOptionSelected : s.industryOption}
                  onClick={() => toggleIndustry(opt.id)}
                >
                  <span>{opt.icon}</span>
                  {opt.id}
                </button>
              ))}
            </div>
          </div>
        </div>
      </VdfDrawer>
    </div>
  );
}
