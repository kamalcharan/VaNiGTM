'use client';

import { useParams, useRouter } from 'next/navigation';
import { useSkillQuery } from '@/hooks/useSkill';
import {
  VdfLoader, VdfStatusBadge, VdfReadinessRing, VdfChannelItem,
} from '@/components/vdf';
import s from './contact-profile.module.css';

/* ── Types ───────────────────────────────────────────── */

interface Channel {
  id: number;
  channel_type: string;
  channel_value: string;
  channel_subtype: string;
  is_primary: boolean;
  source?: string;
}

interface Contact {
  id: number;
  contact_no: string | null;
  prefix: string | null;
  name: string;
  normalized_name: string;
  is_active: boolean;
  job_title: string | null;
  company_name: string | null;
  company_domain: string | null;
  linkedin_url: string | null;
  location: string | null;
  source: string;
  score: number;
  channels: Channel[];
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

/** Profile completeness: identity + reachability + firmographics. */
function readinessPct(c: Contact): number {
  const hasEmail    = c.channels.some(ch => ch.channel_type === 'email');
  const hasAnyReach = c.channels.length > 0;
  const hasCompany  = !!c.company_name;
  const hasTitle    = !!c.job_title;
  let pct = 20;
  if (hasAnyReach) pct += 20;
  if (hasEmail)    pct += 25;
  if (hasCompany)  pct += 20;
  if (hasTitle)    pct += 15;
  return pct;
}

function sourceLabel(source: string): string {
  if (source.startsWith('byo:'))      return `Connector · ${source.slice(4)}`;
  if (source.startsWith('platform:')) return `Platform · ${source.slice(9)}`;
  return source.charAt(0).toUpperCase() + source.slice(1);
}

/* ── Main Page ───────────────────────────────────────── */

export default function ContactProfilePage() {
  const { id } = useParams() as { id: string };
  const router  = useRouter();
  const contactId = Number(id);

  const { data, isLoading, isError } = useSkillQuery<{ contact: Contact | null }>(
    'contact-skill', 'get_contact', { contact_id: contactId }
  );

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

  const primaryMobile = contact.channels.find(ch => ch.channel_type === 'mobile' && ch.is_primary) ?? contact.channels.find(ch => ch.channel_type === 'mobile');
  const primaryEmail  = contact.channels.find(ch => ch.channel_type === 'email'  && ch.is_primary) ?? contact.channels.find(ch => ch.channel_type === 'email');
  const whatsapp      = contact.channels.find(ch => ch.channel_type === 'whatsapp');
  const otherChannels = contact.channels.filter(ch => !['mobile', 'email', 'whatsapp'].includes(ch.channel_type));

  return (
    <div className={s.page}>
      {/* ── Hero ── */}
      <div className={s.hero}>
        <div className={s.heroCrumb}>
          <button className={s.backBtn} onClick={() => router.push('/gtm/people')}>Contacts</button>
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
              <h1 className={s.heroName}>{contact.prefix ? `${contact.prefix} ` : ''}{contact.name}</h1>
              <div className={s.heroBadges}>
                {(contact.job_title || contact.company_name) && (
                  <span className={s.heroMeta}>
                    {[contact.job_title, contact.company_name].filter(Boolean).join(' · ')}
                  </span>
                )}
                <VdfStatusBadge
                  label={`Score ${contact.score}`}
                  variant={contact.score >= 60 ? 'success' : contact.score > 0 ? 'warning' : 'muted'}
                />
                <VdfStatusBadge label={sourceLabel(contact.source)} variant="info" />
              </div>
              <div className={s.heroMeta}>
                Added {new Date(contact.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                {contact.channels.length > 0 && (
                  <> · {contact.channels.length} channel{contact.channels.length !== 1 ? 's' : ''}</>
                )}
              </div>
            </div>
          </div>

          {/* Right: profile completeness */}
          <div className={s.heroRingCard}>
            <div className={s.heroRingCardTop}>
              <VdfReadinessRing pct={pct} size={44} strokeWidth={3} />
              <div>
                <div className={s.heroRingTitle}>
                  {pct >= 80 ? 'Outreach-ready' : pct >= 45 ? 'Profile in progress' : 'Just added'}
                </div>
                {pct < 80 && (
                  <div className={s.heroRingHint}>
                    {!primaryEmail ? 'Add an email address' :
                     !contact.company_name ? 'Add company details' :
                     'Add a job title'}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Body ── */}
      <div className={s.tabPanel}>
        <div className={s.overviewGrid}>
          {/* Left — contact details */}
          <div className={s.detailCard}>
            <h3 className={s.cardTitle}>Details</h3>
            <div className={s.detailRows}>
              {contact.contact_no && (
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Contact No.</span>
                  <span className={`${s.detailValue} ${s.detailMono}`}>{contact.contact_no}</span>
                </div>
              )}
              <div className={s.detailRow}>
                <span className={s.detailLabel}>Full Name</span>
                <span className={s.detailValue}>{contact.prefix ? `${contact.prefix} ` : ''}{contact.name}</span>
              </div>
              {contact.job_title && (
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Job Title</span>
                  <span className={s.detailValue}>{contact.job_title}</span>
                </div>
              )}
              {contact.company_name && (
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Company</span>
                  <span className={s.detailValue}>{contact.company_name}</span>
                </div>
              )}
              {contact.company_domain && (
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Domain</span>
                  <span className={`${s.detailValue} ${s.detailMono}`}>{contact.company_domain}</span>
                </div>
              )}
              {contact.linkedin_url && (
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>LinkedIn</span>
                  <a className={s.detailValue} href={contact.linkedin_url} target="_blank" rel="noreferrer">
                    {contact.linkedin_url.replace(/^https?:\/\/(www\.)?/, '')}
                  </a>
                </div>
              )}
              {contact.location && (
                <div className={s.detailRow}>
                  <span className={s.detailLabel}>Location</span>
                  <span className={s.detailValue}>{contact.location}</span>
                </div>
              )}
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
              <div className={s.detailRow}>
                <span className={s.detailLabel}>Added</span>
                <span className={s.detailValue}>{new Date(contact.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
            </div>
          </div>

          {/* Right — channels card */}
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
        </div>
      </div>
    </div>
  );
}
