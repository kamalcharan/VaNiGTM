'use client';

/**
 * Settings → Platform models (admin only) — POA release 2, P2-R.
 *
 * Several models serve enrichment, by route. `.env` declares what each one IS
 * (model, window, quota, data terms; the key never leaves the server); this
 * tab is where the admin decides whether enrichment may USE it (Charan,
 * 2026-10-02: "whatever are on, will run"). A model nobody has switched on is
 * off — nothing new is used, or paid for, by accident.
 *
 * The routes are shown as they would run RIGHT NOW for each kind of data, so
 * "why did this run go to qwen?" is answered here, with the reason for every
 * model it passed over.
 *
 * Switching Haiku on spends money, so it asks once more in place.
 */

import { Fragment, useState } from 'react';
import { useAuth } from '@/context/auth-provider';
import { IS_LIVE } from '@/lib/live-transport';
import { DataBoundary, InlineLoader, SkeletonRows } from '@/platform/feedback';
import { formatDateTime } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import f from './settings.module.css';
import s from './model-provider.module.css';
import m from './platform-models.module.css';
import {
  useRouterOverview, useRouterWrites,
  type DataClass, type RouterOverview, type RouterProvider, type ProviderStateName, type TestResult,
} from '../useModelRouter';

const STATE: Record<ProviderStateName, { label: string; cls: string }> = {
  serving:      { label: 'Serving',       cls: u.tagOk },
  off:          { label: 'Off',           cls: u.tagDim },
  cooling_down: { label: 'Cooling down',  cls: u.tagWarn },
  quota_spent:  { label: 'Quota spent',   cls: u.tagWarn },
};
const TERMS: Record<RouterProvider['data_terms'], { label: string; cls: string }> = {
  no_training: { label: 'No training', cls: u.tagOk },
  may_train:   { label: 'May train',   cls: u.tagBad },
  unknown:     { label: 'Unknown',     cls: u.tagWarn },
};
const CLASSES: Array<{ id: DataClass; label: string }> = [
  { id: 'public_company', label: 'Pool company facts' },
  { id: 'tenant', label: "A tenant's list" },
  { id: 'people', label: 'People' },
];
const ROUTE_LABEL = { high: 'High · judgement (industry, offers, does this domain belong to this company)', medium: 'Medium', low: 'Low · short extraction, normalising' };
const n = (v: number) => v.toLocaleString('en-US');

export default function PlatformModels() {
  const { tenant } = useAuth();
  const isAdmin = !IS_LIVE || tenant?.is_admin === true;
  const q = useRouterOverview(isAdmin);

  if (!isAdmin) {
    return (
      <div>
        <h2 className={f.h2}>Platform models</h2>
        <section className={u.card}>
          <div className={s.body}>
            <p className={s.note}>The models that serve enrichment are managed by Vikuna&rsquo;s admin. Your own model, if you bring one, is under <strong>Model</strong>.</p>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div>
      <h2 className={f.h2}>Platform models</h2>
      <p className={u.lede}>
        The models that serve enrichment, in the order each route tries them. Switch a model on and the next
        enrichment call may use it; switch it off and new calls pass it by. Its URL, key, window, quota and data
        terms come from the server&rsquo;s settings and are only shown here.
      </p>
      <DataBoundary query={q} label="the platform models" skeleton={<SkeletonRows rows={5} />}
        isEmpty={(d) => d.providers.length === 0}
        empty={<p className={s.note}>No model is configured. Add providers and routes to the server&rsquo;s .env (LLM_PROVIDERS, LLM_ROUTE_*) and restart it.</p>}>
        {(d) => <Overview data={d} />}
      </DataBoundary>
    </div>
  );
}

function Overview({ data }: { data: RouterOverview }) {
  const { toggle, test } = useRouterWrites();
  const [confirmPaid, setConfirmPaid] = useState<string | null>(null);
  const [tests, setTests] = useState<Record<string, TestResult>>({});
  const [dc, setDc] = useState<DataClass>('tenant');

  async function flip(p: RouterProvider, on: boolean) {
    if (on && p.paid && confirmPaid !== p.code) { setConfirmPaid(p.code); return; }
    setConfirmPaid(null);
    await toggle.mutate({ provider_code: p.code, enabled: on });
  }
  async function runTest(code: string) {
    const r = await test.mutate({ provider_code: code });
    if (r) setTests((t) => ({ ...t, [code]: r }));
  }

  return (
    <>
      <section className={u.card}>
        <div className={u.cardHead}>Models<span className={u.cardMeta}>a model with no switch yet is off</span></div>
        <div className={`${s.body} ${m.wrap}`}>
          <table className={`${s.rows} ${m.rows}`}>
            <thead>
              <tr><th>Model</th><th className={m.num}>Window</th><th>Data terms</th><th className={m.num}>Today</th><th>State</th><th>Enrichment</th></tr>
            </thead>
            <tbody>
              {data.providers.map((p) => (
                <Fragment key={p.code}>
                <tr>
                  <td className={m.cellPad}>
                    <span className={m.code}>{p.code}</span>{p.paid && <> <span className={`${u.tag} ${u.tagWarn}`}>Paid</span></>}
                    <span className={m.sub}>{p.model} · {p.host}</span>
                    {tests[p.code] && (
                      <div className={m.result}>
                        {tests[p.code].ok ? `Answered “${tests[p.code].answer}” in ${(tests[p.code].latency_ms / 1000).toFixed(1)}s.` : `Did not answer: ${tests[p.code].error}`}
                      </div>
                    )}
                  </td>
                  <td className={m.num}>{p.ctx ? n(p.ctx) : '—'}</td>
                  <td><span className={`${u.tag} ${TERMS[p.data_terms].cls}`}>{TERMS[p.data_terms].label}</span></td>
                  <td className={m.num}>
                    {n(p.calls_today)}{p.daily ? ` / ${n(p.daily)}` : ''}
                    <span className={m.sub}>{p.rpm ? `${p.calls_minute}/${p.rpm} this minute` : 'no limit declared'}</span>
                  </td>
                  <td>
                    <span className={`${u.tag} ${STATE[p.state].cls}`}>{STATE[p.state].label}</span>
                    {p.cooldown_until && <span className={m.sub}>until {formatDateTime(p.cooldown_until)}</span>}
                  </td>
                  <td>
                    <div className={s.actions}>
                      <button type="button" className={p.enabled ? `${s.btn} ${s.btnDanger}` : `${s.btn} ${s.btnPrimary}`}
                        disabled={toggle.isPending} onClick={() => flip(p, !p.enabled)}
                        aria-label={`${p.enabled ? 'Switch off' : 'Switch on'} ${p.code} for enrichment`}>
                        {p.enabled ? 'Switch off' : 'Switch on'}
                      </button>
                      {!p.paid && (
                        <button type="button" className={s.btn} disabled={test.isPending} onClick={() => runTest(p.code)}>
                          {test.isPending ? <InlineLoader size="sm" message="Testing…" /> : 'Test'}
                        </button>
                      )}
                    </div>
                    {p.switched_at && <span className={m.sub}>{p.enabled ? 'on' : 'off'} since {formatDateTime(p.switched_at)}{p.switched_by ? ` · ${p.switched_by}` : ''}</span>}
                  </td>
                </tr>
                {confirmPaid === p.code && (
                  <tr>
                    <td colSpan={6}>
                      <div className={m.confirm}>
                        <p className={s.note}><strong>{p.code} is paid per token.</strong> With it on, an enrichment call that every free model passes by is answered by {p.code}, and Vikuna is billed. Every such call is recorded and shown in its run.</p>
                        <div className={s.actions}>
                          <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={toggle.isPending} onClick={() => flip(p, true)}>
                            {toggle.isPending ? <InlineLoader size="sm" message="Switching on…" /> : 'Yes, switch on'}
                          </button>
                          <button type="button" className={s.btn} onClick={() => setConfirmPaid(null)}>Cancel</button>
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className={s.note}>
            Tenant lists go only to models whose terms say they do not train on prompts; people data never goes to an
            outside model. Test makes one tiny call to a free model, whether or not it is switched on — it counts
            against that model&rsquo;s quota like any call.
          </p>
        </div>
      </section>

      <section className={u.card} style={{ marginTop: 16 }}>
        <div className={u.cardHead}>Routes, as they would run now</div>
        <div className={s.body}>
          <div className={m.chips} role="group" aria-label="Kind of data">
            {CLASSES.map((c) => (
              <button key={c.id} type="button" className={m.chip} aria-pressed={dc === c.id} onClick={() => setDc(c.id)}>{c.label}</button>
            ))}
          </div>
          {data.routes.map((r) => {
            const pl = r.plan[dc];
            const reason = new Map(pl.skipped.map((x) => [x.code, x.reason]));
            return (
              <div key={r.route}>
                <div className={m.routeHead}>{ROUTE_LABEL[r.route]}</div>
                <div className={m.route}>
                  {r.order.map((code, i) => (
                    <span key={code} style={{ display: 'contents' }}>
                      {i > 0 && <span className={m.arr} aria-hidden>→</span>}
                      <span className={reason.has(code) ? `${m.hop} ${m.hopSkip}` : m.hop}>{code}</span>
                    </span>
                  ))}
                </div>
                {pl.skipped.length > 0 && (
                  <ul className={m.reasons}>{pl.skipped.map((x) => <li key={x.code}><strong>{x.code}</strong>: {x.reason}</li>)}</ul>
                )}
                {pl.serves.length === 0 && (
                  <div className={m.stop}>No model can take this call right now. Enrichment steps on this route stop and say so — they are not sent to a model that is off, and nothing is guessed. Switch one on above.</div>
                )}
              </div>
            );
          })}
          <p className={s.note}>A route moves to the next model when one answers 429, times out or fails, and when an answer fails validation. Each move is a step in the run.</p>
        </div>
      </section>

      <section className={u.card} style={{ marginTop: 16 }}>
        <div className={u.cardHead}>Today, by route<span className={u.cardMeta}>since 00:00 UTC</span></div>
        <div className={`${s.body} ${m.wrap}`}>
          {data.usage.length === 0 ? (
            <p className={s.note}>No routed calls yet today. They appear here as soon as an enrichment run starts — switch a model on above first.</p>
          ) : (
            <table className={`${s.rows} ${m.rows}`}>
              <thead><tr><th>Route</th><th>Model</th><th className={m.num}>Calls</th><th className={m.num}>Moved on</th><th className={m.num}>Bad answers</th><th className={m.num}>Tokens</th></tr></thead>
              <tbody>
                {data.usage.map((x) => (
                  <tr key={`${x.route}-${x.provider_code}`}>
                    <td>{x.route}</td><td>{x.provider_code}</td><td className={m.num}>{n(x.calls)}</td>
                    <td className={m.num}>{n(x.moved_on)}</td><td className={m.num}>{n(x.bad)}</td><td className={m.num}>{n(x.tokens)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {data.history.length > 0 && (
        <section className={u.card} style={{ marginTop: 16 }}>
          <div className={u.cardHead}>Switch history<span className={u.cardMeta}>every change kept, newest first</span></div>
          <div className={s.body}>
            <table className={s.rows}>
              <tbody>
                {data.history.map((h, i) => (
                  <tr key={`${h.provider_code}-${h.changed_at}-${i}`}>
                    <th>{formatDateTime(h.changed_at)}</th>
                    <td>{h.provider_code} switched {h.enabled ? 'on' : 'off'}{h.changed_by_name ? ` by ${h.changed_by_name}` : ''}{h.note ? ` — ${h.note}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
