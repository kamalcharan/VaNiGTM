'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import { VdfLoader, VdfButton } from '@/components/vdf';
import s from './convert.module.css';

/* ── Types ── */

interface Channel {
  id: number;
  channel_type: string;
  channel_value: string;
  is_primary: boolean;
}

interface SnapshotSummary {
  has_snapshot: boolean;
  risk_profile: string | null;
  goals_lite_count: number;
  net_worth_estimate: number | null;
}

interface Contact {
  id: number;
  prefix: string;
  name: string;
  is_client: boolean;
  channels: Channel[];
  snapshot_summary: SnapshotSummary | null;
  created_at: string;
}

interface SuccessData {
  clientId: number;
  extRef: string | null;
  goalsSeeded: number;
}

/* ── Helpers ── */

function formatAmount(v: number): string {
  if (v >= 1_00_00_000) return `₹ ${(v / 1_00_00_000).toFixed(1)} Cr`;
  if (v >= 1_00_000)    return `₹ ${(v / 1_00_000).toFixed(1)} L`;
  return `₹ ${v.toLocaleString('en-IN')}`;
}

const RAIL_ITEMS = (c: Contact) => {
  const snap       = c.snapshot_summary;
  const channelTypes = c.channels.map(ch =>
    ch.channel_type.charAt(0).toUpperCase() + ch.channel_type.slice(1)
  );
  const channelSummary = channelTypes.length
    ? channelTypes.join(' · ')
    : null;

  return [
    {
      label: 'Identity',
      value: `${c.prefix} ${c.name}`,
      done: true,
    },
    {
      label: `${c.channels.length} Channel${c.channels.length !== 1 ? 's' : ''}`,
      value: channelSummary,
      done: c.channels.length > 0,
    },
    {
      label: 'Risk Profile',
      value: snap?.risk_profile
        ? snap.risk_profile.charAt(0).toUpperCase() + snap.risk_profile.slice(1)
        : null,
      done: !!snap?.risk_profile,
    },
    {
      label: 'Net Worth',
      value: snap?.net_worth_estimate ? formatAmount(snap.net_worth_estimate) : null,
      done: !!snap?.net_worth_estimate,
    },
    {
      label: `${snap?.goals_lite_count ?? 0} Aspirational Goal${(snap?.goals_lite_count ?? 0) !== 1 ? 's' : ''}`,
      value: (snap?.goals_lite_count ?? 0) > 0 ? 'Defined in snapshot' : null,
      done: (snap?.goals_lite_count ?? 0) > 0,
    },
  ];
};

/* ── Page ── */

export default function ConvertPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const contactId = Number(id);

  const [pan, setPan]                 = useState('');
  const [dob, setDob]                 = useState('');
  const [anniversary, setAnniversary] = useState('');
  const [extRef, setExtRef]           = useState('');
  const [isFamilyHead, setFamilyHead] = useState<boolean | null>(null);
  const [referredBy, setReferredBy]   = useState('');
  const [addrLine1, setAddrLine1]     = useState('');
  const [addrLine2, setAddrLine2]     = useState('');
  const [addrCity, setAddrCity]       = useState('');
  const [addrState, setAddrState]     = useState('');
  const [addrPin, setAddrPin]         = useState('');

  const { data, isLoading, isError } = useSkillQuery<{ contact: Contact | null }>(
    'contact-skill', 'get_contact', { contact_id: contactId }
  );

  const contact = data?.data?.contact ?? null;

  // ALL hooks before any early returns — Rules of Hooks
  useEffect(() => {
    if (contact?.is_client) {
      router.replace(`/contacts/${contactId}`);
    }
  }, [contact?.is_client, contactId, router]);

  const [successData, setSuccessData] = useState<SuccessData | null>(null);

  const { mutate: convert, isPending } = useSkillMutation(
    'contact-skill', 'convert_to_client',
    {
      onSuccess: (res: { data: { client: { id: number; ext_ref_id: string | null }; goals_seeded: number } }) => {
        setSuccessData({
          clientId:   res.data.client.id,
          extRef:     res.data.client.ext_ref_id,
          goalsSeeded: res.data.goals_seeded,
        });
      },
      onError: (e: Error) => showToast({ message: e.message || 'Conversion failed', type: 'error' }),
    }
  );

  if (isLoading) return <VdfLoader overlay message="Loading…" />;

  const skillError = !data?.success ? data?.error : null;
  if (isError || skillError || !contact) {
    return (
      <div className={s.page}>
        <div className={s.errorBanner}>
          {skillError ? `Skill error: ${skillError}` : 'Contact not found.'}
        </div>
      </div>
    );
  }

  if (contact.is_client) return null;

  const railItems = RAIL_ITEMS(contact);

  const handleConvert = () => {
    const hasAddress = addrLine1.trim() && addrCity.trim() && addrState.trim() && addrPin.trim();
    convert({
      contact_id:        contactId,
      pan:               pan.trim().toUpperCase() || undefined,
      dob:               dob || undefined,
      anniversary_date:  anniversary || undefined,
      ext_ref_id:        extRef.trim() || undefined,
      is_family_head:    isFamilyHead === true,
      referred_by_name:  referredBy.trim() || undefined,
      address: hasAddress ? {
        address_type: 'residential',
        line1:   addrLine1.trim(),
        line2:   addrLine2.trim() || undefined,
        city:    addrCity.trim(),
        state:   addrState.trim(),
        pincode: addrPin.trim(),
      } : undefined,
    });
  };

  return (
    <div className={s.page}>
      {/* ── Header ── */}
      <header className={s.header}>
        <div className={s.headerLeft}>
          <button className={s.backBtn} onClick={() => router.push('/contacts')}>Contacts</button>
          <span className={s.headerCrumb}>/</span>
          <button className={s.backBtn} onClick={() => router.push(`/contacts/${contactId}`)}>{contact.name}</button>
          <span className={s.headerCrumb}>/</span>
          <span className={s.headerTitle}>Convert to Client</span>
        </div>
        <div className={s.headerStepper}>
          The final step ·{' '}
          <span className={s.headerStepperStrong}>5 new fields</span>
          {' '}· ~2 min
        </div>
      </header>

      {/* ── Body ── */}
      <div className={s.body}>

        {/* Left rail */}
        <aside className={s.rail}>
          <div className={s.railEyebrow}>Conversion Brief</div>
          <div className={s.railTitle}>
            Welcome <em>{contact.name.split(' ')[0]}</em> to<br />your client family.
          </div>
          <div className={s.railSub}>
            You&apos;ve already gathered everything that matters. Here&apos;s what&apos;s on file — just fill the official details on the right.
          </div>

          <div className={s.railKnown}>
            {railItems.map((item) => (
              <div key={item.label} className={s.railItem}>
                <div className={`${s.railCheck} ${item.done ? s.railCheckDone : s.railCheckMiss}`}>
                  {item.done ? '✓' : '—'}
                </div>
                <div className={s.railItemBody}>
                  <div className={s.railItemLabel}>{item.label}</div>
                  {item.value
                    ? <div className={s.railItemValue}>{item.value}</div>
                    : <div className={s.railItemMissing}>Not added</div>
                  }
                </div>
              </div>
            ))}
          </div>

          <div className={s.railQuote}>
            <span className={s.railQuoteMark}>"</span>
            <p className={s.railQuoteText}>
              A conversion isn&apos;t paperwork — it&apos;s the moment a stranger trusts you with their future.
            </p>
            <div className={s.railQuoteAuthor}>ProKey · Client Management</div>
          </div>
        </aside>

        {/* Right form */}
        <main className={s.form}>

          {/* Section 1 — KYC */}
          <div className={s.formSection}>
            <div className={s.formSectionHead}>
              <span className={s.formSectionNum}>01</span>
              <span className={s.formSectionTitle}>Identity Verification</span>
              <span className={s.formSectionSub}>Required by SEBI</span>
            </div>

            <div className={s.formGrid2} style={{ marginBottom: 18 }}>
              <div className={s.field}>
                <label className={s.fieldLabel}>PAN Number</label>
                <input
                  className={`${s.fieldInput} ${s.panInput}`}
                  value={pan}
                  onChange={e => setPan(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                />
              </div>
              <div className={s.field}>
                <label className={s.fieldLabel}>Date of Birth</label>
                <input
                  className={s.fieldInput}
                  type="date"
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                />
              </div>
            </div>

            <div className={s.field}>
              <label className={s.fieldLabel}>Anniversary Date <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.6 }}>(optional)</span></label>
              <input
                className={s.fieldInput}
                type="date"
                value={anniversary}
                onChange={e => setAnniversary(e.target.value)}
                style={{ maxWidth: 240 }}
              />
            </div>
          </div>

          {/* Section 2 — System Reference */}
          <div className={s.formSection}>
            <div className={s.formSectionHead}>
              <span className={s.formSectionNum}>02</span>
              <span className={s.formSectionTitle}>Distributor Reference</span>
              <span className={s.formSectionSub}>Your tracking code</span>
            </div>

            <div className={s.field} style={{ marginBottom: 24 }}>
              <label className={s.fieldLabel}>External Reference ID</label>
              <div className={s.extRefWrap}>
                <span className={s.extRefLabel}>CLIENT · CODE</span>
                <input
                  className={s.extRefInput}
                  value={extRef}
                  onChange={e => setExtRef(e.target.value)}
                  placeholder="e.g. KR-2024-0042"
                />
              </div>
              <span style={{ fontSize: '0.68rem', color: 'var(--color-muted)', marginTop: 4 }}>
                Your own numbering system — appears on reports and client card.
              </span>
            </div>
          </div>

          {/* Section 3 — Family */}
          <div className={s.formSection}>
            <div className={s.formSectionHead}>
              <span className={s.formSectionNum}>03</span>
              <span className={s.formSectionTitle}>Family Structure</span>
              <span className={s.formSectionSub}>Group household members</span>
            </div>

            <div className={s.toggleCards}>
              <button
                className={`${s.toggleCard} ${isFamilyHead === true ? s.toggleCardSelected : ''}`}
                onClick={() => setFamilyHead(isFamilyHead === true ? null : true)}
              >
                <div className={s.toggleIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                  </svg>
                </div>
                <div>
                  <div className={s.toggleLabel}>Family Head</div>
                  <div className={s.toggleSub}>Will create a new family</div>
                </div>
              </button>

              <button
                className={`${s.toggleCard} ${isFamilyHead === false ? s.toggleCardSelected : ''}`}
                onClick={() => setFamilyHead(isFamilyHead === false ? null : false)}
              >
                <div className={s.toggleIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                    <circle cx="12" cy="7" r="4" />
                  </svg>
                </div>
                <div>
                  <div className={s.toggleLabel}>Family Member</div>
                  <div className={s.toggleSub}>Link to existing family</div>
                </div>
              </button>
            </div>
          </div>

          {/* Section 4 — Address */}
          <div className={s.formSection}>
            <div className={s.formSectionHead}>
              <span className={s.formSectionNum}>04</span>
              <span className={s.formSectionTitle}>Residential Address</span>
              <span className={s.formSectionSub}>Sets as primary · Optional</span>
            </div>

            <div className={s.field} style={{ marginBottom: 14 }}>
              <label className={s.fieldLabel}>Address Line 1</label>
              <input
                className={s.fieldInput}
                value={addrLine1}
                onChange={e => setAddrLine1(e.target.value)}
                placeholder="Flat / House no., Building"
              />
            </div>
            <div className={s.field} style={{ marginBottom: 18 }}>
              <label className={s.fieldLabel}>
                Address Line 2{' '}
                <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, opacity: 0.6 }}>(optional)</span>
              </label>
              <input
                className={s.fieldInput}
                value={addrLine2}
                onChange={e => setAddrLine2(e.target.value)}
                placeholder="Street, Area, Landmark"
              />
            </div>
            <div className={s.formGrid3}>
              <div className={s.field}>
                <label className={s.fieldLabel}>City</label>
                <input
                  className={s.fieldInput}
                  value={addrCity}
                  onChange={e => setAddrCity(e.target.value)}
                  placeholder="Mumbai"
                />
              </div>
              <div className={s.field}>
                <label className={s.fieldLabel}>State</label>
                <input
                  className={s.fieldInput}
                  value={addrState}
                  onChange={e => setAddrState(e.target.value)}
                  placeholder="Maharashtra"
                />
              </div>
              <div className={s.field}>
                <label className={s.fieldLabel}>Pincode</label>
                <input
                  className={s.fieldInput}
                  value={addrPin}
                  onChange={e => setAddrPin(e.target.value)}
                  placeholder="400001"
                  maxLength={6}
                />
              </div>
            </div>
          </div>

          {/* Section 5 — Referral */}
          <div className={s.formSection}>
            <div className={s.formSectionHead}>
              <span className={s.formSectionNum}>05</span>
              <span className={s.formSectionTitle}>Referral</span>
              <span className={s.formSectionSub}>Optional</span>
            </div>
            <div className={s.field}>
              <label className={s.fieldLabel}>Referred By</label>
              <input
                className={s.fieldInput}
                value={referredBy}
                onChange={e => setReferredBy(e.target.value)}
                placeholder="Name of person who referred this client"
                style={{ maxWidth: 380 }}
              />
            </div>
          </div>

        </main>
      </div>

      {/* ── Sticky footer ── */}
      <footer className={s.footer}>
        <div className={s.footerLeft}>
          Goals from snapshot will be seeded automatically if set.
        </div>
        <div className={s.footerRight}>
          <VdfButton variant="ghost" onClick={() => router.push(`/contacts/${contactId}`)}>
            ← Back to profile
          </VdfButton>
          <VdfButton variant="primary" loading={isPending} onClick={handleConvert}>
            Convert {contact.name.split(' ')[0]} to Client →
          </VdfButton>
        </div>
      </footer>

      {/* ── Conversion Success Screen ── */}
      {successData && (
        <div className={s.successScreen}>
          <div className={s.successContent}>

            {/* Card — flips in */}
            <div className={s.successCard}>
              <div className={s.successCardEyebrow}>ProKey · Active Client</div>
              <div className={s.successCardTitle}>{contact.name}</div>

              {successData.extRef && (
                <div className={s.successExtRef}>
                  <span className={s.successExtRefLabel}>CLIENT · CODE</span>
                  <span className={s.successExtRefValue}>{successData.extRef}</span>
                </div>
              )}

              <div className={s.successCardMeta}>
                <span>
                  SINCE{' '}
                  {new Date().toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase()}
                </span>
                <span>
                  {contact.snapshot_summary?.risk_profile
                    ? `${contact.snapshot_summary.risk_profile.toUpperCase()} RISK`
                    : 'PROKEY · MFD'}
                </span>
              </div>
            </div>

            {/* Headline */}
            <h1 className={s.successHeadline}>
              Welcome <em>{contact.name.split(' ')[0]}</em><br />
              to your client family.
            </h1>

            {/* Sub */}
            <p className={s.successSub}>
              {[
                contact.snapshot_summary?.has_snapshot ? 'Snapshot data migrated' : null,
                successData.goalsSeeded > 0
                  ? `${successData.goalsSeeded} goal${successData.goalsSeeded !== 1 ? 's' : ''} seeded`
                  : null,
                'Client profile created',
              ].filter(Boolean).join(' · ')}
            </p>

            {/* Actions */}
            <div className={s.successActions}>
              <button
                className={s.successBtnPrimary}
                onClick={() => router.push(`/clients/${successData.clientId}`)}
              >
                View Client Profile →
              </button>
              <button
                className={s.successBtnGhost}
                onClick={() => router.push('/contacts')}
              >
                Back to Roster
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
