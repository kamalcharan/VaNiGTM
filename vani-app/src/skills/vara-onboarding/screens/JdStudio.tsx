'use client';

/**
 * JD Studio — compose a JD by chatting with Vara.
 *
 * UX PREVIEW ONLY. Scripted flow instead of a real LLM conversation, so the
 * shape is visible before any model is wired. Every quick-reply chip
 * CONTRIBUTES structured facts to the JD panel on the right — weights,
 * knockouts, threshold, band. That is what Charan meant by
 * "the playbook controls will be the outcome of JD Studio": the tenant
 * never touches abstract sliders here; they answer role-shaped questions
 * and the numbers emerge.
 *
 * Publish is the LIVE moment. The first JD in a family also silently seeds
 * that family's playbook defaults (weights, threshold) so the second JD in
 * the same family inherits them — no repetition.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/platform/feedback';
import { useSkillQuery } from '@/lib/useSkill';
import {
  UX_DRAFT_KEY, EMPLOYMENT_TYPES, workModeLabel,
  type DraftJd, type PublishedFacts,
} from '../mock-data';
import { fromStarter, unknownRole, type JdStudioStep } from '../jd-script';
import { JdImport } from './JdImport';
import u from '@/platform/shell/ui.module.css';
import s from '../vara-onboarding.module.css';

type JdFacts = PublishedFacts;

const EMPTY: JdFacts = { musthaves: [], knockouts: [] };

const SKILL = 'domain-pack-skill';

interface StarterShape {
  role_summary_hint?: string;
  musthaves?: { name: string; weight: number; years?: number; why?: string }[];
  knockouts?: { label: string; rule: string }[];
  threshold?: number;
  band_hint?: string;
}

/**
 * What `domain-pack-skill.match_title` answers. A union, not a bag of
 * optionals, because the two branches are genuinely different screens: one
 * prefills from a real family, the other admits it has nothing.
 */
type MatchResult =
  | {
      matched: true;
      family_name: string;
      matched_title: string;
      researched: boolean;
      score: number;
      starter: StarterShape;
      detail: string;
      alternates?: { family_name: string; matched_title: string; score: number }[];
    }
  | { matched: false; reason: string; detail: string };

/**
 * Weight for a must-have the tenant TYPED rather than picked off a pack.
 *
 * Descending, and Vara says so before asking ("give me the strongest signal
 * first — I'll weight it heaviest"). The number lands in the JD panel where
 * the tenant can see it, so it is a stated rule they can check, not a guess
 * made on their behalf. Matched roles never come through here — those weights
 * come from the pack.
 */
function typedWeight(existing: number): number {
  return [40, 25, 20, 15][existing] ?? 10;
}

function mintIdempotencyKey(): string {
  // A per-attempt key: high-resolution counter + a wide random tail, stable
  // across React re-renders (held in a ref) but fresh per publish attempt.
  return `jd-compose-${Math.floor(performance.now() * 1000).toString(36)}-${Math.floor(Math.random() * 1e9).toString(36)}`;
}

function mergeFacts(prev: JdFacts, contrib: Record<string, unknown>): JdFacts {
  const next: JdFacts = {
    ...prev,
    musthaves: [...prev.musthaves],
    knockouts: [...prev.knockouts],
  };
  if (typeof contrib.one_liner === 'string') next.one_liner = contrib.one_liner;
  if (typeof contrib.band === 'string') next.band = contrib.band;
  if (typeof contrib.threshold === 'number') next.threshold = contrib.threshold;
  if (contrib.top_musthave && typeof contrib.top_musthave === 'object') {
    next.musthaves = [contrib.top_musthave as JdFacts['musthaves'][number], ...prev.musthaves];
  }
  if (contrib.addl_musthave && typeof contrib.addl_musthave === 'object') {
    next.musthaves = [...prev.musthaves, contrib.addl_musthave as JdFacts['musthaves'][number]];
  }
  // "All of them" — the bulk chip on a matched family. Without this the chip
  // reads as accepting the pack's whole shape and silently adds nothing.
  if (Array.isArray(contrib.addl_musthaves)) {
    next.musthaves = [
      ...next.musthaves,
      ...(contrib.addl_musthaves as JdFacts['musthaves']),
    ];
  }
  if (contrib.knockout && typeof contrib.knockout === 'object') {
    next.knockouts = [...prev.knockouts, contrib.knockout as JdFacts['knockouts'][number]];
  }
  return next;
}

function JdStudioInner() {
  const router = useRouter();
  const params = useSearchParams();

  // Draft (Duplicate / Edit) is hydrated inside an effect — sessionStorage
  // is not available on the SSR pass. So the initial render works from URL
  // params alone; the draft's family/title/facts are grafted on afterwards.
  const [draft, setDraft] = useState<DraftJd | null>(null);
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(UX_DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as DraftJd;
        setDraft(d);
        // Clear immediately so a refresh doesn't re-apply stale draft state.
        sessionStorage.removeItem(UX_DRAFT_KEY);
      }
    } catch { /* private mode */ }
    setHydrated(true);
  }, []);

  const familyParam = (draft?.family ?? params.get('family') ?? '').trim();
  const titleParam = (draft?.title ?? params.get('title') ?? '').trim();

  // Reached from the nav rather than the doorway, nothing names the role.
  // This used to default to "Senior Engineer" in "Backend Engineering" — a JD
  // nobody asked for, in a family that might not be theirs. Ask instead.
  const [titleAsked, setTitleAsked] = useState('');
  const [titleDraftBox, setTitleDraftBox] = useState('');
  const [familyAsked, setFamilyAsked] = useState('');
  const title = titleParam || titleAsked;

  // What Vara actually knows about this title. Server-side and deterministic
  // (no LLM), so it answers in one round trip and answers the same way twice.
  const match = useSkillQuery<MatchResult>(SKILL, 'match_title', { title }, {
    enabled: !draft && title.length > 1,
    staleTime: 5 * 60_000,
  });
  const result = match.data?.success ? match.data.data : null;
  const matched = result && result.matched ? result : null;

  // A refusal arrives as success:false with HTTP 200 — the query SUCCEEDS and
  // carries no data. Treated as "still loading", which is what this did, the
  // composer waits forever and the tenant sees an empty screen with no reason
  // given. It is the same failure the research card had: "the backend does not
  // have this skill" and "nothing to report" must never look alike.
  const refused = match.data && !match.data.success
    ? (match.data.error || 'The service refused the request.')
    : null;
  const failed = match.isError ? match.error.message : refused;

  // The explicit way out of a failure, chosen by the tenant, never taken for
  // them (rule 12). Vara could not look the role up, so she asks about it from
  // scratch — which is a real conversation, not a substituted result.
  const [scratch, setScratch] = useState(false);

  // A matched family names itself. An unmatched one has to be named by the
  // tenant — the server requires a family on publish, and inventing one here
  // would put a role into a playbook it does not belong to.
  const family = familyParam || matched?.family_name || familyAsked.trim();

  const script = useMemo<JdStudioStep[]>(() => {
    if (draft || !title) return [];          // a draft skips the conversation
    if (matched) return fromStarter(matched.starter, matched.family_name, title);
    if (result || scratch) return unknownRole(title);  // knows nothing, or could not look
    return [];                                          // still asking
  }, [draft, title, matched, result, scratch]);

  const [stepIdx, setStepIdx] = useState(0);
  const [facts, setFacts] = useState<JdFacts>(EMPTY);
  const [transcript, setTranscript] = useState<{ who: 'v' | 'u'; text: string }[]>([]);
  const [typedDraft, setTypedDraft] = useState('');

  // The opening question can only be asked once the script exists, and the
  // script waits on the match. Seeding it in a useState initialiser — as this
  // did — chose Vara's first line before she had looked anything up.
  useEffect(() => {
    if (draft || script.length === 0) return;
    setTranscript((t) => (t.length ? t : [{ who: 'v', text: script[0].ask }]));
  }, [draft, script]);
  const [published, setPublished] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);
  const [locDraft, setLocDraft] = useState('');
  const submitOnce = useRef(false);   // guard against double-submit at the ref level, not state
  const qc = useQueryClient();
  const { showToast } = useToast();

  // Draft hydration: once a draft lands, prefill facts + jump the transcript
  // to the "conversation complete" state so the tenant can tune-and-publish
  // rather than answer the script from scratch. Real build will hand the
  // draft to the LLM as prior context; this preview just skips ahead.
  useEffect(() => {
    if (!draft) return;
    setFacts(draft.facts);
    setStepIdx(script.length);
    setTranscript([
      { who: 'v', text:
        draft.mode === 'edit'
          ? `Editing ${draft.title} — publishing again will become v${draft.baseVersion + 1}. Tune anything on the right, or type below to change a section.`
          : `Duplicated from ${draft.title} — this will publish as a brand-new v1. Tune anything on the right, or say what you want changed.` },
    ]);
  }, [draft, script.length]);

  const current = stepIdx < script.length ? script[stepIdx] : null;
  const canPublish = stepIdx >= script.length
    && facts.musthaves.length > 0
    && family.length > 0;

  function pick(chipLabel: string, contributes: Record<string, unknown>) {
    setFacts((f) => mergeFacts(f, contributes));
    const next = stepIdx + 1;
    const newTurns: { who: 'v' | 'u'; text: string }[] = [
      { who: 'u', text: chipLabel },
    ];
    if (next < script.length) {
      newTurns.push({ who: 'v', text: script[next].ask });
    } else {
      newTurns.push({
        who: 'v',
        text:
          "That's the shape. The panel on the right is your JD, ready to publish. " +
          "Publishing will take Vara live for your workspace, and start listing this role in the embed.",
      });
    }
    setTranscript((t) => [...t, ...newTurns]);
    setStepIdx(next);
  }

  /** A must-have or a summary the tenant typed, rather than picked. */
  function submitTyped() {
    const text = typedDraft.trim();
    if (!text || !current?.typed) return;
    setTypedDraft('');
    if (current.typed.kind === 'one_liner') {
      pick(text, { one_liner: text });
      return;
    }
    const entry = { name: text, weight: typedWeight(facts.musthaves.length) };
    pick(
      `${text} (${entry.weight}%)`,
      facts.musthaves.length === 0 ? { top_musthave: entry } : { addl_musthave: entry },
    );
  }

  const idemKeyRef = useRef<string | null>(null);
  async function publish() {
    if (submitOnce.current || publishing) return;
    submitOnce.current = true;
    setPublishing(true);
    // Mint one key per logical attempt, reuse across retries of that same
    // attempt so a network hiccup doesn't create two JDs.
    if (!idemKeyRef.current) idemKeyRef.current = mintIdempotencyKey();
    try {
      const r = await apiFetch<{
        jd_id: string;
        version: number;
        subscription_status?: string;
        live_first_time?: boolean;
        replayed?: boolean;
      }>(API.vara.jdCompose, {
        body: { family, title, facts },
        idempotencyKey: idemKeyRef.current,
      });
      setPublishedVersion(r.version);
      setPublished(true);
      // Refresh the doorway list AND the landing status — both are
      // affected by a new JD (list grows; subscription may flip live).
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['vara', 'onboarding-context'] }),
        qc.invalidateQueries({ queryKey: ['vara', 'state'] }),
      ]);
      showToast({
        message: r.live_first_time
          ? 'Published — Vara is now live for your workspace.'
          : `Published as v${r.version}.`,
        type: 'success',
      });
      setTimeout(() => router.replace('/agents/vara/onboarding'), 1800);
    } catch (err) {
      // Reset the ref so the tenant can genuinely re-submit after fixing
      // whatever went wrong; the same idempotency key stays so a retry of
      // the SAME attempt (network flap while the button was hit) still
      // dedupes on the server.
      submitOnce.current = false;
      const msg = err instanceof ApiError ? err.message : 'Could not publish this JD';
      showToast({ message: msg, type: 'error' });
    } finally {
      setPublishing(false);
    }
  }

  if (published) {
    return (
      <div className={s.wrap}>
        <div className={s.doneCard}>
          <h1 className={s.doneTitle}>Vara is live for your workspace</h1>
          <p className={s.doneSub}>
            {title} is now published as v{publishedVersion ?? 1} in the {family} family. Redirecting…
          </p>
        </div>
        {/* Family-defaults derivation lands with Phase 3 (vara_family_profile
            statistics over N JDs). Kept as a client-side preview earlier;
            re-enters when the writer exists on the server side. */}
      </div>
    );
  }

  if (!hydrated) {
    return <div className={s.wrap}><div style={{ padding: 24 }}>Loading…</div></div>;
  }

  // No title means nobody has said what this JD is for. Ask, and let the
  // match run off the answer — the family follows from the title, not the
  // other way round.
  if (!title) {
    return (
      <div className={s.wrap}>
        <div className={u.eyebrow}>// AGENTS · VARA · JD STUDIO</div>
        <h1 className={u.h1}>What are you hiring for?</h1>
        <div className={s.card}>
          <p className={s.cardWhat}>
            Type the role title. I&rsquo;ll check it against the role families I
            know for your industry — if I have one, we start from its real
            must-haves; if I don&rsquo;t, I&rsquo;ll say so and you shape it.
          </p>
          <form
            className={s.locAdd}
            onSubmit={(e) => { e.preventDefault(); setTitleAsked(titleDraftBox.trim()); }}
          >
            <input
              className={s.textInput}
              value={titleDraftBox}
              onChange={(e) => setTitleDraftBox(e.target.value)}
              placeholder="Senior Backend Engineer, Depot Supervisor…"
              aria-label="Role title"
              autoFocus
            />
            <button type="submit" className={s.primary} disabled={titleDraftBox.trim().length < 3}>
              Start
            </button>
          </form>
        </div>
      </div>
    );
  }

  const mode = params.get('mode') === 'import' ? 'import' : 'compose';

  if (mode === 'import') {
    return (
      <div className={s.wrap}>
        <div className={u.eyebrow}>// AGENTS · VARA · JD STUDIO · IMPORT</div>
        <h1 className={u.h1}>{title}</h1>
        <div className={s.uxBanner}>
          <b>Design preview.</b> Deterministic mock extraction — the real one
          runs a fenced LLM stage that emits evidence spans and confidence
          per field. Drop any file; the preview populates a fixture so you
          can see the review pattern with provenance.
        </div>
        <JdImport family={family} title={title} />
      </div>
    );
  }

  return (
    <div className={s.wrap}>
      <div className={u.eyebrow}>// AGENTS · VARA · JD STUDIO · COMPOSE</div>
      <h1 className={u.h1}>{title}</h1>

      <div className={s.uxBanner}>
        <b>Design preview.</b> Scripted composer flow — the real one uses LLM
        chat. Every answer you pick becomes a structured fact on the right;
        weights, knockouts and threshold are the OUTCOME of this conversation,
        not settings you configure directly. Publishing this JD is what takes
        Vara live for this workspace and seeds this family&rsquo;s defaults.
      </div>

      <div className={s.studio}>
        {/* Left: compose-with-Vara ─────────────────────────────────── */}
        <div className={s.chatCol}>
          <div className={s.chatCard}>
            <div className={s.chatHead}>
              <span className={s.chatAvatar}>V</span>
              <div>
                <div className={s.chatName}>Vara · {family || 'new role family'}</div>
                {/* Provenance, in the one place the tenant is looking. "Matched
                    X, researched for Y" and "no family looks like this" are
                    different conversations and must not read the same. */}
                <div className={s.chatSub}>
                  {failed
                    ? 'could not reach my role families'
                    : match.isFetching && !result
                      ? 'checking what I know about this role…'
                      : result?.detail ?? 'compose · say it, Vara structures it'}
                </div>
              </div>
            </div>
            <div className={s.chatBody}>
              {transcript.map((t, i) => (
                <div key={i} className={t.who === 'v' ? `${s.msg} ${s.msgV}` : `${s.msg} ${s.msgU}`}>
                  {t.text}
                </div>
              ))}
            </div>
            <div className={s.chatFoot}>
              {script.length === 0 && !draft ? (
                failed ? (
                  <div className={s.researchFailed}>
                    <div className={s.researchDetail}>
                      I could not check which role family &ldquo;{title}&rdquo; belongs to.
                    </div>
                    {/* The server's own words. A generic "something went wrong"
                        here is why a missing deploy and a real outage took
                        three rounds to tell apart. */}
                    <div className={s.researchNote}>{failed}</div>
                    <div className={s.actions}>
                      <button
                        type="button"
                        className={s.btnRetry}
                        onClick={() => { void match.refetch(); }}
                        disabled={match.isFetching}
                      >
                        {match.isFetching ? 'Checking…' : 'Try again'}
                      </button>
                      <button type="button" className={s.ghost} onClick={() => setScratch(true)}>
                        Shape it from scratch
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className={s.note} style={{ textAlign: 'center' }}>
                    Checking what I know about this role…
                  </div>
                )
              ) : current ? (
                <>
                  {current.chips.length > 0 && (
                    <div className={s.chipRow}>
                      {current.chips.map((c) => (
                        <button
                          key={c.label}
                          type="button"
                          className={s.chip}
                          onClick={() => pick(c.label, c.contributes)}
                        >
                          {c.label}
                        </button>
                      ))}
                    </div>
                  )}
                  {/* Typing is the only option when nothing matched, and always
                      an option when something did — a pack is a starting shape,
                      not a ceiling. Chips-only was why an unmatched tenant had
                      no way to enter anything at all. */}
                  {current.typed && (
                    <form
                      className={s.locAdd}
                      onSubmit={(e) => { e.preventDefault(); submitTyped(); }}
                    >
                      <input
                        className={s.textInput}
                        value={typedDraft}
                        onChange={(e) => setTypedDraft(e.target.value)}
                        placeholder={current.typed.placeholder}
                        aria-label={current.typed.placeholder}
                      />
                      <button type="submit" className={s.ghost} disabled={!typedDraft.trim()}>
                        Add
                      </button>
                    </form>
                  )}
                </>
              ) : (
                <div className={s.note} style={{ textAlign: 'center' }}>
                  Conversation complete — review the JD on the right, publish when ready.
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: JD emerging ───────────────────────────────────────── */}
        <div className={s.jdCol}>
          <div className={s.jdCard}>
            <h2 className={s.jdTitle}>{title}</h2>
            <p className={s.jdSub}>
              {family || 'family not set'} · draft · will be v{draft?.mode === 'edit' ? draft.baseVersion + 1 : 1} on publish
            </p>

            {/* Only when nothing matched and nothing named it. The server
                requires a family, and picking one for the tenant is how a
                Customer Success role ends up scored on an engineering
                playbook. */}
            {!family && (
              <div className={s.jdSection}>
                <div className={s.jdSectionH}>Role family</div>
                <input
                  className={s.textInput}
                  value={familyAsked}
                  onChange={(e) => setFamilyAsked(e.target.value)}
                  placeholder="Depot Operations, Clinical Care…"
                  aria-label="Role family"
                />
                <p className={s.note} style={{ marginTop: 6 }}>
                  No family I know looks like &ldquo;{title}&rdquo;, so name the one this
                  belongs to. The next role like it inherits what you set here.
                </p>
              </div>
            )}

            <div className={s.jdSection}>
              <div className={s.jdSectionH}>Role summary</div>
              {facts.one_liner
                ? <div className={s.jdLine}>{facts.one_liner}</div>
                : <div className={s.jdEmpty}>emerges from your first answer</div>}
            </div>

            <div className={s.jdSection}>
              <div className={s.jdSectionH}>Must-haves · weighted</div>
              {facts.musthaves.length === 0
                ? <div className={s.jdEmpty}>emerges as you answer</div>
                : facts.musthaves.map((m, i) => (
                  <div key={i} className={s.weightRow}>
                    <div>
                      <div className={s.weightName}>{m.name}</div>
                      <div className={s.weightBar}>
                        <div className={s.weightFill} style={{ width: `${m.weight}%` }} />
                      </div>
                    </div>
                    <div className={s.weightVal}>{m.weight} wt</div>
                  </div>
                ))}
            </div>

            <div className={s.jdSection}>
              <div className={s.jdSectionH}>Knockout rules · deterministic, never scored</div>
              {facts.knockouts.length === 0
                ? <div className={s.jdEmpty}>emerges from your policy answers</div>
                : facts.knockouts.map((k, i) => (
                  <div key={i} className={s.knockRow}>
                    <span className={s.knockLabel}>{k.label}</span>
                    <span className={s.knockRule}>{k.rule}</span>
                  </div>
                ))}
            </div>

            {/* The posting — what a candidate reads. The scoring contract above
                is what Vara evaluates. Both are versioned together so the two
                can never drift apart into a promise the weights don't keep. */}
            <div className={s.jdSection}>
              <div className={s.jdSectionH}>Description · what candidates read</div>
              <textarea
                className={s.descBox}
                value={facts.description ?? ''}
                onChange={(e) => setFacts((f) => ({ ...f, description: e.target.value }))}
                placeholder="What the role does, who it works with, why it matters."
                rows={6}
                aria-label="Role description"
              />
              {/* Drafting from the facts needs the composer LLM, which is not
                  reachable yet (POA standing dependency). Following the same
                  habit as Edit: say so rather than render a button that fails. */}
              <p className={s.note} style={{ marginTop: 6 }}>
                Vara will draft this from the facts above in your brand voice —
                you edit, then publish. That arrives with the composer LLM; for
                now, write it yourself. Left blank, the widget shows the role
                summary alone.
              </p>
            </div>

            {/* The employment contract. Typed directly rather than drawn out of
                the conversation: these are declarations with exact answers, and
                asking a model to infer "part time" from prose would be a worse
                way to learn something the tenant can state in two clicks. */}
            <div className={s.jdSection}>
              <div className={s.jdSectionH}>Employment</div>

              <div className={s.chipRow} role="group" aria-label="Employment type">
                {EMPLOYMENT_TYPES.map((t) => (
                  <button
                    key={t.value}
                    type="button"
                    className={facts.employment_type === t.value ? s.suggChipOn : s.suggChip}
                    aria-pressed={facts.employment_type === t.value}
                    onClick={() => setFacts((f) => ({
                      ...f,
                      employment_type: f.employment_type === t.value ? undefined : t.value,
                    }))}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <label className={s.modeLabel} htmlFor="jd-onsite">
                Work mode
                <span className={s.modeValue}>{workModeLabel(facts.onsite_pct)}</span>
              </label>
              <input
                id="jd-onsite"
                type="range"
                min={0}
                max={100}
                step={10}
                className={s.slider}
                value={facts.onsite_pct ?? 0}
                onChange={(e) => setFacts((f) => ({ ...f, onsite_pct: Number(e.target.value) }))}
                aria-valuetext={workModeLabel(facts.onsite_pct)}
              />
              <div className={s.sliderEnds} aria-hidden="true">
                <span>Fully remote</span><span>Fully on-site</span>
              </div>

              <div className={s.jdSectionH} style={{ marginTop: 14 }}>Locations</div>
              {(facts.locations ?? []).length > 0 && (
                <div className={s.chipRow}>
                  {(facts.locations ?? []).map((loc) => (
                    <button
                      key={loc}
                      type="button"
                      className={s.locChip}
                      title={`Remove ${loc}`}
                      onClick={() => setFacts((f) => ({
                        ...f,
                        locations: (f.locations ?? []).filter((l) => l !== loc),
                      }))}
                    >
                      {loc} <span aria-hidden="true">×</span>
                    </button>
                  ))}
                </div>
              )}
              <form
                className={s.locAdd}
                onSubmit={(e) => {
                  e.preventDefault();
                  const v = locDraft.trim();
                  if (!v) return;
                  // Case-insensitive dedup: "Hyderabad" and "hyderabad" are one
                  // place, and two chips for it would read as two locations.
                  setFacts((f) => {
                    const cur = f.locations ?? [];
                    if (cur.some((l) => l.toLowerCase() === v.toLowerCase())) return f;
                    return { ...f, locations: [...cur, v] };
                  });
                  setLocDraft('');
                }}
              >
                <input
                  className={s.textInput}
                  value={locDraft}
                  onChange={(e) => setLocDraft(e.target.value)}
                  placeholder="Hyderabad, Remote (India)…"
                  aria-label="Add a location"
                />
                <button type="submit" className={s.ghost} disabled={!locDraft.trim()}>Add</button>
              </form>
              <p className={s.note} style={{ marginTop: 8 }}>
                How many seats you are filling — and how they split across these
                locations — is tracked separately, so filling one does not
                republish the JD. That lands with the candidate pipeline.
              </p>
            </div>

            <div className={s.jdSection}>
              <div className={s.jdSectionH}>Threshold & band</div>
              <div className={s.jdLine}>
                Handover threshold: {facts.threshold !== undefined ? `${facts.threshold}%` : <span className={s.jdEmpty}>—</span>}
              </div>
              <div className={s.jdLine}>
                Comp band: {facts.band ?? <span className={s.jdEmpty}>—</span>}
              </div>
            </div>

            <div className={s.publishRow}>
              <button
                type="button"
                className={s.primary}
                onClick={publish}
                disabled={!canPublish || publishing}
              >
                {publishing ? 'Publishing…' : 'Publish this JD → take Vara live'}
              </button>
            </div>
            <p className={s.note} style={{ marginTop: 8 }}>
              {family
                ? `Publishing this JD also seeds default weights and threshold for future roles in ${family} — the second JD you add here will inherit them.`
                : 'Name the role family above to publish — it is what future roles inherit from.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function JdStudio() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <JdStudioInner />
    </Suspense>
  );
}
