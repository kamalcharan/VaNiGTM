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
import { Suspense, useEffect, useMemo, useState } from 'react';
import {
  jdScriptFor, UX_DONE_KEY, UX_DRAFT_KEY,
  readPublishedJds, writePublishedJds, deriveFamilyDefaults,
  type DraftJd, type PublishedFacts, type PublishedJd, type DerivedFamilyDefaults,
} from '../mock-data';
import { JdImport } from './JdImport';
import u from '@/platform/shell/ui.module.css';
import s from '../vara-onboarding.module.css';

type JdFacts = PublishedFacts;

const EMPTY: JdFacts = { musthaves: [], knockouts: [] };

function newId(): string {
  return `jd-${Math.floor(performance.now() * 1000).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
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

  const family = draft?.family ?? params.get('family') ?? 'Backend Engineering';
  const title = draft?.title ?? params.get('title') ?? 'Senior Engineer';

  const script = useMemo(() => jdScriptFor(family, title), [family, title]);
  const [stepIdx, setStepIdx] = useState(0);
  const [facts, setFacts] = useState<JdFacts>(EMPTY);
  const [transcript, setTranscript] = useState<{ who: 'v' | 'u'; text: string }[]>(() => [
    { who: 'v', text: script[0].ask },
  ]);
  const [published, setPublished] = useState(false);
  const [familyPrompt, setFamilyPrompt] = useState(false);
  const [familyJds, setFamilyJds] = useState<PublishedJd[] | null>(null);
  const [derived, setDerived] = useState<DerivedFamilyDefaults | null>(null);

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
  const canPublish = stepIdx >= script.length && (facts.musthaves.length > 0);

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

  function publish() {
    const existing = readPublishedJds();
    let next: PublishedJd[];
    let publishedVersion: number;
    if (draft?.mode === 'edit') {
      // Edit → new version of the same identity. Append per V-14 (append-only),
      // so v1 stays honest and Duplicate still targets whichever version was clicked.
      publishedVersion = draft.baseVersion + 1;
      next = [...existing, { id: draft.id, family, title, version: publishedVersion, facts }];
    } else {
      // Fresh JD (either new from doorway or a Duplicate that mints a new id).
      publishedVersion = 1;
      next = [...existing, { id: draft?.id ?? newId(), family, title, version: 1, facts }];
    }
    writePublishedJds(next);
    try { sessionStorage.setItem(UX_DONE_KEY, '1'); } catch { /* private mode */ }
    setPublished(true);

    // Family-defaults prompt fires on the 2nd distinct JD identity in a
    // family — a Duplicate that publishes as a new identity triggers it,
    // an Edit that publishes as v2 of the SAME identity does not (there is
    // still only one JD in the family, just at a higher version).
    const distinctIdsInFamily = new Set(next.filter((j) => j.family === family).map((j) => j.id));
    if (distinctIdsInFamily.size >= 2) {
      const latestPerId = new Map<string, PublishedJd>();
      for (const j of next.filter((k) => k.family === family)) {
        const cur = latestPerId.get(j.id);
        if (!cur || j.version > cur.version) latestPerId.set(j.id, j);
      }
      const familyList = Array.from(latestPerId.values());
      setFamilyJds(familyList);
      setDerived(deriveFamilyDefaults(familyList));
      setFamilyPrompt(true);
    } else {
      setTimeout(() => router.replace('/agents/vara/onboarding'), 1800);
    }
  }

  function acceptDerivation() {
    // No family-profile row is written in the preview — the prompt is the
    // shape, not the persistence. Real Phase 3 wires vara_family_profile.
    router.replace('/agents/vara/onboarding');
  }

  if (published) {
    return (
      <div className={s.wrap}>
        {familyPrompt && derived && familyJds ? (
          <div className={s.card} style={{ borderColor: 'var(--gold)' }}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>Ready to seed defaults for {family}</h2>
              <span className={s.cardMeta}>derived from {familyJds.length} JDs in this family</span>
            </div>
            <p className={s.cardWhat}>
              These items appeared in <b>all {familyJds.length}</b> JDs, so Vara
              would keep them as {family} defaults. The next JD you add in this
              family inherits them; you can still tune per-JD.
            </p>

            <div className={s.derivBox}>
              <div className={s.derivHead}>Included</div>
              {derived.musthaves.length === 0 && derived.knockouts.length === 0 && (
                <div className={s.derivEmpty}>
                  Nothing in common yet — the JDs don&rsquo;t share any must-have
                  or knockout by name. Family defaults will stay empty until a
                  future JD reinforces a pattern.
                </div>
              )}
              {derived.musthaves.length > 0 && (
                <ul className={s.derivList}>
                  {derived.musthaves.map((m) => (
                    <li key={m.name} className={s.derivRow}>
                      <span className={s.derivBadge}>must-have</span>
                      <span className={s.derivName}>{m.name}</span>
                      <span className={s.derivMeta}>
                        avg wt {m.weight} · in {m.in}/{m.of}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {derived.knockouts.length > 0 && (
                <ul className={s.derivList}>
                  {derived.knockouts.map((k) => (
                    <li key={k.label} className={s.derivRow}>
                      <span className={s.derivBadgeK}>knockout</span>
                      <span className={s.derivName}>{k.label} — {k.rule}</span>
                      <span className={s.derivMeta}>in {k.in}/{k.of}</span>
                    </li>
                  ))}
                </ul>
              )}
              {derived.threshold !== undefined && (
                <div className={s.derivFoot}>
                  Threshold default: <b>{derived.threshold}%</b>
                  {derived.band_range && <> · Bands seen: {derived.band_range}</>}
                </div>
              )}
            </div>

            <div className={s.derivDiff}>
              <div className={s.derivDiffH}>Not carried across (JD-specific)</div>
              {familyJds.map((jd) => {
                const derivedMustNames = new Set(derived.musthaves.map((m) => m.name));
                const derivedKnockLabels = new Set(derived.knockouts.map((k) => k.label));
                const musts = jd.facts.musthaves.filter((m) => !derivedMustNames.has(m.name));
                const knocks = jd.facts.knockouts.filter((k) => !derivedKnockLabels.has(k.label));
                if (musts.length === 0 && knocks.length === 0) {
                  return (
                    <div key={jd.id} className={s.derivPerJd}>
                      <b>{jd.title}</b> v{jd.version} — nothing unique.
                    </div>
                  );
                }
                return (
                  <div key={jd.id} className={s.derivPerJd}>
                    <b>{jd.title}</b> v{jd.version}: {[...musts.map((m) => m.name), ...knocks.map((k) => k.label)].join(', ')}
                  </div>
                );
              })}
            </div>

            <div className={s.actions} style={{ marginTop: 14 }}>
              <button type="button" className={s.primary} onClick={acceptDerivation}>
                Apply as {family} defaults
              </button>
              <button type="button" className={s.ghost} onClick={() => router.replace('/agents/vara/onboarding')}>
                Skip — keep JDs independent
              </button>
            </div>
          </div>
        ) : (
          <div className={s.doneCard}>
            <h1 className={s.doneTitle}>Vara is live for your workspace</h1>
            <p className={s.doneSub}>
              {title} is now published as v{draft?.mode === 'edit' ? draft.baseVersion + 1 : 1} in the {family} family. Redirecting…
            </p>
          </div>
        )}
      </div>
    );
  }

  if (!hydrated) {
    return <div className={s.wrap}><div style={{ padding: 24 }}>Loading…</div></div>;
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
                <div className={s.chatName}>Vara · {family}</div>
                <div className={s.chatSub}>compose · say it, Vara structures it</div>
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
              {current ? (
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
              {family} · draft · will be v{draft?.mode === 'edit' ? draft.baseVersion + 1 : 1} on publish
            </p>

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
                disabled={!canPublish}
              >
                Publish this JD → take Vara live
              </button>
            </div>
            <p className={s.note} style={{ marginTop: 8 }}>
              Publishing this JD also seeds default weights and threshold for
              future roles in {family} — the second JD you add here will
              inherit them.
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
