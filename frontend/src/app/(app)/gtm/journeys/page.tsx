'use client';

/**
 * The journey board — what is owed today, on which company.
 *
 * ── WHY DEBTS, NOT STATUSES ───────────────────────────────────────────
 *
 * The backend computes what each journey is OWED — "rule on the brief",
 * "find the person", "write the story", "decide another story or stop" —
 * not just what state it is in. Every board shows status; this shows
 * debt. That was the design ruling in journey-cycle.html and it survives
 * here as: the row leads with a VERB, not a name.
 *
 * The strip above the list is the shape of the whole cohort. Ticks in
 * each state band SINK as they age — a fortnight in `qualified` and the
 * tick physically drops out of the band, so the reviewer sees stalling
 * without running a report.
 *
 * Clicking a row opens the drawer with everything the pilot needs to
 * work that account end to end — brief, contact, stories, compose, log.
 */

import { useMemo, useState } from 'react';
import { useSkillQuery } from '@/hooks/useSkill';
import { VdfPageHeader, VdfLoader, VdfEmptyState } from '@/components/vdf';
import { JourneyDrawer } from './JourneyDrawer';
import s from './journeys.module.css';

/* ── The verb & rank tables. Same words the prototype used. ──────────── */

const VERB: Record<string, string> = {
  sourced: 'RESEARCH', researched: 'RULE', qualified: 'FIND',
  addressed: 'WRITE', ready: 'SEND', waiting: 'WAIT',
  answered: 'DECIDE', won: 'HAND OVER',
  ruled_out: 'RULED OUT', parked: 'PARKED', lost: 'LOST',
};
const LADDER = ['sourced', 'researched', 'qualified', 'addressed', 'ready', 'waiting', 'answered', 'won'];
const EXIT_STATES = new Set(['ruled_out', 'parked', 'lost']);
const ACTIVE = (state: string) => !EXIT_STATES.has(state) && state !== 'won';

/** Debt precedence: answered outranks a still-owed decision, and stale
 *  outranks fresh within a state. Same rule journey-cycle.html used. */
const DEBT_RANK: Record<string, number> = {
  answered: 0, addressed: 1, ready: 2, qualified: 3, researched: 4, sourced: 5, waiting: 6,
};

interface JourneyRow {
  id: number; prospect_id: number; name: string;
  state: string; owed: string | null;
  entered_state_at: string;
  offer: string | null; ref: string | null;
  industry_raw: string | null; city: string | null;
  brief_id?: number | null; brief_status?: string | null; brief_hook?: string | null;
  contact_name?: string | null;
}

interface CountsShape {
  [state: string]: { n: number; due: number; owed: string };
}

/** Days-in-state — the number every row and every tick uses. */
function daysSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 86_400_000));
}
/** How far a tick sinks in its band. 0–3 days floats; over 14 hangs low. */
function sinkClass(days: number): string {
  if (days <= 3) return '';
  if (days <= 7) return 'tickD1';
  if (days <= 14) return 'tickD2';
  return 'tickD3';
}

export default function JourneysPage() {
  const [selBand, setSelBand] = useState<string | null>(null);
  const [drawerJourney, setDrawerJourney] = useState<JourneyRow | null>(null);

  // Bumped when the drawer moves the journey — same query key, so react-query
  // refetches naturally. useSkillMutation already invalidates 'skill', so
  // this is just belt + braces for the moment the drawer closes.
  const { data, isLoading, error, refetch } = useSkillQuery<{
    journeys: JourneyRow[]; counts: CountsShape; total: number;
  }>('journey-skill', 'list_journeys', { limit: 200 });

  const journeys = data?.data?.journeys ?? [];
  const counts = data?.data?.counts ?? {};

  /* ── The strip ─────────────────────────────────────────────────────
   * Ticks lay out by seq-in-band on x, and by dwell on y. Absolute
   * positioning so a wide band with two ticks looks the same as a
   * narrow band with two. */
  const strip = LADDER.map((state) => {
    const inBand = journeys.filter((j) => j.state === state);
    const n = inBand.length;
    const depths = [10, 34, 60, 82]; // %; matches sinkClass 0..3
    const ticks = inBand.map((j, i) => {
      const days = daysSince(j.entered_state_at);
      const idx = days <= 3 ? 0 : days <= 7 ? 1 : days <= 14 ? 2 : 3;
      const w = Math.max(14, Math.min(34, 76 / Math.max(n, 1)));
      const left = n === 1 ? 50 : 14 + (i * (72 / (n - 1)));
      return (
        <span key={j.id} className={`${s.tick} ${s[sinkClass(days)] ?? ''}`}
          style={{ left: `${left}%`, top: `${depths[idx]}%`, width: `${w}%`, transform: 'translateX(-50%)' }}
          title={`${j.name} · ${days}d in ${state}`} />
      );
    });
    return { state, n, ticks };
  });

  const stalled = journeys.filter((j) => ACTIVE(j.state) && daysSince(j.entered_state_at) >= 8).length;
  const quiet = journeys.filter((j) => !ACTIVE(j.state)).length;

  /* ── The ranked list ─────────────────────────────────────────────── */
  const ranked = useMemo(() => {
    const list = selBand
      ? journeys.filter((j) => j.state === selBand)
      : journeys.filter((j) => ACTIVE(j.state) && j.state !== 'waiting');
    return [...list].sort((a, b) => {
      const ra = DEBT_RANK[a.state] ?? 9;
      const rb = DEBT_RANK[b.state] ?? 9;
      if (ra !== rb) return ra - rb;
      return daysSince(b.entered_state_at) - daysSince(a.entered_state_at);
    });
  }, [journeys, selBand]);

  const waitingList = selBand ? [] : journeys.filter((j) => j.state === 'waiting');
  const quietList = selBand ? [] : journeys.filter((j) => !ACTIVE(j.state));

  return (
    <div className={s.body}>
      <VdfPageHeader
        eyebrow="JOURNEYS"
        title={selBand ? `${ranked.length} in ${selBand.replace('_', ' ')}` : `${ranked.length} owed today`}
        meta={selBand
          ? 'Filtered to one state. Click the band again to see the whole agenda.'
          : 'Ranked by what is owed, then by how long it has been owed. Every row is one thing to do.'}
      />

      {isLoading && <VdfLoader message="Loading journeys" />}
      {error && <p style={{ color: 'var(--color-error)' }}>{error.message}</p>}

      {/* THE STRIP */}
      {journeys.length > 0 && (
        <div className={s.stripCard}>
          <div className={s.stripHead}>
            <span>The cohort · {journeys.length} companies</span>
            <span className={s.stripLegend}>
              a tick that hangs low has gone quiet ·{' '}
              {stalled ? <em>{stalled} stalled</em> : <>none stalled</>}
              {quiet ? ` · ${quiet} closed or parked` : ''}
            </span>
          </div>
          <div className={s.bands}>
            {strip.map(({ state, n, ticks }) => (
              <button
                key={state}
                className={`${s.band} ${selBand === state ? s.selBand : ''}`}
                onClick={() => setSelBand(selBand === state ? null : state)}
                aria-label={`${n} in ${state}`}
                type="button"
              >
                <div className={s.well}>{ticks}</div>
                <div className={s.bandLabel}>
                  <span>{state.replace('_', ' ')}</span>
                  <span className={s.bandN}>{n || '·'}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* THE OWED LIST */}
      {!isLoading && journeys.length === 0 && (
        <VdfEmptyState
          title="No journeys yet"
          description="Import a cohort into Prospects, then research it — every prospect gets a journey the moment a brief is written."
        />
      )}

      {ranked.length > 0 && (
        <div className={s.list}>
          {ranked.map((j) => {
            const days = daysSince(j.entered_state_at);
            const hot = days >= 8 && ACTIVE(j.state);
            return (
              <button
                key={j.id}
                className={`${s.row} ${hot ? s.stalled : ''}`}
                onClick={() => setDrawerJourney(j)}
                type="button"
              >
                <div className={s.verb}>
                  <span className={`${s.verbChip} ${hot ? s.warnChip : ''}`}>{VERB[j.state] ?? j.state}</span>
                  <span className={`${s.dwell} ${hot ? s.hot : ''}`}>{days}d in state</span>
                </div>
                <div>
                  <div className={s.coName}>
                    {j.name}
                    {j.offer && <span className={`${s.pill} ${s.gold}`}>{j.offer}</span>}
                    {j.contact_name && <span className={s.pill}>{j.contact_name}</span>}
                  </div>
                  <div className={s.coMeta}>
                    {[j.city, j.industry_raw, j.ref].filter(Boolean).join(' · ')}
                  </div>
                  {j.owed && <div className={s.owed}>{j.owed}</div>}
                </div>
                <div className={s.rowAction}>Open →</div>
              </button>
            );
          })}
        </div>
      )}

      {waitingList.length > 0 && (
        <>
          <div className={s.sectionHead}>Out with them · {waitingList.length}</div>
          <div className={s.list}>
            {waitingList.map((j) => (
              <button key={j.id} className={s.row}
                onClick={() => setDrawerJourney(j)} type="button">
                <div className={s.verb}>
                  <span className={s.verbChip}>{VERB[j.state]}</span>
                  <span className={s.dwell}>{daysSince(j.entered_state_at)}d</span>
                </div>
                <div>
                  <div className={s.coName}>{j.name}</div>
                  <div className={s.coMeta}>{j.owed}</div>
                </div>
                <div className={s.rowAction}>Open →</div>
              </button>
            ))}
          </div>
        </>
      )}

      {quietList.length > 0 && (
        <>
          <div className={s.sectionHead}>Closed, parked and ruled out · {quietList.length}</div>
          <div className={s.list}>
            {quietList.map((j) => (
              <button key={j.id} className={`${s.row} ${s.quiet}`}
                onClick={() => setDrawerJourney(j)} type="button">
                <div className={s.verb}>
                  <span className={s.verbChip} style={{
                    background: 'transparent', color: 'var(--color-text-muted)',
                    borderColor: 'var(--color-border)',
                  }}>
                    {VERB[j.state] ?? j.state}
                  </span>
                </div>
                <div>
                  <div className={s.coName}>{j.name}</div>
                  <div className={s.coMeta}>{j.owed}</div>
                </div>
              </button>
            ))}
          </div>
        </>
      )}

      <JourneyDrawer
        journey={drawerJourney}
        open={!!drawerJourney}
        onClose={() => setDrawerJourney(null)}
        onMoved={() => { refetch(); }}
      />
    </div>
  );
}
