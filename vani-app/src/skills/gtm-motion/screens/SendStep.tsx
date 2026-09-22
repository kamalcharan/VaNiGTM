'use client';
/**
 * Station 10 — Send, locked. The platform owns orchestration, story, cadence,
 * consent and evidence; the tenant owns identity and delivery. First-party
 * tenants send as the platform; everyone else as themselves. Nothing sends
 * until a consent and suppression model exists — a schema decision, not a
 * UI one — and this step says exactly that.
 */
import Link from 'next/link';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import a from '@/skills/gtm-audience/audience.module.css';
import s from '../motion.module.css';
import { useChannels, useStories } from '../useMotion';
import type { Channel } from '../mock';

export function SendStep() {
  const q = useChannels();
  const stories = useStories();
  const moves = (stories.data?.data?.stories ?? []).filter((x) => x.scope === 'move').length;
  return (
    <DataBoundary query={q} label="channels" skeleton={<SkeletonRows rows={3} />}>
      {(d: { channels: Channel[]; identity: 'tenant' | 'first_party' }) => {
        const first = d.identity === 'first_party';
        return (
          <div className={a.card}>
            <div className={a.eyebrow}>// PUT THEM IN MOTION · 4 OF 4</div>
            <h1 className={a.h}>Send — as {first ? 'Vikuna' : 'you'}</h1>
            <p className={a.sub}>{first ? 'This is a Vikuna product, so the platform\'s identity carries the mail: sender, domain, reputation — ours.' : 'Every message goes out under your own identity: your email domain, your WhatsApp number, your LinkedIn. The platform composes, times and records; it never speaks as you from an address you do not own.'}</p>
            <div className={a.subh}>Channels for this plan</div>
            <div className={a.list} style={{ marginTop: 6 }}>
              {d.channels.map((c) => (
                <div key={c.id} className={`${a.row} ${a.rowNoTick}`}>
                  <div><div className={a.name}>{c.name}</div><div className={a.why}>{c.note}{c.status === 'not_connected' && <> · <Link href="/settings/channels">Settings → Channels</Link></>}</div></div>
                  <span className={`${u.tag} ${c.status === 'platform' ? u.tagOk : c.status === 'assisted' ? u.tagDim : u.tagWarn}`}>{c.status === 'platform' ? 'automated' : c.status === 'assisted' ? 'assisted' : 'connect first'}</span>
                </div>
              ))}
            </div>
            <div className={s.lock}>
              <span className={s.lockTag}>Locked · not a UI decision</span>
              <h2>Nothing sends until consent and suppression exist</h2>
              <p>There is no opt-out, no suppression list and no consent record anywhere in GTM today. Sending to strangers without one is not a feature gap; it is the one thing this product must not do. Everything above this line — the audience, the briefs, the stories, the reservations — is real and kept. This step unlocks when the schema decision is taken.</p>
              <div className={a.actions}>
                <button type="button" className={a.primary} disabled>Send {moves} {moves === 1 ? 'move' : 'moves'}</button>
                <Link href="/agents/gtm/today" className={a.quiet} style={{ textDecoration: 'none' }}>Today — what is waiting →</Link>
              </div>
            </div>
          </div>
        );
      }}
    </DataBoundary>
  );
}
