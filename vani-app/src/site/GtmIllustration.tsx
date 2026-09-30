'use client';
/**
 * How GTM works, as a loop of three stages — built from the console's own
 * shapes (rows, tags, a draft waiting for approval), not a video.
 *
 * It is an ILLUSTRATION and says so in its corner. The company and every
 * name in it are invented (Ledgerline, the fictional company the console's
 * mock data uses); none is a customer.
 *
 * Reduced motion: no timers, the three stages are shown side by side, still.
 */
import { useEffect, useState } from 'react';
import s from './landing.module.css';

const STAGES = [
  { key: 'audience', num: '1', title: 'Build the audience', line: 'VaNi finds companies that match who you sell to, and says why each one fits.' },
  { key: 'motion', num: '2', title: 'Put them in motion', line: 'It drafts each step of the journey. Nothing is sent until you approve it.' },
  { key: 'queue', num: '3', title: 'Work the queue', line: 'Every morning: who has gone quiet, ranked by what it costs to wait.' },
] as const;

const AUDIENCE: [string, string, boolean][] = [
  ['Sunridge Multispeciality', '420 beds · vendor contracts in email', true],
  ['Kaveri Care Hospitals', '310 beds · AMC renewals tracked in Excel', true],
  ['Lotus Eye Clinics', 'single-speciality chain · outside your buyer', false],
  ['Meridian Health Group', '650 beds · procurement head named on site', true],
];
const JOURNEY = ['Intro email', 'WhatsApp follow-up', 'Call booked'];
const QUEUE: [string, string][] = [
  ['Kaveri Care Hospitals', 'opened the proposal twice · no reply for 6 days'],
  ['Meridian Health Group', 'asked for pricing · follow-up due today'],
  ['Sunridge Multispeciality', 'meeting done · no next step agreed'],
];

/** Beats per stage; one beat ≈ 0.8s. */
const BEATS = 6;
const BEAT_MS = 800;

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

export function GtmIllustration() {
  const reduced = usePrefersReducedMotion();
  // One value, so a tick advances beat and stage together (a state update
  // nested in another's updater runs twice under StrictMode). The first paint
  // shows stage 1 complete, so the server render and the client agree.
  const [{ stage, beat }, setPos] = useState({ stage: 0, beat: BEATS });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduced || paused) return;
    const t = window.setInterval(() => {
      setPos((p) => (p.beat < BEATS ? { ...p, beat: p.beat + 1 } : { stage: (p.stage + 1) % STAGES.length, beat: 0 }));
    }, BEAT_MS);
    return () => window.clearInterval(t);
  }, [reduced, paused]);

  if (reduced) {
    return (
      <div className={s.gtm}>
        <span className={s.illus}>Illustration · fictional company</span>
        <div className={s.gtmStill}>
          {STAGES.map((st, i) => <Frame key={st.key} index={i} beat={BEATS} />)}
        </div>
      </div>
    );
  }

  return (
    <div className={s.gtm} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <span className={s.illus}>Illustration · fictional company</span>
      <div className={s.gtmTabs} role="tablist" aria-label="GTM stages">
        {STAGES.map((st, i) => (
          <button key={st.key} type="button" role="tab" aria-selected={stage === i} className={stage === i ? s.gtmTabOn : s.gtmTab}
            onClick={() => { setPos({ stage: i, beat: BEATS }); setPaused(true); }}>
            <span className={s.gtmNum}>{st.num}</span>{st.title}
          </button>
        ))}
      </div>
      <Frame index={stage} beat={beat} />
    </div>
  );
}

function Frame({ index, beat }: { index: number; beat: number }) {
  const st = STAGES[index];
  return (
    <div className={s.gtmFrame} role="tabpanel">
      <div className={s.gtmFrameHead}><span className={s.gtmNum}>{st.num}</span><strong>{st.title}</strong></div>
      <p className={s.gtmLine}>{st.line}</p>
      {st.key === 'audience' && (
        <ul className={s.gtmRows}>
          {AUDIENCE.map(([name, why, fits], i) => (
            <li key={name} className={`${s.gtmRow} ${beat > i ? s.gtmIn : ''}`}>
              <span className={s.gtmRowName}>{name}</span>
              <span className={s.gtmRowWhy}>{why}</span>
              <span className={fits ? s.tagOk : s.tagDim}>{fits ? 'fits' : 'not a fit'}</span>
            </li>
          ))}
          <li className={`${s.gtmSum} ${beat > AUDIENCE.length ? s.gtmIn : ''}`}>3 of 4 qualified · reasons kept with each</li>
        </ul>
      )}
      {st.key === 'motion' && (
        <div className={s.gtmMotion}>
          <ol className={s.gtmJourney}>
            {JOURNEY.map((j, i) => <li key={j} className={beat > i ? s.gtmIn : ''}>{j}</li>)}
          </ol>
          <div className={`${s.gtmDraft} ${beat > 2 ? s.gtmIn : ''}`}>
            <div className={s.gtmDraftHead}><span className={s.tagWarn}>draft · waiting for you</span><span>to Sunridge Multispeciality</span></div>
            <p>Your team renews vendor contracts and AMCs across 420 beds. Ledgerline shows every renewal 60 days ahead and keeps the SLA evidence in one place. Would a two-week contract audit be useful?</p>
            <div className={s.gtmDraftActions}>
              <span className={`${s.gtmApprove} ${beat > 4 ? s.gtmApproved : ''}`}>{beat > 4 ? '✓ Approved by you' : 'Approve'}</span>
              <span className={s.gtmEdit}>Edit</span>
            </div>
          </div>
        </div>
      )}
      {st.key === 'queue' && (
        <ul className={s.gtmRows}>
          {QUEUE.map(([name, why], i) => (
            <li key={name} className={`${s.gtmRow} ${beat > i ? s.gtmIn : ''}`}>
              <span className={s.gtmRank}>{i + 1}</span>
              <span className={s.gtmRowName}>{name}</span>
              <span className={s.gtmRowWhy}>{why}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
