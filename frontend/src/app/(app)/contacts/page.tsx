'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfEmptyState, VdfButton, VdfStatusBadge, VdfReadinessRing,
  VdfSearchBar, VdfMobileInput, VdfInput, VdfPersonRow,
  VdfPageHeader, VdfToggleGroup,
} from '@/components/vdf';
import s from './contacts.module.css';
import d from '@/styles/data.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Contact {
  id: number;
  contact_no: string | null;
  prefix: string | null;
  name: string;
  is_active: boolean;
  job_title: string | null;
  company_name: string | null;
  company_domain: string | null;
  location: string | null;
  source: string;
  score: number;
  primary_mobile: string | null;
  primary_email: string | null;
  created_at: string;
}

interface ContactsData {
  contacts: Contact[];
  total: number;
}

type StatusMode = 'active' | 'inactive';

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

/** Profile completeness: reachability + firmographics. */
function readinessPct(c: Contact): number {
  let pct = 20;
  if (c.primary_mobile) pct += 20;
  if (c.primary_email)  pct += 25;
  if (c.company_name)   pct += 20;
  if (c.job_title)      pct += 15;
  return pct;
}

function sourceLabel(source: string): string {
  if (source.startsWith('byo:'))      return source.slice(4);
  if (source.startsWith('platform:')) return source.slice(9);
  return source;
}

import { getCountryByCode } from '@/constants/countries';

/* ── Component ───────────────────────────────────────── */

export default function ContactsPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch]           = useState('');
  const [status, setStatus]           = useState<StatusMode>('active');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage]               = useState(1);
  const [deletingId, setDeletingId]   = useState<number | null>(null);
  const [reactivatingId, setReactivatingId] = useState<number | null>(null);

  // Drawer — shared between create and edit modes
  const [drawerOpen, setDrawerOpen]         = useState(false);
  const [drawerMode, setDrawerMode]         = useState<'create' | 'edit'>('create');
  const [editingId, setEditingId]           = useState<number | null>(null);
  const [newName, setNewName]               = useState('');
  const [newCountryCode, setNewCountryCode] = useState('in');
  const [newMobile, setNewMobile]           = useState('');
  const [newEmail, setNewEmail]             = useState('');
  const [newJobTitle, setNewJobTitle]       = useState('');
  const [newCompany, setNewCompany]         = useState('');
  const [newLocation, setNewLocation]       = useState('');

  // Search fires only on Enter or icon click — not per keystroke.
  function handleSearch(v: string) {
    setSearch(v);
    if (!v) { setDebouncedSearch(''); setPage(1); }
  }

  function triggerSearch() {
    setDebouncedSearch(search);
    setPage(1);
  }

  const skillParams = useMemo(() => ({
    search:        debouncedSearch || undefined,
    show_inactive: status === 'inactive',
    limit:         PAGE_SIZE,
    offset:        (page - 1) * PAGE_SIZE,
  }), [debouncedSearch, status, page]);

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
    setNewName(''); setNewCountryCode('in'); setNewMobile(''); setNewEmail('');
    setNewJobTitle(''); setNewCompany(''); setNewLocation('');
    setDrawerOpen(true);
  }

  function openEditDrawer(contact: Contact) {
    setDrawerMode('edit');
    setEditingId(contact.id);
    setNewName(contact.name);
    setNewCountryCode('in');
    setNewMobile(contact.primary_mobile || '');
    setNewEmail(contact.primary_email || '');
    setNewJobTitle(contact.job_title || '');
    setNewCompany(contact.company_name || '');
    setNewLocation(contact.location || '');
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
      name: newName.trim(),
      channels,
      job_title:    newJobTitle.trim() || undefined,
      company_name: newCompany.trim() || undefined,
      location:     newLocation.trim() || undefined,
    });
  }

  function handleEdit() {
    if (!newName.trim()) { showToast({ message: 'Name is required', type: 'error' }); return; }
    if (editingId === null) return;
    updateContact({
      contact_id:   editingId,
      name:         newName.trim(),
      job_title:    newJobTitle.trim() || null,
      company_name: newCompany.trim() || null,
      location:     newLocation.trim() || null,
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

  function handleStatusChange(v: StatusMode) {
    setStatus(v);
    setPage(1);
  }

  const contacts   = data?.data?.contacts ?? [];
  const total      = data?.data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const ready      = contacts.filter(c => readinessPct(c) >= 80).length;

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
      <VdfPageHeader
        eyebrow="CONTACT PIPELINE"
        title="Contacts"
        titleEm="& Prospects"
        meta={<>
          <strong>{total}</strong> total ·{' '}
          <strong>{ready}</strong> outreach-ready on this page
        </>}
        actions={<VdfButton variant="primary" size="sm" onClick={openDrawer}>+ Add Contact</VdfButton>}
      />

      {/* ── Toolbar ── */}
      <div className={s.toolbar}>
        <VdfSearchBar
          value={search}
          onChange={handleSearch}
          onSearch={triggerSearch}
          placeholder="Search name, company, email — press Enter"
        />
        <VdfToggleGroup
          options={[
            { id: 'active',   label: 'Active',   activeColor: 'success' },
            { id: 'inactive', label: 'Inactive', activeColor: 'warning' },
          ]}
          value={status}
          onChange={v => handleStatusChange(v as StatusMode)}
        />
      </div>

      {/* ── List ── */}
      <div className={s.listContent}>
        {contacts.length === 0 ? (
          <VdfEmptyState
            title="No contacts yet"
            description="Add your first prospect to start building your pipeline."
            action={<VdfButton variant="outline" size="sm" onClick={openDrawer}>+ Add Contact</VdfButton>}
          />
        ) : (
          <div className={s.cardList}>
            {contacts.map(contact => {
              const pct = readinessPct(contact);
              return (
                <VdfPersonRow
                  key={contact.id}
                  avatarInitials={initials(contact.name)}
                  avatarGradient={avatarGradient(contact.name)}
                  name={contact.name}
                  prefix={contact.prefix ?? undefined}
                  nameBadges={contact.contact_no
                    ? <span className={s.contactNo}>{contact.contact_no}</span>
                    : undefined
                  }
                  subLine={<>
                    {(contact.job_title || contact.company_name) && (
                      <span className={s.channel}>
                        {[contact.job_title, contact.company_name].filter(Boolean).join(' · ')}
                      </span>
                    )}
                    {contact.primary_email && (
                      <span className={s.channel}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="11" height="11">
                          <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" />
                        </svg>
                        {contact.primary_email}
                      </span>
                    )}
                    <span className={s.addedDate}>
                      Added {new Date(contact.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}
                    </span>
                  </>}
                  trailing={<>
                    <div className={s.readiness}>
                      <VdfReadinessRing pct={pct} size={32} strokeWidth={3} />
                      <span className={s.readinessLabel}>
                        {pct >= 80 ? 'Ready' : pct >= 45 ? 'In progress' : 'Just added'}
                      </span>
                    </div>
                    <VdfStatusBadge
                      label={contact.score > 0 ? `Score ${contact.score}` : sourceLabel(contact.source)}
                      variant={contact.score >= 60 ? 'success' : contact.score > 0 ? 'warning' : 'muted'}
                      size="sm"
                    />
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      {contact.is_active ? (
                        <>
                          <VdfButton
                            variant="ghost"
                            size="xs"
                            iconOnly
                            onClick={e => { e.stopPropagation(); openEditDrawer(contact); }}
                            title="Edit contact"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </VdfButton>
                          <VdfButton
                            variant="danger"
                            size="xs"
                            iconOnly
                            disabled={deletingId === contact.id}
                            onClick={e => handleDelete(e, contact.id)}
                            title="Deactivate contact"
                          >
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="14" height="14">
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
                            </svg>
                          </VdfButton>
                        </>
                      ) : (
                        <VdfButton
                          variant="success"
                          size="sm"
                          disabled={reactivatingId === contact.id}
                          onClick={e => handleReactivate(e, contact.id)}
                          icon={
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="13" height="13">
                              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
                              <path d="M3 3v5h5" />
                            </svg>
                          }
                        >
                          Reactivate
                        </VdfButton>
                      )}
                    </div>
                  </>}
                  onClick={() => router.push(`/contacts/${contact.id}`)}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* ── Pagination ── */}
      {totalPages > 1 && (
        <div className={d.pagination}>
          <button className={d.pageBtn} disabled={page === 1} onClick={() => setPage(p => p - 1)}>← Prev</button>
          <span className={d.pageInfo}>Page {page} of {totalPages} · {total} contacts</span>
          <button className={d.pageBtn} disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}>Next →</button>
        </div>
      )}

      {/* ── Create / Edit drawer ── */}
      {drawerOpen && (
        <div className={s.drawerOverlay} onClick={closeDrawer}>
          <div className={s.drawer} onClick={e => e.stopPropagation()}>
            <div className={s.drawerHeader}>
              <div>
                <h2 className={s.drawerTitle}>{drawerMode === 'edit' ? 'Edit Contact' : 'New Contact'}</h2>
                <p className={s.drawerSub}>{drawerMode === 'edit' ? 'Update identity and company details' : 'Add a prospect to your pipeline'}</p>
              </div>
              <button className={s.drawerClose} onClick={closeDrawer} aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="16" height="16">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className={s.drawerBody}>
              <VdfInput
                label="Full Name"
                required
                placeholder="e.g. Rajesh Kumar"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                autoFocus
              />

              <div className={s.drawerRow2}>
                <VdfInput
                  label="Job Title"
                  placeholder="e.g. Head of Operations"
                  value={newJobTitle}
                  onChange={e => setNewJobTitle(e.target.value)}
                />
                <VdfInput
                  label="Company"
                  placeholder="e.g. Acme Corp"
                  value={newCompany}
                  onChange={e => setNewCompany(e.target.value)}
                />
              </div>

              <VdfInput
                label="Location"
                placeholder="e.g. Mumbai, India"
                value={newLocation}
                onChange={e => setNewLocation(e.target.value)}
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
