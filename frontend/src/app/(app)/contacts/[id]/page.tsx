'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfButton, VdfStatusBadge, VdfReadinessRing, VdfTabs,
} from '@/components/vdf';
import s from './contact-profile.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Channel {
  id: number;
  channel_type: string;
  channel_value: string;
  channel_subtype: string;
  is_primary: boolean;
}

interface SnapshotSummary {
  has_snapshot: boolean;
  risk_profile: string | null;
  goals_lite_count: number;
  net_worth_estimate: number | null;
  investment_horizon_years: number | null;
}

interface Snapshot {
  id: number;
  contact_id: number;
  risk_profile: string | null;
  net_worth_estimate: number | null;
  annual_income_estimate: number | null;
  investment_horizon_years: number | null;
  existing_mf_breakdown: Record<string, number> | null;
  goals_lite: Array<{ name: string; target_amount: number; timeline_years: number }> | null;
  notes: string | null;
  updated_at: string;
}

interface Contact {
  id: number;
  prefix: string;
  name: string;
  normalized_name: string;
  is_client: boolean;
  is_active: boolean;
  channels: Channel[];
  snapshot_summary: SnapshotSummary | null;
  created_at: string;
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

function readinessPct(c: Contact): number {
  if (c.is_client) return 100;
  const hasMobile = c.channels.some(ch => ch.channel_type === 'mobile');
  const hasEmail  = c.channels.some(ch => ch.channel_type === 'email');
  const hasSnap   = !!c.snapshot_summary?.has_snapshot;
  let pct = 20;
  if (hasMobile) pct += 25;
  if (hasEmail)  pct += 25;
  if (hasSnap)   pct += 30;
  return pct;
}

const RISK_COLORS: Record<string, string> = {
  conservative: 'var(--color-info)',
  moderate:     'var(--color-warning)',
  aggressive:   'var(--color-danger)',
};

const CHANNEL_ICONS: Record<string, string> = {
  mobile:    'M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07A19.5 19.5 0 013.07 10.8 19.79 19.79 0 01.12 2.2 2 2 0 012.11 0h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L6.91 7.09a16 16 0 006 6l.56-.56a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 14.92z',
  email:     'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z',
  whatsapp:  'M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z',
  linkedin:  'M16 8a6 6 0 016 6v7h-4v-7a2 2 0 00-2-2 2 2 0 00-2 2v7h-4v-7a6 6 0 016-6zM2 9h4v12H2z',
  instagram: 'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 01-2.063-2.065 2.064 2.064 0 112.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
  twitter:   'M23 3a10.9 10.9 0 01-3.14 1.53 4.48 4.48 0 00-7.86 3v1A10.66 10.66 0 013 4s-4 9 5 13a11.64 11.64 0 01-7 2c9 5 20 0 20-11.5a4.5 4.5 0 00-.08-.83A7.72 7.72 0 0023 3z',
  other:     'M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6-1.41-1.41z',
};

/* ── Snapshot Editor ─────────────────────────────────── */

function SnapshotTab({ contactId }: { contactId: number }) {
  const { showToast } = useToast();
  const { data, isLoading } = useSkillQuery<{ snapshot: Snapshot | null }>(
    'contact-skill', 'get_snapshot', { contact_id: contactId }
  );
  const snap = data?.data?.snapshot;

  const [riskProfile, setRiskProfile] = useState<string>(snap?.risk_profile ?? '');
  const [netWorth, setNetWorth]        = useState(snap?.net_worth_estimate?.toString() ?? '');
  const [annualIncome, setAnnualIncome] = useState(snap?.annual_income_estimate?.toString() ?? '');
  const [horizon, setHorizon]          = useState(snap?.investment_horizon_years?.toString() ?? '');
  const [notes, setNotes]              = useState(snap?.notes ?? '');
  const [goals, setGoals]              = useState<Array<{ name: string; target_amount: string; timeline_years: string }>>(
    snap?.goals_lite?.map(g => ({ name: g.name, target_amount: String(g.target_amount), timeline_years: String(g.timeline_years) })) ?? []
  );

  const { mutate: save, isPending } = useSkillMutation(
    'contact-skill', 'update_snapshot',
    {
      onSuccess: () => showToast({ message: 'Snapshot saved', type: 'success' }),
      onError: (e) => showToast({ message: e.message || 'Save failed', type: 'error' }),
    }
  );

  if (isLoading) return <VdfLoader message="Loading snapshot…" />;

  const handleSave = () => save({
    contact_id: contactId,
    risk_profile:             riskProfile || undefined,
    net_worth_estimate:       netWorth ? Number(netWorth) : undefined,
    annual_income_estimate:   annualIncome ? Number(annualIncome) : undefined,
    investment_horizon_years: horizon ? Number(horizon) : undefined,
    notes:                    notes || undefined,
    goals_lite: goals.filter(g => g.name && g.target_amount).map(g => ({
      name: g.name,
      target_amount: Number(g.target_amount),
      timeline_years: Number(g.timeline_years) || 10,
    })),
  });

  return (
    <div className={s.snapshotGrid}>
      {/* Risk Profile */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>Risk Profile</h3>
        <div className={s.riskCards}>
          {(['conservative', 'moderate', 'aggressive'] as const).map(r => (
            <button
              key={r}
              className={`${s.riskCard} ${riskProfile === r ? s.riskSelected : ''}`}
              style={riskProfile === r ? { borderColor: RISK_COLORS[r] } : {}}
              onClick={() => setRiskProfile(r)}
            >
              <div className={s.riskDot} style={{ background: RISK_COLORS[r] }} />
              <span className={s.riskName}>{r.charAt(0).toUpperCase() + r.slice(1)}</span>
            </button>
          ))}
        </div>
      </section>

      {/* Financial Overview */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>Financial Overview</h3>
        <div className={s.fieldGrid}>
          <div className={s.field}>
            <label className={s.fieldLabel}>Net Worth Estimate (₹)</label>
            <input className={s.fieldInput} type="number" value={netWorth} onChange={e => setNetWorth(e.target.value)} placeholder="e.g. 5000000" />
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel}>Annual Income (₹)</label>
            <input className={s.fieldInput} type="number" value={annualIncome} onChange={e => setAnnualIncome(e.target.value)} placeholder="e.g. 1200000" />
          </div>
          <div className={s.field}>
            <label className={s.fieldLabel}>Investment Horizon (Years)</label>
            <input className={s.fieldInput} type="number" value={horizon} onChange={e => setHorizon(e.target.value)} placeholder="e.g. 15" min={1} max={40} />
          </div>
        </div>
      </section>

      {/* Aspirational Goals */}
      <section className={s.section}>
        <div className={s.sectionHead}>
          <h3 className={s.sectionTitle}>Aspirational Goals</h3>
          <VdfButton variant="ghost" size="sm" onClick={() => setGoals(g => [...g, { name: '', target_amount: '', timeline_years: '' }])}>
            + Add Goal
          </VdfButton>
        </div>
        {goals.map((g, i) => (
          <div key={i} className={s.goalRow}>
            <input className={s.fieldInput} placeholder="Goal name (e.g. Retirement)" value={g.name} onChange={e => setGoals(gs => gs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))} />
            <input className={s.fieldInput} type="number" placeholder="Target ₹" value={g.target_amount} onChange={e => setGoals(gs => gs.map((x, j) => j === i ? { ...x, target_amount: e.target.value } : x))} />
            <input className={s.fieldInput} type="number" placeholder="Years" value={g.timeline_years} onChange={e => setGoals(gs => gs.map((x, j) => j === i ? { ...x, timeline_years: e.target.value } : x))} min={1} max={40} />
            <button className={s.deleteGoal} onClick={() => setGoals(gs => gs.filter((_, j) => j !== i))}>×</button>
          </div>
        ))}
        {goals.length === 0 && <p className={s.emptyGoals}>No goals added yet. Click + Add Goal to begin.</p>}
      </section>

      {/* Notes */}
      <section className={s.section}>
        <h3 className={s.sectionTitle}>Notes</h3>
        <textarea className={s.textarea} rows={4} value={notes} onChange={e => setNotes(e.target.value)} placeholder="MFD observations about this prospect…" />
      </section>

      <div className={s.saveRow}>
        <VdfButton variant="primary" loading={isPending} onClick={handleSave}>Save Snapshot</VdfButton>
      </div>
    </div>
  );
}

/* ── Main Page ───────────────────────────────────────── */

export default function ContactProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const { showToast } = useToast();
  const contactId = Number(id);

  // All hooks must be at the top — before any early returns
  const [activeTab, setActiveTab] = useState('overview');

  const { data, isLoading, isError } = useSkillQuery<{ contact: Contact | null }>(
    'contact-skill', 'get_contact', { contact_id: contactId }
  );

  const { mutate: convertToClient, isPending: converting } = useSkillMutation(
    'contact-skill', 'convert_to_client',
    {
      onSuccess: (res) => {
        const clientId = (res.data as { client: { id: number } }).client.id;
        showToast({ message: 'Contact converted to client!', type: 'success' });
        router.push(`/clients/${clientId}`);
      },
      onError: (e) => showToast({ message: e.message || 'Conversion failed', type: 'error' }),
    }
  );

  if (isLoading) return <VdfLoader overlay message="Loading contact…" />;

  const skillError = !data?.success ? data?.error : null;
  if (isError || skillError || !data?.data?.contact) return (
    <div className={s.page}>
      <div className={s.errorBanner}>
        {skillError
          ? `Skill error: ${skillError}`
          : isError
            ? `Request failed: ${error?.message ?? 'Unknown error'}`
            : 'Contact not found.'}
      </div>
    </div>
  );

  const contact = data.data.contact;
  const pct     = readinessPct(contact);

  const TAB_DEFS = [
    {
      id: 'overview',
      label: 'Overview',
      content: (
        <div className={s.overviewGrid}>
          {/* Left — details */}
          <div className={s.detailCard}>
            <h3 className={s.cardTitle}>Personal Details</h3>
            <div className={s.detailRows}>
              <div className={s.detailRow}><span className={s.detailLabel}>Full Name</span><span className={s.detailValue}>{contact.prefix} {contact.name}</span></div>
              <div className={s.detailRow}><span className={s.detailLabel}>Status</span><VdfStatusBadge label={contact.is_client ? 'Client' : 'Prospect'} variant={contact.is_client ? 'success' : 'warning'} size="sm" /></div>
              <div className={s.detailRow}><span className={s.detailLabel}>Added</span><span className={s.detailValue}>{new Date(contact.created_at).toLocaleDateString('en-IN')}</span></div>
              {contact.snapshot_summary?.risk_profile && (
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Risk Profile</span>
                  <span className={s.detailValue} style={{ color: RISK_COLORS[contact.snapshot_summary.risk_profile] }}>
                    {contact.snapshot_summary.risk_profile.charAt(0).toUpperCase() + contact.snapshot_summary.risk_profile.slice(1)}
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Right — readiness */}
          <div className={s.readinessCard}>
            <VdfReadinessRing pct={pct} size={64} strokeWidth={4} />
            <div>
              <div className={s.readinessTitle}>
                {pct === 100 ? 'Converted to client' : pct >= 70 ? 'Ready to convert' : pct >= 35 ? 'Profile in progress' : 'Just added'}
              </div>
              <div className={s.readinessSub}>
                {!contact.is_client && (
                  <VdfButton
                    variant="primary"
                    size="sm"
                    loading={converting}
                    disabled={pct < 35}
                    onClick={() => convertToClient({ contact_id: contactId })}
                  >
                    Convert to Client →
                  </VdfButton>
                )}
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'channels',
      label: 'Channels',
      content: (
        <div className={s.channelsList}>
          {contact.channels.length === 0 ? (
            <p className={s.emptyGoals}>No channels added yet.</p>
          ) : (
            contact.channels.map(ch => (
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
                  <span className={s.subtype}>{ch.channel_subtype}</span>
                </div>
              </div>
            ))
          )}
        </div>
      ),
    },
    {
      id: 'snapshot',
      label: 'Financial Snapshot',
      content: <SnapshotTab contactId={contactId} />,
    },
  ];

  const tabs = TAB_DEFS.map(({ id, label }) => ({ id, label }));
  const activeContent = TAB_DEFS.find(t => t.id === activeTab)?.content;

  return (
    <div className={s.page}>
      {/* ── Hero ── */}
      <div className={s.hero}>
        <button className={s.backBtn} onClick={() => router.push('/contacts')}>
          ← Back
        </button>
        <div className={s.heroContent}>
          <div className={s.heroAvatar} style={{ background: avatarGradient(contact.name) }}>
            {initials(contact.name)}
          </div>
          <div className={s.heroText}>
            <h1 className={s.heroName}>{contact.prefix} {contact.name}</h1>
            <div className={s.heroBadges}>
              <VdfStatusBadge label={contact.is_client ? 'Client' : 'Prospect'} variant={contact.is_client ? 'success' : 'warning'} />
              {contact.snapshot_summary?.goals_lite_count > 0 && (
                <span className={s.goalCount}>{contact.snapshot_summary.goals_lite_count} goal{contact.snapshot_summary.goals_lite_count > 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <VdfTabs tabs={tabs} activeId={activeTab} onChange={setActiveTab} variant="underline" />
      <div className={s.tabPanel}>{activeContent}</div>
    </div>
  );
}
