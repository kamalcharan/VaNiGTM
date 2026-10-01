'use client';
/**
 * /agents/gtm/channels/* — the four pieces that were built with no console:
 * gt_channels, the cadence governor, the story library, the touch log.
 * Read-only on purpose; nothing here sends. One nav entry, four tabs.
 */
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useSkillQuery } from '@/lib/useSkill';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { formatDateTime } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import a from '@/skills/gtm-audience/audience.module.css';
import st from '@/skills/settings/screens/settings.module.css';
import type { Channel, Policy, Story } from '@/skills/gtm-motion/mock';
import { CHANNEL_TABS, type ChannelTab } from '../tabs';

function Identity() {
  const q = useSkillQuery<{ channels: Channel[]; identity: 'tenant' | 'first_party' }>('channel-skill', 'get_channels');
  return (
    <DataBoundary query={q} label="channels" skeleton={<SkeletonRows rows={4} />}>
      {(d) => (
        <>
          <p className={u.lede}>{d.identity === 'first_party' ? 'A Vikuna product: messages go out under the platform\'s identity.' : 'Messages go out under your own identity — your domain, your number, your accounts. The platform composes, times and records; it never speaks as you from an address you do not own.'} Email, SMS and WhatsApp automate on connected channels; LinkedIn and X are assisted — GTM drafts, you send, and the touch still counts.</p>
          <div className={a.list}>
            {d.channels.map((c) => (
              <div key={c.id} className={`${a.row} ${a.rowNoTick}`}>
                <div><div className={a.name}>{c.name}</div><div className={a.why}>{c.note}{c.status === 'not_connected' && <> · <Link href="/settings/channels">Settings → Channels</Link></>}</div></div>
                <span className={`${u.tag} ${c.status === 'platform' ? u.tagOk : c.status === 'assisted' ? u.tagDim : u.tagWarn}`}>{c.status === 'platform' ? 'automated' : c.status === 'assisted' ? 'assisted' : 'not connected'}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </DataBoundary>
  );
}

function Cadence() {
  const pol = useSkillQuery<{ built_in: Policy; using_built_in: boolean }>('cadence-skill', 'get_policy');
  const res = useSkillQuery<{ reservations: { contact_ref: string; name: string; company: string; scheduled_at: string; channel: string; status: string }[] }>('cadence-skill', 'reservations');
  return (
    <>
      <p className={u.lede}>The governor: nobody is touched more than the cap in any rolling window, never in quiet hours, across every channel and every agent. A planned touch reserves a slot; the reservation is what the next plan collides with. Migration 223 — on a screen for the first time.</p>
      <DataBoundary query={pol} label="policy" skeleton={<SkeletonRows rows={2} />}>
        {(d) => (
          <div className={u.counters}>
            <div className={u.counter}><div className={u.cVal}>{d.built_in.max_touches}</div><div className={u.cLbl}>touches per person</div></div>
            <div className={u.counter}><div className={u.cVal}>{d.built_in.window_days}d</div><div className={u.cLbl}>rolling window</div></div>
            <div className={u.counter}><div className={u.cVal} style={{ fontSize: 17 }}>{d.built_in.quiet_hours}</div><div className={u.cLbl}>quiet hours · {d.built_in.timezone}</div></div>
            <div className={u.counter}><div className={u.cVal} style={{ fontSize: 17 }}>{d.built_in.quiet_days.join(', ')}</div><div className={u.cLbl}>quiet days · {d.using_built_in ? 'built-in policy' : 'yours'}</div></div>
          </div>
        )}
      </DataBoundary>
      <div className={a.subh}>Held reservations</div>
      <DataBoundary query={res} label="reservations" skeleton={<SkeletonRows rows={2} />} isEmpty={(d) => !d?.reservations?.length} empty="No slots held. Reservations appear when a plan reaches the Cadence step in Put them in motion.">
        {(d) => (
          <div className={a.list}>{d.reservations.map((r, i) => (
            <div key={i} className={`${a.row} ${a.rowNoTick}`}><div><div className={a.name}>{r.name}<small>{r.contact_ref} · {r.company}</small></div><div className={a.why}>{r.channel} · {formatDateTime(r.scheduled_at)}</div></div><span className={`${u.tag} ${u.tagWarn}`}>{r.status}</span></div>
          ))}</div>
        )}
      </DataBoundary>
    </>
  );
}

function Stories() {
  const kinds = useSkillQuery<{ kinds: { kind_key: string; display_name: string; scope: 'asset' | 'move'; channel: string | null; stages: string[] }[] }>('story-skill', 'list_kinds');
  const stories = useSkillQuery<{ stories: Story[] }>('story-skill', 'list_stories');
  return (
    <>
      <p className={u.lede}>Two grains. An <b>asset</b> is about you and is reused; a <b>move</b> is about one person and never is. That line is the difference between nurture and personalised spam, and it is in the schema (gt_content_kinds.scope).</p>
      <div className={a.subh}>Content kinds</div>
      <DataBoundary query={kinds} label="kinds" skeleton={<SkeletonRows rows={4} />}>
        {(d) => <div className={a.chips}>{d.kinds.map((k) => <span key={k.kind_key} className={`${a.chip} ${k.scope === 'asset' ? a.chipPool : a.chipMine}`}>{k.display_name} · {k.scope}{k.channel ? ` · ${k.channel}` : ''}</span>)}</div>}
      </DataBoundary>
      <div className={a.subh}>Stories</div>
      <DataBoundary query={stories} label="stories" skeleton={<SkeletonRows rows={3} lines={2} />} isEmpty={(d) => !d?.stories?.length} empty="No stories yet. They are drafted per segment in Put them in motion.">
        {(d) => (
          <div className={a.list}>{d.stories.map((s) => (
            <div key={s.story_id} className={`${a.row} ${a.rowNoTick}`}><div><div className={a.name}>{s.title}<small>#{s.seq} · {s.kind_key}</small></div><div className={a.why}>{s.body[0]}</div></div>
              <div className={a.chips} style={{ margin: 0 }}><span className={`${a.chip} ${s.scope === 'asset' ? a.chipPool : a.chipMine}`}>{s.scope}</span><span className={`${u.tag} ${s.status === 'approved' ? u.tagOk : u.tagWarn}`}>{s.status}</span></div></div>
          ))}</div>
        )}
      </DataBoundary>
    </>
  );
}

function Touches() {
  const q = useSkillQuery<{ touches: { at: string; contact_ref: string; channel: string; kind: string; outcome: string | null }[] }>('gtm', 'touch_log');
  return (
    <>
      <p className={u.lede}>One row per touch — channel, offer, outcome, who. This is what the governor counts, so an analytics signal never lands here; signals inform touches, touches consume budget.</p>
      <DataBoundary query={q} label="touches" skeleton={<SkeletonRows rows={3} />} isEmpty={(d) => !d?.touches?.length} empty="No touches recorded. Nothing has been sent — and nothing sends until a consent and suppression model exists.">
        {(d) => <div className={a.list}>{d.touches.map((t, i) => <div key={i} className={`${a.row} ${a.rowNoTick}`}><div><div className={a.name}>{t.contact_ref}<small>{t.channel} · {t.kind}</small></div><div className={a.why}>{formatDateTime(t.at)}{t.outcome ? ` · ${t.outcome}` : ''}</div></div><span /></div>)}</div>}
      </DataBoundary>
    </>
  );
}

export default function ChannelsFrame({ tab }: { tab: ChannelTab }) {
  const pathname = usePathname() ?? '';
  return (
    <div>
      <div className={u.eyebrow}>// GTM · CHANNELS & CADENCE</div>
      <h1 className={u.h1}>The machinery, read-only</h1>
      <nav className={st.tabs} aria-label="Channels sections">
        {CHANNEL_TABS.map((t) => <Link key={t.id} href={t.href} className={st.tab} aria-current={pathname === t.href ? 'page' : undefined}>{t.label}</Link>)}
      </nav>
      {tab === 'identity' ? <Identity /> : tab === 'cadence' ? <Cadence /> : tab === 'stories' ? <Stories /> : <Touches />}
    </div>
  );
}
