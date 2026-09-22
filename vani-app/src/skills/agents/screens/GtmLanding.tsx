'use client';
/**
 * /agents/gtm — GTM's landing.
 *
 * Vara's chrome (eyebrow, name, state, one action) and the old GTM landing's
 * substance: what GTM read from the Smart Profile, the weakest object named
 * with why it matters TO GTM, what changed, and the journey — done steps
 * collapsed, the current one open with its one action.
 *
 * It reads and links; it never asks. A missing BRAIN object is the other
 * lane: the screen names it and links to the Smart Profile step that owns it.
 * There is no start button in that state — the missing thing IS the screen,
 * not a disabled button with a reason under it, and not an offers form here.
 */
import Link from 'next/link';
import { useSkillQuery } from '@/lib/useSkill';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { AgentJourney } from '@/platform/pathway';
import { GTM_WORKSPACE } from '@/skills/gtm-shell/gtm-nav';
import type { Readiness } from '@/skills/gtm-shell/mock';
import u from '@/platform/shell/ui.module.css';
import s from './gtm.module.css';

export default function GtmLanding() {
  const q = useSkillQuery<Readiness>('gtm', 'readiness');
  const journey = GTM_WORKSPACE.journey!;

  return (
    <div>
      <div className={s.hero}>
        <div className={s.heroText}>
          <div className={u.eyebrow}>// AGENTS · GTM</div>
          <h1 className={u.h1}>Here is who you sell to</h1>
          <p className={u.lede}>
            Read from your Smart Profile. Nothing here is asked again — if something
            is missing, the fix is one link away, not a form on this page.
          </p>
        </div>
        <div className={s.scoreBox}>
          <DataBoundary query={q} label="readiness" skeleton={<SkeletonRows rows={1} />}>
            {(r: Readiness) => (
              <>
                <div className={s.scoreVal}>{r.score}<small>/100</small></div>
                <div className={s.scoreLbl}>profile, as GTM reads it</div>
                <p className={s.scoreNote}>
                  {r.ready
                    ? 'Enough to build an audience from. The score keeps rising as VaNi reads more.'
                    : 'Not enough yet — one object is missing, and it is named below.'}
                </p>
              </>
            )}
          </DataBoundary>
        </div>
      </div>

      <DataBoundary query={q} label="what GTM knows" skeleton={<SkeletonRows rows={3} lines={2} />}>
        {(r: Readiness) => {
          const weakest = r.objects.find((o) => o.key === r.weakest);
          return (
            <>
              <div className={s.grid}>
                {r.objects.map((o) => (
                  <div key={o.key} className={`${s.cell} ${o.state === 'missing' ? s.cellMiss : ''}`}>
                    <div className={s.cellHead}>
                      <span className={s.cellKey}>{o.label}</span>
                      <span className={`${u.tag} ${o.state === 'captured' ? u.tagOk : u.tagWarn}`}>{o.state}</span>
                    </div>
                    <div className={s.cellVal}>{o.value ?? 'not captured'}</div>
                    <div className={s.cellWhy}>{o.why}</div>
                    {o.state === 'missing' && (
                      <Link href={o.href} className={s.cellLink}>Capture it in the Smart Profile →</Link>
                    )}
                  </div>
                ))}
              </div>

              {!r.ready && weakest && (
                <div className={s.lane}>
                  <span className={s.laneTag}>The other lane</span>
                  <p>
                    <b>I know your product and your buyer. I don&rsquo;t have {weakest.label.toLowerCase()} yet</b> —
                    {' '}{weakest.why.replace(/\.$/, '')}. Capture it and come back; nothing here will ask for it.
                  </p>
                  <Link href={weakest.href} className={s.laneGo}>Open the Smart Profile at {weakest.label} →</Link>
                </div>
              )}

              <div className={s.two}>
                <div>
                  <div className={s.secH}>Where you are</div>
                  <AgentJourney decl={journey} />
                </div>
                <div>
                  <div className={s.secH}>What changed since you last looked</div>
                  <div className={s.changes}>
                    {r.changes.length ? r.changes.map((c, i) => (
                      <div key={i} className={s.chg}><span className={s.chgAt}>{c.at}</span><span>{c.text}</span></div>
                    )) : <div className={s.chg}><span className={s.chgAt}>—</span><span>Nothing yet. This fills as VaNi reads and as runs finish.</span></div>}
                  </div>
                </div>
              </div>
            </>
          );
        }}
      </DataBoundary>
    </div>
  );
}
