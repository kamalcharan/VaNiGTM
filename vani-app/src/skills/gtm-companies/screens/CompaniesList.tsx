'use client';
/**
 * /agents/gtm/companies — every company the tenant holds. A reference surface
 * (a noun): you look at it; anything you DO with a company is a pathway step.
 * Reads `prospect-skill.get_records` (scope 'mine'), the same rows the hot
 * list is built from, with the filters the function already offers — search,
 * research state, has a domain. Refs are PROS-0042-style, never a raw key.
 *
 * This is where an imported list lands and where a researched company can be
 * found again — the question "where do I see what I imported" is answered
 * here, not inside step 1 of a pathway.
 */
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { useSkillQuery } from '@/lib/useSkill';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import s from '@/skills/gtm-people/people.module.css';
import type { RecordRow } from '@/skills/gtm-audience/mock-data';

type Research = '' | 'none' | 'done' | 'failed' | 'decided';
const RESEARCH: { v: Research; label: string }[] = [
  { v: '', label: 'All' }, { v: 'none', label: 'Not researched' }, { v: 'done', label: 'Researched' }, { v: 'decided', label: 'Decided' }, { v: 'failed', label: 'Research failed' },
];

const STATUS: Record<string, { label: string; cls: string }> = {
  drafted: { label: 'brief · undecided', cls: 'tagWarn' }, approved: { label: 'worth a message', cls: 'tagOk' },
  rejected: { label: 'not this one', cls: 'tagDim' }, no_contact: { label: 'do not contact', cls: 'tagBad' },
  unreadable: { label: 'site unreadable', cls: 'tagBad' }, extract_failed: { label: 'extraction failed', cls: 'tagBad' },
};

export default function CompaniesList() {
  const params = useSearchParams();
  const [search, setSearch] = useState('');
  const [research, setResearch] = useState<Research>((params?.get('research') as Research) ?? '');
  const q = useSkillQuery<{ records: RecordRow[]; total: number; stats?: { total?: number | string } }>('prospect-skill', 'get_records', {
    scope: 'mine', limit: 200, ...(search ? { search } : {}), ...(research ? { research } : {}),
  });
  const total = q.data?.data?.total ?? 0;

  return (
    <div>
      <div className={u.eyebrow}>// GTM · COMPANIES</div>
      <h1 className={u.h1}>Every company you hold</h1>
      <p className={u.lede}>Imported, from the pool, or researched — one row per company, with where it came from and what GTM has done with it. Building the audience picks from here; this page is for looking.</p>

      <div className={s.tools}>
        <input className={s.search} type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, city, domain, industry" />
        <span className={s.count}>{q.data?.data ? `${total} ${total === 1 ? 'company' : 'companies'}` : ''}</span>
      </div>
      <div className={s.tools} role="group" aria-label="Research state" style={{ gap: 6, flexWrap: 'wrap' }}>
        {RESEARCH.map((r) => (
          <button key={r.v || 'all'} type="button" className={`${u.tag} ${research === r.v ? u.tagOk : u.tagDim}`} aria-pressed={research === r.v} onClick={() => setResearch(r.v)} style={{ cursor: 'pointer', font: 'inherit', fontSize: 11 }}>{r.label}</button>
        ))}
      </div>

      <DataBoundary query={q} label="companies" skeleton={<SkeletonRows rows={6} lines={2} />}
        isEmpty={(d) => !d?.records?.length}
        empty={search || research ? 'Nothing matches that filter.' : 'No companies yet.'}>
        {(d) => (
          <section className={u.card}>
            {d.records.map((r) => {
              const st = r.research_status ? STATUS[r.research_status] : null;
              return (
                <Link key={String(r.id)} href={`/agents/gtm/companies/${encodeURIComponent(r.ref)}`} className={s.row}>
                  <span className={s.ref}>{r.ref}</span>
                  <div><div className={s.name}>{r.name}</div><div className={s.title}>{[r.industry_raw, r.employees_band].filter(Boolean).join(' · ') || '—'}</div></div>
                  <div><div className={s.co}>{r.domain_normalized ?? 'no domain'}</div>{r.city && <div className={s.loc}>{[r.city, r.state_code].filter(Boolean).join(', ')}</div>}</div>
                  <div className={s.ch}>
                    {st ? <span className={`${u.tag} ${u[st.cls]}`}>{st.label}</span> : <span className={`${u.tag} ${u.tagDim}`}>not researched</span>}
                    {r.duplicate && <span className={`${u.tag} ${u.tagWarn}`}>possible duplicate</span>}
                  </div>
                  <span className={s.src}>{r.source_label ?? '—'}{r.freshness && r.freshness !== 'unknown' ? ` · ${r.freshness}` : ''}</span>
                </Link>
              );
            })}
          </section>
        )}
      </DataBoundary>

      {q.isSuccess && !q.data?.data?.records?.length && !search && !research && (
        <div className={s.empty} style={{ marginTop: 14 }}>
          <span className={u.cardMeta}>WHERE COMPANIES COME FROM</span>
          <div className={s.emptyH}>Bring a list, or wait for the pool to be fed for your market</div>
          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--tx2)' }}>Step 1 of Build the audience takes a spreadsheet — mapped before anything lands, clashes held for your decision. Rows land here and on the hot list.</p>
          <Link href="/agents/gtm/audience?step=bring" className={s.go}>Add your own list →</Link>
        </div>
      )}
    </div>
  );
}
