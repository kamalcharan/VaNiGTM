'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfEmptyState, VdfButton, VdfStatusBadge, VdfReadinessRing,
  VdfSearchBar, VdfMobileInput, VdfInput,
} from '@/components/vdf';
import s from './contacts.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Contact {
  id: number;
  contact_no: string | null;
  prefix: string;
  name: string;
  is_client: boolean;
  is_active: boolean;
  has_snapshot: boolean;
  primary_mobile: string | null;
  primary_email: string | null;
  age: number | null;
  city: string | null;
  marital_status: string | null;
  dependents_count: number | null;
  created_at: string;
}

interface ContactsData {
  contacts: Contact[];
  total: number;
}

type FilterMode  = 'all' | 'prospects' | 'clients';
type StatusMode  = 'active' | 'inactive';

const PAGE_SIZE = 25;

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

const TYPE_PILLS = [
  { id: 'all',       label: 'All' },
  { id: 'prospects', label: 'Prospects' },
  { id: 'clients',   label: 'Clients' },
];

const PREFIX_OPTIONS = [
  { value: 'Mr',   label: 'Mr.'   },
  { value: 'Mrs',  label: 'Mrs.'  },
  { value: 'Ms',   label: 'Ms.'   },
  { value: 'Dr',   label: 'Dr.'   },
  { value: 'Prof', label: 'Prof.' },
  { value: 'Sri',  label: 'Sri.'  },
  { value: 'Smt',  label: 'Smt.'  },
];

import { getCountryByCode } from '@/constants/countries';

/* ── Component ───────────────────────────────────────── */

export default function ContactsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch]           = useState('');
  const [filter, setFilter]           = useState<FilterMode>('all');
  const [status, setStatus]           = useState<StatusMode>('active');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage]               = useState(1);
  const [deletingId, setDeletingId]   = useState<number | null>(null);
  const [reactivatingId, setReactivatingId] = useState<number | null>(null);

  // Drawer — shared between create and edit modes
  const [drawerOpen, setDrawerOpen]             = useState(false);
  const [drawerMode, setDrawerMode]             = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId]               = useState<number | null>(null);
  const [newPrefix, setNewPrefix]               = useState('Mr');
  const [newName, setNewName]                   = useState('');
  const [newCountryCode, setNewCountryCode]     = useState('in');
  const [newMobile, setNewMobile]               = useState('');
  const [newEmail, setNewEmail]                 = useState('');
  const [newAge, setNewAge]                     = useState('');
  const [newCity, setNewCity]                   = useState('');
  const [newMarital, setNewMarital]             = useState('');
  const [newDependents, setNewDependents]       = useState<number | null>(null);

  const handleSearch = (v: string) => {
    setSearch(v);
    setPage(1);
    clearTimeout((handleSearch as unknown as { timer: ReturnType<typeof setTimeout> }).timer);
    (handleSearch as unknown as { timer: ReturnType<typeof setTimeout> }).timer = setTimeout(
      () => setDebouncedSearch(v), 350
    );
  };

  const skillParams = useMemo(() => ({
    search:        debouncedSearch || undefined,
    is_client:     filter === 'all' ? undefined : filter === 'clients',
    show_inactive: status === 'inactive',
    limit:         PAGE_SIZE,
    offset:        (page - 1) * PAGE_SIZE,
  }), [debouncedSearch, filter, status, page]);

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

  const { mutate: deleteContact } = useSkillMutation(
    'contact-skill', 'delete_contact',
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skill', 'contact-skill', 'get_contacts'] });
        showToast({ message: 'Contact deactivated.', type: 'success' });
        setDeletingId(null);
      },
      onError: (err) => {
        showToast({ message: err.message || 'Failed to deactivate contact', type: 'error' });
        setDeletingId(null);
      },
    }
  );

  const { mutate: reactivateContact } = useSkillMutation(
    'contact-skill', 'reactivate_contact',
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skill', 'contact-skill', 'get_contacts'] });
        showToast({ message: 'Contact reactivated.', type: 'success' });
        setReactivatingId(null);
      },
      onError: (err) => {
        showToast({ message: err.message || 'Failed to reactivate contact', type: 'error' });
        setReactivatingId(null);
      },
    }
  );

  const { mutate: updateContact, isPending: updating } = useSkillMutation(
    'contact-skill', 'update_contact',
    {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['skill', 'contact-skill', 'get_contacts'] });
        showToast({ message: 'Contact updated.', type: 'success' });
        closeDrawer();
      },
      onError: (err) => showToast({ message: err.message || 'Failed to update contact', type: 'error' }),
    }
  );

  function openDrawer() {
    setDrawerMode('create');
    setEditingId(null);
    setNewPrefix('Mr'); setNewName(''); setNewCountryCode('in'); setNewMobile(''); setNewEmail('');
    setNewAge(''); setNewCity(''); setNewMarital(''); setNewDependents(null);
    setDrawerOpen(true);
  }

  function openEditDrawer(contact: Contact) {
    setDrawerMode('edit');
    setEditingId(contact.id);
    setNewPrefix(contact.prefix || 'Mr');
    setNewName(contact.name);
    setNewCountryCode('in');
    setNewMobile(contact.primary_mobile || '');
    setNewEmail(contact.primary_email || '');
    setNewAge(contact.age !== null && contact.age !== undefined ? String(contact.age) : '');
    setNewCity(contact.city || '');
    setNewMarital(contact.marital_status || '');
    setNewDependents(contact.dependents_count !== null && contact.dependents_count !== undefined ? contact.dependents_count : null);
    setDrawerOpen(true);
  }

  function closeDrawer() {
    setDrawerOpen(false);
    setDrawerMode('create');
    setEditingId(null);
  }

  function handleCreate() {
    if (!newName.trim()) { showToast({ message: 'Name is required', type: 'error' }); return; }
    const channels: { channel_type: string; channel_value: string; is_primary: boolean }[] = [];
    if (newMobile.trim()) {
      const country = getCountryByCode(newCountryCode);
      channels.push({ channel_type: 'mobile', channel_value: `${country?.dial_code ?? '+91'}${newMobile.trim()}`, is_primary: true });
    }
    if (newEmail.trim()) channels.push({ channel_type: 'email', channel_value: newEmail.trim(), is_primary: !newMobile.trim() });
    createContact({
      prefix: newPrefix,
      name: newName.trim(),
      channels,
      age:              newAge ? Number(newAge) : undefined,
      city:             newCity.trim() || undefined,
      marital_status:   (newMarital as 'single' | 'married' | 'family' | 'other') || undefined,
      dependents_count: newDependents !== null ? newDependents : undefined,
    });
  }

  function handleEdit() {
    if (!newName.trim()) { showToast({ message: 'Name is required', type: 'error' }); return; }
    if (editingId === null) return;
    updateContact({
      contact_id: editingId,
      prefix: newPrefix,
      name: newName.trim(),
      age: newAge ? Number(newAge) : null,
      city: newCity.trim() || null,
      marital_status: (newMarital as 'single' | 'married' | 'family' | 'other') || null,
      dependents_count: newDependents,
    });
  }

  function handleDelete(e: React.MouseEvent, contactId: number) {
    e.stopPropagation();
    setDeletingId(contactId);
    deleteContact({ contact_id: contactId });
  }

  function handleReactivate(e: React.MouseEvent, contactId: number) {
    e.stopPropagation();
    setReactivatingId(contactId);
    reactivateContact({ contact_id: contactId });
  }

  function handleFilterChange(id: string) {
    setFilter(id as FilterMode);
    setPage(1);
  }

  function handleStatusChange(s: StatusMode) {
    setStatus(s);
    setPage(1);
    // Inactive contacts can't be filtered by prospect/client — reset to all
    if (s === 'inactive') setFilter('all');
  }

  const contacts   = data?.data?.contacts ?? [];
  const total      = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const prospects  = contacts.filter(c => !c.is_client).length;
  const converted  = contacts.filter(c => c.is_client).length;

  if (isLoading) return <VdfLoader overlay message="Loading contacts…" />;
  if (isError) return (
    <div className={s.page}>
      <p style={{ color: 'var(--color-danger)', padding: '16px' }}>
        Failed to load contacts — {error?.message ?? 'Unknown error'}
      </p>
    </div>
  );

  return (
    <div className={s.page}>
      {/* ── Sticky header ── */}
      <div className={s.pageHeader}>
        <div className={s.pageHeaderRow}>
          <div>
            <p className={s.eyebrow}>Contact Pipeline</p>
            <h1 className={s.pageTitle}>Contacts <em>&amp; Prospects</em></h1>
            <div className={s.pageMeta}>
              <span><strong>{total}</strong> total</span>
              <span><strong>{prospects}</strong> prospects</span>
              <span><strong>{converted}</strong> converted</span>
            </div>
          </div>
          <VdfButton variant="primary" size="sm" onClick={openDrawer}>+ Add Contact</VdfButton>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <div className={s.toolbar}>
        <VdfSearchBar
          value={search}
          onChange={handleSearch}
          placeholder="Search by name, mobile, email…"
          pills={status === 'active' ? TYPE_PILLS : [{ id: 'all', label: 'All' }]}
          activePill={filter}
          onPillChange={handleFilterChange}
        />
        <div className={s.statusToggle}>
          <button
            className={`${s.statusPill} ${status === 'active' ? s.statusPillActive : ''}`}
            onClick={() => handleStatusChange('active')}
          >
            Active
          </button>
          <button
            className={`${s.statusPill} ${status === 'inactive' ? s.statusPillInactive : ''}`}
            onClick={() => handleStatusChange('inactive')}
          >
            Inactive
          </button>
        </div>
      </div>

      {/* ── List ── */}
      <div className={s.listContent}>
        {contacts.length === 0 ? (
          <VdfEmptyState
            title="No contacts yet"
            description="Add your first prospect to start building your client pipeline."
            action={<VdfButton variant="outline" size="sm" onClick={openDrawer}>+ Add Contact</VdfButton>}
          />
        ) : (
          <div className={s.table}>
            <div className={s.tableHead}>
              <span>Contact</span>
              <span>Channels</span>
              <span>Readiness</span>
              <span>Status</span>
              <span />
            </div>

            {contacts.map(contact => {
              const pct = readinessPct(contact);
              return (
                <div
                  key={contact.id}
                  className={s.row}
                  onClick={() => router.push(`/contacts/${contact.id}`)}
                >
                  {/* Name cell */}
                  <div className={s.nameCell}>
                    <div className={s.avatar} style={{ background: avatarGradient(contact.name) }}>
                      {initials(contact.name)}
                    </div>
                    <div>
                      <div className={s.contactName}>
                        <span className={s.prefix}>{contact.prefix}</span>{contact.name}
                      </div>
                      <div className={s.contactSub}>
                        {contact.contact_no && <span className={s.contactNo}>{contact.contact_no}</span>}
                        {contact.primary_mobile ? `${contact.primary_mobile} · ` : ''}Added {new Date(contact.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                      </div>
                    </div>
                  </div>

                  {/* Channels cell */}
                  <div className={s.channelsCell}>
                    {contact.primary_mobile && (
                      <span className={s.channelIcon} title={contact.primary_mobile}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="12" height="12">
                          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.12 2.2 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.56-.56a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z" />
                        </svg>
                      </span>
                    )}
                    {contact.primary_email && (
                      <span className={s.channelIcon} title={contact.primary_email}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="12" height="12">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                        </svg>
                      </span>
                    )}
                    {contact.has_snapshot && (
                      <span className={s.channelIcon} title="Snapshot">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="12" height="12">
                          <path d="M12 2L2 7l10 5 10-5-10-5z" /><path d="M2 17l10 5 10-5" /><path d="M2 12l10 5 10-5" />
                        </svg>
                      </span>
                    )}
                    {!contact.primary_mobile && !contact.primary_email && (
                      <span className={s.noChannels}>—</span>
                    )}
                  </div>

                  {/* Readiness cell */}
                  <div className={s.readinessCell}>
                    <VdfReadinessRing pct={pct} size={36} strokeWidth={3} />
                    <span className={s.readinessLabel}>
                      {pct === 100 ? 'Client' : pct >= 70 ? 'Ready' : pct >= 35 ? 'In progress' : 'Just added'}
                    </span>
                  </div>

                  {/* Status cell */}
                  <div className={s.statusCell}>
                    <VdfStatusBadge
                      label={contact.is_client ? 'Client' : 'Prospect'}
                      variant={contact.is_client ? 'success' : 'warning'}
                      size="sm"
                    />
                  </div>

                  {/* Actions cell */}
                  <div className={s.actionsCell}>
                    {contact.is_active ? (
                      <>
                        <button
                          className={s.editBtn}
                          onClick={(e) => { e.stopPropagation(); openEditDrawer(contact); }}
                          title="Edit contact"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                        </button>
                        {!contact.is_client && (
                          <button
                            className={s.deleteBtn}
                            disabled={deletingId === contact.id}
                            onClick={(e) => handleDelete(e, contact.id)}
                            title="Deactivate contact"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                            </svg>
                          </button>
                        )}
                      </>
                    ) : (
                      <button
                        className={s.reactivateBtn}
                        disabled={reactivatingId === contact.id}
                        onClick={(e) => handleReactivate(e, contact.id)}
                        title="Reactivate contact"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                          <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                          <path d="M3 3v5h5" />
                        </svg>
                        Reactivate
                      </button>
                    )}
                    <span className={s.rowArrow}>→</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className={s.pagination}>
          <button
            className={s.pageBtn}
            disabled={page === 1}
            onClick={() => setPage(p => p - 1)}
          >
            ← Prev
          </button>
          <span className={s.pageInfo}>Page {page} of {totalPages} · {total} contacts</span>
          <button
            className={s.pageBtn}
            disabled={page >= totalPages}
            onClick={() => setPage(p => p + 1)}
          >
            Next →
          </button>
        </div>
      )}

      {/* ── Create / Edit drawer ── */}
      {drawerOpen && (
        <div className={s.drawerOverlay} onClick={closeDrawer}>
          <div className={s.drawer} onClick={e => e.stopPropagation()}>
            <div className={s.drawerHeader}>
              <div>
                <h2 className={s.drawerTitle}>{drawerMode === 'edit' ? 'Edit Contact' : 'New Contact'}</h2>
                <p className={s.drawerSub}>{drawerMode === 'edit' ? 'Update name, prefix, and demographics' : 'Add a prospect to your pipeline'}</p>
              </div>
              <button className={s.drawerClose} onClick={closeDrawer} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className={s.drawerBody}>
              {/* Prefix pills */}
              <div className={s.fieldGroup}>
                <label className={s.fieldLabel}>Prefix</label>
                <div className={s.prefixPills}>
                  {PREFIX_OPTIONS.map(p => (
                    <button
                      key={p.value}
                      className={`${s.prefixPill} ${newPrefix === p.value ? s.prefixPillActive : ''}`}
                      onClick={() => setNewPrefix(p.value)}
                      type="button"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <VdfInput
                label="Full Name"
                required
                placeholder="e.g. Rajesh Kumar"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />

              {drawerMode === 'create' ? (
                <>
                  <VdfMobileInput
                    label="Mobile (optional)"
                    countryCode={newCountryCode}
                    mobile={newMobile}
                    onCountryChange={setNewCountryCode}
                    onMobileChange={setNewMobile}
                  />
                  <VdfInput
                    label="Email"
                    type="email"
                    placeholder="email@example.com"
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleCreate()}
                  />
                </>
              ) : (
                <p className={s.editChannelNote}>
                  Mobile and email are managed from the contact profile page.
                </p>
              )}

              {/* Age + City */}
              <div className={s.drawerRow2}>
                <VdfInput
                  label="Age"
                  type="number"
                  placeholder="e.g. 38"
                  value={newAge}
                  onChange={e => setNewAge(e.target.value.replace(/\D/g, '').slice(0, 3))}
                />
                <VdfInput
                  label="City"
                  placeholder="e.g. Mumbai"
                  value={newCity}
                  onChange={e => setNewCity(e.target.value)}
                />
              </div>

              {/* Life situation */}
              <div className={s.fieldGroup}>
                <label className={s.fieldLabel}>Life Situation</label>
                <div className={s.situationTiles}>
                  {([
                    { value: 'single',  label: 'Single',  sub: 'No dependents' },
                    { value: 'married', label: 'Married', sub: 'With partner' },
                    { value: 'family',  label: 'Family',  sub: 'With kids' },
                    { value: 'other',   label: 'Other',   sub: 'Will specify' },
                  ] as const).map(opt => (
                    <button
                      key={opt.value}
                      type="button"
                      className={`${s.situationTile} ${newMarital === opt.value ? s.situationTileActive : ''}`}
                      onClick={() => setNewMarital(newMarital === opt.value ? '' : opt.value)}
                    >
                      <span className={s.situationLabel}>{opt.label}</span>
                      <span className={s.situationSub}>{opt.sub}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Dependents */}
              <div className={s.fieldGroup}>
                <label className={s.fieldLabel}>Dependents</label>
                <div className={s.dependentBubbles}>
                  {[0, 1, 2, 3, '4+'].map((v) => {
                    const num = v === '4+' ? 4 : Number(v);
                    const active = newDependents === num;
                    return (
                      <button
                        key={v}
                        type="button"
                        className={`${s.depBubble} ${active ? s.depBubbleActive : ''}`}
                        onClick={() => setNewDependents(active ? null : num)}
                      >
                        {v}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            <div className={s.drawerFooter}>
              <VdfButton variant="outline" size="sm" onClick={closeDrawer} disabled={creating || updating}>Cancel</VdfButton>
              {drawerMode === 'edit' ? (
                <VdfButton variant="primary" size="sm" loading={updating} onClick={handleEdit}>Save Changes</VdfButton>
              ) : (
                <VdfButton variant="primary" size="sm" loading={creating} onClick={handleCreate}>Add Contact</VdfButton>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
