'use client';

/**
 * /knowledge — "Teach VaNi": the enrichment loop, out of onboarding.
 *
 * User ruling (2026-07-27): first-run onboarding is a sprint to quick
 * results; loops belong AFTER it — "anyone will come for quick results,
 * enhancements are the loops". So this page owns feeding VaNi more:
 * another URL (pricing, case studies, docs) or pasted context (competitor
 * notes, call summaries, positioning). Both run the SAME ingestion
 * pipeline as onboarding's step 1, so the knowledge graph and profile
 * grow from one code path.
 *
 * The tenant's own edits always win: the drafter only fills empty fields
 * or improves values still at their agent-drafted baseline.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import {
  VdfPageHeader,
  VdfButton,
  VdfKgLoader,
  VdfScoreRing,
} from '@/components/vdf';
import s from './knowledge.module.css';

interface GtmProfile {
  product_name: string | null;
  completion_score: number;
}

interface KbSource {
  id: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error_msg?: string | null;
  display_name?: string | null;
  source_type?: string | null;
  node_count?: number | null;
  created_at?: string | null;
}

const POLL_MS = 3000;
const POLL_LIMIT = 200;

export default function KnowledgePage() {
  const { showToast } = useToast();

  const [profile, setProfile] = useState<GtmProfile | null>(null);
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [state, setState] = useState<'idle' | 'running'>('idle');
  const [note, setNote] = useState('');
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refreshProfile = useCallback(async (): Promise<GtmProfile | null> => {
    try {
      const res = await apiFetch<{ profile: GtmProfile }>(API.gtmProfile.get);
      setProfile(res.profile);
      return res.profile;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => { refreshProfile(); }, [refreshProfile]);
  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current); }, []);

  const submit = useCallback(async () => {
    const u = url.trim();
    const t = text.trim();
    if (!u && !t) {
      showToast({ message: 'Add a URL or paste some context first', type: 'error' });
      return;
    }
    if (pollTimer.current) { clearTimeout(pollTimer.current); pollTimer.current = null; }

    setState('running');
    setNote('Handing the new context to VaNi…');
    const scoreBefore = profile?.completion_score ?? 0;

    try {
      const submissions: { source_id: string }[] = [];
      if (u) submissions.push(await apiFetch<{ source_id: string }>(API.ingest.submitUrl, { body: { url: u } }));
      if (t) submissions.push(await apiFetch<{ source_id: string }>(API.ingest.submitText, { body: { text: t, title: 'Pasted context' } }));

      setNote('Reading, extracting and writing to your knowledge graph…');

      let tries = 0;
      const poll = async () => {
        tries += 1;
        let allDone = true;
        for (const sub of submissions) {
          try {
            const res = await apiFetch<{ source: KbSource }>(API.ingest.getSource, { pathParams: { id: sub.source_id } });
            if (res.source.status === 'error') {
              showToast({ message: res.source.error_msg || 'One source failed to process', type: 'error' });
            } else if (res.source.status !== 'complete') {
              allDone = false;
            }
          } catch { allDone = false; }
        }

        if (allDone || tries >= POLL_LIMIT) {
          const p = await refreshProfile();
          setState('idle');
          setUrl('');
          setText('');
          const scoreAfter = p?.completion_score ?? scoreBefore;
          showToast({
            message: scoreAfter > scoreBefore
              ? `Profile enriched — score ${scoreBefore} → ${scoreAfter}`
              : 'Context absorbed into your knowledge graph — your existing profile fields were left as you set them',
            type: 'success',
          });
          return;
        }
        pollTimer.current = setTimeout(poll, POLL_MS);
      };
      poll();
    } catch (err) {
      setState('idle');
      showToast({ message: (err as ApiError).message || 'Could not submit the new context', type: 'error' });
    }
  }, [url, text, profile, refreshProfile, showToast]);

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="THE LOOP · ALWAYS OPEN"
        title="Teach VaNi"
        meta={profile?.product_name ? <>Building on {profile.product_name}</> : undefined}
      />

      <div className={s.body}>
        <section className={s.feedCard}>
          <div className={s.feedHead}>
            <div className={s.feedIntro}>
              <span className={s.feedTitle}>Feed VaNi more context</span>
              <p className={s.feedSub}>
                Another page — pricing, case studies, docs, careers — or paste anything
                you know: competitor notes, a call summary, your positioning doc.
                VaNi reads it, grows your knowledge graph, and fills profile gaps.
                <strong> Your own edits always win over drafts.</strong>
              </p>
            </div>
            {profile && (
              <div className={s.scoreWrap}>
                <VdfScoreRing value={profile.completion_score} label="Profile" size={92} />
              </div>
            )}
          </div>

          {state === 'running' ? (
            <VdfKgLoader message={note} hint="This runs the same pipeline as your first research — crawl, extract, write to the graph" />
          ) : (
            <>
              <div className={s.inputs}>
                <input
                  className={s.urlInput}
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="another URL — pricing page, docs, a case study…"
                />
                <textarea
                  className={s.textInput}
                  rows={5}
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="…or paste context: competitor notes, a call summary, your positioning doc"
                />
              </div>
              <div className={s.actions}>
                <VdfButton variant="primary" onClick={submit}>Feed it to VaNi</VdfButton>
              </div>
            </>
          )}
        </section>

        <section className={s.hints}>
          <span className={s.hintsLabel}>What moves the needle most</span>
          <ul className={s.hintList}>
            <li><strong>Case studies &amp; results</strong> — become proof points your decks and campaigns can cite.</li>
            <li><strong>Pricing &amp; packaging</strong> — sharpens qualification and positioning against competitors.</li>
            <li><strong>Competitor notes</strong> — anything the web didn&apos;t reveal; VaNi folds it into your competitive map.</li>
            <li><strong>Call summaries</strong> — real buyer language beats marketing copy for finding pains.</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
