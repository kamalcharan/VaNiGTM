'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfEmptyState, VdfButton, VdfStatusBadge, VdfReadinessRing,
  VdfCard, VdfSearchBar,
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

function readinessPct(c: Contact): number {
  if (c.is_client) return 100;
  let pct = 20;
  if (c.primary_mobile) pct += 25;
  if (c.primary_email)  pct += 25;
  if (c.has_snapshot)   pct += 30;
  return pct;
}

const FILTER_PILLS = [
  { id: 'all',       label: 'All' },
  { id: 'prospects', label: 'Prospects' },
  { id: 'clients',   label: 'Clients' },
];

const PREFIX_OPTIONS = ['Mr', 'Ms', 'Mrs', 'Dr', 'Prof'];

/* ── Component ───────────────────────────────────────── */

export default function ContactsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch]     = useState('');
  const [filter, setFilter]     = useState<FilterMode>('all');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Create drawer state
  const [drawerOpen, setDrawerOpen]   = useState(false);
  const [newPrefix, setNewPrefix]     = useState('Mr');
  const [newName, setNewName]         = useState('');
  const [newMobile, setNewMobile]     = useState('');
  const [newEmail, setNewEmail]       = useState('');

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
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skill', 'contact-skill', 'get_contacts'] });
        showToast({ message: 'Contact added.', type: 'success' });
        closeDrawer();
      },
      onError: (err) => showToast({ message: err.message || 'Failed to create contact', type: 'error' }),
    }
  );

  function openDrawer() {
    setNewPrefix('Mr');
    setNewName('');
    setNewMobile('');
    setNewEmail('');
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
  }

  function handleCreate() {
    if (!newName.trim()) {
      showToast({ message: 'Name is required', type: 'error' });
      return;
    }
    const channels: { channel_type: string; channel_value: string; is_primary: boolean }[] = [];
    if (newMobile.trim()) channels.push({ channel_type: 'mobile', channel_value: newMobile.trim(), is_primary: true });
    if (newEmail.trim())  channels.push({ channel_type: 'email',  channel_value: newEmail.trim(),  is_primary: !newMobile.trim() });

    createContact({ prefix: newPrefix, name: newName.trim(), channels });
  }

  const contacts  = data?.data?.contacts ?? [];
  const total     = data?.data?.total ?? 0;
  const prospects = contacts.filter(c => !c.is_client).length;
  const converted = contacts.filter(c => c.is_client).length;

  if (isLoading) return <VdfLoader overlay message="Loading contacts…" />;
  if (isError)   return (
    <div className={s.page}>
      <p style={{ color: 'var(--color-danger)', padding: '16px' }}>
        Failed to load contacts — {error?.message ?? 'Unknown error'}
      </p>
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
              <strong>{converted}</strong> converted
            </p>
          </div>
          <VdfButton variant="primary" size="sm" onClick={openDrawer}>
            + Add Contact
          </VdfButton>
        </div>

        <div className={s.toolbar}>
          <VdfSearchBar
            value={search}
            onChange={handleSearch}
            placeholder="Search by name, mobile, email…"
            pills={FILTER_PILLS}
            activePill={filter}
            onPillChange={(id) => setFilter(id as FilterMode)}
          />
        </div>
      </div>

      {/* ── Card Grid ── */}
      {contacts.length === 0 ? (
        <VdfEmptyState
          title="No contacts yet"
          description="Add your first prospect to start building your client pipeline."
          action={
            <VdfButton variant="outline" size="sm" onClick={openDrawer}>
              + Add Contact
            </VdfButton>
          }
        />
      ) : (
        <div className={s.grid}>
          {contacts.map(contact => {
            const pct = readinessPct(contact);
            return (
              <VdfCard key={contact.id} hoverLift onClick={() => router.push(`/contacts/${contact.id}`)}>
                {/* Avatar + readiness ring */}
                <div className={s.cardTop}>
                  <div className={s.avatarWrap}>
                    <div className={s.avatar} style={{ background: avatarGradient(contact.name) }}>
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

                {/* Channel icons */}
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
              </VdfCard>
            );
          })}
        </div>
      )}

      {/* ── Create Contact Drawer ── */}
      {drawerOpen && (
        <div className={s.drawerOverlay} onClick={closeDrawer}>
          <div className={s.drawer} onClick={e => e.stopPropagation()}>
            <div className={s.drawerHeader}>
              <h2 className={s.drawerTitle}>New Contact</h2>
              <button className={s.drawerClose} onClick={closeDrawer} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="18" height="18">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className={s.drawerBody}>
              <div className={s.fieldGroup}>
                <label className={s.fieldLabel}>Prefix</label>
                <select className={s.fieldSelect} value={newPrefix} onChange={e => setNewPrefix(e.target.value)}>
                  {PREFIX_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>

              <div className={s.fieldGroup}>
                <label className={s.fieldLabel}>Full Name <span className={s.required}>*</span></label>
                <input
                  className={s.fieldInput}
                  type="text"
                  placeholder="e.g. Rajesh Kumar"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  autoFocus
                />
              </div>

              <div className={s.fieldGroup}>
                <label className={s.fieldLabel}>Mobile <span className={s.optional}>(optional)</span></label>
                <input
                  className={s.fieldInput}
                  type="tel"
                  placeholder="10-digit mobile number"
                  value={newMobile}
                  onChange={e => setNewMobile(e.target.value)}
                />
              </div>

              <div className={s.fieldGroup}>
                <label className={s.fieldLabel}>Email <span className={s.optional}>(optional)</span></label>
                <input
                  className={s.fieldInput}
                  type="email"
                  placeholder="email@example.com"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleCreate()}
                />
              </div>
            </div>

            <div className={s.drawerFooter}>
              <VdfButton variant="outline" size="sm" onClick={closeDrawer} disabled={creating}>
                Cancel
              </VdfButton>
              <VdfButton variant="primary" size="sm" loading={creating} onClick={handleCreate}>
                Add Contact
              </VdfButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
