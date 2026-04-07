'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfEmptyState, VdfButton, VdfStatusBadge, VdfReadinessRing,
} from '@/components/vdf';
import s from './contacts.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Contact {
  id: number;
  prefix: string;
  name: string;
  is_client: boolean;
  is_active: boolean;
  has_snapshot: boolean;
  primary_mobile: string | null;
  primary_email: string | null;
  created_at: string;
}

interface ContactsData {
  contacts: Contact[];
  total: number;
}

type FilterMode = 'all' | 'prospects' | 'clients';

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

/** 20% base + 20% per factor (mobile, email, snapshot) → 80% max for prospects; clients = 100% */
function readinessPct(c: Contact): number {
  if (c.is_client) return 100;
  let pct = 20;
  if (c.primary_mobile) pct += 25;
  if (c.primary_email)  pct += 25;
  if (c.has_snapshot)   pct += 30;
  return pct;
}

/* ── Component ───────────────────────────────────────── */

export default function ContactsPage() {
  const router = useRouter();
  const { showToast } = useToast();

  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<FilterMode>('all');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Debounce search
  const handleSearch = (v: string) => {
    setSearch(v);
    clearTimeout((handleSearch as unknown as { timer: ReturnType<typeof setTimeout> }).timer);
    (handleSearch as unknown as { timer: ReturnType<typeof setTimeout> }).timer = setTimeout(
      () => setDebouncedSearch(v), 350
    );
  };

  const skillParams = useMemo(() => ({
    search:    debouncedSearch || undefined,
    is_client: filter === 'all' ? undefined : filter === 'clients',
    limit: 100,
    offset: 0,
  }), [debouncedSearch, filter]);

  const { data, isLoading, isError, error } = useSkillQuery<ContactsData>(
    'contact-skill', 'get_contacts', skillParams
  );

  const { mutate: createContact, isPending: creating } = useSkillMutation(
    'contact-skill', 'create_contact',
    {
      onSuccess: (res) => {
        const id = (res.data as { contact: { id: number } }).contact.id;
        router.push(`/contacts/${id}`);
      },
      onError: (err) => showToast({ message: err.message || 'Failed to create contact', type: 'error' }),
    }
  );

  const contacts = data?.data?.contacts ?? [];
  const total    = data?.data?.total ?? 0;
  const prospects = contacts.filter(c => !c.is_client).length;
  const clients   = contacts.filter(c => c.is_client).length;

  if (isLoading) return <VdfLoader overlay message="Loading contacts…" />;
  if (isError)   return (
    <div className={s.page}>
      <div className={s.errorBanner}>
        Failed to load contacts — {error?.message ?? 'Unknown error'}
      </div>
    </div>
  );

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.titleRow}>
          <div>
            <h1 className={s.title}>Contacts</h1>
            <p className={s.meta}>
              <strong>{total}</strong> total ·&nbsp;
              <strong>{prospects}</strong> prospects ·&nbsp;
              <strong>{clients}</strong> converted
            </p>
          </div>
          <VdfButton
            variant="primary"
            size="sm"
            loading={creating}
            onClick={() => createContact({ prefix: 'Mr', name: 'New Contact' })}
          >
            + Add Contact
          </VdfButton>
        </div>

        {/* ── Toolbar ── */}
        <div className={s.toolbar}>
          <div className={s.searchWrap}>
            <svg className={s.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              className={s.searchInput}
              placeholder="Search by name, mobile, email…"
              value={search}
              onChange={e => handleSearch(e.target.value)}
            />
          </div>

          <div className={s.filters}>
            {(['all', 'prospects', 'clients'] as FilterMode[]).map(f => (
              <button
                key={f}
                className={`${s.filterPill} ${filter === f ? s.active : ''}`}
                onClick={() => setFilter(f)}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Card Grid ── */}
      {contacts.length === 0 ? (
        <VdfEmptyState
          title="No contacts yet"
          description="Add your first prospect to start building your client pipeline."
          action={{ label: '+ Add Contact', onClick: () => createContact({ prefix: 'Mr', name: 'New Contact' }) }}
        />
      ) : (
        <div className={s.grid}>
          {contacts.map(contact => {
            const pct = readinessPct(contact);
            return (
              <button
                key={contact.id}
                className={s.card}
                onClick={() => router.push(`/contacts/${contact.id}`)}
              >
                {/* Avatar + readiness ring */}
                <div className={s.cardTop}>
                  <div className={s.avatarWrap}>
                    <div
                      className={s.avatar}
                      style={{ background: avatarGradient(contact.name) }}
                    >
                      {initials(contact.name)}
                    </div>
                    <div className={s.ring}>
                      <VdfReadinessRing pct={pct} size={36} strokeWidth={3} />
                    </div>
                  </div>

                  <VdfStatusBadge
                    label={contact.is_client ? 'Client' : 'Prospect'}
                    variant={contact.is_client ? 'success' : 'warning'}
                    size="sm"
                  />
                </div>

                {/* Name */}
                <div className={s.cardName}>
                  <span className={s.prefix}>{contact.prefix}</span>
                  {contact.name}
                </div>

                {/* Channels */}
                <div className={s.channels}>
                  {contact.primary_mobile && (
                    <span className={s.channelBadge} title={contact.primary_mobile}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                        <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.12 2.2 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.56-.56a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" />
                      </svg>
                    </span>
                  )}
                  {contact.primary_email && (
                    <span className={s.channelBadge} title={contact.primary_email}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                      </svg>
                    </span>
                  )}
                  {contact.has_snapshot && (
                    <span className={s.channelBadge} title="Financial snapshot captured">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                        <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                      </svg>
                    </span>
                  )}
                  {!contact.primary_mobile && !contact.primary_email && (
                    <span className={s.noChannels}>No channels</span>
                  )}
                </div>

                {/* Readiness label */}
                {!contact.is_client && (
                  <div className={s.readinessLabel}>
                    {pct >= 70 ? 'Ready to convert' : pct >= 35 ? 'In progress' : 'Just added'}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
