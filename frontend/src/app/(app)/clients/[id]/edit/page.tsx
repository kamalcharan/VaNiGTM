'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import { useAuth } from '@/context/auth-provider';
import { VdfLoader, VdfButton } from '@/components/vdf';
import s from './edit.module.css';
import f from '@/styles/forms.module.css';

/* ── Platform label map ── */
const PLATFORM_LABELS: Record<string, string> = {
  CAMS:     'CAMS Code',
  KFINTECH: 'KFintech Code',
  IWELL:    'IWell Code',
  BSE_STAR: 'BSE StarMF Code',
  CUSTOM:   'Client Code',
};

/* ── Types ── */

interface ClientSummary {
  id: number;
  contact_id: number;
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
  channels: { id: number; channel_type: string; is_primary: boolean }[];
  addresses: { id: number; city: string; state: string; is_primary: boolean }[];
  family: { id: string; family_name: string; member_count: number } | null;
}

/* ── Rail snapshot items ── */
function makeRailItems(client: ClientSummary) {
  return [
    {
      label: 'PAN',
      value: client.pan ? `${client.pan.slice(0, 5)}•••${client.pan.slice(-2)}` : null,
      done: !!client.pan,
      warn: false,
    },
    {
      label: 'Risk Profile',
      value: client.risk_profile
        ? client.risk_profile.charAt(0).toUpperCase() + client.risk_profile.slice(1)
        : null,
      done: !!client.risk_profile,
      warn: false,
    },
    {
      label: 'Onboarding',
      value: client.onboarding_status.replace('_', ' '),
      done: client.onboarding_status === 'completed',
      warn: false,
    },
    {
      label: 'Addresses',
      value: client.addresses.length > 0 ? `${client.addresses.length} on file` : null,
      done: client.addresses.length > 0,
      warn: false,
    },
    {
      label: 'Survival Status',
      value: client.survival_status === 'deceased' ? '⚠ Deceased' : 'Alive',
      done: client.survival_status === 'alive',
      warn: client.survival_status === 'deceased',
    },
  ];
}

/* ── Page ── */

export default function EditClientPage() {
  const { id } = useParams() as { id: string };
  const router  = useRouter();
  const { showToast }  = useToast();
  const { tenant }     = useAuth();
  const clientId       = Number(id);
  const platformLabel  = PLATFORM_LABELS[tenant?.ext_ref_type_code ?? ''] ?? 'Client Code';

  /* Form state */
  const [pan,              setPan]              = useState('');
  const [dob,              setDob]              = useState('');
  const [anniversary,      setAnniversary]      = useState('');
  const [extRef,           setExtRef]           = useState('');
  const [riskProfile,      setRiskProfile]      = useState('');
  const [onboardingStatus, setOnboardingStatus] = useState('pending');
  const [survivalStatus,   setSurvivalStatus]   = useState<'alive' | 'deceased'>('alive');
  const [dateOfDeath,      setDateOfDeath]      = useState('');
  const [referredBy,       setReferredBy]       = useState('');
  const [initialized,      setInitialized]      = useState(false);

  const { data, isLoading, isError } = useSkillQuery<{ client: ClientSummary | null }>(
    'client-skill', 'get_client', { client_id: clientId }
  );

  const client = data?.data?.client ?? null;

  /* Pre-populate form once client data arrives */
  useEffect(() => {
    if (client && !initialized) {
      setPan(client.pan ?? '');
      setDob(client.dob ? client.dob.split('T')[0] : '');
      setAnniversary(client.anniversary_date ? client.anniversary_date.split('T')[0] : '');
      setExtRef(client.ext_ref_id ?? '');
      setRiskProfile(client.risk_profile ?? '');
      setOnboardingStatus(client.onboarding_status);
      setSurvivalStatus(client.survival_status === 'deceased' ? 'deceased' : 'alive');
      setDateOfDeath(client.date_of_death ? client.date_of_death.split('T')[0] : '');
      setReferredBy(client.referred_by_name ?? '');
      setInitialized(true);
    }
  }, [client, initialized]);

  const { mutate: updateClient, isPending } = useSkillMutation(
    'client-skill', 'update_client',
    {
      onSuccess: () => {
        showToast({ message: 'Client profile updated', type: 'success' });
        router.push(`/clients/${clientId}`);
      },
      onError: (e) => showToast({ message: e.message || 'Update failed', type: 'error' }),
    }
  );

  if (isLoading) return <VdfLoader overlay message="Loading client…" />;
  if (isError || !client) {
    return (
      <div className={s.page}>
        <div className={s.errorBanner}>Client not found or not accessible.</div>
      </div>
    );
  }

  const railItems = makeRailItems(client);

  const handleSave = () => {
    if (survivalStatus === 'deceased' && !dateOfDeath) {
      showToast({ message: 'Date of death is required when status is Deceased', type: 'error' });
      return;
    }
    updateClient({
      client_id:         clientId,
      pan:               pan.trim().toUpperCase() || undefined,
      dob:               dob || undefined,
      anniversary_date:  anniversary || undefined,
      ext_ref_id:        extRef.trim() || undefined,
      risk_profile:      riskProfile || undefined,
      onboarding_status: onboardingStatus || undefined,
      survival_status:   survivalStatus,
      date_of_death:     survivalStatus === 'deceased' ? dateOfDeath : null,
      referred_by_name:  referredBy.trim() || undefined,
    });
  };

  return (
    <div className={s.page}>

      {/* ── Header ── */}
      <header className={s.header}>
        <div className={s.headerLeft}>
          <button className={s.backBtn} onClick={() => router.push('/clients')}>Clients</button>
          <span className={s.headerCrumb}>/</span>
          <button className={s.backBtn} onClick={() => router.push(`/clients/${clientId}`)}>
            {client.name}
          </button>
          <span className={s.headerCrumb}>/</span>
          <span className={s.headerTitle}>Edit Profile</span>
        </div>
        <span className={s.headerNote}>Not auto-saved · submit to apply changes</span>
      </header>

      {/* ── Body ── */}
      <div className={s.body}>

        {/* Left Rail */}
        <aside className={s.rail}>
          <div className={s.railEyebrow}>Edit Profile</div>
          <div className={s.railTitle}>
            <em>{client.name.split(' ')[0]}</em>&apos;s<br />client record
          </div>
          <div className={s.railSub}>
            Review the current profile snapshot below. Submit to save changes.
          </div>

          <div className={s.railNote}>
            To update <strong>name</strong>, <strong>prefix</strong>, or <strong>contact channels</strong>,
            visit the linked Contact record.
          </div>

          <div className={s.railKnown}>
            {railItems.map(item => (
              <div key={item.label} className={s.railItem}>
                <div className={`${s.railCheck} ${item.warn ? s.railCheckWarn : item.done ? s.railCheckDone : s.railCheckMiss}`}>
                  {item.warn ? '!' : item.done ? '✓' : '—'}
                </div>
                <div>
                  <div className={s.railItemLabel}>{item.label}</div>
                  {item.value
                    ? <div className={s.railItemValue}>{item.value}</div>
                    : <div className={s.railItemMissing}>Not set</div>
                  }
                </div>
              </div>
            ))}
          </div>

          <div className={s.railQuote}>
            <span className={s.railQuoteMark}>&ldquo;</span>
            <p className={s.railQuoteText}>
              Accurate data is the foundation of every financial plan you build for your client.
            </p>
            <div className={s.railQuoteAuthor}>ProKey · Client Management</div>
          </div>
        </aside>

        {/* Right Form */}
        <main className={s.form}>

          {/* ── Section 01: Identity Verification ── */}
          <div className={s.formSection}>
            <div className={s.formSectionHead}>
              <span className={s.formSectionNum}>01</span>
              <span className={s.formSectionTitle}>Identity Verification</span>
              <span className={s.formSectionSub}>KYC · SEBI requirement</span>
            </div>

            <div className={s.formGrid2}>
              <div className={s.fieldWrap}>
                <label className={f.label}>PAN Number</label>
                <input
                  className={`${f.input} ${s.panInput}`}
                  value={pan}
                  onChange={e => setPan(e.target.value.toUpperCase())}
                  placeholder="ABCDE1234F"
                  maxLength={10}
                />
              </div>
              <div className={s.fieldWrap}>
                <label className={f.label}>Date of Birth</label>
                <input
                  className={f.input}
                  type="date"
                  value={dob}
                  onChange={e => setDob(e.target.value)}
                />
              </div>
            </div>

            <div className={s.fieldWrap}>
              <label className={f.label}>
                Anniversary Date{' '}
                <span className={s.optional}>(optional)</span>
              </label>
              <input
                className={f.input}
                type="date"
                value={anniversary}
                onChange={e => setAnniversary(e.target.value)}
                style={{ maxWidth: 240 }}
              />
            </div>
          </div>

          {/* ── Section 02: Distributor Reference ── */}
          <div className={s.formSection}>
            <div className={s.formSectionHead}>
              <span className={s.formSectionNum}>02</span>
              <span className={s.formSectionTitle}>Distributor Reference</span>
              <span className={s.formSectionSub}>Your tracking code</span>
            </div>

            <div className={s.fieldWrap}>
              <label className={f.label}>External Reference ID</label>
              <div className={s.extRefWrap}>
                <span className={s.extRefLabel}>{platformLabel.toUpperCase()}</span>
                <input
                  className={s.extRefInput}
                  value={extRef}
                  onChange={e => setExtRef(e.target.value)}
                  placeholder="e.g. KR-2024-0042"
                />
              </div>
              <span className={s.fieldHint}>Appears on reports and client card.</span>
            </div>
          </div>

          {/* ── Section 03: Risk & Onboarding ── */}
          <div className={s.formSection}>
            <div className={s.formSectionHead}>
              <span className={s.formSectionNum}>03</span>
              <span className={s.formSectionTitle}>Risk &amp; Onboarding</span>
              <span className={s.formSectionSub}>Profile classification</span>
            </div>

            <div className={s.formGrid2}>
              <div className={s.fieldWrap}>
                <label className={f.label}>Risk Profile</label>
                <select
                  className={f.select}
                  value={riskProfile}
                  onChange={e => setRiskProfile(e.target.value)}
                >
                  <option value="">— Not set —</option>
                  <option value="conservative">Conservative</option>
                  <option value="moderate">Moderate</option>
                  <option value="aggressive">Aggressive</option>
                </select>
              </div>
              <div className={s.fieldWrap}>
                <label className={f.label}>Onboarding Status</label>
                <select
                  className={f.select}
                  value={onboardingStatus}
                  onChange={e => setOnboardingStatus(e.target.value)}
                >
                  <option value="pending">Pending</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            </div>
          </div>

          {/* ── Section 04: Survival Status ── */}
          <div className={s.formSection}>
            <div className={s.formSectionHead}>
              <span className={s.formSectionNum}>04</span>
              <span className={s.formSectionTitle}>Survival Status</span>
              <span className={s.formSectionSub}>Handle with care</span>
            </div>

            <div className={s.toggleCards}>
              <button
                type="button"
                className={`${s.toggleCard} ${survivalStatus === 'alive' ? s.toggleCardSelected : ''}`}
                onClick={() => setSurvivalStatus('alive')}
              >
                <div className={s.toggleIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z" />
                  </svg>
                </div>
                <div>
                  <div className={s.toggleLabel}>Alive</div>
                  <div className={s.toggleSub}>Client is active</div>
                </div>
              </button>

              <button
                type="button"
                className={`${s.toggleCard} ${survivalStatus === 'deceased' ? s.toggleCardDanger : ''}`}
                onClick={() => setSurvivalStatus('deceased')}
              >
                <div className={s.toggleIcon}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <circle cx="12" cy="12" r="10" />
                    <line x1="8" y1="12" x2="16" y2="12" />
                  </svg>
                </div>
                <div>
                  <div className={s.toggleLabel}>Deceased</div>
                  <div className={s.toggleSub}>Record date of death</div>
                </div>
              </button>
            </div>

            {survivalStatus === 'deceased' && (
              <div className={s.deceasedFields}>
                <div className={s.fieldWrap}>
                  <label className={f.label}>Date of Death *</label>
                  <input
                    className={f.input}
                    type="date"
                    value={dateOfDeath}
                    onChange={e => setDateOfDeath(e.target.value)}
                    style={{ maxWidth: 240 }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* ── Section 05: Referral ── */}
          <div className={s.formSection}>
            <div className={s.formSectionHead}>
              <span className={s.formSectionNum}>05</span>
              <span className={s.formSectionTitle}>Referral</span>
              <span className={s.formSectionSub}>Optional</span>
            </div>
            <div className={s.fieldWrap}>
              <label className={f.label}>Referred By</label>
              <input
                className={f.input}
                value={referredBy}
                onChange={e => setReferredBy(e.target.value)}
                placeholder="Name of person who referred this client"
                style={{ maxWidth: 380 }}
              />
            </div>
          </div>

        </main>
      </div>

      {/* ── Footer ── */}
      <footer className={s.footer}>
        <div className={s.footerLeft}>
          Name and contact channels are managed via the linked Contact record.
        </div>
        <div className={s.footerRight}>
          <VdfButton variant="ghost" onClick={() => router.push(`/clients/${clientId}`)}>
            ← Cancel
          </VdfButton>
          <VdfButton variant="primary" loading={isPending} onClick={handleSave}>
            Save Changes
          </VdfButton>
        </div>
      </footer>

    </div>
  );
}
