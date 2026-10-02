'use client';
/**
 * Settings → Scoring (release 3; D-Q4–D-Q7, S17).
 *
 * How this workspace's companies are scored 0–100: the seven parts and their
 * weights. A workspace uses the platform default until an owner or admin saves
 * its own; it may change the PART weights only — the split inside each part
 * and the level boundaries stay the platform's, so a level means the same
 * thing everywhere. Saving re-scores its companies (arithmetic, no tokens).
 *
 * Admin tenants also edit the platform default here: it scores the common pool
 * and every workspace that follows it.
 *
 * The Exit gate is not on this screen on purpose (D-Q6): a workspace can
 * change how a company scores, never what it takes to be contacted.
 */
import { useEffect, useMemo, useState } from 'react';
import { DataBoundary, InlineLoader, SkeletonRows } from '@/platform/feedback';
import { formatDateTime } from '@/lib/format';
import u from '@/platform/shell/ui.module.css';
import f from './settings.module.css';
import s from './model-provider.module.css';
import sc from '@/skills/scoring/scoring.module.css';
import {
  LEVELS, LEVEL_LABEL, useScoringLevels, useScoringProfile, useScoringWrites,
  type LevelCounts, type PartKey, type PartWeights, type ProfileView,
} from '@/skills/scoring/useScoring';

export default function ScoringSettings() {
  const q = useScoringProfile();
  return (
    <div>
      <h2 className={f.h2}>Scoring</h2>
      <p className={u.lede}>
        Every company gets a readiness score from 0 to 100 in seven parts, and a level. Qualified needs the company
        to pass the Complete test; Campaign-ready needs the Exit gate — a named person, a lawful basis and a verified channel.
      </p>
      <DataBoundary query={q} label="scoring" skeleton={<SkeletonRows rows={6} />}>
        {(d) => <Profile d={d} />}
      </DataBoundary>
      <Levels />
    </div>
  );
}

function Weights({ parts, value, onChange, disabled }: { parts: ProfileView['parts']; value: PartWeights; onChange: (w: PartWeights) => void; disabled: boolean }) {
  const total = Object.values(value).reduce((a, b) => a + (Number(b) || 0), 0);
  return (
    <>
      <div className={sc.weights}>
        {parts.map((p) => (
          <label key={p.key} className={sc.weight}>
            {p.label}
            <input type="number" min={0} max={100} step={1} value={value[p.key]} disabled={disabled}
              onChange={(e) => onChange({ ...value, [p.key]: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
          </label>
        ))}
      </div>
      <p className={s.note}>Total: <strong className={`${sc.sum} ${total === 100 ? '' : sc.sumBad}`}>{total}</strong> of 100{total !== 100 && ' — the weights must add up to exactly 100 before they can be saved.'}</p>
    </>
  );
}

function Profile({ d }: { d: ProfileView }) {
  const { save, follow, savePlatform, rescore } = useScoringWrites();
  const [w, setW] = useState<PartWeights>(d.in_force.part_weights);
  const [pw, setPw] = useState<PartWeights>(d.platform.part_weights);
  useEffect(() => { setW(d.in_force.part_weights); }, [d.in_force.part_weights]);
  useEffect(() => { setPw(d.platform.part_weights); }, [d.platform.part_weights]);
  const sum = (x: PartWeights) => Object.values(x).reduce((a, b) => a + b, 0);
  const dirty = useMemo(() => (Object.keys(w) as PartKey[]).some((k) => w[k] !== d.in_force.part_weights[k]), [w, d]);
  const pDirty = useMemo(() => (Object.keys(pw) as PartKey[]).some((k) => pw[k] !== d.platform.part_weights[k]), [pw, d]);
  const f_ = d.in_force;

  return (
    <>
      <section className={u.card}>
        <div className={u.cardHead}>
          This workspace
          <span className={`${u.tag} ${f_.own ? u.tagOk : u.tagDim}`}>{f_.own ? `Your own · v${f_.version}` : `Platform default · v${f_.version}`}</span>
        </div>
        <div className={s.body}>
          <p className={s.note}>
            {f_.own
              ? <>You use your own weights (version {f_.version}, based on platform v{f_.based_on_version}). Levels follow the platform's v{f_.platform_version}.</>
              : <>You use the platform default and follow its future versions. Change a weight and save to use your own.</>}
          </p>
          {f_.own && f_.platform_changed && (
            <div className={s.note} role="status">
              <strong>The platform default changed</strong> since your weights were based on it (v{f_.based_on_version} → v{d.platform.version}).
              Its weights now: {d.parts.map((p) => `${p.label} ${d.platform.part_weights[p.key]}`).join(' · ')}.
              <div className={s.actions} style={{ marginTop: 8 }}>
                <button type="button" className={s.btn} disabled={follow.isPending || !d.can_edit} onClick={() => void follow.mutate({})}>Adopt the platform default</button>
                <span className={sc.muted}>or keep yours — nothing changes unless you choose.</span>
              </div>
            </div>
          )}
          <Weights parts={d.parts} value={w} onChange={setW} disabled={!d.can_edit} />
          {!d.can_edit && <p className={s.note}>Only a workspace owner or admin can change these.</p>}
          {d.can_edit && (
            <div className={s.actions}>
              <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={!dirty || sum(w) !== 100 || save.isPending} onClick={() => void save.mutate({ part_weights: w })}>
                {save.isPending ? <InlineLoader size="sm" message="Saving…" /> : 'Save and re-score'}
              </button>
              {dirty && <button type="button" className={s.btn} onClick={() => setW(d.in_force.part_weights)}>Undo changes</button>}
              {f_.own && !f_.platform_changed && (
                <button type="button" className={s.btn} disabled={follow.isPending} onClick={() => void follow.mutate({})}>Back to the platform default</button>
              )}
              <button type="button" className={s.btn} disabled={rescore.isPending} onClick={() => void rescore.mutate({ scope: 'tenant' })}>Re-score now</button>
            </div>
          )}
        </div>
      </section>

      <section className={u.card} style={{ marginTop: 16 }}>
        <div className={u.cardHead}>What earns each part<span className={u.cardMeta}>the platform's split · v{d.platform.version}</span></div>
        <div className={s.body}>
          <table className={s.rows}>
            <tbody>
              {d.parts.map((p) => (
                <tr key={p.key}>
                  <th>{p.label}</th>
                  <td>{p.items.map((it) => `${it.label} (${d.platform.item_weights[p.key]?.[it.key] ?? 0})`).join(' · ')}</td>
                </tr>
              ))}
              <tr><th>Levels</th><td>{LEVELS.slice(1).map((l) => `${LEVEL_LABEL[l]} from ${d.platform.level_bounds[l as Exclude<typeof l, 'raw'>]}`).join(' · ')}</td></tr>
            </tbody>
          </table>
          <p className={s.note}>The numbers in brackets split a part between its items. Freshness is not scored — every record shows when it was last refreshed instead.</p>
        </div>
      </section>

      {d.can_edit_platform && (
        <section className={u.card} style={{ marginTop: 16 }}>
          <div className={u.cardHead}>Platform default<span className={`${u.tag} ${u.tagWarn}`}>Admin</span></div>
          <div className={s.body}>
            <p className={s.note}>Scores the common pool, and every workspace that has not saved its own. A save is a new version; workspaces with their own weights are told it changed and choose whether to adopt it.</p>
            <Weights parts={d.parts} value={pw} onChange={setPw} disabled={false} />
            <div className={s.actions}>
              <button type="button" className={`${s.btn} ${s.btnPrimary}`} disabled={!pDirty || sum(pw) !== 100 || savePlatform.isPending}
                onClick={() => void savePlatform.mutate({ part_weights: pw })}>
                {savePlatform.isPending ? <InlineLoader size="sm" message="Saving…" /> : `Save as platform v${d.platform.version + 1}`}
              </button>
              <button type="button" className={s.btn} disabled={rescore.isPending} onClick={() => void rescore.mutate({ scope: 'pool' })}>Re-score the common pool</button>
            </div>
          </div>
        </section>
      )}

      {d.history.length > 0 && (
        <section className={u.card} style={{ marginTop: 16 }}>
          <div className={u.cardHead}>History<span className={u.cardMeta}>every version kept, newest first</span></div>
          <div className={s.body}>
            <table className={s.rows}>
              <tbody>
                {d.history.map((h, i) => (
                  <tr key={`${h.scope}-${h.version}-${i}`}>
                    <th>{formatDateTime(h.saved_at)}</th>
                    <td>
                      {h.scope === 'platform' ? `Platform default v${h.version}` : h.follows_platform ? `Back to the platform default (v${h.version})` : `Your weights v${h.version}`}
                      {h.saved_by_name ? ` — ${h.saved_by_name}` : ''}{h.note ? ` · ${h.note}` : ''}
                    </td>
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

function Levels() {
  const q = useScoringLevels();
  return (
    <section className={u.card} style={{ marginTop: 16 }}>
      <div className={u.cardHead}>Where companies stand</div>
      <DataBoundary query={q} label="the levels" skeleton={<SkeletonRows rows={2} />}>
        {(d) => (
          <div className={s.body}>
            <Stack title="Your companies" c={d.tenant} empty="No companies yet — import a list under GTM → Import a list, and they are scored as they land." />
            {d.pool && <Stack title="Common pool (admin)" c={d.pool} empty="The pool has no companies yet." />}
          </div>
        )}
      </DataBoundary>
    </section>
  );
}

function Stack({ title, c, empty }: { title: string; c: LevelCounts; empty: string }) {
  if (!c.total) return <p className={s.note}><strong>{title}:</strong> {empty}</p>;
  return (
    <div>
      <p className={s.note}><strong>{title}</strong> · {c.total.toLocaleString('en-US')} companies · average {c.average ?? '—'}{c.unscored ? ` · ${c.unscored.toLocaleString('en-US')} not scored yet — press Re-score now` : ''}</p>
      <div className={sc.stack} aria-hidden>
        {LEVELS.map((l) => <i key={l} className={sc[`s_${l}`]} style={{ width: `${(c.by_level[l] / c.total) * 100}%` }} />)}
      </div>
      <div className={sc.legend}>{LEVELS.map((l) => <span key={l}><b className={sc[`s_${l}`]} />{LEVEL_LABEL[l]} {c.by_level[l].toLocaleString('en-US')}</span>)}</div>
    </div>
  );
}
