'use client';
/**
 * /agents/gtm/people/[id] — one person. Identity and channels from
 * gt_contacts; where they came from (the brief); what has happened
 * (gt_touch_log) and where they are (gt_journeys), both honestly empty until
 * G2 exists, with the reason and the link.
 */
import Link from 'next/link';
import { useSkillQuery } from '@/lib/useSkill';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { formatDate } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import s from '../people.module.css';
import type { ContactDetail } from '../mock';

export default function PersonDetail({ id }: { id: string }) {
  const q = useSkillQuery<{ contact: ContactDetail } | null>('contact-skill', 'get_contact', { contact_id: id });
  return (
    <div>
      <Link href="/agents/gtm/people" className={s.back}>← Your audience</Link>
      <DataBoundary query={q} label="record" skeleton={<SkeletonRows rows={4} lines={2} />}
        isEmpty={(d) => !d?.contact}
        empty={`No one with the id ${id} in your audience.`}>
        {(d) => {
          const c = d!.contact;
          return (
            <>
              <div className={u.eyebrow} style={{ marginTop: 14 }}>// GTM · PEOPLE · {c.contact_no}</div>
              <h1 className={u.h1}>{c.name}</h1>
              <p className={u.lede}>{[c.job_title, c.company_name, c.location].filter(Boolean).join(' · ')}</p>

              <div className={s.two}>
                <section className={u.card}>
                  <div className={u.cardHead}>Reach them<span className={u.cardMeta}>{c.channels.length} {c.channels.length === 1 ? 'channel' : 'channels'}</span></div>
                  {c.channels.length ? c.channels.map((ch) => (
                    <div key={ch.type + ch.value} className={s.field}>
                      <span className={s.fk}>{ch.type}</span>
                      <span className={s.fv}>{ch.value} <span className={`${u.tag} ${ch.verified ? u.tagOk : u.tagDim}`} style={{ marginLeft: 8 }}>{ch.verified ? 'verified' : 'unverified'}</span></span>
                    </div>
                  )) : <p className={s.none}>No channel found for this person — every source tried came back empty. That is said, not hidden.</p>}
                </section>

                <section className={u.card}>
                  <div className={u.cardHead}>Where they came from</div>
                  <div className={s.field}><span className={s.fk}>Source</span><span className={s.fv}>{c.source}</span></div>
                  <div className={s.field}><span className={s.fk}>Company</span><span className={s.fv}>{c.company_name ?? '—'}{c.prospect_ref && <> · <Link href={`/agents/gtm/audience?step=qualify`}>brief {c.prospect_ref} →</Link></>}</span></div>
                  <div className={s.field}><span className={s.fk}>Added</span><span className={s.fv}>{formatDate(c.created_at)}</span></div>
                </section>
              </div>

              <div className={s.two} style={{ marginTop: 18 }}>
                <section className={u.card}>
                  <div className={u.cardHead}>Touches<span className={u.cardMeta}>gt_touch_log</span></div>
                  {c.touches.length ? c.touches.map((t, i) => (
                    <div key={i} className={s.field}><span className={s.fk}>{t.at}</span><span className={s.fv}>{t.channel} · {t.kind}{t.outcome ? ` · ${t.outcome}` : ''}</span></div>
                  )) : <p className={s.none}>Nothing yet. Touches are recorded here once this person is in motion — and nothing sends until a consent model exists. <Link href="/agents/gtm/motion">Put them in motion →</Link></p>}
                </section>
                <section className={u.card}>
                  <div className={u.cardHead}>Journey<span className={u.cardMeta}>gt_journeys</span></div>
                  {c.journey ? (
                    <div className={s.field}><span className={s.fk}>Stage</span><span className={s.fv}>{c.journey.stage} · since {c.journey.since}</span></div>
                  ) : <p className={s.none}>Not in motion. A segment and a story come first. <Link href="/agents/gtm/motion">Put them in motion →</Link></p>}
                </section>
              </div>
            </>
          );
        }}
      </DataBoundary>
    </div>
  );
}
