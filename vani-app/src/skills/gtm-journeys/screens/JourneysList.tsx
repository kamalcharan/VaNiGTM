'use client';
/** /agents/gtm/journeys — everyone in motion, by state. A reference surface. */
import Link from 'next/link';
import { useSkillQuery } from '@/lib/useSkill';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { formatDate } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import a from '@/skills/gtm-audience/audience.module.css';

interface Journey { id: string; contact_ref: string; person: string; company: string; state: string; offer: string; since: string; wake_at: string | null; }

export default function JourneysList() {
  const q = useSkillQuery<{ journeys: Journey[]; counts: Record<string, number>; total: number }>('journey-skill', 'list_journeys');
  return (
    <div>
      <div className={u.eyebrow}>// GTM · JOURNEYS</div>
      <h1 className={u.h1}>In motion</h1>
      <p className={u.lede}>Every person with a journey, by state. States are recorded, never inferred — a journey moves when a story is approved, a reply lands, or you park it.</p>
      <DataBoundary query={q} label="journeys" skeleton={<SkeletonRows rows={3} lines={2} />} isEmpty={(d) => !d?.journeys?.length} empty="Nobody is in motion yet.">
        {(d) => (
          <>
            <div className={a.chips}>{Object.entries(d.counts).map(([k, n]) => <span key={k} className={`${a.chip} ${a.chipPool}`}>{k} · {n}</span>)}</div>
            <div className={a.list}>
              {d.journeys.map((j) => (
                <div key={j.id} className={`${a.row} ${a.rowNoTick}`}>
                  <div><div className={a.name}><Link href="/agents/gtm/people" style={{ color: 'inherit', textDecoration: 'none' }}>{j.person}</Link><small>{j.contact_ref} · {j.company}</small></div>
                    <div className={a.why}>{j.offer} · since {formatDate(j.since)}{j.wake_at ? ` · wakes ${formatDate(j.wake_at)}` : ''}</div></div>
                  <span className={`${u.tag} ${j.state === 'parked' ? u.tagDim : u.tagOk}`}>{j.state}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </DataBoundary>
      {q.isSuccess && !q.data?.data?.journeys?.length && (
        <div className={a.card} style={{ maxWidth: 720, borderStyle: 'dashed', marginTop: 14 }}>
          <div className={a.eyebrow}>// WHERE JOURNEYS COME FROM</div>
          <p className={a.sub} style={{ margin: 0 }}>A journey starts when a person is put in motion — a segment, an approved story, a reserved slot.</p>
          <div className={a.actions}><Link href="/agents/gtm/motion" className={a.primary} style={{ textDecoration: 'none' }}>Put them in motion →</Link></div>
        </div>
      )}
    </div>
  );
}
