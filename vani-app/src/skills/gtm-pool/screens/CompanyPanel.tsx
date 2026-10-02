'use client';
/**
 * One pool company, as a side panel: why it is or is not in the core pool
 * (the eight Complete checks), the decision a person owes it, which source
 * won each field, and every source row behind it. Admin only — the server
 * gates every call; this only asks.
 *
 * Decisions are recorded with who and when, and each is reversible: junk ↔
 * restore, company ↔ individual. The console does not auto-retry a decision
 * (vani-app/CLAUDE.md §2: the server does not store idempotency keys yet).
 */
import { useState } from 'react';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { formatDate } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import s from '../pool.module.css';
import { ScoreCard } from '@/skills/scoring/ScoreCard';
import { JUNK_REASONS, useCompany, usePoolWrites, type Check, type CompanyResult } from '../usePool';
import Link from 'next/link';
import e from '../enrich.module.css';
import { runHref } from '../useEnrich';
import { LevelBadge } from './EnrichParts';
import { LEVEL_LABEL, type Level } from '@/skills/scoring/useScoring';

const DOT: Record<Check['status'], string> = { pass: s.dotPass, fail: s.dotFail, pending: s.dotPending, review: s.dotReview, na: s.dotNa };
const STATE_LABEL: Record<string, string> = { complete: 'In the pool', candidate: 'Waiting for Complete', enriching: 'Being enriched', held: 'Held — needs a person', junk: 'Junk' };
const STATE_TAG: Record<string, string> = { complete: u.tagOk, candidate: u.tagDim, enriching: u.tagDim, held: u.tagWarn, junk: u.tagBad };
const FIELD_LABEL: Record<string, string> = { name: 'Name', domain_normalized: 'Domain', city: 'City', state_code: 'State', pin: 'PIN', phone: 'Phone', email: 'Email', industry_id: 'Industry', cin: 'CIN', gstin: 'GSTIN', legal_status: 'Legal status', is_individual: 'Company or individual', website: 'Website', address_line: 'Address' };

function Decisions({ c }: { c: NonNullable<CompanyResult['company']> }) {
  const { decide } = usePoolWrites();
  const [reason, setReason] = useState('');
  const busy = decide.isPending;
  const run = (decision: string, extra: Record<string, unknown> = {}) => void decide.mutate({ company_id: c.id, decision, ...extra });
  const checks = c.complete_checks?.checks ?? [];
  const type = checks.find((k) => k.key === 'type');
  const match = checks.find((k) => k.key === 'match');

  if (c.lifecycle_state === 'junk') {
    return (
      <div className={s.decision}>
        <p className={s.decisionQ}>Junk — {JUNK_REASONS.find((r) => r.code === c.junk_reason)?.label ?? c.junk_reason}</p>
        <p className={s.decisionWhy}>Kept, never deleted. Restoring puts it back through the Complete test.</p>
        <div className={s.decisionRow}><button type="button" className={s.btn} disabled={busy} onClick={() => run('restore')}>Restore</button></div>
      </div>
    );
  }
  return (
    <>
      {match?.status === 'review' && (
        <div className={s.decision}>
          <p className={s.decisionQ}>The same company as {c.duplicate_of_name ?? `#${c.duplicate_of_id}`}?</p>
          <p className={s.decisionWhy}>{match.detail}. Duplicates are flagged, never merged: say whether this is a different company (a sister company or a division on the same website), or junk it.</p>
          <div className={s.decisionRow}>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={busy} onClick={() => run('not_duplicate')}>A different company — keep</button>
          </div>
        </div>
      )}
      {type && type.status !== 'pass' && (
        <div className={s.decision}>
          <p className={s.decisionQ}>Company, or an individual practitioner?</p>
          <p className={s.decisionWhy}>Individual practitioners (advocates, CAs, consultants trading under their own name) do not enter a companies pool. Enrichment will propose this; you can decide it now.</p>
          <div className={s.decisionRow}>
            <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={busy} onClick={() => run('company')}>Company — keep</button>
            <button type="button" className={`${s.btn} ${s.btnBad}`} disabled={busy} onClick={() => run('individual')}>Individual — junk: out of scope</button>
          </div>
          <div className={s.decisionNote}>Recorded with who and when, and kept as a case the classifier is later checked against.</div>
        </div>
      )}
      <div className={s.decisionRow} style={{ marginTop: 8 }}>
        <select className={s.select} value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Junk reason" disabled={busy}>
          <option value="">Junk this company — pick a reason…</option>
          {JUNK_REASONS.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
        </select>
        <button type="button" className={`${s.btn} ${s.btnBad}`} disabled={busy || !reason} onClick={() => { run('junk', { reason }); setReason(''); }}>Junk</button>
      </div>
    </>
  );
}

/**
 * A pool company after enrichment (prototype p2c-pool-enrich.html, tab 5): the
 * score and level now and before the run, the three facts the run decides, and
 * when it was last read.
 */
function After({ c, p }: { c: NonNullable<CompanyResult['company']>; p: CompanyResult['provenance'] }) {
  const en = p?.enrichment ?? null;
  const level = (c.coverage_parts?.level ?? 'raw') as Level;
  const site = !c.domain_normalized ? null : !en ? 'not checked yet' : en.site === 'live' ? 'live' : en.site === 'js_only' ? 'live · JavaScript-only' : 'not live';
  return (
    <div className={e.card} style={{ padding: 14 }}>
      <div className={e.eyebrow}>Pool company · {(c.source_codes ?? []).map((x) => x.toUpperCase()).join(' · ') || 'no source'}</div>
      <div className={e.scoreRow}>
        <div className={e.big}>{c.coverage_score ?? '—'} <small>/ 100</small></div>
        <LevelBadge level={level} />
        {en?.before && <span className={e.muted}>was {en.before.score} · {LEVEL_LABEL[(en.before.level ?? 'raw') as Level] ?? en.before.level}</span>}
      </div>
      <div className={e.check}><span>Industry</span><span className={`${u.tag} ${c.industry_name ? u.tagOk : u.tagWarn}`}>{c.industry_name ?? 'not mapped yet'}</span></div>
      <div className={e.check}><span>Company or individual</span><span className={`${u.tag} ${c.is_individual === false ? u.tagOk : c.is_individual ? u.tagBad : u.tagWarn}`}>{c.is_individual === false ? 'company' : c.is_individual ? 'individual' : 'not decided yet'}</span></div>
      <div className={e.check}><span>Domain lookup</span><span className={`${u.tag} ${site === 'live' || site?.startsWith('live') ? u.tagOk : c.domain_normalized ? u.tagWarn : u.tagDim}`}>{c.domain_normalized ? `${c.domain_normalized} · ${site}` : 'no website — domain lookup later (E5)'}</span></div>
      <p className={e.muted} style={{ marginTop: 8 }}>
        {en ? <>Last refreshed {formatDate(en.refreshed_at)} · <Link href={runHref(en.event_id)}>enrichment run #{en.run_no}</Link>{en.site === 'not_live' && en.reason ? ` — ${en.reason}` : ''}</>
          : c.domain_normalized ? 'Not read by an enrichment run yet — start one from the pool page.' : 'Not readable until it has a website.'}
      </p>
    </div>
  );
}

/** Where each value came from: a delivery, or a run's page, model and confidence; a delivery wins and the site's value is named. */
function Provenance({ c, p }: { c: NonNullable<CompanyResult['company']>; p: CompanyResult['provenance'] }) {
  const shown = new Set((p?.rows ?? []).map((r) => r.field));
  const rest = Object.entries(c.field_sources ?? {}).filter(([f]) => !shown.has(f) && f !== 'industry_raw');
  return (
    <>
      <div className={s.dSecTitle}>Where each value came from</div>
      <div className={e.tableWrap}><table className={e.table}>
        <thead><tr><th>Field</th><th>Value</th><th>From</th></tr></thead>
        <tbody>
          {(p?.rows ?? []).map((r) => (
            <tr key={r.field}><td>{r.label}</td><td>{r.value}</td>
              <td><span className={e.mono}>{r.from}{r.wins_over && <> — <b className={e.wins}>wins</b> over the site&apos;s {r.wins_over}</>}</span></td></tr>
          ))}
          {rest.map(([f, w]) => (
            <tr key={f}><td>{FIELD_LABEL[f] ?? f}</td><td>{String((f === 'industry_id' ? c.industry_name : c[f]) ?? '—')}</td>
              <td><span className={e.mono}>{w.via ? `${w.source} (${w.via})` : `${w.source} delivery`}{w.as_of ? ` · ${formatDate(w.as_of)}` : ''}</span></td></tr>
          ))}
        </tbody>
      </table></div>
      <p className={e.note}>Where a delivery and the site disagree, the delivery wins (it ranks higher) and both are kept. The mini knowledge graph is drawn here in the second half of the release.</p>
    </>
  );
}

export function CompanyPanel({ companyId, onClose }: { companyId: string; onClose: () => void }) {
  const q = useCompany(companyId);
  return (
    <>
      <div className={s.overlay} onClick={onClose} />
      <aside className={s.drawer} role="dialog" aria-label="Company">
        <DataBoundary query={q} label="company" skeleton={<SkeletonRows rows={6} lines={2} />}
          isEmpty={(d) => !d?.company} empty="This company is no longer in the pool — it may have been merged by a person. Close and refresh the list.">
          {(d) => {
            const c = d.company!;
            const checks = c.complete_checks?.checks ?? [];
            return (
              <>
                <div className={s.dHead}>
                  <div>
                    <div className={s.dName}>{c.name}</div>
                    <div className={s.dMeta}>company #{c.id} · {(c.source_codes ?? []).join(' · ') || 'no source'}{c.admitted_at ? ` · in the pool since ${formatDate(c.admitted_at)}` : ''}</div>
                  </div>
                  <button type="button" className={s.dClose} onClick={onClose} aria-label="Close">×</button>
                </div>
                <After c={c} p={d.provenance} />
                <span className={`${u.tag} ${STATE_TAG[c.lifecycle_state] ?? u.tagDim}`}>{STATE_LABEL[c.lifecycle_state] ?? c.lifecycle_state}</span>

                <div style={{ marginTop: 12 }}><ScoreCard companyId={c.id} /></div>

                <div className={s.dSecTitle}>Why it is {c.lifecycle_state === 'complete' ? '' : 'not '}in the pool · Complete {c.complete_checks?.passed ?? '?'} of {c.complete_checks?.total ?? 8}</div>
                {checks.length ? (
                  <div className={s.checks}>
                    {checks.map((k) => (
                      <div key={k.key} className={s.check}>
                        <span className={`${s.checkDot} ${DOT[k.status]}`} aria-label={k.status} />
                        <span className={s.checkLabel}>{k.label}</span>
                        <span className={s.checkDetail}>{k.detail}</span>
                      </div>
                    ))}
                  </div>
                ) : <p className={s.muted}>Not tested yet — run the matching job from the pool page.</p>}
                <p className={s.muted} style={{ fontSize: 'var(--fs-sm)' }}>Amber is what enrichment fills (P2–P3). Red needs a decision.</p>

                <Decisions c={c} />

                <Provenance c={c} p={d.provenance} />

                <div className={s.dSecTitle}>Every row behind it</div>
                {d.sources.map((r) => (
                  <div key={r.id} className={s.field}>
                    <span className={s.fk}>{r.is_decision ? 'decided by a person' : `${r.source_code} · tier ${r.tier}`}</span>
                    <span className={s.fv}>{r.is_decision ? String((r.raw as any)?.decision ?? 'decision') : `${r.name}${r.city ? ` · ${r.city}` : ''}${r.industry_raw ? ` · “${r.industry_raw}”` : ''}`}
                      <span className={s.muted}> · {r.load_label}{r.load_status !== 'active' ? ` (${r.load_status})` : ''}{r.as_of ? ` · ${formatDate(r.as_of)}` : ''}</span></span>
                  </div>
                ))}
              </>
            );
          }}
        </DataBoundary>
      </aside>
    </>
  );
}
