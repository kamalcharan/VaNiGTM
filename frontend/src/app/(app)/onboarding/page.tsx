'use client';

/**
 * /onboarding — the agent-led mission wizard (LIVE, replaces form-first
 * onboarding per the approved PLG direction).
 *
 * Steps 1–3 are wired to the real backend:
 *   1. Research company  → POST /ingest/url → poll source → poll profile
 *   2. Confirm ICP       → PUT /profile (blur-save) → POST /profile/approve
 *   3. Pitch deck        → POST /storyteller/build → PATCH approve → share link
 * Steps 4–6 (Lead Finder / Sequence / Pulse) are visible but locked —
 * they unlock as those agents ship.
 *
 * Finishing PATCHes every pending vn_tenant_onboarding step; the (app)
 * layout guard then routes to /dashboard. The ICP builder at
 * /onboarding/icp-builder remains the post-onboarding refine surface.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { useOnboardingStatus } from '@/hooks/useOnboarding';
import { ME_QUERY_KEY } from '@/hooks/useMe';
import {
  VdfWizard,
  VdfMissionRail,
  VdfApprovalCard,
  VdfButton,
  VdfLoader,
  type VdfMissionRailItem,
} from '@/components/vdf';
import s from './mission-wizard.module.css';

/* ── Types (backend contracts) ──────────────────────────────────────── */

interface GtmProfile {
  product_name: string | null;
  product_description: string | null;
  product_tagline: string | null;
  core_problem: string | null;
  key_differentiators: string[] | null;
  icp_role: string | null;
  icp_company_type: string | null;
  icp_industry: string | null;
  primary_pain_points: string[] | null;
  completion_score: number;
  approved_at: string | null;
}

interface AgentRunStep {
  step_name: string;
  action?: string;
  output_summary?: string;
  status?: string;
}

interface KbSource {
  id: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error_msg?: string | null;
  node_count?: number | null;
  run_status?: string | null;
  run_steps?: AgentRunStep[] | null;
}

/** Friendly labels for the agent's real pipeline steps (gt_agent_runs.steps). */
const RESEARCH_STEP_LABELS: Record<string, string> = {
  parse: 'Connected — reading your website',
  parse_complete: 'Website read',
  site_health: 'Website health check',
  draft_profile: 'Drafting your GTM profile',
  chunk: 'Organizing what I found',
  extract: 'Deep-reading each section',
  extract_complete: 'Knowledge extracted',
  complete: 'Saved to your knowledge graph',
}

/** Site-health signals → what's at stake (SEO/AEO/CRO framing). */
const SITE_HEALTH_ADVICE: Record<string, { label: string; why: string }> = {
  title: { label: '<title> tag', why: 'the first thing search engines and AI read about you' },
  meta_description: { label: 'Meta description', why: 'the summary Google and AI answer engines quote in results' },
  og_tags: { label: 'OpenGraph tags', why: 'controls how your links preview on LinkedIn and WhatsApp' },
  json_ld: { label: 'JSON-LD structured data', why: 'makes your business quotable by AI answer engines (AEO)' },
  body_text: { label: 'Server-rendered content', why: 'your page is JS-only — crawlers and AI see an empty page' },
};

/** Pull the health check out of the run steps: "present: …; missing: a, b; …" */
function parseSiteHealth(steps: AgentRunStep[]): string[] | null {
  const step = steps.find((st) => st.step_name === 'site_health');
  const m = step?.output_summary?.match(/missing:\s*([^;]+)/);
  if (!m) return null;
  const missing = m[1].split(',').map((x) => x.trim()).filter((x) => x && x !== 'none');
  return missing.length > 0 ? missing : null;
}

interface DeckSummary {
  id: string;
  title: string | null;
  status: string;
  share_token: string | null;
}

/* ── Wizard steps (1–3 live, 4–6 locked) ────────────────────────────── */

const STEPS = [
  { id: 'company', label: 'Research company', locked: false },
  { id: 'icp', label: 'Confirm ICP', locked: false },
  { id: 'deck', label: 'Pitch deck', locked: false },
  { id: 'prospects', label: 'Find customers', locked: true },
  { id: 'sequence', label: 'Outreach', locked: true },
  { id: 'pulse', label: 'Follow-ups', locked: true },
];

const ICP_FIELDS: { key: keyof GtmProfile & string; label: string; required: boolean; multiline?: boolean; list?: boolean }[] = [
  { key: 'product_name', label: 'Product name', required: true },
  { key: 'product_description', label: 'What it does', required: true, multiline: true },
  { key: 'core_problem', label: 'Core problem it solves', required: true, multiline: true },
  { key: 'icp_role', label: 'Buyer role (ICP)', required: true },
  { key: 'icp_company_type', label: 'Company type', required: false },
  { key: 'primary_pain_points', label: 'Primary pain points (one per line)', required: true, multiline: true, list: true },
];

const POLL_MS = 3000;
const SOURCE_POLL_LIMIT = 200;  // ~10 min hard ceiling — profile-first exit normally fires long before
const PENDING_HINT_AFTER = 8;   // ~24s still 'pending' → surface the "worker running?" hint

export default function MissionWizardPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const onboardingStatus = useOnboardingStatus();

  const [stepIndex, setStepIndex] = useState(0);
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  const [booting, setBooting] = useState(true);

  // Step 1 state
  const [domain, setDomain] = useState('');
  const [research, setResearch] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [researchNote, setResearchNote] = useState('');
  const [researchSteps, setResearchSteps] = useState<AgentRunStep[]>([]);
  const [stillDigesting, setStillDigesting] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Profile (steps 1–2)
  const [profile, setProfile] = useState<GtmProfile | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [approving, setApproving] = useState(false);
  const [missingFields, setMissingFields] = useState<string[]>([]);

  // Step 3 state
  const [deckPhase, setDeckPhase] = useState<'idle' | 'building' | 'ready' | 'shared'>('idle');
  const [deck, setDeck] = useState<DeckSummary | null>(null);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);

  // Enrichment loop state (add context + re-run, any time after research)
  const [enrichUrl, setEnrichUrl] = useState('');
  const [enrichText, setEnrichText] = useState('');
  const [enrich, setEnrich] = useState<'idle' | 'running'>('idle');
  const [enrichNote, setEnrichNote] = useState('');

  /* ── Boot: resume from wherever the tenant already is ─────────────── */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const domainHint = typeof window !== 'undefined' ? sessionStorage.getItem('gtm-domain-hint') : null;
        if (domainHint) setDomain(domainHint);

        // Existing profile? → research is done; approved? → jump to deck.
        try {
          const res = await apiFetch<{ profile: GtmProfile }>(API.gtmProfile.get);
          if (cancelled) return;
          setProfile(res.profile);
          if (res.profile.product_name) {
            setResearch('done');
            setConfirmed((prev) => new Set(prev).add('company'));
            setStepIndex(1);
          }
          if (res.profile.approved_at) {
            setConfirmed((prev) => new Set(prev).add('icp'));
            setStepIndex(2);
          }
        } catch {
          // 404 PROFILE_NOT_FOUND — fresh tenant, start at step 1
        }

        // Existing approved deck? → share link is ready.
        try {
          const res = await apiFetch<{ decks: DeckSummary[] }>(API.storyteller.list);
          if (cancelled) return;
          const approved = res.decks.find((d) => d.status === 'approved' && d.share_token);
          if (approved) {
            setDeck(approved);
            setShareToken(approved.share_token);
            setDeckPhase('shared');
          }
        } catch { /* list is best-effort on boot */ }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => () => { if (pollTimer.current) clearTimeout(pollTimer.current); }, []);

  /* ── Step 1: research ─────────────────────────────────────────────── */

  const refreshProfile = useCallback(async (): Promise<GtmProfile | null> => {
    try {
      const res = await apiFetch<{ profile: GtmProfile }>(API.gtmProfile.get);
      setProfile(res.profile);
      return res.profile;
    } catch {
      return null;
    }
  }, []);

  // Unified poll: each tick reads the source (real agent steps for the live
  // checklist) AND the profile. The moment the profile drafter has produced
  // fields we show the card — the slower KG extraction keeps running in the
  // background and does not block the wizard. Shared by the URL path and the
  // pasted-copy fallback.
  const pollResearch = useCallback((sourceId: string) => {
    setResearchNote('Waiting for an agent to pick this up…');
    let tries = 0;
    const poll = async () => {
      tries += 1;

      // Profile-first exit: drafted fields = research is usable now.
      const p = await refreshProfile();
      if (p?.product_name) {
        setResearch('done');
        setStillDigesting(true); // KG extraction may still be running
        return;
      }

      try {
        const res = await apiFetch<{ source: KbSource }>(API.ingest.getSource, { pathParams: { id: sourceId } });
        const src = res.source;

        if (Array.isArray(src.run_steps) && src.run_steps.length > 0) {
          setResearchSteps(src.run_steps);
          setResearchNote('');
        } else if (src.status === 'pending' && tries >= PENDING_HINT_AFTER) {
          setResearchNote('Still waiting for an agent to pick this up — is the worker process running?');
        }

        if (src.status === 'error') {
          setResearch('error');
          setResearchNote(src.error_msg || 'Ingestion failed');
          return;
        }
        if (src.status === 'complete') {
          // Pipeline done but drafter produced nothing usable — hand over.
          const finalP = await refreshProfile();
          setResearch('done');
          if (!finalP?.product_name) {
            showToast({ message: 'Research finished, but some fields need you — fill the gaps below.', type: 'info' });
          }
          return;
        }
      } catch { /* transient — keep polling */ }

      if (tries >= SOURCE_POLL_LIMIT) {
        setResearch('error');
        setResearchNote('Research is taking too long — the agent may be busy. Try again, or fill the profile manually.');
        return;
      }
      pollTimer.current = setTimeout(poll, POLL_MS);
    };

    poll();
  }, [refreshProfile, showToast]);

  const startResearch = useCallback(async () => {
    const input = domain.trim();
    if (!input) {
      showToast({ message: 'Enter your website domain first', type: 'error' });
      return;
    }
    setResearch('running');
    setResearchSteps([]);
    setStillDigesting(false);
    setResearchNote('Submitting your website to VaNi…');

    try {
      const res = await apiFetch<{ source_id: string }>(API.ingest.submitUrl, { body: { url: input } });
      pollResearch(res.source_id);
    } catch (err) {
      setResearch('error');
      setResearchNote((err as ApiError).message || 'Could not submit the URL');
    }
  }, [domain, pollResearch, showToast]);

  // Fallback for JS-rendered sites the crawler can't read: the user pastes
  // their website copy and it runs through the exact same research pipeline.
  const startPasteResearch = useCallback(async () => {
    const text = pasteText.trim();
    if (text.length < 40) {
      showToast({ message: 'Paste at least a paragraph of your website copy', type: 'error' });
      return;
    }
    setResearch('running');
    setResearchSteps([]);
    setStillDigesting(false);
    setResearchNote('Analyzing your pasted copy…');

    try {
      const res = await apiFetch<{ source_id: string }>(API.ingest.submitText, {
        body: { text, title: 'Website copy (pasted)' },
      });
      pollResearch(res.source_id);
    } catch (err) {
      setResearch('error');
      setResearchNote((err as ApiError).message || 'Could not submit the pasted copy');
    }
  }, [pasteText, pollResearch, showToast]);

  /* ── Step 2: edit + approve ───────────────────────────────────────── */

  const fieldValue = (key: string): string => {
    if (key in edits) return edits[key];
    const v = profile?.[key as keyof GtmProfile];
    if (Array.isArray(v)) return v.join('\n');
    return (v as string | null) ?? '';
  };

  const saveField = useCallback(async (key: string, list?: boolean) => {
    if (!(key in edits)) return;
    const raw = edits[key];
    const value = list ? raw.split('\n').map((x) => x.trim()).filter(Boolean) : raw.trim();
    try {
      const res = await apiFetch<{ profile: GtmProfile }>(API.gtmProfile.update, { body: { [key]: value } });
      setProfile(res.profile);
      setMissingFields((prev) => prev.filter((f) => f !== key));
    } catch (err) {
      showToast({ message: (err as ApiError).message || `Failed to save ${key}`, type: 'error' });
    }
  }, [edits, showToast]);

  const approveIcp = useCallback(async () => {
    setApproving(true);
    setMissingFields([]);
    try {
      await apiFetch(API.gtmProfile.approve);
      await refreshProfile();
      setConfirmed((prev) => new Set(prev).add('icp'));
      setStepIndex(2);
      showToast({ message: 'ICP confirmed — every agent now builds on it', type: 'success' });
    } catch (err) {
      const apiErr = err as ApiError;
      const missing = (apiErr.details?.missing as string[] | undefined) ?? [];
      setMissingFields(missing);
      showToast({
        message: missing.length
          ? `Still needed: ${missing.join(', ')}`
          : apiErr.message || 'Could not approve the profile',
        type: 'error',
      });
    } finally {
      setApproving(false);
    }
  }, [refreshProfile, showToast]);

  /* ── Step 3: deck ─────────────────────────────────────────────────── */

  const buildDeck = useCallback(async () => {
    setDeckPhase('building');
    try {
      const res = await apiFetch<{ presentationId: string }>(API.storyteller.build);
      const d = await apiFetch<DeckSummary>(API.storyteller.get, { pathParams: { id: res.presentationId } });
      setDeck(d);
      setDeckPhase('ready');
    } catch (err) {
      setDeckPhase('idle');
      showToast({ message: (err as ApiError).message || 'Deck generation failed — try again', type: 'error' });
    }
  }, [showToast]);

  const approveDeck = useCallback(async () => {
    if (!deck) return;
    try {
      const res = await apiFetch<{ shareToken: string }>(API.storyteller.approve, { pathParams: { id: deck.id } });
      setShareToken(res.shareToken);
      setDeckPhase('shared');
      showToast({ message: 'Deck approved — share link is live', type: 'success' });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Could not approve the deck', type: 'error' });
    }
  }, [deck, showToast]);

  const finishOnboarding = useCallback(async () => {
    setFinishing(true);
    try {
      const status = onboardingStatus.data
        ?? await apiFetch<{ complete: boolean; steps: { step_id: string; status: string }[] }>(API.onboarding.status);
      const pending = status.steps.filter((st) => st.status !== 'completed');
      for (const st of pending) {
        await apiFetch(API.onboarding.completeStep, {
          body: { step_id: st.step_id, status: 'completed', metadata: { via: 'mission-wizard' } },
        });
      }
      setConfirmed((prev) => new Set(prev).add('deck'));
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      showToast({ message: 'Mission configured — welcome to the war room', type: 'success' });
      router.replace('/dashboard');
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Could not finish setup', type: 'error' });
    } finally {
      setFinishing(false);
    }
  }, [onboardingStatus.data, queryClient, showToast]);

  /* ── Enrichment loop: add context → agents re-run → profile updates ── */

  const submitEnrichment = useCallback(async () => {
    const url = enrichUrl.trim();
    const text = enrichText.trim();
    if (!url && !text) {
      showToast({ message: 'Add a URL or paste some context first', type: 'error' });
      return;
    }
    setEnrich('running');
    const scoreBefore = profile?.completion_score ?? 0;

    try {
      const submissions: { source_id: string }[] = [];
      if (url) submissions.push(await apiFetch<{ source_id: string }>(API.ingest.submitUrl, { body: { url } }));
      if (text) submissions.push(await apiFetch<{ source_id: string }>(API.ingest.submitText, { body: { text } }));

      setEnrichNote('VaNi is working the new context into your profile…');

      // Poll every submitted source to a terminal state.
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
        if (allDone || tries >= SOURCE_POLL_LIMIT) {
          const p = await refreshProfile();
          setEnrich('idle');
          setEnrichUrl('');
          setEnrichText('');
          const scoreAfter = p?.completion_score ?? scoreBefore;
          showToast({
            message: scoreAfter > scoreBefore
              ? `Profile enriched — score ${scoreBefore} → ${scoreAfter}`
              : 'Context absorbed — no empty fields left to fill, edit any field directly to override',
            type: 'success',
          });
          return;
        }
        pollTimer.current = setTimeout(poll, POLL_MS);
      };
      poll();
    } catch (err) {
      setEnrich('idle');
      showToast({ message: (err as ApiError).message || 'Could not submit the new context', type: 'error' });
    }
  }, [enrichUrl, enrichText, profile, refreshProfile, showToast]);

  const copyShareLink = useCallback(() => {
    if (!shareToken) return;
    const link = `${window.location.origin}/deck/${shareToken}`;
    navigator.clipboard?.writeText(link)
      .then(() => showToast({ message: 'Share link copied', type: 'success' }))
      .catch(() => showToast({ message: link, type: 'info' }));
  }, [shareToken, showToast]);

  /* ── Mission rail ─────────────────────────────────────────────────── */

  const railItems: VdfMissionRailItem[] = useMemo(() => STEPS.map((step, i) => ({
    id: step.id,
    step: i + 1,
    title: step.locked ? `${step.label} · soon` : step.label,
    state: confirmed.has(step.id) ? 'done' : (!step.locked && i === stepIndex) ? 'active' : 'pending',
    digest: confirmed.has(step.id)
      ? step.id === 'company'
        ? (profile?.product_tagline || profile?.product_name || 'Company researched')
        : step.id === 'icp'
          ? `Approved · score ${profile?.completion_score ?? '—'}`
          : step.id === 'deck' ? 'Deck approved + shared' : undefined
      : undefined,
  })), [confirmed, stepIndex, profile]);

  const current = STEPS[stepIndex];

  /* ── Render ───────────────────────────────────────────────────────── */

  if (booting) {
    return <div className={s.bootWrap}><VdfLoader message="Preparing your mission" overlay /></div>;
  }

  return (
    <div className={s.page}>
      <header className={s.top}>
        <div className={s.mission}>
          <span className={s.missionLabel}>Mission · Onboarding</span>
          <span className={s.missionName}>Set up your GTM engine</span>
          {onboardingStatus.data?.complete && (
            <button type="button" className={s.backLink} onClick={() => router.push('/dashboard')}>
              ← Back to dashboard
            </button>
          )}
        </div>
        <div className={s.railWrap}>
          <VdfWizard
            steps={STEPS.map(({ id, label }) => ({ id, label, mandatory: true }))}
            currentIndex={stepIndex}
            completedSteps={confirmed}
            onStepClick={(i) => { if (!STEPS[i].locked && (confirmed.has(STEPS[i].id) || i <= stepIndex)) setStepIndex(i); }}
          />
        </div>
      </header>

      <div className={s.layout}>
        <aside className={s.left}>
          <VdfMissionRail items={railItems} />
        </aside>

        <main className={s.main} key={current.id}>

          {/* ── STEP 1 — Research ─────────────────────────────────── */}
          {current.id === 'company' && research !== 'done' && (
            <VdfApprovalCard
              eyebrow="VaNi · your first agent"
              title="Point me at your website"
              subtitle="I'll read it, learn your product and market, and draft your GTM profile — you confirm, I build on it."
            >
              <div className={s.domainRow}>
                <input
                  className={s.domainInput}
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && research !== 'running') startResearch(); }}
                  placeholder="yourcompany.com"
                  disabled={research === 'running'}
                  autoFocus
                />
                <VdfButton variant="primary" onClick={startResearch} loading={research === 'running'}>
                  Research it
                </VdfButton>
              </div>

              {research === 'running' && researchSteps.length === 0 && (
                <div className={s.progressNote}>
                  <span className={s.progressDot} aria-hidden />
                  {researchNote}
                </div>
              )}

              {research === 'running' && researchSteps.length > 0 && (
                <ol className={s.stepFeed} aria-label="VaNi's live progress">
                  {researchSteps.map((st, i) => {
                    const isLast = i === researchSteps.length - 1;
                    const failed = st.status === 'error';
                    return (
                      <li
                        key={`${st.step_name}-${i}`}
                        className={`${s.stepRow} ${isLast && !failed ? s.stepActive : s.stepDone} ${failed ? s.stepFailed : ''}`}
                      >
                        <span className={s.stepMark} aria-hidden>
                          {failed ? '✕' : isLast ? '' : '✓'}
                          {isLast && !failed && <span className={s.stepSpinner} />}
                        </span>
                        <span className={s.stepText}>
                          {RESEARCH_STEP_LABELS[st.step_name] ?? st.action ?? st.step_name}
                          {st.output_summary && <span className={s.stepDetail}> — {st.output_summary}</span>}
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}

              {research === 'error' && parseSiteHealth(researchSteps) && (
                <div className={s.healthCard}>
                  <span className={s.healthEyebrow}>VaNi&apos;s first finding · website health</span>
                  <p className={s.healthLede}>
                    I connected to your site, but it ships almost nothing a crawler can read.
                    This doesn&apos;t just block me — it makes you invisible to Google and to AI
                    answer engines your buyers ask. Worth fixing regardless:
                  </p>
                  <ul className={s.healthList}>
                    {parseSiteHealth(researchSteps)!.map((key) => (
                      <li key={key} className={s.healthItem}>
                        <span className={s.healthMark} aria-hidden>✗</span>
                        <span>
                          <strong>{SITE_HEALTH_ADVICE[key]?.label ?? key}</strong>
                          {' — '}{SITE_HEALTH_ADVICE[key]?.why ?? 'missing'}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className={s.healthFoot}>
                    The Auditor agent will track this once it ships. For now, add these to your
                    site when you can — and let&apos;s keep your onboarding moving below.
                  </p>
                </div>
              )}

              {research === 'error' && (
                <div className={s.errorNote}>
                  <p>{researchNote}</p>
                  <div className={s.errorActions}>
                    <VdfButton variant="outline" size="sm" onClick={startResearch}>Try again</VdfButton>
                    <VdfButton
                      variant="ghost" size="sm"
                      onClick={() => { setResearch('done'); setConfirmed((p) => new Set(p).add('company')); setStepIndex(1); }}
                    >
                      Skip — I&apos;ll fill it in myself
                    </VdfButton>
                  </div>

                  {/* Fallback for JS-rendered sites: paste the copy, same pipeline */}
                  <div className={s.pasteFallback}>
                    <span className={s.fieldLabel}>Or paste your website copy — VaNi researches it the same way</span>
                    <textarea
                      className={s.input}
                      rows={5}
                      value={pasteText}
                      onChange={(e) => setPasteText(e.target.value)}
                      placeholder="Open your website, select-all, copy, paste here — homepage + about/pricing works best"
                    />
                    <div className={s.errorActions}>
                      <VdfButton variant="primary" size="sm" onClick={startPasteResearch}>
                        Research from pasted copy
                      </VdfButton>
                    </div>
                  </div>
                </div>
              )}
            </VdfApprovalCard>
          )}

          {current.id === 'company' && research === 'done' && (
            <VdfApprovalCard
              eyebrow="VaNi · researched your website"
              title="Here's what I learned"
              subtitle="Rough edges are normal — you'll refine everything in the next step."
              status={confirmed.has('company') ? 'confirmed' : 'draft'}
              onConfirm={() => { setConfirmed((p) => new Set(p).add('company')); setStepIndex(1); }}
              confirmLabel="Looks right — continue"
            >
              {parseSiteHealth(researchSteps) && (
                <div className={s.healthInline}>
                  Heads-up: your site is missing{' '}
                  {parseSiteHealth(researchSteps)!.map((k) => SITE_HEALTH_ADVICE[k]?.label ?? k).join(', ')}
                  {' '}— that weakens SEO and AI-answer-engine visibility. The Auditor agent will
                  track this; fixing it also makes my research sharper.
                </div>
              )}
              {stillDigesting && (
                <div className={s.digestingNote}>
                  <span className={s.progressDot} aria-hidden />
                  I&apos;m still digesting the rest of your site into the knowledge graph in the
                  background — you can continue, everything downstream picks it up automatically.
                </div>
              )}
              <div className={s.researchSummary}>
                <div className={s.summaryField}>
                  <span className={s.fieldLabel}>Product</span>
                  <span className={profile?.product_name ? s.fieldValueBig : s.fieldEmpty}>
                    {profile?.product_name || 'Not found yet — add it in the next step'}
                  </span>
                  {profile?.product_tagline && <span className={s.fieldValue}>{profile.product_tagline}</span>}
                </div>
                {[
                  { label: 'What it does', value: profile?.product_description },
                  { label: 'Core problem', value: profile?.core_problem },
                  { label: 'Buyer', value: [profile?.icp_role, profile?.icp_company_type, profile?.icp_industry].filter(Boolean).join(' · ') },
                  { label: 'Pain points', value: profile?.primary_pain_points?.join(' · ') },
                ].map((f) => (
                  <div key={f.label} className={s.summaryField}>
                    <span className={s.fieldLabel}>{f.label}</span>
                    <span className={f.value ? s.fieldValue : s.fieldEmpty}>{f.value || 'Not found yet — add it in the next step'}</span>
                  </div>
                ))}
                {(profile?.key_differentiators?.length ?? 0) > 0 && (
                  <div className={s.summaryField}>
                    <span className={s.fieldLabel}>Differentiators</span>
                    <div className={s.chipRow}>
                      {profile!.key_differentiators!.map((d) => (
                        <span key={d} className={s.valueChip}>{d}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </VdfApprovalCard>
          )}

          {/* ── STEP 2 — Confirm ICP ──────────────────────────────── */}
          {current.id === 'icp' && (
            <VdfApprovalCard
              eyebrow={`VaNi · profile score ${profile?.completion_score ?? 0}/100`}
              title="Confirm your ICP"
              subtitle="This is the foundation — every agent (decks, prospecting, outreach) is gated on it. Edits save when you leave a field."
              status={confirmed.has('icp') ? 'confirmed' : 'draft'}
              onConfirm={approveIcp}
              confirmLabel="Confirm ICP"
              loading={approving}
            >
              <div className={s.icpFields}>
                {ICP_FIELDS.map((f) => (
                  <div key={f.key} className={s.icpField}>
                    <label className={`${s.fieldLabel} ${missingFields.includes(f.key) ? s.fieldLabelMissing : ''}`} htmlFor={`icp-${f.key}`}>
                      {f.label}{f.required ? ' *' : ''}
                    </label>
                    {f.multiline ? (
                      <textarea
                        id={`icp-${f.key}`}
                        className={s.input}
                        rows={f.list ? 3 : 2}
                        value={fieldValue(f.key)}
                        onChange={(e) => setEdits((p) => ({ ...p, [f.key]: e.target.value }))}
                        onBlur={() => saveField(f.key, f.list)}
                      />
                    ) : (
                      <input
                        id={`icp-${f.key}`}
                        className={s.input}
                        value={fieldValue(f.key)}
                        onChange={(e) => setEdits((p) => ({ ...p, [f.key]: e.target.value }))}
                        onBlur={() => saveField(f.key)}
                      />
                    )}
                  </div>
                ))}
              </div>
            </VdfApprovalCard>
          )}

          {/* ── STEP 3 — Pitch deck ───────────────────────────────── */}
          {current.id === 'deck' && (
            <VdfApprovalCard
              eyebrow="Storyteller · your second agent"
              title={deckPhase === 'shared' ? 'Your deck is live' : 'Turn your ICP into a pitch deck'}
              subtitle={
                deckPhase === 'shared'
                  ? 'Anyone with the link sees an always-current deck that answers questions in your voice.'
                  : 'Storyteller reads your confirmed profile and knowledge graph, and drafts a seven-slide deck for your approval.'
              }
              status={confirmed.has('deck') ? 'confirmed' : 'draft'}
            >
              {deckPhase === 'idle' && (
                <div className={s.deckStart}>
                  <VdfButton variant="primary" onClick={buildDeck}>Build my deck</VdfButton>
                </div>
              )}

              {deckPhase === 'building' && (
                <div className={s.progressNote}>
                  <span className={s.progressDot} aria-hidden />
                  Storyteller is writing your deck — usually under two minutes…
                </div>
              )}

              {deckPhase === 'ready' && deck && (
                <div className={s.deckReady}>
                  <div className={s.summaryField}>
                    <span className={s.fieldLabel}>Draft ready</span>
                    <span className={s.fieldValue}>{deck.title || 'Untitled deck'}</span>
                  </div>
                  <div className={s.deckActions}>
                    <VdfButton variant="primary" onClick={approveDeck}>Approve &amp; get share link</VdfButton>
                    <VdfButton variant="ghost" onClick={buildDeck}>Rebuild</VdfButton>
                  </div>
                </div>
              )}

              {deckPhase === 'shared' && shareToken && (
                <div className={s.shareBlock}>
                  <div className={s.shareLinkRow}>
                    <span className={s.shareLink}>{typeof window !== 'undefined' ? `${window.location.origin}/deck/${shareToken}` : `/deck/${shareToken}`}</span>
                    <VdfButton variant="outline" size="sm" onClick={copyShareLink}>Copy</VdfButton>
                    <VdfButton variant="ghost" size="sm" href={`/deck/${shareToken}`}>Open</VdfButton>
                  </div>
                  <div className={s.finishRow}>
                    <VdfButton variant="primary" onClick={finishOnboarding} loading={finishing}>
                      Enter mission control →
                    </VdfButton>
                  </div>
                </div>
              )}
            </VdfApprovalCard>
          )}

          {/* ── The loop: add context, agents re-run, profile enriches ── */}
          {(research === 'done' || confirmed.has('company')) && (
            <section className={s.enrichCard}>
              <div className={s.enrichHead}>
                <span className={s.enrichEyebrow}>The loop · always open</span>
                <span className={s.enrichTitle}>Teach VaNi more, any time</span>
                <p className={s.enrichSub}>
                  Add another page (pricing, case studies, docs) or paste context —
                  competitor notes, call summaries, positioning. VaNi re-runs, fills the
                  gaps, and every agent downstream builds on the richer profile.
                  Your own edits always win over drafts.
                </p>
              </div>
              <div className={s.enrichInputs}>
                <input
                  className={s.domainInput}
                  value={enrichUrl}
                  onChange={(e) => setEnrichUrl(e.target.value)}
                  placeholder="another URL — pricing page, docs, a case study…"
                  disabled={enrich === 'running'}
                />
                <textarea
                  className={s.input}
                  rows={3}
                  value={enrichText}
                  onChange={(e) => setEnrichText(e.target.value)}
                  placeholder="…or paste context: competitor notes, a call summary, your positioning doc"
                  disabled={enrich === 'running'}
                />
              </div>
              <div className={s.enrichActions}>
                {enrich === 'running' && (
                  <span className={s.progressNoteInline}>
                    <span className={s.progressDot} aria-hidden />
                    {enrichNote}
                  </span>
                )}
                <VdfButton variant="outline" onClick={submitEnrichment} loading={enrich === 'running'}>
                  Feed it to VaNi
                </VdfButton>
              </div>
            </section>
          )}

          {/* Locked steps preview */}
          <div className={s.lockedRow}>
            {STEPS.filter((st) => st.locked).map((st) => (
              <div key={st.id} className={s.lockedCard}>
                <span className={s.lockedName}>{st.label}</span>
                <span className={s.lockedTag}>Agent coming soon</span>
              </div>
            ))}
          </div>
        </main>
      </div>
    </div>
  );
}
