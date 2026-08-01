'use client';

/**
 * VaNi AI — public assessment flow, /a/:slug
 *
 * The blueprint's whole public path in one route: landing → assessment
 * (one question per screen) → analyzing → teaser → capture. Same
 * single-page-with-screens shape the blueprint prototypes, because the
 * flow order is fixed by the App Spec (teaser BEFORE capture) and each
 * step depends on the last.
 *
 * NO BUSINESS LOGIC LIVES HERE. Every question, option label, framing
 * line, band name, verdict, exposure number, failure-mode name and piece
 * of body copy is rendered from what the API returns. This file contains
 * no scoring, no thresholds, no mode names, and no assessment copy — if
 * you find yourself about to type a sentence a prospect will read, it
 * belongs in the assessment definition row, not here.
 *
 * The response row is created by the FIRST answer (the API creates it and
 * returns response_id + anon_token), not on landing — so someone who
 * opens the page and leaves never becomes a row.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import s from './assessment.module.css';
import v from '../../vani-tokens.module.css';

/* ── API shapes ─────────────────────────────────────────────── */

interface Option { label: string }

interface Question {
  id: string;
  context_only: boolean;
  framing: string;
  text: string;
  options: Option[];
}

interface Definition {
  service_slug: string;
  version: string;
  title: string;
  short_title: string;
  estimated_minutes: number;
  landing: { card_tag?: string; card_meta?: string; cta?: string } | null;
  questions: Question[];
  teaser: {
    kicker?: string; score_caption?: string;
    locked_1?: string; locked_2?: string; cta?: string;
  } | null;
  capture: {
    heading?: string; sub?: string; dpdp_note?: string; cta?: string;
    fields?: string[]; optional_fields?: string[];
  } | null;
}

interface TeaserPayload {
  health_score: number;
  band: { key: string; label: string; color: string; verdict: string };
  top_mode: { key: string; name: string; exposure_pct: number; symptom: string };
  locked_modes: number;
}

interface AnswerResult { response_id: string; anon_token: string }
interface CaptureResult { report_token: string }

/* ── Resume state (localStorage) ────────────────────────────── */

interface SavedProgress {
  responseId: string;
  anonToken: string;
  index: number;
}

function storageKey(slug: string) { return `vani:progress:${slug}`; }

function loadProgress(slug: string): SavedProgress | null {
  try {
    const raw = window.localStorage.getItem(storageKey(slug));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.responseId === 'string' && typeof parsed?.anonToken === 'string') {
      return { responseId: parsed.responseId, anonToken: parsed.anonToken, index: Number(parsed.index) || 0 };
    }
  } catch { /* corrupt/unavailable storage is not worth surfacing */ }
  return null;
}

function saveProgress(slug: string, p: SavedProgress) {
  try { window.localStorage.setItem(storageKey(slug), JSON.stringify(p)); } catch { /* private mode */ }
}

function clearProgress(slug: string) {
  try { window.localStorage.removeItem(storageKey(slug)); } catch { /* private mode */ }
}

/* ── Band colour → blueprint chip class ─────────────────────── */
// The API supplies the band's colour NAME; the blueprint defines what each
// looks like. Frontend picks neither the band nor its colour.
const BAND_CLASS: Record<string, string> = {
  green: s.bandGreen,
  amber: s.bandAmber,
  red: s.bandRed,
};

/* ── Analyzing beat ─────────────────────────────────────────── */
// Deliberately instrument-agnostic. The blueprint's sample lines name the
// instrument ("Scoring against ten failure modes…"), which would put
// assessment-specific copy in the frontend — not allowed, and wrong the
// moment a second assessment ships. The definition JSON has no field for
// these, so they are generic here. Flagged in the C2 report as a blueprint
// detail that didn't translate cleanly; the fix is a `analyzing_lines`
// array on the definition, which is a backend/config change.
const THINK_LINES = [
  'Reading your responses…',
  'Scoring your answers…',
  'Comparing the pattern across your initiatives…',
  'Preparing your read…',
];

type Screen = 'landing' | 'assessment' | 'analyzing' | 'teaser' | 'capture';

/**
 * Turns a definition-load failure into something a human can act on.
 *
 * The case worth separating is the API being unreachable. In dev that means
 * the backend isn't running (or is on a different port than next.config.js
 * proxies to), and Next.js answers the failed rewrite with its own HTML 500
 * — which arrives here as a 500 with a non-JSON body. Reporting that as
 * "this assessment isn't available" sends the reader looking at the
 * assessment definition, which is the wrong place entirely. In production
 * the same shape means the backend is down behind Nginx, which is likewise
 * not a content problem.
 */
function describeLoadFailure(err: ApiError | undefined): string {
  const status = err?.status ?? 0;
  const message = err?.message ?? '';
  const looksUnreachable =
    status === 0 || status === 502 || status === 503 || status === 504 ||
    (status === 500 && /non-JSON body/i.test(message));

  if (looksUnreachable) {
    return process.env.NODE_ENV === 'production'
      ? 'The assessment service is temporarily unreachable. Please try again shortly.'
      : 'The API is unreachable — is the backend running, and on the port next.config.js proxies to? '
        + 'This repo\'s dev convention is 3002 (see CLAUDE.md); override with DEV_BACKEND_ORIGIN.';
  }
  if (status === 404) {
    return 'This assessment does not exist, or is not published yet.';
  }
  return message || 'This assessment could not be loaded.';
}

export default function AssessmentPage() {
  const params = useParams<{ slug: string }>();
  const slug = params?.slug;

  const [definition, setDefinition] = useState<Definition | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [screen, setScreen] = useState<Screen>('landing');

  const [responseId, setResponseId] = useState<string | null>(null);
  const [anonToken, setAnonToken] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [saving, setSaving] = useState(false);
  const [answerError, setAnswerError] = useState<string | null>(null);
  const retryRef = useRef<(() => void) | null>(null);

  const [resumeOffer, setResumeOffer] = useState<SavedProgress | null>(null);
  const [teaser, setTeaser] = useState<TeaserPayload | null>(null);
  const [thinkIndex, setThinkIndex] = useState(0);

  const [form, setForm] = useState({ name: '', email: '', company: '', role_title: '', phone: '' });
  const [submitting, setSubmitting] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  /* ── Load the definition ─────────────────────────────────── */
  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      try {
        const def = await apiFetch<Definition>(API.assessment.definition, { pathParams: { slug } });
        if (cancelled) return;
        setDefinition(def);
        const saved = loadProgress(slug);
        if (saved) setResumeOffer(saved);
      } catch (err) {
        if (cancelled) return;
        setLoadError(describeLoadFailure(err as ApiError));
      }
    })();
    return () => { cancelled = true; };
  }, [slug]);

  const questions = definition?.questions ?? [];
  const total = questions.length;
  const current = questions[index];

  /* ── Save one answer (creates the row on the first call) ─── */
  const submitAnswer = useCallback(async (questionId: string, optionIndex: number) => {
    if (!slug) return;
    setSaving(true);
    setAnswerError(null);
    try {
      const res = await apiFetch<AnswerResult>(API.assessment.answer, {
        body: {
          service_slug: slug,
          question_id: questionId,
          option_index: optionIndex,
          ...(responseId && anonToken ? { response_id: responseId, anon_token: anonToken } : {}),
        },
      });
      setResponseId(res.response_id);
      setAnonToken(res.anon_token);
      setAnswers((a) => ({ ...a, [questionId]: optionIndex }));

      const nextIndex = index + 1;
      saveProgress(slug, { responseId: res.response_id, anonToken: res.anon_token, index: nextIndex });

      if (nextIndex < total) {
        setIndex(nextIndex);
      } else {
        void runAnalyzing(res.response_id, res.anon_token);
      }
    } catch (err) {
      // Blueprint's inline error: the answer is not lost, retry is offered,
      // previous answers are explicitly safe.
      setAnswerError((err as ApiError)?.message || 'Your connection may have dropped.');
      retryRef.current = () => { void submitAnswer(questionId, optionIndex); };
    } finally {
      setSaving(false);
    }
    // runAnalyzing is stable for the life of the component
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug, responseId, anonToken, index, total]);

  /* ── Analyzing beat, then teaser ─────────────────────────── */
  const runAnalyzing = useCallback(async (rid: string, tok: string) => {
    setScreen('analyzing');
    setThinkIndex(0);
    const started = Date.now();
    try {
      const result = await apiFetch<TeaserPayload>(API.assessment.complete, {
        body: { response_id: rid, anon_token: tok },
      });
      // The beat is a designed moment, not a spinner — hold it long enough
      // to read at least a couple of lines even when the API is instant.
      const elapsed = Date.now() - started;
      const minimum = THINK_LINES.length * 850;
      if (elapsed < minimum) await new Promise((r) => setTimeout(r, minimum - elapsed));
      setTeaser(result);
      setScreen('teaser');
    } catch (err) {
      setAnswerError((err as ApiError)?.message || 'Your read could not be prepared.');
      retryRef.current = () => { void runAnalyzing(rid, tok); };
      setScreen('assessment');
    }
  }, []);

  // Cycle the analyzing lines while that screen is up.
  useEffect(() => {
    if (screen !== 'analyzing') return;
    const t = setInterval(() => {
      setThinkIndex((i) => Math.min(THINK_LINES.length - 1, i + 1));
    }, 850);
    return () => clearInterval(t);
  }, [screen]);

  /* ── Capture ─────────────────────────────────────────────── */
  const submitCapture = useCallback(async () => {
    if (!responseId || !anonToken) return;
    setSubmitting(true);
    setCaptureError(null);
    try {
      const res = await apiFetch<CaptureResult>(API.assessment.capture, {
        body: {
          response_id: responseId,
          anon_token: anonToken,
          name: form.name.trim(),
          email: form.email.trim(),
          company: form.company.trim(),
          role_title: form.role_title.trim(),
          ...(form.phone.trim() ? { phone: form.phone.trim() } : {}),
        },
      });
      if (slug) clearProgress(slug);
      window.location.href = `/r/${res.report_token}`;
    } catch (err) {
      setCaptureError((err as ApiError)?.message || 'Your assessment could not be sent.');
      setSubmitting(false);
    }
  }, [responseId, anonToken, form, slug]);

  /* ── Resume handlers ─────────────────────────────────────── */
  const acceptResume = () => {
    if (!resumeOffer) return;
    setResponseId(resumeOffer.responseId);
    setAnonToken(resumeOffer.anonToken);
    setIndex(Math.min(resumeOffer.index, Math.max(0, total - 1)));
    setResumeOffer(null);
    setScreen('assessment');
  };
  const declineResume = () => {
    if (slug) clearProgress(slug);
    setResumeOffer(null);
  };

  /* ── Render ──────────────────────────────────────────────── */

  if (loadError) {
    return (
      <div className={v.vaniRoot}>
        <div className={v.darkStage}>
          <div className={v.wrap}>
            <TopBar />
            <div className={s.teaser}>
              <h1 style={{ fontSize: 24 }}>This assessment isn’t available</h1>
              <p className={s.teaserVerdict}>{loadError}</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!definition) {
    return (
      <div className={v.vaniRoot}>
        <div className={v.darkStage}>
          <div className={v.wrap}>
            <TopBar />
            <div className={s.centerStage}><div className={s.orbXl} /></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={v.vaniRoot}>
      <div className={v.darkStage}>
        <div className={v.wrap}>
          <TopBar />

          {/* Resume prompt — blueprint edge state, shown on return with an
              incomplete response. */}
          {resumeOffer && (
            <div className={s.modalScrim} role="dialog" aria-modal="true">
              <div className={s.modalDemo}>
                <div className={s.orb} style={{ margin: '0 auto 14px' }} />
                <h3>Welcome back — pick up where you left off?</h3>
                <p>
                  Your assessment is saved at question{' '}
                  {Math.min(resumeOffer.index + 1, total)} of {total}.
                </p>
                <div className={s.actRow}>
                  <button type="button" className={`${s.btn} ${s.btnSmall}`} onClick={acceptResume}>
                    Resume →
                  </button>
                  <button type="button" className={`${s.btn} ${s.btnGhost} ${s.btnSmall}`} onClick={declineResume}>
                    Start over
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Landing ── */}
          {screen === 'landing' && (
            <section className={s.screen}>
              <div className={s.hero}>
                <div className={s.kicker}>AI Business Assessments</div>
                <h1>{definition.title}</h1>
                {definition.landing?.card_meta && <p>{definition.landing.card_meta}</p>}
              </div>
              <div className={s.cards}>
                <div className={`${s.aCard} ${s.live}`}>
                  {definition.landing?.card_tag && <div className={s.aTag}>{definition.landing.card_tag}</div>}
                  <h3>{definition.short_title}</h3>
                  <div className={s.meta}>
                    <b>{total} questions · ~{definition.estimated_minutes} minutes</b>
                  </div>
                  <button type="button" className={s.btn} onClick={() => setScreen('assessment')}>
                    {definition.landing?.cta ?? 'Start'} →
                  </button>
                </div>
              </div>
              <footer className={s.footer}>
                VaNi AI is built and operated by Vikuna Technologies, Hyderabad. Your responses are
                stored securely in India and used only to prepare your assessment. · vikuna.io
              </footer>
            </section>
          )}

          {/* ── Assessment ── */}
          {screen === 'assessment' && current && (
            <section className={s.screen}>
              <div className={s.assessShell}>
                <div className={s.progress}>
                  <i style={{ width: `${((index + 1) / total) * 100}%` }} />
                </div>
                <div className={s.pLabel}>QUESTION {index + 1} OF {total}</div>

                {answerError && (
                  <div className={s.errBanner} role="alert">
                    <span aria-hidden>⚠</span>
                    <span>
                      I couldn’t save that answer — {answerError}{' '}
                      <button type="button" className={s.retryBtn} onClick={() => retryRef.current?.()}>
                        Tap to retry.
                      </button>{' '}
                      Your previous answers are safe.
                    </span>
                  </div>
                )}

                <div className={s.framing}>
                  <div className={s.orb} />
                  <span>{current.framing}</span>
                </div>
                <div className={s.qText}>{current.text}</div>

                <div className={s.opts}>
                  {current.options.map((opt, i) => {
                    const selected = answers[current.id] === i;
                    return (
                      <button
                        key={i}
                        type="button"
                        className={`${s.opt} ${selected ? s.optSel : ''}`}
                        disabled={saving}
                        onClick={() => void submitAnswer(current.id, i)}
                      >
                        <span className={s.optKey}>{'ABCDEFGH'[i]}</span>
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className={s.assessFoot}>
                  {index > 0 ? (
                    <button type="button" className={s.linky} onClick={() => setIndex((i) => Math.max(0, i - 1))}>
                      ← Back
                    </button>
                  ) : <span />}
                  <span>Answers are saved as you go</span>
                </div>
              </div>
            </section>
          )}

          {/* ── Analyzing ── */}
          {screen === 'analyzing' && (
            <section className={s.screen}>
              <div className={s.centerStage}>
                <div className={s.orbXl} />
                <div className={s.thinkLine}>{THINK_LINES[thinkIndex]}</div>
              </div>
            </section>
          )}

          {/* ── Teaser ── */}
          {screen === 'teaser' && teaser && (
            <section className={s.screen}>
              <div className={s.teaser}>
                {definition.teaser?.kicker && <div className={s.kicker}>{definition.teaser.kicker}</div>}
                <span className={`${s.bandChip} ${BAND_CLASS[teaser.band.color] ?? s.bandAmber}`}>
                  ◆ {teaser.band.label}
                </span>
                <div className={s.scoreRow}>
                  <div className={s.scoreBig}>{teaser.health_score}</div>
                  <div className={s.scoreCap}>{definition.teaser?.score_caption}</div>
                </div>
                <p className={s.teaserVerdict}>{teaser.band.verdict}</p>

                <div className={s.modeCard}>
                  <div className={s.mTag}>#1 failure mode · {teaser.top_mode.exposure_pct}% exposure</div>
                  <h3>{teaser.top_mode.name}</h3>
                  <p>{teaser.top_mode.symptom}</p>
                </div>

                {definition.teaser?.locked_1 && (
                  <div className={s.locked}>
                    <span aria-hidden>🔒</span>
                    <span className={s.lockedN}>{definition.teaser.locked_1}</span>
                  </div>
                )}
                {definition.teaser?.locked_2 && (
                  <div className={s.locked}>
                    <span aria-hidden>🔒</span>
                    <span className={s.lockedN}>{definition.teaser.locked_2}</span>
                  </div>
                )}

                <div style={{ marginTop: 28 }}>
                  <button type="button" className={s.btn} onClick={() => setScreen('capture')}>
                    {definition.teaser?.cta ?? 'Continue'} →
                  </button>
                </div>
              </div>
            </section>
          )}

          {/* ── Capture ── */}
          {screen === 'capture' && (
            <section className={s.screen}>
              <div className={s.cap}>
                <div className={s.framing}>
                  <div className={s.orb} />
                  <span>VaNi · your report is ready</span>
                </div>
                <h2>{definition.capture?.heading}</h2>
                <p className={s.capSub}>{definition.capture?.sub}</p>

                {captureError && (
                  <div className={s.errBanner} role="alert">
                    <span aria-hidden>⚠</span>
                    <span>{captureError} <b>Your answers are safe — try again.</b></span>
                  </div>
                )}

                <form
                  onSubmit={(e) => { e.preventDefault(); void submitCapture(); }}
                  noValidate
                >
                  <div className={s.field}>
                    <label htmlFor="vani-name">NAME</label>
                    <input id="vani-name" required value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div className={s.field}>
                    <label htmlFor="vani-email">WORK EMAIL</label>
                    <input id="vani-email" type="email" required value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })} />
                  </div>
                  <div className={s.field}>
                    <label htmlFor="vani-company">COMPANY</label>
                    <input id="vani-company" required value={form.company}
                      onChange={(e) => setForm({ ...form, company: e.target.value })} />
                  </div>
                  <div className={s.field}>
                    <label htmlFor="vani-role">ROLE</label>
                    <input id="vani-role" required value={form.role_title}
                      onChange={(e) => setForm({ ...form, role_title: e.target.value })} />
                  </div>
                  {definition.capture?.optional_fields?.includes('phone') && (
                    <div className={s.field}>
                      <label htmlFor="vani-phone">PHONE (OPTIONAL)</label>
                      <input id="vani-phone" value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })} />
                    </div>
                  )}

                  {definition.capture?.dpdp_note && <p className={s.dpdp}>{definition.capture.dpdp_note}</p>}

                  <button type="submit" className={s.btn} disabled={submitting}>
                    {submitting ? 'Sending…' : `${definition.capture?.cta ?? 'Send'} →`}
                  </button>
                </form>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function TopBar() {
  return (
    <div className={s.top}>
      <div className={s.brand}>
        <div className={s.orb} />
        <div>
          <div className={s.wordmark}>VaNi <em>AI</em></div>
          <div className={s.byline}>BY VIKUNA TECHNOLOGIES</div>
        </div>
      </div>
    </div>
  );
}
