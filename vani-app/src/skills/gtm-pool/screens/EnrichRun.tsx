'use client';
/**
 * /agents/gtm/pool/runs/[eventId] — one enrichment run (prototype
 * p2c-pool-enrich.html). While it runs: tab 3, Live — the feed, before and
 * now, read / unreadable / abstained. Once it has finished: tab 4, What it did
 * — before and after, by part, the models, what was not read and why, and
 * withdraw. The run lives on the worker; this page only reads it (polling
 * while it is queued or running), so leaving it changes nothing.
 */
import { useState } from 'react';
import Link from 'next/link';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { formatDate, formatDateTime } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import s from '../pool.module.css';
import e from '../enrich.module.css';
import { fmt, useEnrichRun, useEnrichWrites, type RunView } from '../useEnrich';
import { BeforeAfter, PartsBeforeAfter } from './EnrichParts';
import { CompanyPanel } from './CompanyPanel';
import { PoolGate, useIsPoolAdmin } from './PoolParts';

const AMBER = new Set(['move', 'bad', 'skip']);

function Feed({ r }: { r: RunView }) {
  if (!r.feed.length) return <p className={e.muted}>{r.status === 'queued' ? 'Waiting for the worker to pick the run up…' : 'No steps yet.'}</p>;
  return (
    <div className={e.feed}>
      {r.feed.map((f, i) => (
        <div key={`${f.ts}-${i}`} className={e.step}>
          <span className={e.stepKind}>{f.kind}</span>
          <span className={AMBER.has(f.kind) || f.status === 'error' ? e.move : undefined}>{f.text}{f.model && <span className={e.model}>{f.model}</span>}</span>
        </div>
      ))}
    </div>
  );
}

function Live({ r }: { r: RunView }) {
  const pct = r.progress.total ? (100 * r.progress.done) / r.progress.total : 0;
  return (
    <div className={e.grid}>
      <div className={e.card}>
        <h2 className={e.h2}>Run #{r.run_no} · {r.delivery_label} · {fmt(r.records)} companies</h2>
        <div className={e.bar}><span style={{ width: `${pct}%` }} /></div>
        <p className={e.muted}>{r.status === 'queued' ? 'Queued — the worker starts it shortly.' : `${fmt(r.progress.done)} of ${fmt(r.progress.total)} companies`}</p>
        <Feed r={r} />
      </div>
      <div className={e.card}>
        <h2 className={e.h2}>As it goes</h2>
        <BeforeAfter before={r.before} after={r.now} afterLabel="Now" />
        <div className={e.grid3} style={{ marginTop: 12 }}>
          <div><div className={e.eyebrow}>Read</div><div className={e.big}>{fmt(r.counts.read)}</div></div>
          <div><div className={e.eyebrow}>Unreadable</div><div className={e.big}>{fmt(r.counts.unreadable)}</div></div>
          <div><div className={e.eyebrow}>Abstained</div><div className={e.big}>{fmt(r.counts.abstained)}</div></div>
        </div>
        <p className={e.note}>You can leave this page. The run continues on the worker and resumes where it stopped if the worker restarts.</p>
      </div>
    </div>
  );
}

function Withdraw({ r }: { r: RunView }) {
  const { withdraw } = useEnrichWrites();
  const [confirming, setConfirming] = useState(false);
  if (r.withdrawn_at) {
    return (
      <div className={e.decision}>
        <h3 className={e.h3}>Withdrawn</h3>
        <p>Withdrawn on {formatDateTime(r.withdrawn_at)}. Every value this run wrote was taken back and the {fmt(r.touched)} companies it touched were re-scored from what was delivered. The numbers above are what the run did at the time.</p>
      </div>
    );
  }
  return (
    <div className={e.decision}>
      <h3 className={e.h3}>Withdraw this run?</h3>
      <p>Takes back every value this run wrote and re-scores the {fmt(r.touched)} companies it touched. Delivered data is untouched. The run stays in the history, marked withdrawn.</p>
      <div className={e.actions}>
        {!confirming
          ? <button type="button" className={e.btn} onClick={() => setConfirming(true)}>Withdraw run #{r.run_no}</button>
          : <>
              <button type="button" className={`${e.btn} ${e.btnBad}`} disabled={withdraw.isPending} onClick={async () => { await withdraw.mutate({ event_id: r.event_id }); setConfirming(false); }}>{withdraw.isPending ? 'Withdrawing…' : `Yes — withdraw run #${r.run_no}`}</button>
              <button type="button" className={e.btn} disabled={withdraw.isPending} onClick={() => setConfirming(false)}>Keep it</button>
            </>}
      </div>
    </div>
  );
}

function WhatItDid({ r, onOpen }: { r: RunView; onOpen: (id: string) => void }) {
  const mins = r.duration_ms != null ? Math.max(1, Math.round(r.duration_ms / 60000)) : null;
  const bad = r.models.filter((m) => m.bad > 0);
  return (
    <div className={e.grid}>
      <div className={`${e.card} ${e.wide}`}>
        <div className={e.headRow}>
          <h2 className={e.h2} style={{ margin: 0 }}>Run #{r.run_no} — what it did</h2>
          <span className={e.muted}>{formatDate(r.started_at ?? r.created_at)}{mins != null ? ` · ${fmt(mins)} min` : ''} · {fmt(r.progress.done)} records · {fmt(r.tokens)} tokens · {r.paid_tokens ? `${fmt(r.paid_tokens)} paid tokens (Haiku)` : '₹0'}</span>
        </div>
        <BeforeAfter before={r.before} after={r.now} afterLabel="After" />
        {r.stopped && <p className={e.note} style={{ color: 'var(--warn)' }}>Stopped early: no model was left for this route today. {fmt(r.counts.not_reached)} companies were not reached and were released from today&apos;s records. {r.stopped.split(' — ')[1]?.split('. Nothing')[0] ?? ''}</p>}
      </div>
      <div className={e.card}>
        <h2 className={e.h2}>By part, average</h2>
        <PartsBeforeAfter before={r.before} after={r.now} />
      </div>
      <div className={e.card}>
        <h2 className={e.h2}>Models</h2>
        {r.models.length ? r.models.map((m) => (
          <div key={m.provider} className={e.row}><span>{m.provider} · {m.model}</span>
            <span>{fmt(m.companies)} companies · {fmt(m.tokens)} tokens{m.quota_spent ? ' (then quota spent)' : ''}</span></div>
        )) : <p className={e.muted}>No model was called — nothing this run reached needed one.</p>}
        <div className={e.row}><span>Bad answers moved on</span><span>{fmt(r.bad_answers)}{bad.length ? ` (${bad.map((m) => `${m.bad} ${m.provider}`).join(', ')})` : ''}</span></div>
        <p className={e.note}>Every value names the model that read it. Release 5 adds the test set each model must pass per step.</p>
      </div>
      <div className={`${e.card} ${e.wide}`}>
        <h2 className={e.h2}>Not read — and why</h2>
        <div className={e.tableWrap}><table className={e.table}>
          <thead><tr><th>Reason</th><th className={e.num}>Companies</th><th>Next</th></tr></thead>
          <tbody>
            <tr><td>Site is JavaScript-only — nothing to read without a browser (E6)</td><td className={e.num}>{fmt(r.counts.js_only)}</td><td className={e.muted}>the headless reader, later</td></tr>
            <tr><td>Site down or a parked domain</td><td className={e.num}>{fmt(r.counts.not_live)}</td><td className={e.muted}>marked &quot;website not live&quot;; domain lookup later (E5)</td></tr>
            <tr><td>Read, but no model was sure enough — nothing written</td><td className={e.num}>{fmt(r.counts.abstained)}</td>
              <td className={e.muted}>waits for a person in the review list{r.abstained.length > 0 && <>: {r.abstained.slice(0, 8).map((a, i) => <span key={a.company_id}>{i ? ', ' : ''}<button type="button" className={s.link} onClick={() => onOpen(a.company_id)}>{a.name}</button></span>)}{r.abstained.length > 8 ? ` +${r.abstained.length - 8}` : ''}</>}</td></tr>
            {r.counts.failed > 0 && <tr><td>Failed — the step said why in the run</td><td className={e.num}>{fmt(r.counts.failed)}</td><td className={e.muted}>each one is a &quot;bad&quot; line in the feed</td></tr>}
            {r.counts.not_reached > 0 && <tr><td>Not reached — no model left today</td><td className={e.num}>{fmt(r.counts.not_reached)}</td><td className={e.muted}>start another run when a quota resets</td></tr>}
          </tbody>
        </table></div>
        <Withdraw r={r} />
      </div>
      <div className={`${e.card} ${e.wide}`}>
        <h2 className={e.h2}>The run, step by step</h2>
        <Feed r={r} />
      </div>
    </div>
  );
}

export default function EnrichRun({ eventId }: { eventId: string }) {
  const isAdmin = useIsPoolAdmin();
  const q = useEnrichRun(eventId);
  const [open, setOpen] = useState<string | null>(null);
  if (!isAdmin) return <PoolGate title="An enrichment run" />;
  return (
    <div className={s.wrap}>
      <div>
        <div className={u.eyebrow}>// GTM · SHARED DATA · ADMIN</div>
        <h1 className={u.h1}>Enrichment run</h1>
        <nav className={s.crumbs}><Link href="/agents/gtm/pool">← Common pool</Link></nav>
      </div>
      <DataBoundary query={q} label="the run" skeleton={<SkeletonRows rows={6} lines={2} />} isEmpty={(d) => !d?.run}
        empty="No enrichment run has this id. Go back to the common pool and open one from its Runs list.">
        {(d) => {
          const r = d.run!;
          if (r.status === 'failed') {
            return (
              <div className={e.card}>
                <h2 className={e.h2}>Run #{r.run_no} failed</h2>
                <p className={e.muted}>{r.error ?? 'The worker reported a failure without a reason.'} What it read before failing is kept and counted below; start a new run from the pool page for the rest.</p>
                <Feed r={r} />
              </div>
            );
          }
          return r.status === 'queued' || r.status === 'running' ? <Live r={r} /> : <WhatItDid r={r} onOpen={setOpen} />;
        }}
      </DataBoundary>
      {open && <CompanyPanel companyId={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
