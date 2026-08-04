'use client';

/**
 * VaNi AI — report, /r/:token
 *
 * Light mode, print-friendly. Follows the deck/[token] pattern: fetch by
 * unguessable token, no JWT, `loading → error | ready` state machine.
 *
 * Every number and every sentence here comes from the API — the health
 * score, the band and its verdict/next-step copy, all three top exposures
 * with their names/percentages/route lines, the ten-mode profile, the
 * narrative, and the CTA/signoff. This file contains no scoring, no
 * thresholds and no assessment copy.
 *
 * The mode profile is inline SVG-free plain divs with a width percentage —
 * lighter than SVG and far lighter than any chart library, per the
 * "no heavy chart libs on the public path" constraint.
 */

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import s from './report.module.css';
import v from '../../vani-tokens.module.css';

interface TopMode {
  key: string;
  name: string;
  exposure_pct: number;
  symptom: string;
  remediation: string;
  route_label: string;
  referral_line: string;
}

interface ProfileMode { key: string; name: string; exposure_pct: number }

interface Report {
  ref: string | null;
  narrative: string | null;
  created_at: string;
  health_score: number | null;
  band: { key: string; label: string; color: string; verdict: string; next_step: string } | null;
  top_modes: TopMode[] | null;
  all_modes: ProfileMode[] | null;
  name: string;
  company: string;
  assessment_title: string | null;
  report: { cta_label?: string; cta_url?: string; signoff?: string } | null;
}

const BAND_CLASS: Record<string, string> = {
  green: s.bandGreen,
  amber: s.bandAmber,
  red: s.bandRed,
};

type Stage =
  | { name: 'loading' }
  | { name: 'error'; status: number }
  | { name: 'ready'; report: Report };

export default function ReportPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;
  const [stage, setStage] = useState<Stage>({ name: 'loading' });

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const report = await apiFetch<Report>(API.assessment.report, { pathParams: { token } });
        if (!cancelled) setStage({ name: 'ready', report });
      } catch (err) {
        if (!cancelled) setStage({ name: 'error', status: (err as ApiError)?.status || 500 });
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  if (stage.name === 'loading') {
    return (
      <div className={v.vaniRoot}>
        <div className={v.lightStage} />
      </div>
    );
  }

  // Blueprint's expired/invalid link page. Deliberately no error codes shown
  // to prospects — "This report link isn't valid" covers revoked, mistyped
  // and expired alike.
  if (stage.name === 'error') {
    return (
      <div className={v.vaniRoot}>
        <div className={v.lightStage}>
          <header className={s.rHead}>
            <div className={s.rHeadRow}>
              <div className={s.rBrand}><div className={s.orb} style={{ width: 24, height: 24 }} />VaNi AI</div>
            </div>
          </header>
          <div className={s.expiredWrap}>
            <h1 className={s.rH2} style={{ fontSize: 24 }}>This report link isn’t valid</h1>
            <p>
              It may have been revoked or mistyped. If you received it by email, use the button in
              that email — or take the assessment again in a few minutes.
            </p>
            <a className={s.btnNavy} href="/a/ai-recovery">Take the assessment →</a>
            <p className={s.expiredHelp}>Need help? hello@vikuna.io</p>
          </div>
        </div>
      </div>
    );
  }

  const r = stage.report;
  const topModes = r.top_modes ?? [];
  const profile = r.all_modes ?? [];
  const topKeys = new Set(topModes.map((m) => m.key));
  const reportDate = new Date(r.created_at).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });

  return (
    <div className={v.vaniRoot}>
      <div className={v.lightStage}>
        <header className={s.rHead}>
          <div className={s.rHeadRow}>
            <div className={s.rBrand}>
              <div className={s.orb} style={{ width: 24, height: 24 }} />
              VaNi AI · Assessment Report
            </div>
            <div className={s.rMeta}>
              {r.assessment_title ? `${r.assessment_title} · ` : ''}{reportDate}
              {r.ref ? ` · Ref ${r.ref}` : ''}
            </div>
          </div>
        </header>

        <div className={s.rBody}>
          <div className={s.rBodyInner}>

            {/* ── Score + band ── */}
            <div className={`${s.rCard} ${s.rHero}`}>
              <div>
                <div className={s.rKicker}>AI Initiative Health</div>
                <div className={s.rScore}>
                  {r.health_score}<span className={s.rScoreOutOf}>/100</span>
                </div>
                {r.band && (
                  <span className={`${s.rBand} ${BAND_CLASS[r.band.color] ?? s.bandAmber}`}>
                    {r.band.label}
                  </span>
                )}
              </div>
              {r.band && (
                <p><b>{r.company}</b> — {r.band.verdict}</p>
              )}
            </div>

            {/* ── Narrative ── */}
            {r.narrative && (
              <div className={s.rCard}>
                <div className={s.rKicker}>VaNi’s summary</div>
                <p className={s.rSummary}>{r.narrative}</p>
              </div>
            )}

            {/* ── Top exposures ── */}
            {topModes.length > 0 && (
              <div className={s.rCard}>
                <h2 className={s.rH2}>Your top {topModes.length} exposures</h2>
                {topModes.map((m) => (
                  <div key={m.key} className={s.rMode}>
                    <h4>
                      {m.key} · {m.name}<span className={s.pct}>{m.exposure_pct}%</span>
                    </h4>
                    <p>{m.symptom}</p>
                    {m.referral_line && <div className={s.route}>{m.referral_line}</div>}
                  </div>
                ))}
              </div>
            )}

            {/* ── Full mode profile ── */}
            {profile.length > 0 && (
              <div className={s.rCard}>
                <h2 className={s.rH2}>All {profile.length} failure modes</h2>
                {profile.map((m) => {
                  const hi = topKeys.has(m.key);
                  return (
                    <div key={m.key} className={`${s.barRow} ${hi ? s.barRowHi : ''}`}>
                      <div className={s.bLabel}>{m.key} · {m.name}</div>
                      <div className={s.bTrack}>
                        <div className={s.bFill} style={{ width: `${Math.max(m.exposure_pct, 1)}%` }} />
                      </div>
                      <div className={s.bVal}>{m.exposure_pct}</div>
                    </div>
                  );
                })}
                <p className={s.profileNote}>
                  Exposure 0–100 per mode, computed deterministically from your responses.
                  Highlighted rows are your top {topModes.length}.
                </p>
              </div>
            )}

            {/* ── Recommended next step ── */}
            {r.band?.next_step && (
              <div className={`${s.rCard} ${s.rNext}`}>
                <div className={s.rKicker}>Recommended next step</div>
                <h2 className={s.rH2} style={{ marginBottom: 4 }}>{r.band.next_step}</h2>
                {r.report?.cta_label && r.report.cta_url && !r.report.cta_url.includes('{{') && (
                  <a className={`${s.btnNavy} ${v.noPrint}`} href={r.report.cta_url}
                     target="_blank" rel="noopener noreferrer">
                    {r.report.cta_label}
                  </a>
                )}
              </div>
            )}

            {/* ── Sign-off ── */}
            <div className={s.sign}>
              <div>{r.report?.signoff}</div>
              <div className={v.noPrint}>
                <button type="button" className={s.btnGhostLight} onClick={() => window.print()}>
                  Print / PDF
                </button>
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}
