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
import { Suspense, useMemo, useState } from 'react';
import { jdScriptFor, UX_DONE_KEY, UX_PUBLISHED_JDS_KEY } from '../mock-data';
import { JdImport } from './JdImport';
import u from '@/platform/shell/ui.module.css';
import s from '../vara-onboarding.module.css';

interface JdFacts {
  one_liner?: string;
  band?: string;
  threshold?: number;
  musthaves: { name: string; weight: number }[];
  knockouts: { label: string; rule: string }[];
}

const EMPTY: JdFacts = { musthaves: [], knockouts: [] };

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
  const family = params.get('family') ?? 'Backend Engineering';
  const title = params.get('title') ?? 'Senior Engineer';

  const script = useMemo(() => jdScriptFor(family, title), [family, title]);
  const [stepIdx, setStepIdx] = useState(0);
  const [facts, setFacts] = useState<JdFacts>(EMPTY);
  const [transcript, setTranscript] = useState<{ who: 'v' | 'u'; text: string }[]>(() => [
    { who: 'v', text: script[0].ask },
  ]);
  const [published, setPublished] = useState(false);
  const [familyPrompt, setFamilyPrompt] = useState(false);

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
    let list: { family: string; title: string }[] = [];
    try {
      list = JSON.parse(sessionStorage.getItem(UX_PUBLISHED_JDS_KEY) || '[]');
    } catch { /* ignore */ }
    list.push({ family, title });
    try {
      sessionStorage.setItem(UX_PUBLISHED_JDS_KEY, JSON.stringify(list));
      sessionStorage.setItem(UX_DONE_KEY, '1');
    } catch { /* private mode */ }
    setPublished(true);
    const secondInFamily = list.filter((j) => j.family === family).length >= 2;
    if (secondInFamily) {
      setFamilyPrompt(true);
    } else {
      setTimeout(() => router.replace('/agents/vara'), 1800);
    }
  }

  function acceptDerivation() {
    router.replace('/agents/vara');
  }

  if (published) {
    return (
      <div className={s.wrap}>
        {familyPrompt ? (
          <div className={s.card} style={{ borderColor: 'var(--gold)' }}>
            <div className={s.cardHead}>
              <h2 className={s.cardTitle}>Ready to seed defaults for {family}</h2>
              <span className={s.cardMeta}>from 2 of 2 JDs in this family</span>
            </div>
            <p className={s.cardWhat}>
              The must-haves that appeared in both JDs become family defaults;
              the knockouts that appeared in both become always-applied. The
              next JD you add in {family} will inherit these — you can still
              tune per-JD.
            </p>
            <div className={s.actions}>
              <button type="button" className={s.primary} onClick={acceptDerivation}>
                Apply as {family} defaults
              </button>
              <button type="button" className={s.ghost} onClick={() => router.replace('/agents/vara')}>
                Skip — keep JDs independent
              </button>
            </div>
          </div>
        ) : (
          <div className={s.doneCard}>
            <h1 className={s.doneTitle}>Vara is live for your workspace</h1>
            <p className={s.doneSub}>
              {title} is now the first role in the {family} family. Redirecting…
            </p>
          </div>
        )}
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
            <p className={s.jdSub}>{family} · draft · will be v1 on publish</p>

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
