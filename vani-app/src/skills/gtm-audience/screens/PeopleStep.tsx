'use client';
/**
 * Station 5 — who, at each company worth it.
 *
 * The only names here are the ones the brief evidenced on a page we read
 * (`contact-skill.list_brief_contacts`). Nobody is invented (rule 9d): a brief
 * that named nobody says so, and the row cannot be promoted. Promoting is
 * `promote_from_brief`; it confirms the person reachable only when the entry
 * carries an address — a name with no channel joins the audience as a draft,
 * and the row says that too.
 */
import Link from 'next/link';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useAudienceWrites, useBriefContacts, useBriefs } from '../useAudience';
import type { Brief, BriefContacts, BriefList } from '../mock-data';
import s from '../audience.module.css';

function BriefPeople({ b }: { b: Brief }) {
  const q = useBriefContacts(b.id);
  const w = useAudienceWrites();
  return (
    <div>
      <div className={s.subh}><Link href={`/agents/gtm/companies/${encodeURIComponent(b.ref)}`} style={{ color: 'inherit' }}>{b.name}</Link> · {b.ref}</div>
      <DataBoundary query={q} label="the people named in this brief" skeleton={<SkeletonRows rows={2} lines={2} />}
        isEmpty={(d: BriefContacts | undefined) => !d?.entries?.length}
        empty={q.data?.data?.empty_reason ?? 'This brief named nobody.'}>
        {(d: BriefContacts) => (
          <div className={s.list} style={{ marginTop: 6 }}>
            {d.entries.map((p) => {
              const done = p.promoted_contact_id != null;
              return (
                <div key={p.named_index} className={`${s.row} ${done ? s.rowOn : ''}`}>
                  <button type="button" className={s.tick} aria-pressed={done} disabled={done || !p.has_name || w.busy}
                    title={!p.has_name ? 'No name — cannot be added' : done ? 'In your audience' : p.addressable ? 'Add, reachable' : 'Add as a draft — no address found'}
                    onClick={() => void w.promote(b.id, p.named_index, p.addressable)}>✓</button>
                  <div>
                    <div className={s.name}>{p.name ?? '(no name)'}<small>{p.title ?? ''}</small></div>
                    <div className={s.wf}>
                      <span className={p.email ? s.wfHit : s.wfMiss}>{p.email ? `email · ${p.email}` : 'no email on any page read'}</span>
                      <span className={p.phone ? s.wfHit : s.wfNa}>{p.phone ? `phone · ${p.phone}` : 'no phone'}</span>
                      {p.source_url && <a className={s.wfNa} href={p.source_url} target="_blank" rel="noreferrer noopener">read on {p.source_url.replace(/^https?:\/\//, '')}</a>}
                    </div>
                  </div>
                  <span className={s.side}>{done ? <Link href={`/agents/gtm/people/${p.promoted_contact_id}`}>in audience →</Link> : p.addressable ? 'reachable' : 'no address'}</span>
                </div>
              );
            })}
          </div>
        )}
      </DataBoundary>
    </div>
  );
}

export function PeopleStep() {
  const briefs = useBriefs();
  const w = useAudienceWrites();
  return (
    <DataBoundary query={briefs} label="the companies worth a message" skeleton={<SkeletonRows rows={4} lines={2} />}
      isEmpty={(d: BriefList | undefined) => !d?.briefs?.some((b) => b.status === 'approved')}
      empty="Nobody to show yet — mark at least one company worth a message in Qualify, one step back.">
      {(d: BriefList) => {
        const worth = d.briefs.filter((b) => b.status === 'approved');
        return (
          <div className={s.card}>
            <div className={s.eyebrow}>// BUILD THE AUDIENCE · 4 OF 4</div>
            <h1 className={s.h}>Who, at the {worth.length} worth it</h1>
            <p className={s.sub}>Named in the briefs, on pages we read — never invented. Add the ones who matter. A person with an email or phone joins as reachable; one without joins as a draft until an address is found, and says so.</p>
            {worth.map((b) => <BriefPeople key={String(b.id)} b={b} />)}
            <div className={s.actions}>
              <button type="button" className={s.primary} disabled={w.busy} onClick={() => void w.advance('done')}>Done — see the audience →</button>
              <span className={s.hint}>Everyone added is under People. Come back any time.</span>
            </div>
          </div>
        );
      }}
    </DataBoundary>
  );
}
