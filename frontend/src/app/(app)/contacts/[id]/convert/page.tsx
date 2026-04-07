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

/* ── Helpers ── */

function formatAmount(v: number): string {
  if (v >= 1_00_00_000) return `₹ ${(v / 1_00_00_000).toFixed(1)} Cr`;
  if (v >= 1_00_000)    return `₹ ${(v / 1_00_000).toFixed(1)} L`;
  return `₹ ${v.toLocaleString('en-IN')}`;
}

const RAIL_ITEMS = (c: Contact) => {
  const mobile  = c.channels.find(ch => ch.channel_type === 'mobile');
  const email   = c.channels.find(ch => ch.channel_type === 'email');
  const snap    = c.snapshot_summary;

  return [
    {
      label: 'Identity',
      value: `${c.prefix} ${c.name}`,
      done: true,
    },
    {
      label: 'Mobile',
      value: mobile?.channel_value ?? null,
      done: !!mobile,
    },
    {
      label: 'Email',
      value: email?.channel_value ?? null,
      done: !!email,
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
      label: 'Goals',
      value: snap?.goals_lite_count
        ? `${snap.goals_lite_count} goal${snap.goals_lite_count > 1 ? 's' : ''} defined`
        : null,
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

  const { mutate: convert, isPending } = useSkillMutation(
    'contact-skill', 'convert_to_client',
    {
      onSuccess: (res: { data: { client: { id: number } } }) => {
        const clientId = res.data.client.id;
        showToast({ message: `${contact?.name} is now a client!`, type: 'success' });
        router.push(`/clients/${clientId}`);
      },
      onError: (e: Error) => showToast({ message: e.message || 'Conversion failed', type: 'error' }),
    }
  );

  if (isLoading) return <VdfLoader overlay message="Loading…" />;

  const skillError = !data?.success ? data?.error : null;
  if (isError || skillError || !data?.data?.contact) {
    return (
      <div className={s.page}>
        <div className={s.errorBanner}>
          {skillError ? `Skill error: ${skillError}` : 'Contact not found.'}
        </div>
      </div>
    );
  }

  const contact = data.data.contact;

  // Move navigation out of render — calling router during render is illegal in React 19
  useEffect(() => {
    if (contact.is_client) {
      router.replace(`/contacts/${contactId}`);
    }
  }, [contact.is_client, contactId, router]);

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
          <button className={s.backBtn} onClick={() => router.push(`/contacts/${contactId}`)}>
            ← Back to profile
          </button>
          <div className={s.headerDivider} />
          <span className={s.headerTitle}>Convert to Client</span>
        </div>
        <div className={s.headerStepper}>
          Converting{' '}
          <span className={s.headerStepperStrong}>{contact.prefix} {contact.name}</span>
        </div>
      </header>

      {/* ── Body ── */}
      <div className={s.body}>

        {/* Left rail */}
        <aside className={s.rail}>
          <div className={s.railEyebrow}>Conversion Brief</div>
          <div className={s.railTitle}>What we know</div>
          <div className={s.railSub}>
            Review the profile before creating their client record.
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
              A client record creates the foundation for their entire financial journey with you.
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
              <span className={s.formSectionTitle}>KYC & Identity</span>
              <span className={s.formSectionSub}>All fields optional</span>
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
              <span className={s.formSectionTitle}>Client Reference</span>
              <span className={s.formSectionSub}>Your internal ID system</span>
            </div>

            <div className={s.field} style={{ marginBottom: 24 }}>
              <label className={s.fieldLabel}>External Reference ID</label>
              <div className={s.extRefWrap}>
                <span className={s.extRefLabel}>REF</span>
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
              <span className={s.formSectionTitle}>Family Grouping</span>
              <span className={s.formSectionSub}>Optional</span>
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
                  <div className={s.toggleLabel}>Create as Family Head</div>
                  <div className={s.toggleSub}>Start a new family group for this client</div>
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
                  <div className={s.toggleLabel}>Individual Client</div>
                  <div className={s.toggleSub}>No family group — standalone record</div>
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
          <VdfButton
            variant="ghost"
            onClick={() => router.push(`/contacts/${contactId}`)}
          >
            Cancel
          </VdfButton>
          <VdfButton
            variant="primary"
            loading={isPending}
            onClick={handleConvert}
          >
            Convert to Client →
          </VdfButton>
        </div>
      </footer>
    </div>
  );
}
