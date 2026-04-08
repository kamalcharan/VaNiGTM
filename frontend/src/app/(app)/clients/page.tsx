'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSkillQuery } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfEmptyState, VdfButton, VdfStatusBadge, VdfCard, VdfSearchBar,
} from '@/components/vdf';
import s from './clients.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Client {
  id: number;
  client_uid: string;
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

interface ClientsData {
  clients: Client[];
  total: number;
}

type RiskFilter = 'all' | 'conservative' | 'moderate' | 'aggressive';

/* ── Helpers ─────────────────────────────────────────── */

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

const RISK_PILLS = [
  { id: 'all',          label: 'All' },
  { id: 'conservative', label: 'Conservative', color: 'var(--color-info)' },
  { id: 'moderate',     label: 'Moderate',     color: 'var(--color-warning)' },
  { id: 'aggressive',   label: 'Aggressive',   color: 'var(--color-danger)' },
];

/* ── Component ───────────────────────────────────────── */

export default function ClientsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [search, setSearch]           = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [riskFilter, setRiskFilter]   = useState<RiskFilter>('all');
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);

  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout((handleSearch as unknown as { timer: ReturnType<typeof setTimeout> }).timer);
    (handleSearch as unknown as { timer: ReturnType<typeof setTimeout> }).timer = setTimeout(
      () => setDebouncedSearch(v), 350
    );
  };

  const skillParams = useMemo(() => ({
    search:          debouncedSearch || undefined,
    risk_profile:    riskFilter === 'all' ? undefined : riskFilter,
    bookmarked_only: bookmarkedOnly || undefined,
    limit: 100,
    offset: 0,
  }), [debouncedSearch, riskFilter, bookmarkedOnly]);

  const { data, isLoading, isError, error } = useSkillQuery<ClientsData>(
    'client-skill', 'get_clients', skillParams
  );

  const clients = data?.data?.clients ?? [];
  const total   = data?.data?.total ?? 0;

  if (isLoading) return <VdfLoader overlay message="Loading clients…" />;
  if (isError) return (
    <div className={s.page}>
      <p style={{ color: 'var(--color-danger)', padding: '16px' }}>
        Failed to load clients — {error?.message ?? 'Unknown error'}
      </p>
    </div>
  );

  /* Bookmark toggle — used as VdfSearchBar addon */
  const bookmarkAddon = (
    <button
      className={`${s.bookmarkToggle} ${bookmarkedOnly ? s.active : ''}`}
      onClick={() => setBookmarkedOnly(v => !v)}
      title="Bookmarked only"
    >
      <svg viewBox="0 0 24 24" fill={bookmarkedOnly ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" width="16" height="16">
        <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
      </svg>
    </button>
  );

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.titleRow}>
          <div>
            <h1 className={s.title}>Clients</h1>
            <p className={s.meta}><strong>{total}</strong> total clients</p>
          </div>
        </div>

        <div className={s.toolbar}>
          <VdfSearchBar
            value={search}
            onChange={handleSearch}
            placeholder="Search by name, PAN, or reference code…"
            pills={RISK_PILLS}
            activePill={riskFilter}
            onPillChange={(id) => setRiskFilter(id as RiskFilter)}
            addon={bookmarkAddon}
          />
        </div>
      </div>

      {/* ── Cards ── */}
      {clients.length === 0 ? (
        <VdfEmptyState
          title="No clients yet"
          description="Convert a contact to a client to get started."
          action={
            <VdfButton variant="outline" size="sm" onClick={() => router.push('/contacts')}>
              Go to Contacts
            </VdfButton>
          }
        />
      ) : (
        <div className={s.grid}>
          {clients.map(client => (
            <VdfCard
              key={client.id}
              hoverLift
              accentColor={client.risk_profile ? RISK_COLORS[client.risk_profile] : undefined}
              onClick={() => router.push(`/clients/${client.id}`)}
            >
              {/* Risk corner fold */}
              {client.risk_profile && (
                <div
                  className={s.riskFold}
                  style={{ borderBottomColor: RISK_COLORS[client.risk_profile] }}
                  title={client.risk_profile}
                />
              )}

              {/* Bookmark ribbon */}
              {client.is_bookmarked && (
                <div className={s.bookmarkRibbon}>
                  <svg viewBox="0 0 24 24" fill="currentColor" width="10" height="10">
                    <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
                  </svg>
                </div>
              )}

              {/* Header */}
              <div className={s.cardHead}>
                <div className={s.avatar} style={{ background: avatarGradient(client.name) }}>
                  {initials(client.name)}
                </div>
                <div className={s.cardHeadText}>
                  <div className={s.cardName}>{client.prefix} {client.name}</div>
                  {client.ext_ref_id && (
                    <div className={s.refId}>
                      <span className={s.refBadge}>ID</span>
                      <span className={s.refValue}>{client.ext_ref_id}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Meta row */}
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

              {/* Footer */}
              <div className={s.cardFooter}>
                <VdfStatusBadge
                  label={client.onboarding_status.replace('_', ' ')}
                  variant={STATUS_VARIANT[client.onboarding_status] ?? 'muted'}
                  size="sm"
                />
                {client.risk_profile && (
                  <span className={s.riskTag} style={{ color: RISK_COLORS[client.risk_profile] }}>
                    <span className={s.riskDot} style={{ background: RISK_COLORS[client.risk_profile] }} />
                    {client.risk_profile}
                  </span>
                )}
              </div>
            </VdfCard>
          ))}
        </div>
      )}
    </div>
  );
}
