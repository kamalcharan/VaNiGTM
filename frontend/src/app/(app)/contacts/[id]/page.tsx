'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfStatusBadge, VdfReadinessRing, VdfTabs, VdfChannelItem,
} from '@/components/vdf';
import s from './contact-profile.module.css';
import { SnapshotTab } from './snapshot-tab';

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

interface Contact {
  id: number;
  contact_no: string | null;
  prefix: string;
  name: string;
  normalized_name: string;
  is_client: boolean;
  is_active: boolean;
  age: number | null;
  city: string | null;
  marital_status: string | null;
  dependents_count: number | null;
  channels: Channel[];
  snapshot_summary: SnapshotSummary | null;
  created_at: string;
  client_id: number | null;
  client_no: string | null;
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


function formatAmount(v: number): string {
  if (v >= 1_00_00_000) return `₹ ${(v / 1_00_00_000).toFixed(1)} Cr`;
  if (v >= 1_00_000)    return `₹ ${(v / 1_00_000).toFixed(1)} L`;
  return `₹ ${v.toLocaleString('en-IN')}`;
}

/* ── Main Page ───────────────────────────────────────── */

export default function ContactProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router  = useRouter();
  const contactId = Number(id);

  // All hooks must be at the top — before any early returns
  const [activeTab, setActiveTab]     = useState('overview');
  const [intakeUrl,  setIntakeUrl]    = useState<string | null>(null);
  const [copied,     setCopied]       = useState(false);
  const { showToast } = useToast();

  const { data, isLoading, isError } = useSkillQuery<{ contact: Contact | null }>(
    'contact-skill', 'get_contact', { contact_id: contactId }
  );

  const { mutate: genToken, isPending: isGenning } = useSkillMutation<{ intake_url: string }>(
    'contact-skill', 'generate_intake_token',
    {
      onSuccess: (res) => {
        const url = res.data?.intake_url;
        if (url) setIntakeUrl(url);
        else showToast({ message: 'Could not generate link', type: 'error' });
      },
      onError: (e) => showToast({ message: e.message || 'Failed to generate link', type: 'error' }),
    }
  );

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  if (isLoading) return <VdfLoader overlay message="Loading contact…" />;

  const skillError = !data?.success ? data?.error : null;
  if (isError || skillError || !data?.data?.contact) return (
    <div className={s.page}>
      <div className={s.errorBanner}>
        {skillError
          ? `Skill error: ${skillError}`
          : isError
            ? 'Request failed — please try again'
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
      content: (() => {
        const primaryMobile  = contact.channels.find(ch => ch.channel_type === 'mobile' && ch.is_primary) ?? contact.channels.find(ch => ch.channel_type === 'mobile');
        const primaryEmail   = contact.channels.find(ch => ch.channel_type === 'email'  && ch.is_primary) ?? contact.channels.find(ch => ch.channel_type === 'email');
        const whatsapp       = contact.channels.find(ch => ch.channel_type === 'whatsapp');
        const otherChannels  = contact.channels.filter(ch => !['mobile','email','whatsapp'].includes(ch.channel_type));
        return (
          <div className={s.overviewGrid}>
            {/* Left — personal details + key channels */}
            <div className={s.detailCard}>
              <h3 className={s.cardTitle}>Personal Details</h3>
              <div className={s.detailRows}>
                {contact.contact_no && (
                  <div className={s.detailRow}>
                    <span className={s.detailLabel}>Contact No.</span>
                    <span className={`${s.detailValue} ${s.detailMono}`}>{contact.contact_no}</span>
                  </div>
                )}
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Full Name</span>
                  <span className={s.detailValue}>{contact.prefix} {contact.name}</span>
                </div>
                {primaryMobile && (
                  <div className={s.detailRow}>
                    <span className={s.detailLabel}>Primary Mobile</span>
                    <span className={`${s.detailValue} ${s.detailMono}`}>{primaryMobile.channel_value}</span>
                  </div>
                )}
                {primaryEmail && (
                  <div className={s.detailRow}>
                    <span className={s.detailLabel}>Email</span>
                    <span className={s.detailValue}>{primaryEmail.channel_value}</span>
                  </div>
                )}
                {whatsapp && (
                  <div className={s.detailRow}>
                    <span className={s.detailLabel}>WhatsApp</span>
                    <span className={`${s.detailValue} ${s.detailMono}`}>{whatsapp.channel_value}</span>
                  </div>
                )}
                {otherChannels.map(ch => (
                  <div key={ch.id} className={s.detailRow}>
                    <span className={s.detailLabel}>{ch.channel_type.charAt(0).toUpperCase() + ch.channel_type.slice(1)}</span>
                    <span className={s.detailValue}>{ch.channel_value}</span>
                  </div>
                ))}
                {contact.age != null && (
                  <div className={s.detailRow}>
                    <span className={s.detailLabel}>Age</span>
                    <span className={s.detailValue}>{contact.age} yrs</span>
                  </div>
                )}
                {contact.city && (
                  <div className={s.detailRow}>
                    <span className={s.detailLabel}>City</span>
                    <span className={s.detailValue}>{contact.city}</span>
                  </div>
                )}
                {contact.marital_status && (
                  <div className={s.detailRow}>
                    <span className={s.detailLabel}>Life Situation</span>
                    <span className={s.detailValue}>{contact.marital_status.charAt(0).toUpperCase() + contact.marital_status.slice(1)}</span>
                  </div>
                )}
                {contact.dependents_count != null && (
                  <div className={s.detailRow}>
                    <span className={s.detailLabel}>Dependents</span>
                    <span className={s.detailValue}>{contact.dependents_count === 4 ? '4+' : contact.dependents_count}</span>
                  </div>
                )}
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Added</span>
                  <span className={s.detailValue}>{new Date(contact.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                </div>
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

            {/* Middle — channels card */}
            <div className={s.channelsCard}>
              <h3 className={s.cardTitle}>Channels</h3>
              {contact.channels.length === 0 ? (
                <p className={s.emptyChannels}>No channels added yet.</p>
              ) : (
                <div className={s.channelsCardList}>
                  {contact.channels.map(ch => (
                    <VdfChannelItem
                      key={ch.id}
                      channelType={ch.channel_type}
                      channelValue={ch.channel_value}
                      isPrimary={ch.is_primary}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right — snapshot summary card */}
            {(() => {
              const snap = contact.snapshot_summary;
              return (
                <div className={s.snapshotCard}>
                  <div className={s.snapshotCardHead}>
                    <h3 className={s.cardTitle}>Snapshot</h3>
                    <button
                      className={s.snapshotCardLink}
                      onClick={() => setActiveTab('snapshot')}
                    >
                      {snap?.has_snapshot ? 'Edit →' : 'Build →'}
                    </button>
                  </div>
                  {!snap?.has_snapshot ? (
                    <div className={s.snapshotEmpty}>
                      <div className={s.snapshotEmptyIcon}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="24" height="24">
                          <path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                        </svg>
                      </div>
                      <p className={s.snapshotEmptyText}>No financial snapshot yet.</p>
                      <p className={s.snapshotEmptyHint}>Add risk profile, net worth, and goals to unlock conversion.</p>
                    </div>
                  ) : (
                    <div className={s.snapshotStats}>
                      {snap.risk_profile && (
                        <div className={s.snapshotStat}>
                          <span className={s.snapshotStatLabel}>Risk Profile</span>
                          <span
                            className={s.snapshotStatValue}
                            style={{ color: RISK_COLORS[snap.risk_profile] ?? 'var(--color-fg)' }}
                          >
                            {snap.risk_profile.charAt(0).toUpperCase() + snap.risk_profile.slice(1)}
                          </span>
                        </div>
                      )}
                      {snap.net_worth_estimate != null && snap.net_worth_estimate > 0 && (
                        <div className={s.snapshotStat}>
                          <span className={s.snapshotStatLabel}>Net Worth (est.)</span>
                          <span className={s.snapshotStatValue}>{formatAmount(snap.net_worth_estimate)}</span>
                        </div>
                      )}
                      {snap.investment_horizon_years != null && (
                        <div className={s.snapshotStat}>
                          <span className={s.snapshotStatLabel}>Horizon</span>
                          <span className={s.snapshotStatValue}>{snap.investment_horizon_years} yr{snap.investment_horizon_years !== 1 ? 's' : ''}</span>
                        </div>
                      )}
                      <div className={s.snapshotStat}>
                        <span className={s.snapshotStatLabel}>Goals</span>
                        <span className={s.snapshotStatValue}>
                          {snap.goals_lite_count > 0
                            ? `${snap.goals_lite_count} defined`
                            : <span style={{ color: 'var(--color-muted)', fontStyle: 'italic', fontWeight: 400 }}>None yet</span>}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        );
      })(),
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
              <VdfChannelItem
                key={ch.id}
                channelType={ch.channel_type}
                channelValue={ch.channel_value}
                isPrimary={ch.is_primary}
                subtype={ch.channel_subtype}
              />
            ))
          )}
        </div>
      ),
    },
    {
      id: 'snapshot',
      label: 'Financial Snapshot',
      content: <SnapshotTab contactId={contactId} isClient={contact.is_client} contactName={contact.name} />,
    },
  ];

  const tabs = TAB_DEFS.map(({ id, label }) => ({ id, label }));
  const activeContent = TAB_DEFS.find(t => t.id === activeTab)?.content;

  return (
    <div className={s.page}>
      {/* ── Hero ── */}
      <div className={s.hero}>
        <div className={s.heroCrumb}>
          <button className={s.backBtn} onClick={() => router.push('/contacts')}>Contacts</button>
          <span className={s.heroCrumbSep}>/</span>
          <span className={s.heroCrumbCurrent}>{contact.name}</span>
        </div>
        <div className={s.heroContent}>
          {/* Left: avatar + identity */}
          <div className={s.heroLeft}>
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
              <div className={s.heroMeta}>
                Added {new Date(contact.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {contact.channels.length > 0 && (
                  <> · {contact.channels.length} channel{contact.channels.length !== 1 ? 's' : ''}</>
                )}
              </div>
            </div>
          </div>

          {/* Right: readiness ring card (for prospects) or client quick-links (for clients) */}
          {contact.is_client && contact.client_id ? (
            <div className={s.heroRingCard}>
              <div className={s.heroRingCardTop}>
                <VdfReadinessRing pct={100} size={44} strokeWidth={3} />
                <div>
                  <div className={s.heroRingTitle}>Active Client</div>
                  <button className={s.heroRingCta} onClick={() => router.push(`/clients/${contact.client_id}`)}>
                    View client profile →
                  </button>
                </div>
              </div>
              <div className={s.heroRingLinks}>
                <button className={s.heroRingLink} onClick={() => router.push(`/clients/${contact.client_id}?tab=addresses`)}>Addresses</button>
                <span className={s.heroRingDot}>·</span>
                <button className={s.heroRingLink} onClick={() => router.push(`/clients/${contact.client_id}`)}>KYC / PAN</button>
              </div>
            </div>
          ) : (
            <div className={s.heroRingCard}>
              <div className={s.heroRingCardTop}>
                <VdfReadinessRing pct={pct} size={44} strokeWidth={3} />
                <div>
                  <div className={s.heroRingTitle}>
                    {pct >= 70 ? 'Ready to convert' : pct >= 35 ? 'Profile in progress' : 'Just added'}
                  </div>
                  {pct < 70 && (
                    <div className={s.heroRingHint}>
                      {!contact.channels.some(c => c.channel_type === 'mobile') ? 'Add a mobile number' :
                       !contact.snapshot_summary?.has_snapshot ? 'Fill financial snapshot' :
                       'Complete snapshot to convert'}
                    </div>
                  )}
                </div>
              </div>
              <div className={s.heroRingActions}>
                <button
                  className={s.heroRingCtaBtn}
                  disabled={pct < 35}
                  onClick={() => router.push(`/contacts/${contactId}/convert`)}
                >
                  Convert to Client →
                </button>
                <button
                  className={s.heroIntakeBtn}
                  disabled={isGenning}
                  onClick={() => genToken({ contact_id: contactId })}
                >
                  {isGenning ? '…' : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M10 13a5 5 0 007.54.54l3-3a5 5 0 00-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 00-7.54-.54l-3 3a5 5 0 007.07 7.07l1.71-1.71"/>
                      </svg>
                      Send Intake Link
                    </>
                  )}
                </button>
              </div>
              {intakeUrl && (
                <div className={s.intakeLinkBox}>
                  <span className={s.intakeLinkUrl}>{intakeUrl}</span>
                  <button
                    className={s.intakeCopyBtn}
                    onClick={() => handleCopy(intakeUrl)}
                  >
                    {copied ? '✓ Copied' : 'Copy'}
                  </button>
                  <button className={s.intakeDismiss} onClick={() => setIntakeUrl(null)}>×</button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ── Tabs ── */}
      <VdfTabs tabs={tabs} activeId={activeTab} onChange={setActiveTab} variant="underline" />
      <div className={s.tabPanel}>{activeContent}</div>
    </div>
  );
}
