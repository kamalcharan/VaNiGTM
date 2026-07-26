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

interface KbSource {
  id: string;
  status: 'pending' | 'processing' | 'complete' | 'error';
  error_msg?: string | null;
  node_count?: number | null;
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
const SOURCE_POLL_LIMIT = 100;  // ~5 min of crawling/extraction
const PROFILE_POLL_LIMIT = 20;  // ~1 min for KNOWLEDGE_UPDATED → recalc

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

  const startResearch = useCallback(async () => {
    const input = domain.trim();
    if (!input) {
      showToast({ message: 'Enter your website domain first', type: 'error' });
      return;
    }
    setResearch('running');
    setResearchNote('Submitting your website to VaNi…');

    let sourceId: string;
    try {
      const res = await apiFetch<{ source_id: string }>(API.ingest.submitUrl, { body: { url: input } });
      sourceId = res.source_id;
    } catch (err) {
      setResearch('error');
      setResearchNote((err as ApiError).message || 'Could not submit the URL');
      return;
    }

    // Poll the source until the ingestion agent finishes.
    setResearchNote('VaNi is reading your website…');
    let tries = 0;
    const pollSource = async () => {
      tries += 1;
      try {
        const res = await apiFetch<{ source: KbSource }>(API.ingest.getSource, { pathParams: { id: sourceId } });
        const st = res.source.status;
        if (st === 'complete') {
          setResearchNote('Extracting your positioning into a profile…');
          pollProfile(0);
          return;
        }
        if (st === 'error') {
          setResearch('error');
          setResearchNote(res.source.error_msg || 'Ingestion failed');
          return;
        }
        if (st === 'processing') setResearchNote('VaNi is extracting entities from your pages…');
      } catch { /* transient — keep polling */ }
      if (tries >= SOURCE_POLL_LIMIT) {
        setResearch('error');
        setResearchNote('Research is taking too long — the agent may be busy. Try again, or fill the profile manually.');
        return;
      }
      pollTimer.current = setTimeout(pollSource, POLL_MS);
    };

    // After ingestion, KNOWLEDGE_UPDATED recalculates the profile — poll for it.
    const pollProfile = async (profileTries: number) => {
      const p = await refreshProfile();
      if (p?.product_name) {
        setResearch('done');
        return;
      }
      if (profileTries >= PROFILE_POLL_LIMIT) {
        // Ingestion worked but the profile is thin — let the human take over.
        setResearch('done');
        showToast({ message: 'Research finished, but some fields need you — fill the gaps below.', type: 'info' });
        return;
      }
      pollTimer.current = setTimeout(() => pollProfile(profileTries + 1), POLL_MS);
    };

    pollSource();
  }, [domain, refreshProfile, showToast]);

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

              {research === 'running' && (
                <div className={s.progressNote}>
                  <span className={s.progressDot} aria-hidden />
                  {researchNote}
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
