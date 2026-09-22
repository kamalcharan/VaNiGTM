'use client';
/**
 * Station 5 — who, at each company worth it.
 *
 * Every person shows every source tried, hit or miss; a provider that is not
 * connected shows as not tried, never as a miss; where nobody was found the
 * row says so instead of spinning. Nobody is invented (rule 9d).
 */
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useAudienceWrites, useBriefContacts } from '../useAudience';
import { HOT_ROWS, UPLOAD_ROWS, type HotRow, type Person } from '../mock-data';
import s from '../audience.module.css';

const nameOf = (id: string) => (HOT_ROWS as HotRow[]).concat(UPLOAD_ROWS as HotRow[]).find((r) => r.id === id)?.name ?? id;

export function Waterfall({ p }: { p: Person }) {
  if (!p.waterfall.length) return null;
  return (
    <div className={s.wf}>
      {p.waterfall.map((x) => (
        <span key={x.source} className={x.result === 'hit' ? s.wfHit : x.result === 'miss' ? s.wfMiss : s.wfNa}>
          {x.source}{x.result === 'not_tried' ? ' · not connected' : ''}
        </span>
      ))}
      <span className={p.email === 'found' ? s.wfHit : s.wfMiss}>{p.email === 'found' ? 'email found' : 'no email found'}</span>
      {p.linkedin && <span className={s.wfHit}>linkedin</span>}
    </div>
  );
}

export function PeopleStep() {
  const q = useBriefContacts();
  const w = useAudienceWrites();
  return (
    <DataBoundary query={q} label="people" skeleton={<SkeletonRows rows={4} lines={2} />}
      isEmpty={(d: { people: Person[] } | undefined) => !d?.people?.length}
      empty="Nobody to show yet — mark at least one company worth a message in Qualify, one step back.">
      {(d: { people: Person[] }) => {
        const groups = [...new Set(d.people.map((p) => p.prospect_id))];
        const promoted = d.people.filter((p) => p.contact_ref).length;
        return (
          <div className={s.card}>
            <div className={s.eyebrow}>// BUILD THE AUDIENCE · 4 OF 4</div>
            <h1 className={s.h}>Who, at the {groups.length} worth it</h1>
            <p className={s.sub}>Found from the briefs. Each person shows every source tried, hit or miss — and an honest &ldquo;no email found&rdquo; where there is none. Nobody is invented. Add the ones who matter.</p>
            {groups.map((pid) => (
              <div key={pid}>
                <div className={s.subh}>{nameOf(pid)}</div>
                <div className={s.list} style={{ marginTop: 6 }}>
                  {d.people.filter((p) => p.prospect_id === pid).map((p) => (
                    <div key={p.id} className={`${s.row} ${p.contact_ref ? s.rowOn : ''}`}>
                      <button type="button" className={s.tick} aria-pressed={!!p.contact_ref} disabled={!!p.none || w.busy}
                        onClick={() => void (p.contact_ref ? w.unpromote(p.id) : w.promote(p.id))}>✓</button>
                      <div>
                        <div className={s.name}>{p.name}<small>{p.title}</small></div>
                        {p.none ? <div className={s.why}>{p.none}</div> : <Waterfall p={p} />}
                      </div>
                      <span className={s.side}>{p.contact_ref ?? ''}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
            <div className={s.actions}>
              <button type="button" className={s.primary} disabled={!promoted || w.busy} onClick={() => void w.advance('done')}>
                {promoted ? `Done — ${promoted} ${promoted === 1 ? 'person' : 'people'} in your audience →` : 'Add at least one person'}
              </button>
            </div>
          </div>
        );
      }}
    </DataBoundary>
  );
}
