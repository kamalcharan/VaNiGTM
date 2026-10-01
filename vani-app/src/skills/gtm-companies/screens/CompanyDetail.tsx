'use client';
/**
 * /agents/gtm/companies/PROS-0042 — one company, in full: every mapped field,
 * every column the source file carried (a directory holds more than a name
 * and a city), the people at it, its tags, and the research half if there is
 * one. `prospect-skill.get_prospect` returns all of it in one call because a
 * dossier that pops the research in a moment later is two screens
 * pretending to be one.
 */
import Link from 'next/link';
import { useSkillQuery } from '@/lib/useSkill';
import { formatDate } from '@/lib/format';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import s from '@/skills/gtm-people/people.module.css';
import type { Brief } from '@/skills/gtm-audience/mock-data';

interface Prospect {
  id: number | string; ref: string; name: string; domain_normalized: string | null; website: string | null; email: string | null; phone: string | null;
  address_line?: string | null; city: string | null; state_code: string | null; pin?: string | null; country: string | null;
  industry_raw: string | null; employees_band: string | null; revenue_band?: string | null; linkedin_url?: string | null; year_founded?: number | null;
  description?: string | null; relationship: string | null; source: string | null; is_active: boolean; created_at: string;
  load_label: string | null; load_as_of: string | null; source_code: string | null;
}
interface Person { id: number; name: string; job_title: string | null; linkedin_url: string | null; location: string | null; channels: { type: string; value: string }[]; }
interface Dossier {
  prospect: Prospect; people: Person[]; tags: { id: number; label: string; inherited: boolean }[];
  brief: (Omit<Brief, 'ref' | 'name'> & { ref?: string; name?: string }) | null;
  offers: { offer_key: string; name: string; commitment: string | null }[];
  source_row: Record<string, unknown>;
}

const FAILED = new Set(['unreadable', 'extract_failed']);
const STATUS: Record<string, string> = { drafted: 'brief written, undecided', approved: 'worth a message', rejected: 'ruled out', no_contact: 'do not contact', unreadable: 'site unreadable', extract_failed: 'our extraction failed' };

const Field = ({ k, v }: { k: string; v: React.ReactNode }) => (v == null || v === '' ? null : <div className={s.field}><span className={s.fk}>{k}</span><span className={s.fv}>{v}</span></div>);

export default function CompanyDetail({ refId }: { refId: string }) {
  const q = useSkillQuery<Dossier>('prospect-skill', 'get_prospect', { ref: refId });
  return (
    <div>
      <Link href="/agents/gtm/companies" className={s.back}>← Companies</Link>
      <DataBoundary query={q} label="this company" skeleton={<SkeletonRows rows={6} />}>
        {(d: Dossier) => {
          const p = d.prospect;
          const b = d.brief;
          const offerName = (id: string | null | undefined) => (id ? d.offers.find((o) => o.offer_key === id)?.name ?? id : '');
          const src = Object.entries(d.source_row ?? {}).filter(([, v]) => v != null && v !== '');
          return (
            <>
              <div className={u.eyebrow}>// GTM · COMPANY · {p.ref}</div>
              <h1 className={u.h1}>{p.name}</h1>
              <p className={u.lede}>{[p.industry_raw, p.employees_band, [p.city, p.state_code].filter(Boolean).join(', ')].filter(Boolean).join(' · ') || 'Nothing beyond the name yet.'}</p>

              <div className={s.two}>
                <section className={u.card}>
                  <span className={u.cardMeta}>THE RECORD</span>
                  <Field k="Website" v={p.website ? <a href={/^https?:/i.test(p.website) ? p.website : `https://${p.website}`} target="_blank" rel="noreferrer noopener">{p.website}</a> : p.domain_normalized} />
                  <Field k="Email" v={p.email} />
                  <Field k="Phone" v={p.phone} />
                  <Field k="Address" v={[p.address_line, p.city, p.state_code, p.pin, p.country].filter(Boolean).join(', ')} />
                  <Field k="Industry" v={p.industry_raw} />
                  <Field k="Size" v={p.employees_band} />
                  <Field k="Revenue" v={p.revenue_band} />
                  <Field k="Founded" v={p.year_founded} />
                  <Field k="LinkedIn" v={p.linkedin_url} />
                  <Field k="Relationship" v={p.relationship} />
                  <Field k="Source" v={[p.load_label ?? p.source, p.source_code, p.load_as_of ? `as of ${formatDate(p.load_as_of)}` : null].filter(Boolean).join(' · ')} />
                  <Field k="Held since" v={formatDate(p.created_at)} />
                  {d.tags.length > 0 && <Field k="Tags" v={d.tags.map((t) => <span key={t.id} className={`${u.tag} ${u.tagDim}`} style={{ marginRight: 4 }}>{t.label}{t.inherited ? ' · from the load' : ''}</span>)} />}
                  {p.description && <p style={{ margin: '10px 0 0', fontSize: 'var(--fs-lg)', lineHeight: 1.6, color: 'var(--tx2)' }}>{p.description}</p>}
                </section>

                <section className={u.card}>
                  <span className={u.cardMeta}>RESEARCH</span>
                  {!b ? (
                    <div className={s.none}>Not researched yet. <Link href="/agents/gtm/audience?step=find">Pick it in Find →</Link></div>
                  ) : FAILED.has(b.status) ? (
                    <div className={s.none}>{STATUS[b.status]} — {b.error || 'no reason recorded'}. Nothing was guessed.</div>
                  ) : (
                    <>
                      <Field k="Status" v={STATUS[b.status] ?? b.status} />
                      <Field k="Open with" v={b.effective_offer ? offerName(b.effective_offer) : 'no offer fits'} />
                      {b.fit && Object.keys(b.fit).length > 0 && <Field k="Fit" v={Object.entries(b.fit).sort((x, y) => y[1].score - x[1].score).map(([k, f]) => `${offerName(k)} ${Math.round(f.score * 100)}%`).join(' · ')} />}
                      <Field k="What they make" v={b.what_they_make} />
                      <Field k="Scale" v={b.scale_signals} />
                      <Field k="Service" v={b.service_signals} />
                      <Field k="Digital" v={b.digital_maturity} />
                      <Field k="Hook" v={b.hook} />
                      <Field k="Your note" v={b.decision_note} />
                      <Field k="Researched" v={formatDate(b.updated_at)} />
                      {b.raw_evidence?.length ? (
                        <div style={{ marginTop: 10 }}>
                          <span className={u.cardMeta}>EVIDENCE · {b.raw_evidence.length}</span>
                          {b.raw_evidence.map((e, i) => <div key={i} style={{ fontSize: 'var(--fs-ui)', lineHeight: 1.5, padding: '4px 0 4px 10px', borderLeft: '2px solid var(--line2)', marginTop: 6 }}>{e.claim}<br /><a href={e.url} target="_blank" rel="noreferrer noopener" style={{ fontFamily: 'var(--mono)', fontSize: 'var(--fs-sm)', wordBreak: 'break-all' }}>{e.url}</a></div>)}
                        </div>
                      ) : <div className={s.none} style={{ marginTop: 8 }}>No evidence the model could point at.</div>}
                      <div style={{ marginTop: 10 }}><Link href="/agents/gtm/audience?step=qualify" className={s.go}>Decide in Qualify →</Link></div>
                    </>
                  )}
                </section>
              </div>

              <section className={u.card} style={{ marginTop: 14 }}>
                <span className={u.cardMeta}>PEOPLE · {d.people.length}</span>
                {d.people.length === 0 ? (
                  <div className={s.none}>Nobody at this company in your audience yet.{b && b.status === 'approved' ? <> <Link href="/agents/gtm/audience?step=people">Add from the brief →</Link></> : null}</div>
                ) : d.people.map((c) => (
                  <Link key={c.id} href={`/agents/gtm/people/${c.id}`} className={s.row}>
                    <span className={s.ref}>→</span>
                    <div><div className={s.name}>{c.name}</div>{c.job_title && <div className={s.title}>{c.job_title}</div>}</div>
                    <div><div className={s.co}>{c.channels.map((ch) => ch.value).join(' · ') || 'no channel'}</div>{c.location && <div className={s.loc}>{c.location}</div>}</div>
                    <span /><span />
                  </Link>
                ))}
              </section>

              {src.length > 0 && (
                <section className={u.card} style={{ marginTop: 14 }}>
                  <span className={u.cardMeta}>AS THE FILE HAD IT · {src.length} columns</span>
                  {src.map(([k, v]) => <Field key={k} k={k} v={String(v)} />)}
                </section>
              )}
            </>
          );
        }}
      </DataBoundary>
    </div>
  );
}
