'use client';
/**
 * How GTM works — the product's own flow, replayed.
 *
 * Every frame is a console screen as it really is: the same pathways and
 * steps (gtm-nav.ts, AudiencePathway, MotionPathway, TodayQueue), the same
 * headlines, chips and button labels, drawn with the console's own
 * stylesheets (PathwayShell, gtm-audience, gtm-motion). Nothing here is a
 * drawing of an imagined product.
 *
 * The DATA is the console's mock example — Ledgerline and the hospitals in
 * gtm-audience/mock-data.ts, on `.example` domains — and the frame says
 * "Illustration · fictional company". None of it is a customer.
 *
 * Reduced motion: no autoplay; each frame is shown complete, and the controls
 * step through them.
 */
import { useEffect, useState, type ReactNode } from 'react';
import p from '@/platform/pathway/PathwayShell.module.css';
import a from '@/skills/gtm-audience/audience.module.css';
import m from '@/skills/gtm-motion/motion.module.css';
import s from './landing.module.css';

type PathwayId = 'audience' | 'motion' | 'today';

const PATHWAYS: Record<PathwayId, { name: string; line: string; steps: { label: string; locked?: string }[] }> = {
  audience: { name: 'Build the audience', line: 'Hot list → find → qualify → people.', steps: [{ label: 'Hot list' }, { label: 'Find' }, { label: 'Qualify' }, { label: 'People' }] },
  motion: { name: 'Put them in motion', line: 'Segment → story → cadence → send.', steps: [{ label: 'Segment' }, { label: 'Story' }, { label: 'Cadence' }, { label: 'Send', locked: 'opens in the beta' }] },
  today: { name: 'Today', line: 'Who has gone quiet, and what it costs to leave them.', steps: [] },
};

/** Beats per frame; a beat ≈ 0.75s. Rows arrive on the early beats, the decision lands on the last ones. */
const BEATS = 7;
const BEAT_MS = 750;

/** `in` reveals a piece from beat `at` onward. */
const at = (beat: number, n: number) => (beat >= n ? s.gtmIn : s.gtmOut);

interface Frame { pathway: PathwayId; step: number; render: (beat: number) => ReactNode }

const FRAMES: Frame[] = [
  { pathway: 'audience', step: 0, render: (b) => (
    <>
      <div className={a.eyebrow}>// BUILD THE AUDIENCE · 1 OF 4</div>
      <h1 className={a.h}>4 companies look like your buyer</h1>
      <p className={a.sub}>From our global data, matched on your vocabulary and your buyer. Each row says where it came from and how fresh it is.</p>
      <div className={a.list}>
        {HOT.map((r, i) => <Row key={r.name} r={r} cls={at(b, i + 1)} side="open →" />)}
      </div>
      <Actions pressed={b >= 6}>Pick who to research →</Actions>
    </>
  ) },
  { pathway: 'audience', step: 1, render: (b) => (
    <>
      <div className={a.eyebrow}>// BUILD THE AUDIENCE · 2 OF 4</div>
      <h1 className={a.h}>Which of these are worth researching?</h1>
      <p className={a.sub}>Research costs a budget, so this is a decision, not a default. The ones below your range are pre-unticked and say why.</p>
      <div className={a.list}>
        {HOT.map((r, i) => <Row key={r.name} r={r} tick={b >= i + 1 && !r.weak} off={!!r.weak} side={r.weak ? 'skip' : b >= i + 1 ? 'research' : ''} />)}
      </div>
      <Actions pressed={b >= 6} hint="One model call at a time on the platform — a few minutes per company.">Research 3 · 12 affordable today</Actions>
    </>
  ) },
  { pathway: 'audience', step: 2, render: (b) => (
    <>
      <div className={a.eyebrow}>// BUILD THE AUDIENCE · 3 OF 4</div>
      <div className={a.batch}><div className={a.batchHead}><span className={`${a.chip} ${b >= 2 ? a.chipMine : a.chipPool}`}>{b >= 2 ? 'completed' : 'running'}</span><span className={a.hint}>{b >= 2 ? 3 : 2} of 3 briefs written</span></div></div>
      <h1 className={a.h}>3 briefs. Who is worth a message?</h1>
      <p className={a.sub}>Fit is scored per offer. Every claim carries the page it was read on. Decide per row; your verdicts teach the next batch.</p>
      <div className={`${a.brief} ${at(b, 1)}`}>
        <div className={a.briefHead}>
          <div>
            <div className={a.name}>Sunridge Multispeciality Hospital<small>PR-0001 · sunridge-hospital.example</small></div>
            <div className={a.meta}><span className={`${a.chip} ${a.chipMine}`}>open with · Two-week contract audit</span><span>4 pages read</span></div>
          </div>
          <div className={a.seg}>
            <button type="button" tabIndex={-1} aria-pressed={b >= 6}>Worth a message</button>
            <button type="button" tabIndex={-1} className="bad" aria-pressed={false}>Not this one</button>
            <button type="button" tabIndex={-1} className="bad" aria-pressed={false}>Do not contact</button>
          </div>
        </div>
        <div className={`${a.fit} ${at(b, 2)}`}>
          <div className={`${a.fitc} ${a.fitBest}`}><div className={a.fitK}>Two-week contract audit · fixed fee</div><div className={a.fitV}>82%</div></div>
          <div className={a.fitc}><div className={a.fitK}>Ledgerline platform · per site</div><div className={a.fitV}>61%</div></div>
        </div>
        <p className={`${a.hook} ${at(b, 3)}`}>“140 vendor contracts across two campuses, and the AMC visits are logged in Excel.”</p>
        <div className={`${a.subh} ${at(b, 4)}`}>Evidence · 2 claims</div>
        <div className={`${a.ev} ${at(b, 4)}`}>
          <div className={a.evl}>Runs 140+ vendor contracts across two campuses<span className={a.evSrc}>https://sunridge-hospital.example/procurement</span></div>
          <div className={a.evl}>AMC visits tracked in spreadsheets<span className={a.evSrc}>https://sunridge-hospital.example/tenders/2026-biomed</span></div>
        </div>
      </div>
      <Actions pressed={b >= 7}>Find people at 2 →</Actions>
    </>
  ) },
  { pathway: 'audience', step: 3, render: (b) => (
    <>
      <div className={a.eyebrow}>// BUILD THE AUDIENCE · 4 OF 4</div>
      <h1 className={a.h}>Who, at the 2 worth it</h1>
      <p className={a.sub}>Named in the briefs, on pages we read — never invented. A person with an email or phone joins as reachable; one without joins as a draft.</p>
      <div className={a.subh}>Sunridge Multispeciality Hospital · PR-0001</div>
      <div className={a.list}>
        <Person cls={at(b, 1)} done={b >= 4} name="R. Menon" title="Head of Procurement" email="r.menon@sunridge-hospital.example" src="sunridge-hospital.example/about/leadership" />
        <Person cls={at(b, 2)} done={false} name="A. Deshpande" title="CFO" email={null} src="sunridge-hospital.example/about/leadership" />
      </div>
      <Actions pressed={b >= 6} hint="Everyone added is under People.">Done — see the audience →</Actions>
    </>
  ) },
  { pathway: 'motion', step: 0, render: (b) => (
    <>
      <div className={a.eyebrow}>// PUT THEM IN MOTION · 1 OF 4</div>
      <h1 className={a.h}>One group, one story</h1>
      <p className={a.sub}>Proposed from your verdicts and the offer each brief fit best, named in your own vocabulary. Confirm, or split.</p>
      <div className={a.list}>
        <div className={`${a.row} ${a.rowOn} ${at(b, 1)}`}>
          <span className={a.tick} aria-pressed="true">✓</span>
          <div>
            <div className={a.name}>Hospital procurement · 300–700 beds</div>
            <div className={a.why}>Sunridge Multispeciality Hospital · Northfield General. Contracts live in spreadsheets. Opens with <b>Two-week contract audit</b>.</div>
            <div className={a.meta}><span className={`${a.chip} ${a.chipMine}`}>CONT-0001 · R. Menon</span><span className={`${a.chip} ${a.chipMine}`}>CONT-0002 · K. Patel</span></div>
          </div>
          <span className={a.side}>2 people</span>
        </div>
      </div>
      <Actions pressed={b >= 5}>These are right — write the stories →</Actions>
    </>
  ) },
  { pathway: 'motion', step: 1, render: (b) => (
    <>
      <div className={a.eyebrow}>// PUT THEM IN MOTION · 2 OF 4</div>
      <h1 className={a.h}>The story, and the move</h1>
      <p className={a.sub}>The story is about you and is reused across the segment — an <b>asset</b>. The move is about <em>them</em> and is never reused.</p>
      <div className={`${m.story} ${at(b, 1)}`}>
        <div className={m.storyHead}>
          <div className={m.storyTitle}>Two-week contract audit — for hospital procurement</div>
          <div className={a.chips} style={{ margin: 0 }}>
            <span className={`${a.chip} ${a.chipPool}`}>asset · one_pager</span>
            <span className={`${a.chip} ${b >= 4 ? a.chipMine : a.chipWarn}`}>{b >= 4 ? 'approved' : 'draft · unapproved'}</span>
          </div>
        </div>
        <p>A two-week contract audit puts a number on it: your top 50 contracts, your renewal dates, and the penalties you are entitled to and have not claimed. You keep the number whatever you decide next.</p>
        <div className={m.trace}><b>built from</b> · offer: Two-week contract audit · 2 briefs<br /><b>voice</b> · plain · evidence-first</div>
      </div>
      <div className={`${m.story} ${at(b, 5)}`}>
        <div className={m.storyHead}>
          <div className={m.storyTitle}>R. Menon · Sunridge Multispeciality Hospital</div>
          <div className={a.chips} style={{ margin: 0 }}><span className={`${a.chip} ${a.chipMine}`}>move · email</span><span className={`${a.chip} ${a.chipWarn}`}>draft · unapproved</span></div>
        </div>
        <div className={m.trace}><b>built from</b> · brief: 2 evidence lines (procurement page, tender) · the segment story above<br /><b>never reused</b> · one person, one message</div>
      </div>
      <Actions pressed={b >= 7}>Check the window →</Actions>
    </>
  ) },
  { pathway: 'motion', step: 2, render: (b) => (
    <>
      <div className={a.eyebrow}>// PUT THEM IN MOTION · 3 OF 4</div>
      <h1 className={a.h}>The window, before anything is scheduled</h1>
      <p className={a.sub}>3 touches per person per rolling 7 days, across every channel and every agent. Sent touches and held reservations both count.</p>
      <div className={m.win}>
        <Window cls={at(b, 1)} name="R. Menon" sub="CONT-0001 · Sunridge" used={0} open />
        <Window cls={at(b, 2)} name="K. Patel" sub="CONT-0002 · Northfield" used={1} open />
        <Window cls={at(b, 3)} name="T. Varghese" sub="CONT-0003 · St. Brigid's" used={3} open={false} />
      </div>
      <p className={a.note}>quiet hours 21:00–09:00 IST · quiet days Sun · assisted touches (LinkedIn, X) count here too</p>
      <Actions pressed={b >= 6} hint="Reserved, not just counted.">Reserve 2 slots →</Actions>
    </>
  ) },
  { pathway: 'motion', step: 3, render: (b) => (
    <>
      <div className={a.eyebrow}>// PUT THEM IN MOTION · 4 OF 4</div>
      <h1 className={a.h}>Send — as you</h1>
      <p className={a.sub}>Every message goes out under your own identity: your email domain, your WhatsApp number, your LinkedIn. VaNi composes, times and records; it never speaks as you from an address you do not own.</p>
      <div className={a.list}>
        <Channel cls={at(b, 1)} name="Email" note="from your own domain" tag="automated" />
        <Channel cls={at(b, 2)} name="WhatsApp" note="your WhatsApp Business number" tag="connect first" />
        <Channel cls={at(b, 3)} name="LinkedIn" note="you send it; VaNi drafts it and counts it" tag="assisted" />
      </div>
      <div className={a.actions}>
        <button type="button" tabIndex={-1} className={a.primary} disabled>Send 2 moves</button>
        <span className={`${a.chip} ${a.chipWarn}`}>opens in the beta</span>
      </div>
    </>
  ) },
  { pathway: 'today', step: 0, render: (b) => (
    <>
      <div className={a.eyebrow}>// GTM · TODAY</div>
      <h1 className={a.h}>3 to come back to</h1>
      <p className={a.sub}>Ranked by what it costs to leave them. Anyone already reserved this week is not here — the governor already has them.</p>
      <div className={a.list}>
        <Quiet cls={at(b, 1)} acted={b >= 5} chip="owed a reply · 2 days" urgent state="answered · Two-week contract audit" person="R. Menon" sub="CONT-0001 · Sunridge Multispeciality Hospital" why="Asked what the audit covers. Nobody has answered." />
        <Quiet cls={at(b, 2)} acted={false} chip="gone quiet · 6 days" state="addressed · Two-week contract audit" person="K. Patel" sub="CONT-0002 · Northfield General" why="Opened the one-pager twice, no reply since." />
        <Quiet cls={at(b, 3)} acted={false} chip="wake due" state="parked · Ledgerline platform" person="T. Varghese" sub="CONT-0003 · St. Brigid's Hospital" why="Parked a week ago; the week is up." />
      </div>
    </>
  ) },
];

interface Hot { name: string; sub: string; why: string; src: string; fresh: string; weak?: boolean }
const HOT: Hot[] = [
  { name: 'Sunridge Multispeciality Hospital', sub: 'PR-0001 · Pune · 420 beds', why: '"vendor compliance" and "AMC" appear on their procurement page; 400+ beds', src: 'pool · directory load', fresh: '3 weeks' },
  { name: 'Northfield General', sub: 'PR-0003 · Ahmedabad · 610 beds', why: 'Recent NABH renewal — contract governance is a scored criterion', src: 'pool · directory load', fresh: '5 weeks' },
  { name: "St. Brigid's Hospital", sub: 'PR-0004 · Kochi · 340 beds', why: 'Job posting for "Contracts Officer" this month — a buyer is being hired', src: 'pool · directory load', fresh: '5 days' },
  { name: "Ashoka Children's Hospital", sub: 'PR-0005 · Hyderabad · 180 beds', why: 'Below your bed range; kept because vocabulary matched twice', src: 'pool · supplier list', fresh: '2 months', weak: true },
];

function Row({ r, cls = '', tick, off, side }: { r: Hot; cls?: string; tick?: boolean; off?: boolean; side: string }) {
  const ticking = tick !== undefined;
  return (
    <div className={`${a.row} ${ticking ? '' : a.rowNoTick} ${tick ? a.rowOn : ''} ${off ? a.rowOff : ''} ${cls}`}>
      {ticking && <span className={a.tick} aria-pressed={tick}>✓</span>}
      <div>
        <div className={a.name}>{r.name}<small>{r.sub}</small></div>
        <div className={a.why}>{r.why}</div>
        <div className={a.meta}><span className={`${a.chip} ${a.chipPool}`}>{r.src}</span><span>fresh · {r.fresh}</span></div>
      </div>
      <span className={a.side}>{side}</span>
    </div>
  );
}

function Person({ cls, done, name, title, email, src }: { cls: string; done: boolean; name: string; title: string; email: string | null; src: string }) {
  return (
    <div className={`${a.row} ${done ? a.rowOn : ''} ${cls}`}>
      <span className={a.tick} aria-pressed={done}>✓</span>
      <div>
        <div className={a.name}>{name}<small>{title}</small></div>
        <div className={a.wf}>
          <span className={email ? a.wfHit : a.wfMiss}>{email ? `email · ${email}` : 'no email on any page read'}</span>
          <span className={a.wfNa}>no phone</span>
          <span className={a.wfNa}>read on {src}</span>
        </div>
      </div>
      <span className={a.side}>{done ? 'in audience →' : email ? 'reachable' : 'no address'}</span>
    </div>
  );
}

function Window({ cls, name, sub, used, open }: { cls: string; name: string; sub: string; used: number; open: boolean }) {
  return (
    <>
      <div className={`${m.winName} ${cls}`}>{name}<small>{sub}</small></div>
      <div className={cls} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <div className={m.slots}>{[0, 1, 2].map((i) => <i key={i} className={i < used ? m.used : open && i === used ? m.plan : ''} />)}</div>
        <span className={m.w}>{used ? `${used} used` : 'free'} · {open ? '1 planned' : <b className={m.refused}>refused — window full</b>}</span>
      </div>
    </>
  );
}

function Channel({ cls, name, note, tag }: { cls: string; name: string; note: string; tag: string }) {
  return (
    <div className={`${a.row} ${a.rowNoTick} ${cls}`}>
      <div><div className={a.name}>{name}</div><div className={a.why}>{note}</div></div>
      <span className={`${a.chip} ${tag === 'automated' ? a.chipMine : tag === 'assisted' ? '' : a.chipWarn}`}>{tag}</span>
    </div>
  );
}

function Quiet({ cls, acted, chip, urgent, state, person, sub, why }: { cls: string; acted: boolean; chip: string; urgent?: boolean; state: string; person: string; sub: string; why: string }) {
  return (
    <div className={`${a.row} ${a.rowNoTick} ${cls} ${acted ? a.rowOff : ''}`}>
      <div>
        <div className={a.meta} style={{ marginTop: 0, marginBottom: 4 }}><span className={`${a.chip} ${urgent ? a.chipBad : a.chipWarn}`}>{chip}</span><span>{state}</span></div>
        <div className={a.name}>{person}<small>{sub}</small></div>
        <div className={a.why}>{why}</div>
      </div>
      <div className={a.seg}>
        <button type="button" tabIndex={-1} aria-pressed={acted}>Act</button>
        <button type="button" tabIndex={-1} className="later" aria-pressed={false}>Park a week</button>
        <button type="button" tabIndex={-1} className="bad" aria-pressed={false}>Let go</button>
      </div>
    </div>
  );
}

function Actions({ pressed, hint, children }: { pressed: boolean; hint?: string; children: ReactNode }) {
  return (
    <div className={a.actions}>
      <span className={`${a.primary} ${pressed ? s.gtmPress : ''}`}>{children}</span>
      {hint && <span className={a.hint}>{hint}</span>}
    </div>
  );
}

/** The console's stepper, same classes (PathwayShell), read-only. */
function Stepper({ pathway, step }: { pathway: PathwayId; step: number }) {
  const steps = PATHWAYS[pathway].steps;
  if (!steps.length) return null;
  return (
    <ol className={p.stepper}>
      {steps.map((st, i) => {
        const done = i < step;
        const current = i === step;
        return (
          <li key={st.label} className={[p.step, done ? p.stepDone : '', current ? p.stepCurrent : '', st.locked ? p.stepLocked : ''].filter(Boolean).join(' ')}>
            <span className={p.stepBtn}>
              <span className={p.dot} aria-hidden="true">{done ? '✓' : st.locked ? '·' : i + 1}</span>
              <span className={p.stepLabel}>{st.label}</span>
              {st.locked && <span className={p.lockedTag}>{st.locked}</span>}
            </span>
            {i < steps.length - 1 && <span className={p.connector} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const q = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(q.matches);
    const on = () => setReduced(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return reduced;
}

export function GtmIllustration() {
  const reduced = usePrefersReducedMotion();
  // One value, so a tick moves beat and frame together. The first paint shows
  // frame 1 complete, so the server render and the client agree.
  const [{ frame, beat }, setPos] = useState({ frame: 0, beat: BEATS });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (reduced || paused) return;
    const t = window.setInterval(() => {
      setPos((x) => (x.beat < BEATS ? { ...x, beat: x.beat + 1 } : { frame: (x.frame + 1) % FRAMES.length, beat: 0 }));
    }, BEAT_MS);
    return () => window.clearInterval(t);
  }, [reduced, paused]);

  const f = FRAMES[frame];
  const pw = PATHWAYS[f.pathway];
  const shownBeat = reduced ? BEATS : beat;
  const go = (i: number) => { setPos({ frame: (i + FRAMES.length) % FRAMES.length, beat: reduced ? BEATS : 0 }); };
  const firstOf = (id: PathwayId) => FRAMES.findIndex((x) => x.pathway === id);

  return (
    <div className={s.gtm} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}>
      <span className={s.illus}>Illustration · fictional company</span>
      <div className={s.gtmTabs} role="tablist" aria-label="GTM pathways">
        {(Object.keys(PATHWAYS) as PathwayId[]).map((id, i) => (
          <button key={id} type="button" role="tab" aria-selected={f.pathway === id} className={f.pathway === id ? s.gtmTabOn : s.gtmTab} onClick={() => go(firstOf(id))}>
            <span className={s.gtmNum}>{i + 1}</span>{PATHWAYS[id].name}
          </button>
        ))}
        <span className={s.gtmNav}>
          <button type="button" className={s.gtmArrow} onClick={() => go(frame - 1)} aria-label="Previous screen">←</button>
          <span className={s.gtmCount}>{frame + 1} / {FRAMES.length}</span>
          <button type="button" className={s.gtmArrow} onClick={() => go(frame + 1)} aria-label="Next screen">→</button>
        </span>
      </div>

      <div className={s.gtmWindow} role="tabpanel" aria-label={`${pw.name} — the console screen`}>
        <div className={s.gtmBar}>
          <span className={s.gtmBarName}><span className={s.gtmBarEyebrow}>GTM</span>{pw.name}</span>
          <Stepper pathway={f.pathway} step={f.step} />
        </div>
        <div className={s.gtmBody}>
          <div className={a.card} key={frame}>{f.render(shownBeat)}</div>
        </div>
      </div>
      <p className={s.gtmCaption}>{pw.line}</p>
    </div>
  );
}
