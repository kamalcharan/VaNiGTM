'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfButton, VdfStatusBadge, VdfTabs, VdfEmptyState, VdfPageHeader,
} from '@/components/vdf';
import { PulseConfigCard }      from '@/components/pulses/PulseConfigCard';
import { PulseHistoryTimeline } from '@/components/pulses/PulseHistoryTimeline';
import { PulseListPanel }       from '@/components/pulses/PulseListPanel';
import { CreatePulseModal }     from '@/components/pulses/CreatePulseModal';
import { usePulses, useClientPulseHistory } from '@/hooks/usePulses';
import s from './client-profile.module.css';
import f from '@/styles/forms.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Channel {
  id: number;
  channel_type: string;
  channel_value: string;
  channel_subtype: string;
  is_primary: boolean;
}

interface Address {
  id: number;
  address_type: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  country: string;
  pincode: string;
  is_primary: boolean;
}

interface Family {
  id: string;
  family_name: string;
  member_count: number;
}

interface Bookmark {
  id: number;
  custom_reason: string | null;
  notes: string | null;
  is_active: boolean;
}

interface Client {
  id: number;
  client_uid: string;
  client_no: string | null;
  contact_id: number;
  is_active: boolean;
  prefix: string;
  name: string;
  ext_ref_id: string | null;
  pan: string | null;
  dob: string | null;
  anniversary_date: string | null;
  survival_status: string;
  date_of_death: string | null;
  risk_profile: string | null;
  onboarding_status: string;
  referred_by_name: string | null;
  is_family_head: boolean;
  created_at: string;
  updated_at: string;
  channels: Channel[];
  addresses: Address[];
  family: Family | null;
  bookmark: Bookmark | null;
}

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

const CHANNEL_ICONS: Record<string, string> = {
  mobile:   'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.12 2.2 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.56-.56a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z',
  email:    'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z',
  whatsapp: 'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z',
  linkedin: 'M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z',
  other:    'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z',
};

const ADDRESS_TYPE_LABEL: Record<string, string> = {
  residential: 'Home',
  office:      'Office',
  mailing:     'Mailing',
  other:       'Other',
};

/* ── Overview Tab ────────────────────────────────────── */

function OverviewTab({ client, clientId }: { client: Client; clientId: number }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [editing, setEditing] = useState(false);
  const [pan, setPan]           = useState(client.pan ?? '');
  const [dob, setDob]           = useState(client.dob ? client.dob.split('T')[0] : '');
  const [anniversary, setAnniversary] = useState(client.anniversary_date ? client.anniversary_date.split('T')[0] : '');
  const [extRefId, setExtRefId] = useState(client.ext_ref_id ?? '');
  const [riskProfile, setRiskProfile] = useState(client.risk_profile ?? '');
  const [onboardingStatus, setOnboardingStatus] = useState(client.onboarding_status);
  const [referredBy, setReferredBy] = useState(client.referred_by_name ?? '');

  const { mutate: updateClient, isPending } = useSkillMutation(
    'client-skill', 'update_client',
    {
      onSuccess: () => {
        showToast({ message: 'Client updated', type: 'success' });
        setEditing(false);
      },
      onError: (e) => showToast({ message: e.message || 'Update failed', type: 'error' }),
    }
  );

  const handleSave = () => updateClient({
    client_id:        clientId,
    pan:              pan || undefined,
    dob:              dob || undefined,
    anniversary_date: anniversary || undefined,
    ext_ref_id:       extRefId || undefined,
    risk_profile:     riskProfile || undefined,
    onboarding_status: onboardingStatus || undefined,
    referred_by_name: referredBy || undefined,
  });

  return (
    <div className={s.overviewGrid}>
      {/* KYC Card */}
      <div className={s.detailCard}>
        <div className={s.cardTitleRow}>
          <h3 className={s.cardTitle}>KYC & Profile</h3>
          <VdfButton variant="ghost" size="sm" onClick={() => setEditing(v => !v)}>
            {editing ? 'Cancel' : 'Edit'}
          </VdfButton>
        </div>

        {editing ? (
          <div className={s.editForm}>
            <div className={s.editRow}>
              <div className={s.editField}>
                <label className={f.label}>PAN</label>
                <input className={f.input} value={pan} onChange={e => setPan(e.target.value.toUpperCase())} placeholder="ABCDE1234F" maxLength={10} />
              </div>
              <div className={s.editField}>
                <label className={f.label}>Date of Birth</label>
                <input className={f.input} type="date" value={dob} onChange={e => setDob(e.target.value)} />
              </div>
            </div>
            <div className={s.editRow}>
              <div className={s.editField}>
                <label className={f.label}>Anniversary</label>
                <input className={f.input} type="date" value={anniversary} onChange={e => setAnniversary(e.target.value)} />
              </div>
              <div className={s.editField}>
                <label className={f.label}>Reference ID</label>
                <input className={f.input} value={extRefId} onChange={e => setExtRefId(e.target.value)} placeholder="External reference code" />
              </div>
            </div>
            <div className={s.editRow}>
              <div className={s.editField}>
                <label className={f.label}>Risk Profile</label>
                <select className={f.select} value={riskProfile} onChange={e => setRiskProfile(e.target.value)}>
                  <option value="">— Not set —</option>
                  <option value="conservative">Conservative</option>
                  <option value="moderate">Moderate</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
              <div className={s.editField}>
                <label className={f.label}>Onboarding Status</label>
                <select className={f.select} value={onboardingStatus} onChange={e => setOnboardingStatus(e.target.value)}>
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className={s.editRow}>
              <div className={s.editFieldFull}>
                <label className={f.label}>Referred By</label>
                <input className={f.input} value={referredBy} onChange={e => setReferredBy(e.target.value)} placeholder="Referral source or name" />
              </div>
            </div>
            <div className={s.editActions}>
              <VdfButton variant="primary" size="sm" onClick={handleSave} disabled={isPending}>
                {isPending ? 'Saving…' : 'Save Changes'}
              </VdfButton>
            </div>
          </div>
        ) : (
          <div className={s.detailRows}>
            <div className={s.detailRow}>
              <span className={s.detailLabel}>PAN</span>
              <span className={s.detailValue}>
                {client.pan ? `${client.pan.slice(0, 5)}•••${client.pan.slice(-2)}` : <span className={s.empty}>Not set</span>}
              </span>
            </div>
            <div className={s.detailRow}>
              <span className={s.detailLabel}>Date of Birth</span>
              <span className={s.detailValue}>
                {client.dob
                  ? new Date(client.dob).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
                  : <span className={s.empty}>Not set</span>}
              </span>
            </div>
            <div className={s.detailRow}>
              <span className={s.detailLabel}>Anniversary</span>
              <span className={s.detailValue}>
                {client.anniversary_date
                  ? new Date(client.anniversary_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })
                  : <span className={s.empty}>Not set</span>}
              </span>
            </div>
            <div className={s.detailRow}>
              <span className={s.detailLabel}>Risk Profile</span>
              <span className={s.detailValue} style={client.risk_profile ? { color: RISK_COLORS[client.risk_profile] } : {}}>
                {client.risk_profile
                  ? client.risk_profile.charAt(0).toUpperCase() + client.risk_profile.slice(1)
                  : <span className={s.empty}>Not set</span>}
              </span>
            </div>
            <div className={s.detailRow}>
              <span className={s.detailLabel}>Onboarding</span>
              <VdfStatusBadge
                label={client.onboarding_status.replace('_', ' ')}
                variant={STATUS_VARIANT[client.onboarding_status] ?? 'muted'}
                size="sm"
              />
            </div>
            {client.referred_by_name && (
              <div className={s.detailRow}>
                <span className={s.detailLabel}>Referred By</span>
                <span className={s.detailValue}>{client.referred_by_name}</span>
              </div>
            )}
            <div className={s.detailRow}>
              <span className={s.detailLabel}>Client Since</span>
              <span className={s.detailValue}>{new Date(client.created_at).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })}</span>
            </div>
          </div>
        )}
      </div>

      {/* Side panel: Family + Contact link */}
      <div className={s.sidePanel}>
        {/* Family Card */}
        <div className={s.familyCard}>
          <h3 className={s.cardTitle}>Family</h3>
          {client.family ? (
            <div className={s.familyInfo}>
              <div className={s.familyName}>{client.family.family_name}</div>
              <div className={s.familyMeta}>
                {client.family.member_count} member{client.family.member_count !== 1 ? 's' : ''}
                {client.is_family_head && <span className={s.headPill}>Head</span>}
              </div>
            </div>
          ) : (
            <p className={s.emptyNote}>Not assigned to a family group.</p>
          )}
        </div>

        {/* Contact Link */}
        <div className={s.contactLinkCard}>
          <h3 className={s.cardTitle}>Contact Record</h3>
          <p className={s.emptyNote}>This client was onboarded from a contact record.</p>
          <VdfButton
            variant="outline"
            size="sm"
            onClick={() => router.push(`/contacts/${client.contact_id}`)}
          >
            View Contact →
          </VdfButton>
        </div>
      </div>
    </div>
  );
}

/* ── Channels Tab ────────────────────────────────────── */

function ChannelsTab({ channels }: { channels: Channel[] }) {
  if (channels.length === 0) {
    return (
      <div className={s.tabContent}>
        <VdfEmptyState
          title="No channels"
          description="Add contact channels via the contact profile."
        />
      </div>
    );
  }
  return (
    <div className={s.channelsList}>
      {channels.map(ch => (
        <div key={ch.id} className={s.channelItem}>
          <div className={s.channelIcon}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
              <path d={CHANNEL_ICONS[ch.channel_type] ?? CHANNEL_ICONS.other} />
              {ch.channel_type === 'email' && <polyline points="22,6 12,13 2,6" />}
            </svg>
          </div>
          <div className={s.channelMeta}>
            <span className={s.channelType}>{ch.channel_type}</span>
            <span className={s.channelValue}>{ch.channel_value}</span>
          </div>
          <div className={s.channelRight}>
            {ch.is_primary && <span className={s.primaryPill}>Primary</span>}
            {ch.channel_subtype && <span className={s.subtype}>{ch.channel_subtype}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Addresses Tab ───────────────────────────────────── */

function AddressesTab({ addresses, clientId }: { addresses: Address[]; clientId: number }) {
  const { showToast } = useToast();
  const queryClient   = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [addrType, setAddrType]   = useState('residential');
  const [line1, setLine1]         = useState('');
  const [line2, setLine2]         = useState('');
  const [city, setCity]           = useState('');
  const [addrState, setAddrState] = useState('');
  const [pincode, setPincode]     = useState('');
  const [isPrimary, setIsPrimary] = useState(addresses.length === 0);

  const { mutate: addAddress, isPending } = useSkillMutation(
    'client-skill', 'add_address',
    {
      onSuccess: () => {
        showToast({ message: 'Address saved', type: 'success' });
        setShowForm(false);
        setLine1(''); setLine2(''); setCity(''); setAddrState(''); setPincode('');
        queryClient.invalidateQueries({ queryKey: ['skill', 'client-skill', 'get_client'] });
      },
      onError: (e) => showToast({ message: e.message || 'Failed to save address', type: 'error' }),
    }
  );

  const handleAdd = () => {
    if (!line1 || !city || !addrState || !pincode) {
      showToast({ message: 'Please fill all required address fields', type: 'error' });
      return;
    }
    addAddress({ client_id: clientId, address_type: addrType, line1, line2: line2 || undefined, city, state: addrState, country: 'India', pincode, is_primary: isPrimary });
  };

  /* upsert hint: add_address upserts by (client_id, address_type) — selecting
     a type that already has an address will update it, not add a duplicate */
  const existingTypes = new Set(addresses.map(a => a.address_type));

  return (
    <div className={s.addressesWrap}>
      <div className={s.addressesHeader}>
        <span className={s.addressCount}>{addresses.length} address{addresses.length !== 1 ? 'es' : ''}</span>
        <VdfButton variant="outline" size="sm" onClick={() => setShowForm(v => !v)}>
          {showForm ? 'Cancel' : '+ Add Address'}
        </VdfButton>
      </div>

      {showForm && (
        <div className={s.addrForm}>
          <div className={s.editRow}>
            <div className={s.editField}>
              <label className={f.label}>Type</label>
              <select className={f.select} value={addrType} onChange={e => setAddrType(e.target.value)}>
                <option value="residential">Residential{existingTypes.has('residential') ? ' (update)' : ''}</option>
                <option value="office">Office{existingTypes.has('office') ? ' (update)' : ''}</option>
                <option value="mailing">Mailing{existingTypes.has('mailing') ? ' (update)' : ''}</option>
                <option value="permanent">Permanent{existingTypes.has('permanent') ? ' (update)' : ''}</option>
                <option value="other">Other{existingTypes.has('other') ? ' (update)' : ''}</option>
              </select>
            </div>
            <div className={s.editField}>
              <label className={f.label}>Pincode *</label>
              <input className={f.input} value={pincode} onChange={e => setPincode(e.target.value)} placeholder="400001" maxLength={6} />
            </div>
          </div>
          <div className={s.editFieldFull}>
            <label className={f.label}>Line 1 *</label>
            <input className={f.input} value={line1} onChange={e => setLine1(e.target.value)} placeholder="Street / building / flat number" />
          </div>
          <div className={s.editFieldFull}>
            <label className={f.label}>Line 2</label>
            <input className={f.input} value={line2} onChange={e => setLine2(e.target.value)} placeholder="Area / landmark (optional)" />
          </div>
          <div className={s.editRow}>
            <div className={s.editField}>
              <label className={f.label}>City *</label>
              <input className={f.input} value={city} onChange={e => setCity(e.target.value)} placeholder="Mumbai" />
            </div>
            <div className={s.editField}>
              <label className={f.label}>State *</label>
              <input className={f.input} value={addrState} onChange={e => setAddrState(e.target.value)} placeholder="Maharashtra" />
            </div>
          </div>
          <div className={s.primaryRow}>
            <label className={s.checkboxLabel}>
              <input type="checkbox" checked={isPrimary} onChange={e => setIsPrimary(e.target.checked)} />
              <span>Set as primary address</span>
            </label>
          </div>
          <div className={s.editActions}>
            <VdfButton variant="primary" size="sm" loading={isPending} onClick={handleAdd}>
              {existingTypes.has(addrType) ? 'Update Address' : 'Save Address'}
            </VdfButton>
          </div>
        </div>
      )}

      {addresses.length === 0 && !showForm ? (
        <VdfEmptyState title="No addresses" description="Add a residential or office address for this client." />
      ) : (
        <div className={s.addressList}>
          {addresses.map(addr => (
            <div key={addr.id} className={s.addrCard}>
              <div className={s.addrCardTop}>
                <span className={s.addrType}>{ADDRESS_TYPE_LABEL[addr.address_type] ?? addr.address_type}</span>
                {addr.is_primary && <span className={s.primaryPill}>Primary</span>}
              </div>
              <div className={s.addrLines}>
                <span>{addr.line1}</span>
                {addr.line2 && <span>{addr.line2}</span>}
                <span>{addr.city}, {addr.state} — {addr.pincode}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── Pulses Tab ──────────────────────────────────────── */

function ClientPulsesTab({ clientId, clientName }: { clientId: number; clientName: string }) {
  const [activeStatus, setActiveStatus] = useState<'open' | 'done' | 'all'>('open');
  const [showCreate, setShowCreate]     = useState(false);
  const { showToast } = useToast();

  const queryStatus = activeStatus === 'all' ? undefined : activeStatus;
  const { data, isLoading: taskLoading, isError, error } = usePulses(
    { client_id: clientId, status: queryStatus, limit: 100 },
  );
  const { data: historyData, isLoading: historyLoading } = useClientPulseHistory(clientId);

  useEffect(() => {
    if (isError) showToast({ message: (error as Error)?.message || 'Failed to load follow-ups', type: 'error' });
  }, [isError, error, showToast]);

  const pulses   = data?.data?.pulses   ?? [];
  const sessions = historyData?.data?.sessions ?? [];

  return (
    <div className={s.pulsesPanel}>
      <div className={s.pulseSection}>
        <div className={s.pulseSectionLabel}>Pulse Setup</div>
        <PulseConfigCard clientId={clientId} />
      </div>
      <div className={s.pulseSection}>
        <div className={s.pulseSectionLabel}>Session History</div>
        <PulseHistoryTimeline sessions={sessions} isLoading={historyLoading} />
      </div>
      <div className={s.pulseSection}>
        <div className={s.pulseSectionLabel}>Follow-up Tasks</div>
        <PulseListPanel
          pulses={pulses}
          isLoading={taskLoading}
          activeStatus={activeStatus}
          onStatusChange={setActiveStatus}
          showSubject={false}
          onAdd={() => setShowCreate(true)}
          emptyMessage={
            activeStatus === 'open'  ? 'No open follow-ups.' :
            activeStatus === 'done'  ? 'No completed follow-ups yet.' :
                                       'No follow-ups yet.'
          }
        />
      </div>
      <CreatePulseModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        clientId={clientId}
        clientName={clientName}
      />
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────── */

export default function ClientProfilePage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const clientId = Number(id);

  // Support deep-link tab activation via ?tab=addresses or ?tab=kyc
  const tabParam = searchParams?.get('tab') ?? null;
  const initialTab = tabParam === 'addresses' ? 'addresses' : 'overview';

  const [activeTab, setActiveTab]           = useState(initialTab);
  const [bookmarked, setBookmarked]         = useState(false);
  const [confirmDeactivate, setConfirmDea]  = useState(false);

  const { data, isLoading, isError } = useSkillQuery<{ client: Client | null }>(
    'client-skill', 'get_client', { client_id: clientId }
  );

  // Sync bookmark state from loaded data
  useEffect(() => {
    if (data?.data?.client) {
      setBookmarked(!!data.data.client.bookmark?.is_active);
    }
  }, [data]);

  const { mutate: addBookmark }    = useSkillMutation('client-skill', 'add_bookmark', {
    onSuccess: () => { setBookmarked(true); showToast({ message: 'Bookmarked', type: 'success' }); },
    onError: () => showToast({ message: 'Failed to bookmark', type: 'error' }),
  });
  const { mutate: removeBookmark } = useSkillMutation('client-skill', 'remove_bookmark', {
    onSuccess: () => { setBookmarked(false); showToast({ message: 'Bookmark removed', type: 'success' }); },
    onError: () => showToast({ message: 'Failed to remove bookmark', type: 'error' }),
  });
  const { mutate: setClientActive, isPending: isTogglingActive } = useSkillMutation(
    'client-skill', 'set_client_active',
    {
      onSuccess: (_res, vars) => {
        const activated = (vars as { is_active: boolean }).is_active;
        showToast({ message: activated ? 'Client reactivated' : 'Client deactivated', type: 'success' });
        setConfirmDea(false);
      },
      onError: (e) => showToast({ message: e.message || 'Failed to update status', type: 'error' }),
    }
  );

  if (isLoading) return <VdfLoader overlay message="Loading client…" />;
  if (isError || !data?.data?.client) return (
    <div className={s.page}>
      <div className={s.errorBanner}>Client not found.</div>
    </div>
  );

  const client = data.data.client;

  const TABS = [
    { id: 'overview',   label: 'Overview' },
    { id: 'channels',   label: 'Channels',  badge: client.channels.length > 0 ? client.channels.length : undefined },
    { id: 'addresses',  label: 'Addresses', badge: client.addresses.length > 0 ? client.addresses.length : undefined },
    { id: 'pulses',     label: 'Pulses' },
  ];

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow={client.client_no ?? 'CLIENT PROFILE'}
        title={`${client.prefix} ${client.name}`}
        meta={<>
          <button
            style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', padding: 0, fontSize: '0.78rem' }}
            onClick={() => router.push('/clients')}
          >← Clients</button>
          {' · '}
          <VdfStatusBadge
            label={client.onboarding_status.replace('_', ' ')}
            variant={STATUS_VARIANT[client.onboarding_status] ?? 'muted'}
            size="sm"
          />
          {client.risk_profile && (
            <span style={{ color: RISK_COLORS[client.risk_profile], fontSize: '0.75rem', fontWeight: 600 }}>
              {' · '}
              <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 2, background: RISK_COLORS[client.risk_profile], marginRight: 4, verticalAlign: 'middle' }} />
              {client.risk_profile}
            </span>
          )}
          {client.survival_status === 'deceased' && (
            <span style={{ color: 'var(--color-danger)', fontSize: '0.75rem' }}>{' · '}Deceased</span>
          )}
        </>}
        actions={<>
          <VdfButton variant="primary" size="sm" onClick={() => router.push(`/customers/${clientId}`)}>
            Portfolio →
          </VdfButton>
          <VdfButton variant="outline" size="sm" onClick={() => router.push(`/clients/${clientId}/edit`)}>
            Edit Profile
          </VdfButton>
          {client.is_active !== false ? (
            confirmDeactivate ? (
              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <VdfButton
                  variant="danger"
                  size="sm"
                  loading={isTogglingActive}
                  onClick={() => setClientActive({ client_id: clientId, is_active: false })}
                >
                  Confirm Deactivate
                </VdfButton>
                <VdfButton variant="ghost" size="xs" iconOnly onClick={() => setConfirmDea(false)} title="Cancel">✕</VdfButton>
              </div>
            ) : (
              <VdfButton variant="ghost" size="sm" onClick={() => setConfirmDea(true)}>Deactivate</VdfButton>
            )
          ) : (
            <VdfButton variant="primary" size="sm" loading={isTogglingActive}
              onClick={() => setClientActive({ client_id: clientId, is_active: true })}>
              Reactivate
            </VdfButton>
          )}
          <VdfButton
            variant="ghost"
            size="sm"
            iconOnly
            className={bookmarked ? s.bookmarked : ''}
            title={bookmarked ? 'Remove bookmark' : 'Bookmark client'}
            onClick={() => bookmarked ? removeBookmark({ client_id: clientId }) : addBookmark({ client_id: clientId })}
          >
            <svg viewBox="0 0 24 24" fill={bookmarked ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" width="18" height="18">
              <path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z" />
            </svg>
          </VdfButton>
        </>}
      />

      {/* ── Inactive banner ── */}
      {client.is_active === false && (
        <div className={s.inactiveBanner}>
          <div className={s.inactiveBannerText}>
            <span className={s.inactiveBannerDot} />
            This client is inactive. Portfolio, goals, and transactions are read-only.
          </div>
          <VdfButton
            variant="primary"
            size="sm"
            loading={isTogglingActive}
            onClick={() => setClientActive({ client_id: clientId, is_active: true })}
          >
            Reactivate Client
          </VdfButton>
        </div>
      )}

      {/* ── Tabs ── */}
      <div className={s.tabsBar}>
        <VdfTabs tabs={TABS} activeId={activeTab} onChange={setActiveTab} variant="underline" />
      </div>

      {/* ── Tab Content ── */}
      <div className={s.tabPanel}>
        {activeTab === 'overview'  && <OverviewTab client={client} clientId={clientId} />}
        {activeTab === 'channels'  && <ChannelsTab channels={client.channels} />}
        {activeTab === 'addresses' && <AddressesTab addresses={client.addresses} clientId={clientId} />}
        {activeTab === 'pulses'    && <ClientPulsesTab clientId={clientId} clientName={`${client.prefix} ${client.name}`} />}
      </div>
    </div>
  );
}
