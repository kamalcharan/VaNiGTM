'use client';
/**
 * /agents/gtm/people — everyone in the audience. A reference surface: you look
 * at it; you do not do anything here that is not also a pathway step. Ids are
 * CONT-0001, never a raw key. Day one it is empty, and the empty state says
 * where people come from.
 */
import Link from 'next/link';
import { useState } from 'react';
import { useSkillQuery } from '@/lib/useSkill';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import s from '../people.module.css';
import type { ContactRow } from '../mock';

export default function PeopleList() {
  const [search, setSearch] = useState('');
  const q = useSkillQuery<{ contacts: ContactRow[]; total: number }>('contact-skill', 'get_contacts', { search });

  return (
    <div>
      <div className={u.eyebrow}>// GTM · PEOPLE</div>
      <h1 className={u.h1}>Your audience</h1>
      <p className={u.lede}>Everyone GTM has found and you have kept. People arrive here from Build the audience and are worked from Put them in motion — this page is for looking.</p>

      <div className={s.tools}>
        <input className={s.search} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, company, title, email" />
        <span className={s.count}>{q.data?.data ? `${q.data.data.total} ${q.data.data.total === 1 ? 'person' : 'people'}` : ''}</span>
      </div>

      <DataBoundary query={q} label="people" skeleton={<SkeletonRows rows={5} lines={2} />}
        isEmpty={(d) => !d?.contacts?.length}
        empty={search
          ? `Nobody matches "${search}".`
          : 'Nobody in your audience yet.'}>
        {(d) => (
          <section className={u.card}>
            {d.contacts.map((c) => (
              <Link key={c.id} href={`/agents/gtm/people/${encodeURIComponent(String(c.id))}`} className={s.row}>
                <span className={s.ref}>{c.contact_no}</span>
                <div><div className={s.name}>{c.name}</div>{c.job_title && <div className={s.title}>{c.job_title}</div>}</div>
                <div><div className={s.co}>{c.company_name ?? '—'}</div>{c.location && <div className={s.loc}>{c.location}</div>}</div>
                <div className={s.ch}>
                  <span className={`${u.tag} ${c.primary_email ? u.tagOk : u.tagDim}`}>{c.primary_email ? 'email' : 'no email'}</span>
                  {c.primary_mobile && <span className={`${u.tag} ${u.tagOk}`}>mobile</span>}
                </div>
                <span className={s.src}>{c.source}</span>
              </Link>
            ))}
          </section>
        )}
      </DataBoundary>

      {q.isSuccess && !q.data?.data?.contacts?.length && !search && (
        <div className={s.empty} style={{ marginTop: 14 }}>
          <span className={u.cardMeta}>WHERE PEOPLE COME FROM</span>
          <div className={s.emptyH}>Build the audience, and the people you keep land here</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--tx2)' }}>A hot list from global data, the ones worth researching, briefs with evidence, then the decision-makers at every company worth a message. About ten minutes.</p>
          <Link href="/agents/gtm/audience" className={s.go}>Build the audience →</Link>
        </div>
      )}
    </div>
  );
}
