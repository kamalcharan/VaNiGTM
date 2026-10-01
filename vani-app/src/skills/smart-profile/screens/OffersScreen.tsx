'use client';
/**
 * /smart-profile/offers — what you sell, in the shape agents score against.
 *
 * Agent proposes, human confirms (Charan, 2026-09-22: "though AI builds the
 * offers and metadata, human intervention will be required"). "Draft from
 * what VaNi has read" proposes 1–3 offers from the profile and the cached
 * crawl; each is read, edited, and CONFIRMED by a person — only then does it
 * count toward the profile score, and only a READY one (every field filled
 * enough to score against) can drive fit. The gap list comes from the
 * server's own readiness check, so the screen and research agree.
 *
 * A BRAIN object, so it lives here beside the Smart Profile — GTM reads and
 * links; it never edits.
 */
import { useState } from 'react';
import Link from 'next/link';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import s from '../offers.module.css';
import { COMMITMENTS, useOffers, useOfferWrites, type Commitment, type Offer, type OffersResult } from '../useOffers';

type Draft = Omit<Offer, 'source' | 'confirmed_at' | 'is_ready'>;
const blank = (): Draft => ({ id: '', name: '', one_line: '', who_for: '', problem: '', what_we_do: [], signals: [], disqualifiers: [], price_band: '', proof: '', commitment: 'project' });
const lines = (xs: string[]) => xs.join('\n');
const toLines = (v: string) => v.split('\n').map((x) => x.trim()).filter(Boolean);

function Field({ k, v, list }: { k: string; v: string | string[]; list?: boolean }) {
  const empty = list ? !(v as string[]).length : !(v as string).trim();
  return (
    <div className={s.f}><span className={s.fk}>{k}</span>
      {empty ? <span className={`${s.fv} ${s.fvMiss}`}>not filled in</span>
        : list ? <div className={s.fv}><ul>{(v as string[]).map((x, i) => <li key={i}>{x}</li>)}</ul></div>
        : <span className={s.fv}>{v as string}</span>}
    </div>
  );
}

function OfferForm({ initial, onSave, onCancel, busy }: { initial: Draft; onSave: (d: Draft) => void; onCancel: () => void; busy: boolean }) {
  const [d, setD] = useState<Draft>(initial);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));
  const T = ({ k, label, hint, rows }: { k: 'one_line' | 'who_for' | 'problem' | 'price_band' | 'proof'; label: string; hint?: string; rows?: number }) => (
    <div className={s.row}><label className={s.label}>{label}{hint && <small>{hint}</small>}</label>
      <textarea className={s.area} rows={rows ?? 2} value={d[k]} onChange={(e) => set(k, e.target.value)} disabled={busy} /></div>
  );
  const L = ({ k, label, hint }: { k: 'what_we_do' | 'signals' | 'disqualifiers'; label: string; hint: string }) => (
    <div className={s.row}><label className={s.label}>{label}<small>{hint} · one per line</small></label>
      <textarea className={s.area} rows={3} value={lines(d[k])} onChange={(e) => set(k, toLines(e.target.value))} disabled={busy} /></div>
  );
  return (
    <div className={s.form}>
      <div className={s.two}>
        <div className={s.row}><label className={s.label}>Name</label><input className={s.input} value={d.name} onChange={(e) => set('name', e.target.value)} disabled={busy} autoFocus /></div>
        <div className={s.row}><label className={s.label}>Commitment<small>{COMMITMENTS.find((c) => c.value === d.commitment)?.hint}</small></label>
          <select className={s.select} value={d.commitment} onChange={(e) => set('commitment', e.target.value as Commitment)} disabled={busy}>
            {COMMITMENTS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}</select></div>
      </div>
      <T k="one_line" label="One line" hint="what a stranger reads first" />
      <T k="who_for" label="Who it is for" />
      <T k="problem" label="The problem it solves" />
      <L k="what_we_do" label="What we do" hint="the work, concretely" />
      <L k="signals" label="Signals" hint="what on a company's site says this fits — drives fit scoring" />
      <L k="disqualifiers" label="Disqualifiers" hint="when NOT to pitch this — as load-bearing as the signals" />
      <div className={s.two}><T k="price_band" label="Price band" /><T k="proof" label="Proof" hint="a result, a number, a name" /></div>
      <div className={s.actions}>
        <button type="button" className={s.primary} onClick={() => onSave(d)} disabled={busy || !d.name.trim()}>Save</button>
        <button type="button" className={s.quiet} onClick={onCancel} disabled={busy}>Cancel</button>
        <span className={s.hint}>Saving never confirms. Confirm is its own step, on purpose.</span>
      </div>
    </div>
  );
}

export default function OffersScreen() {
  const q = useOffers();
  const w = useOfferWrites();
  const [editing, setEditing] = useState<string | null>(null); // offer id, or 'new'

  async function save(d: Draft) { const r = await w.save(d); if (r) setEditing(null); }

  return (
    <div>
      <Link href="/smart-profile" className={u.cardMeta} style={{ textDecoration: 'none' }}>← Smart Profile</Link>
      <div className={u.eyebrow} style={{ marginTop: 12 }}>// SMART PROFILE · OFFERS</div>
      <h1 className={u.h1}>What you sell</h1>
      <p className={u.lede}>In the shape agents score against: who it is for, the problem, the signals that say it fits, the disqualifiers that say it does not. VaNi drafts from what it has read; you read, edit and confirm. Nothing counts until you do.</p>

      <div className={s.tools}>
        <button type="button" className={s.primary} onClick={() => void w.generate()} disabled={w.busy}>{w.generating ? 'Reading…' : 'Draft from what VaNi has read'}</button>
        <button type="button" className={s.quiet} onClick={() => setEditing('new')} disabled={w.busy || editing === 'new'}>Add one by hand</button>
        <span className={s.hint}>Drafting reads the cached crawl and your documents — no re-crawl. Add more under <Link href="/smart-profile">What VaNi has read</Link>.</span>
      </div>

      {editing === 'new' && <div className={s.card}><div className={s.head}><div className={s.name}>New offer</div></div><OfferForm initial={blank()} onSave={save} onCancel={() => setEditing(null)} busy={w.busy} /></div>}

      <DataBoundary query={q} label="offers" skeleton={<SkeletonRows rows={3} lines={3} />}
        isEmpty={(d: OffersResult | undefined) => !d?.offers?.length}
        empty="No offers yet. Draft them from what VaNi has read, or add one by hand.">
        {(d: OffersResult) => (
          <>
            {d.ready ? (
              <div className={s.ok}>Every offer is filled in enough to score against. Research can run.</div>
            ) : d.problems.length > 0 && (
              <div className={s.problems}><div className={s.problemsH}>Research cannot start yet — {d.problems.length} {d.problems.length === 1 ? 'thing' : 'things'} missing</div>
                <ul style={{ margin: 0, paddingLeft: 18 }}>{d.problems.map((p, i) => <li key={i}>{p}</li>)}</ul></div>
            )}
            {d.offers.map((o) => (
              <div key={o.id} className={s.card}>
                <div className={s.head}>
                  <div>
                    <div className={s.name}>{o.name}</div>
                    {o.one_line && <div className={s.line}>{o.one_line}</div>}
                    <div className={s.tags} style={{ marginTop: 8 }}>
                      <span className={`${u.tag} ${u.tagDim}`}>{COMMITMENTS.find((c) => c.value === o.commitment)?.label ?? o.commitment} ask</span>
                      <span className={`${u.tag} ${o.source === 'agent' ? u.tagWarn : u.tagDim}`}>{o.source === 'agent' ? 'drafted by VaNi' : 'written by you'}</span>
                      <span className={`${u.tag} ${o.confirmed_at ? u.tagOk : u.tagWarn}`}>{o.confirmed_at ? 'confirmed' : 'unconfirmed — counts for nothing yet'}</span>
                      <span className={`${u.tag} ${o.is_ready ? u.tagOk : u.tagDim}`}>{o.is_ready ? 'ready to score against' : 'not ready'}</span>
                    </div>
                  </div>
                  <div className={s.actions}>
                    {!o.confirmed_at && <button type="button" className={s.primary} onClick={() => void w.confirm(o.id)} disabled={w.busy}>Confirm</button>}
                    <button type="button" className={s.quiet} onClick={() => setEditing(editing === o.id ? null : o.id)} disabled={w.busy}>{editing === o.id ? 'Cancel' : 'Edit'}</button>
                  </div>
                </div>
                {editing === o.id ? (
                  <OfferForm initial={{ ...o }} onSave={save} onCancel={() => setEditing(null)} busy={w.busy} />
                ) : (
                  <div className={s.body}>
                    <Field k="Who for" v={o.who_for} /><Field k="Problem" v={o.problem} />
                    <Field k="What we do" v={o.what_we_do} list /><Field k="Signals" v={o.signals} list /><Field k="Disqualifiers" v={o.disqualifiers} list />
                    <Field k="Price band" v={o.price_band} /><Field k="Proof" v={o.proof} />
                  </div>
                )}
              </div>
            ))}
          </>
        )}
      </DataBoundary>
    </div>
  );
}
