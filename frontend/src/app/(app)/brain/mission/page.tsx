'use client';

/**
 * /onboarding — the agent-led mission wizard (LIVE, replaces form-first
 * onboarding per the approved PLG direction).
 *
 * FIVE real steps, all wired to the real backend (Complete the Mission
 * Wizard, 2026-08-14 — steps 5-7 of the old 7-step stepper were never setup
 * steps; they're what becomes available AFTER setup, and now live in
 * /today's Agent Launchpad instead):
 *   1. Research company    → POST /ingest/url → poll source → poll profile
 *   2. Confirm vocabulary  → GET /profile/clusters → POST /profile/clusters/approve
 *   3. Confirm competitors → GET /vani/competitors → POST /vani/competitors/confirm
 *   4. Confirm ICP & pains → PUT /profile (blur-save) → POST /profile/approve
 *   5. Confirm brand       → POST /profile/brand/generate → PUT /profile/brand (blur-save) → POST /profile/brand/approve
 * Confirming brand is what configures the mission and enters mission
 * control — Storytelling/Outreach/Sequences unlock there once the score
 * clears the threshold; ICP confirm now just hands off to step 5 like every
 * other step.
 *
 * STEP 2 EXISTS BECAUSE OF AN ORDERING BUG. The market vocabulary
 * (gt_semantic_clusters) is drafted at the end of ingestion and used by
 * competitor research, which reads APPROVED clusters only. It used to be
 * ratified on the ICP card at the very end — after the search that needed
 * it had already run — so every first-run search fell back to guessing from
 * the profile. Ratification now sits ahead of the step that consumes it.
 *
 * Finishing PATCHes every pending vn_tenant_onboarding step; the (app)
 * layout guard then routes to /dashboard. The ICP builder at
 * /onboarding/icp-builder remains the post-onboarding refine surface.
 */

import { type CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { useOnboardingStatus } from '@/hooks/useOnboarding';
import { useMissionHandoff } from '@/hooks/useMissionHandoff';
import { ME_QUERY_KEY } from '@/hooks/useMe';
import {
  VdfApprovalCard,
  VdfButton,
  VdfKgLoader,
  VdfLoader,
  VdfMissionCard,
  VdfMissionChips,
  VdfMissionMemory,
  VdfMissionRows,
  VdfMissionSection,
  VdfPathwayShell,
  type VdfMissionMemoryItem,
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
  render_page: 'JS-rendered site — opening it in a headless browser',
  render_complete: 'Rendered page read',
  draft_profile: 'Drafting your GTM profile',
  crawl_pages: 'Exploring more pages of your site',
  crawl_complete: 'Site crawl finished',
  draft_profile_enriched: 'Filling profile gaps from deeper pages',
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
  json_ld: { label: 'JSON-LD structured data', why: 'makes your business quotable by AI answer engines like ChatGPT and Perplexity' },
  body_text: { label: 'Server-rendered content', why: 'your page is JS-only — crawlers and AI see an empty page' },
};

/** Findings rail: punchy teaser tags per missing signal (PLG hook for the Auditor agent). */
const FINDING_TAGS: Record<string, { tag: string; hook: string }> = {
  title: { tag: 'No page title', hook: 'the first signal search engines read' },
  meta_description: { tag: 'Weak SEO', hook: 'Google has nothing to quote about you' },
  og_tags: { tag: 'Broken link previews', hook: 'shares on LinkedIn/WhatsApp show nothing' },
  json_ld: { tag: 'Invisible to AI', hook: 'AI answer engines can’t cite your business' },
  body_text: { tag: 'JS-only rendering', hook: 'non-JS crawlers see an empty page' },
};

/** Pull the health check out of the run steps: "present: …; missing: a, b; …" */
function parseSiteHealth(steps: AgentRunStep[]): string[] | null {
  const step = steps.find((st) => st.step_name === 'site_health');
  const m = step?.output_summary?.match(/missing:\s*([^;]+)/);
  if (!m) return null;
  const missing = m[1].split(',').map((x) => x.trim()).filter((x) => x && x !== 'none');
  return missing.length > 0 ? missing : null;
}

interface Competitor {
  id: string;
  name: string;
  description: string | null;
  properties: Record<string, unknown>;
}

interface SemanticCluster {
  id: string;
  primary_term: string;
  related_terms: string[];
  cluster_type: string;
  approved_at: string | null;
}

interface TenantBrand {
  voice_tone: string[] | null;
  always_say: string[] | null;
  never_say: string[] | null;
  visual: { logo_url?: string; colors?: string[]; typography?: string };
  proof: string[] | null;
  approved_at: string | null;
}

/** Cluster type → what it means for the tenant, in plain words. */
const CLUSTER_TYPE_LABEL: Record<string, string> = {
  category: 'category',
  offering: 'offering',
  buyer: 'buyer',
  pain: 'pain',
  outcome: 'outcome',
};

interface ResearchRun {
  id: string;
  status: string;
  steps: AgentRunStep[] | null;
  output: Record<string, unknown> | null;
  error_trace: string | null;
}

/** Friendly labels for the competitor-research agent's steps. web_search and
    verify are deliberately absent — their `action` strings carry the specifics
    ("Searched: …", "Acme: verified against its site") and read better raw. */
const COMPETITOR_STEP_LABELS: Record<string, string> = {
  init: 'Agent picked up your request',
  load_profile: 'Framing research around your profile',
  frame_queries: 'Deciding what to search for',
  shortlist: 'Shortlisting candidate competitors',
  kg_write: 'Mapping competitors into your knowledge graph',
};

/** First line of a server error trace — the real cause, not the stack. */
function firstLine(trace: string | null | undefined): string {
  return (trace ?? '').split('\n')[0].trim();
}

/* ── Wizard steps — 5 real steps ─────────────────────────────────────────
   Onboarding = research → vocabulary → competitors → ICP → brand → mission
   configured. Vocabulary sits ahead of competitors on purpose: it is the
   input that frames the search (see the header note). Storytelling,
   Campaigns and Follow-ups are NOT setup steps — they're what becomes
   available after setup, and live in /today's Agent Launchpad instead. */

const STEPS = [
  { id: 'company', label: 'Research company' },
  { id: 'vocabulary', label: 'Market vocabulary' },
  { id: 'competitors', label: 'Competitors' },
  { id: 'icp', label: 'Ideal customer' },
  { id: 'brand', label: 'Brand' },
];

/** Steps that file a durable artifact into mission memory. */
const ARTIFACT_STEPS = new Set(['company', 'vocabulary', 'competitors', 'icp', 'brand']);

const ICP_FIELDS: { key: keyof GtmProfile & string; label: string; required: boolean; multiline?: boolean; list?: boolean }[] = [
  { key: 'product_name', label: 'Product name', required: true },
  { key: 'product_description', label: 'What it does', required: true, multiline: true },
  { key: 'core_problem', label: 'Core problem it solves', required: true, multiline: true },
  { key: 'icp_role', label: 'Buyer role', required: true },
  { key: 'icp_company_type', label: 'Company type', required: false },
  { key: 'primary_pain_points', label: 'Primary pain points (one per line)', required: true, multiline: true, list: true },
];

const BRAND_FIELDS: { key: keyof TenantBrand & string; label: string; required: boolean; multiline?: boolean; list?: boolean }[] = [
  { key: 'voice_tone', label: 'Voice & tone (one adjective per line)', required: false, multiline: true, list: true },
  { key: 'always_say', label: 'What we always say (one per line)', required: false, multiline: true, list: true },
  { key: 'never_say', label: 'What we never say (one per line)', required: false, multiline: true, list: true },
  { key: 'proof', label: 'Proof — case studies, testimonials, clients (one per line)', required: false, multiline: true, list: true },
];

/** Auto-confirm window on a ready step (user ruling: 6–8s, interruptible).
    The agent keeps the flow moving; the human only acts to CHANGE something.
    Touching the card cancels it permanently — see VdfApprovalCard. */
const AUTO_CONFIRM_MS = 7000;

/** Vocabulary poll: clusters are drafted at the end of ingestion, so the
    step can open before the worker has written them. ~90s of patience. */
const VOCAB_POLL_MS = 3000;
const VOCAB_POLL_TRIES = 30;

/** Waiting copy for the vocabulary draft — each line is work genuinely done. */
const VOCAB_ROTATION = [
  'Reading how you describe what you sell',
  'Grouping the terms your buyers would actually type',
  'Separating category words from offering and pain words',
  'Checking each term against what your pages say',
];

/** Rotating status copy for multi-minute agent phases. Every line describes
    work the agent genuinely does — never a fake progress claim. */
const RESEARCH_ROTATION = [
  'Reading your pages the way a first-time buyer would',
  'Pulling out what you sell, who for, and what it fixes',
  'Noting proof — case studies, numbers, differentiators',
  'Writing it all into your knowledge graph',
];

const COMPETITOR_ROTATION = [
  'Framing the search from the words your buyers use',
  'Sweeping the live web for who occupies your space',
  'Opening each candidate’s real site to check they belong',
  'Mapping the survivors into your knowledge graph',
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
  // In-flight blur-saves — Confirm ICP awaits these so a just-edited field's
  // PUT can never race the approve call (approve validating stale data).
  const pendingSaves = useRef<Set<Promise<void>>>(new Set());

  // Step 2 state — competitor map (agent researched, human keeps/removes)
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [competitorsLoading, setCompetitorsLoading] = useState(false);
  /** Have we actually FETCHED the competitor list? An empty `competitors` on
      its own means "unknown", not "none" — the rail must never assert that a
      tenant has no competitors just because nothing has loaded yet. */
  const [competitorsKnown, setCompetitorsKnown] = useState(false);
  const [confirmingCompetitors, setConfirmingCompetitors] = useState(false);
  const [compResearch, setCompResearch] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [compSteps, setCompSteps] = useState<AgentRunStep[]>([]);
  const [compError, setCompError] = useState('');
  const [compNote, setCompNote] = useState('');
  const compPollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Market vocabulary — the semantic clusters that frame competitor search.
  // Agent drafts them during the profile pipeline; the human ratifies them
  // with the ICP (same click, no extra wizard step).
  const [clusters, setClusters] = useState<SemanticCluster[]>([]);
  const [removedClusters, setRemovedClusters] = useState<Set<string>>(new Set());
  const [approvingVocab, setApprovingVocab] = useState(false);
  /** Waiting on the worker to draft the vocabulary — see the poll below. */
  const [vocabWaiting, setVocabWaiting] = useState(false);
  const vocabTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Step 5 — brand (same agent-proposes/human-confirms pattern as ICP).
  const [brand, setBrand] = useState<TenantBrand | null>(null);
  const [brandEdits, setBrandEdits] = useState<Record<string, string>>({});
  const [generatingBrand, setGeneratingBrand] = useState(false);
  const [approvingBrand, setApprovingBrand] = useState(false);
  const brandPendingSaves = useRef<Set<Promise<void>>>(new Set());

  const [finishing, setFinishing] = useState(false);

  /* ── Boot: resume from wherever the tenant already is ─────────────── */

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const domainHint = typeof window !== 'undefined' ? sessionStorage.getItem('gtm-domain-hint') : null;
        if (domainHint) setDomain(domainHint);

        // Existing profile? → research is done. Approved profile means ICP
        // is done and step 5 (brand) is next — flow order guarantees
        // competitors were ruled on before approval. Approved brand means
        // the whole mission was configured.
        //
        // RESTORING THE MISSION, not just the profile. The wizard used to
        // rebuild itself from gt_tenant_profile alone, so everything else the
        // agents produced evaporated on reload: competitors came back empty
        // (and the rail then ASSERTED "no named competitors"), the research
        // run's steps were lost (so the site-health findings rail, the inline
        // health line and the error card all went dark), and the market
        // vocabulary only loaded if you happened to land on the ICP step.
        // Three symptoms, one cause — restore all of it here.
        try {
          const res = await apiFetch<{ profile: GtmProfile }>(API.gtmProfile.get);
          if (cancelled) return;
          setProfile(res.profile);
          if (res.profile.product_name) {
            setResearch('done');
            setConfirmed((prev) => new Set(prev).add('company'));
            setStepIndex(1);
            // Site-health findings belong to step 1, so they come back as soon
            // as we know step 1 ran — not only once the profile is approved.
            void restoreResearchSteps();
          }
          if (res.profile.approved_at) {
            setConfirmed((prev) => new Set(prev).add('vocabulary').add('competitors').add('icp'));
            setStepIndex(4);
            void loadCompetitors(true);
            void loadClusters();
            const existingBrand = await loadBrand();
            if (existingBrand?.approved_at) {
              setConfirmed((prev) => new Set(prev).add('brand'));
            }
          }
        } catch {
          // 404 PROFILE_NOT_FOUND — fresh tenant, start at step 1
        }
      } finally {
        if (!cancelled) setBooting(false);
      }
    })();
    return () => { cancelled = true; };
    // boot runs once; the restore helpers are stable useCallbacks read from
    // the first render's scope (declared below — the effect body runs after)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => () => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    if (compPollTimer.current) clearTimeout(compPollTimer.current);
  }, []);

  /* ── Step 1: research ─────────────────────────────────────────────── */

  /* Pull the research run's steps back into state.
     `researchSteps` is what every site-health surface reads — the findings
     rail, the inline health line on the confirm card, and the error card. It
     was only ever populated by the live poll during step 1, so a reload or a
     return visit left all three dark for a tenant that HAD been audited.
     Two calls on purpose: the list query omits `steps` (JSONB, and there can
     be many sources), so we take the newest source and fetch just that one. */
  const restoreResearchSteps = useCallback(async () => {
    try {
      const list = await apiFetch<{ sources: { id: string; source_type: string }[] }>(
        API.ingest.listSources,
      );
      const newest = list.sources?.find((x) => x.source_type === 'url') ?? list.sources?.[0];
      if (!newest) return;

      const res = await apiFetch<{ source: KbSource }>(
        API.ingest.getSource, { pathParams: { id: newest.id } },
      );
      if (Array.isArray(res.source.run_steps) && res.source.run_steps.length > 0) {
        setResearchSteps(res.source.run_steps);
      }
    } catch {
      // Best-effort rehydration: the wizard is fully usable without the
      // findings rail, and a toast here would fire on every page load.
    }
  }, []);

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
    // Cancel any prior poll chain before starting a new one — retry/paste
    // must never leave two chains racing each other's state updates.
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
    setResearchNote('Waiting for an agent to pick this up…');
    let tries = 0;
    const poll = async () => {
      tries += 1;

      // Profile-first exit: drafted fields = research is usable now.
      const p = await refreshProfile();
      if (p?.product_name) {
        setResearch('done');
        setStillDigesting(true); // KG extraction may still be running
        // This exit returns BEFORE the source fetch below, so on a fast run —
        // profile ready on the first tick — the run steps would never be read
        // and every site-health surface would stay dark on a brand-new tenant.
        // A slow LLM hid this by guaranteeing several step-fetching ticks first.
        void restoreResearchSteps();
        showToast({ message: 'Research ready — review what VaNi drafted', type: 'success' });
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
  }, [refreshProfile, restoreResearchSteps, showToast]);

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
    const save = (async () => {
      try {
        const res = await apiFetch<{ profile: GtmProfile }>(API.gtmProfile.update, { body: { [key]: value } });
        setProfile(res.profile);
        setMissingFields((prev) => prev.filter((f) => f !== key));
      } catch (err) {
        showToast({ message: (err as ApiError).message || `Failed to save ${key}`, type: 'error' });
      }
    })();
    pendingSaves.current.add(save);
    save.finally(() => pendingSaves.current.delete(save));
    await save;
  }, [edits, showToast]);

  /* ── Step 2: competitor map (agent researched, human keeps/removes) ──
     Competitors are RESEARCHED outward from the profile (web search via
     the research-skill agent) — a tenant's own site almost never names
     rivals. Crawl-found Competitor nodes are a bonus second source. */

  // silent=true → no error toast (poll ticks re-pull the map every few
  // seconds; a transient failure there must not spam toasts).
  const loadCompetitors = useCallback(async (silent = false): Promise<Competitor[]> => {
    if (!silent) setCompetitorsLoading(true);
    try {
      const res = await apiFetch<{ competitors: Competitor[] }>(API.vani.competitors);
      setCompetitors(res.competitors);
      setCompetitorsKnown(true);
      return res.competitors;
    } catch (err) {
      if (!silent) showToast({ message: (err as ApiError).message || 'Could not load competitors', type: 'error' });
      return [];
    } finally {
      if (!silent) setCompetitorsLoading(false);
    }
  }, [showToast]);

  // `target` scopes the poll to the run THIS click created. Without it the
  // status endpoint answers with the latest run — and since the worker takes
  // up to a poll interval to create the new run, a re-run would instantly
  // inherit the previous run's 'completed' and the UI would declare victory
  // while the real run was still queued.
  const pollCompetitorResearch = useCallback((target: { event_id?: string; run_id?: string }) => {
    // One chain only — a retry must never race a prior chain's updates.
    if (compPollTimer.current) {
      clearTimeout(compPollTimer.current);
      compPollTimer.current = null;
    }
    const queryParams: Record<string, string> = {};
    if (target.event_id) queryParams.event_id = target.event_id;
    else if (target.run_id) queryParams.run_id = target.run_id;

    let tries = 0;
    const poll = async () => {
      tries += 1;
      try {
        const res = await apiFetch<{ run: ResearchRun | null }>(
          API.vani.competitorResearchStatus,
          { queryParams },
        );
        const run = res.run;
        if (!run) {
          // Queued: the event exists, the worker hasn't picked it up yet.
          setCompNote(tries >= PENDING_HINT_AFTER
            ? 'Still waiting for an agent to pick this up — is the worker process running?'
            : 'Waiting for an agent to pick this up…');
        }
        if (run) {
          setCompNote('');
          if (Array.isArray(run.steps) && run.steps.length > 0) setCompSteps(run.steps);
          if (run.status === 'completed') {
            setCompNote('');
            setCompResearch('done');
            const found = await loadCompetitors();
            showToast({
              message: found.length > 0
                ? `Research done — ${found.length} competitor${found.length === 1 ? '' : 's'} on your map`
                : 'Research done — no verifiable competitors found in your category',
              type: 'success',
            });
            return;
          }
          if (run.status === 'failed') {
            // Partial results survive: verified competitors were written to
            // the KG the moment they were earned — show them under the error.
            await loadCompetitors(true);
            setCompNote('');
            setCompResearch('failed');
            setCompError(firstLine(run.error_trace) || 'Competitor research failed');
            return;
          }
          // Still running: refresh the map too — accepted competitors land
          // in the KG incrementally and appear under the live feed.
          await loadCompetitors(true);
        }
      } catch { /* transient — keep polling */ }

      if (tries >= SOURCE_POLL_LIMIT) {
        setCompResearch('failed');
        setCompNote('');
        setCompError('Research is taking too long — is the worker process running?');
        return;
      }
      compPollTimer.current = setTimeout(poll, POLL_MS);
    };
    poll();
  }, [loadCompetitors, showToast]);

  /* ── The handoff — shared with /design/wizard so the motion can't drift.
     A finished card FLIES into its mission-memory slot; see the hook. */
  const { stageRef, handingOff, handoff: flyTo } = useMissionHandoff<HTMLDivElement>();

  const handoff = useCallback((stepId: string, nextIndex: number) => {
    flyTo(stepId, () => {
      setConfirmed((prev) => new Set(prev).add(stepId));
      setStepIndex(nextIndex);
    });
  }, [flyTo]);

  // Recording mode (?record=1) — the landing loop plays the SAME real flow
  // with no countdown chrome and a tighter dwell. Read from location rather
  // than useSearchParams so the page needs no Suspense boundary.
  const [recording, setRecording] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    setRecording(new URLSearchParams(window.location.search).get('record') === '1');
  }, []);
  const autoMs = recording ? 2200 : AUTO_CONFIRM_MS;

  const keptCount = competitors.filter((c) => !removedIds.has(c.id)).length;

  /* The queries the research agent actually ran. It already writes them to
     its run feed as `frame_queries` — "…" · "…" · "…" — so the card can show
     its working without any backend change. */
  const framedQueries = useMemo(() => {
    const step = compSteps.find((st) => st.step_name === 'frame_queries');
    if (!step?.output_summary) return [];
    return (step.output_summary.match(/"([^"]+)"/g) ?? [])
      .map((q) => q.slice(1, -1))
      .filter(Boolean);
  }, [compSteps]);

  /* ── Market vocabulary (semantic clusters) ────────────────────────── */

  const loadClusters = useCallback(async (): Promise<SemanticCluster[]> => {
    try {
      const res = await apiFetch<{ clusters: SemanticCluster[] }>(API.gtmProfile.clusters);
      setClusters(res.clusters);
      return res.clusters;
    } catch {
      // Never a blocker: research still runs, it just falls back to guessing
      // from the profile — and says so, loudly, in its own run feed.
      return [];
    }
  }, []);

  // Entering the vocabulary step: the clusters may not exist yet.
  //
  // They are drafted at the END of ingestion — draft_profile (which is what
  // releases the wizard to show step 1) fires long before KNOWLEDGE_UPDATED,
  // which is what triggers generateClusters. So a user who confirms step 1
  // quickly arrives here ahead of the worker. Poll rather than render an
  // empty step, and say plainly that we are waiting.
  useEffect(() => {
    if (booting || STEPS[stepIndex]?.id !== 'vocabulary') return;
    if (confirmed.has('vocabulary')) return;

    let cancelled = false;
    let tries = 0;
    setVocabWaiting(true);

    const tick = async () => {
      if (cancelled) return;
      tries += 1;
      const found = await loadClusters();
      if (cancelled) return;

      if (found.length > 0 || tries >= VOCAB_POLL_TRIES) {
        setVocabWaiting(false);
        return;
      }
      vocabTimer.current = setTimeout(tick, VOCAB_POLL_MS);
    };
    tick();

    return () => {
      cancelled = true;
      if (vocabTimer.current) clearTimeout(vocabTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, stepIndex, confirmed]);

  /** Ratify the vocabulary, then hand off to competitor research — which is
      the whole point of the reorder: the search that runs next is framed by
      terms a human just approved, instead of guessed from the profile. */
  const approveVocabulary = useCallback(async () => {
    setApprovingVocab(true);
    try {
      if (clusters.length > 0) {
        await apiFetch(API.gtmProfile.approveClusters, {
          body: { remove: [...removedClusters] },
        });
      }
      handoff('vocabulary', 2);
    } catch (err) {
      showToast({
        message: (err as ApiError).message || 'Could not save your market vocabulary',
        type: 'error',
      });
    } finally {
      setApprovingVocab(false);
    }
  }, [clusters, removedClusters, handoff, showToast]);

  // The research feed, reused across states: live (spinner on the active
  // step) while running, frozen as the evidence trail on failure/done.
  const renderCompFeed = (live: boolean) => (
    <ol className={s.stepFeed} aria-label="VaNi's research steps">
      {compSteps.map((st, i) => {
        const failed = st.status === 'error';
        const active = live && i === compSteps.length - 1 && !failed;
        return (
          <li
            key={`${st.step_name}-${i}`}
            className={`${s.stepRow} ${active ? s.stepActive : s.stepDone} ${failed ? s.stepFailed : ''}`}
          >
            <span className={s.stepMark} aria-hidden>
              {failed ? '✕' : active ? '' : '✓'}
              {active && <span className={s.stepSpinner} />}
            </span>
            <span className={s.stepText}>
              {COMPETITOR_STEP_LABELS[st.step_name] ?? st.action ?? st.step_name}
              {st.output_summary && <span className={s.stepDetail}> — {st.output_summary}</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );

  // resume=true → the agent picks up the last failed run's checkpoint and
  // skips completed stages (queries/search/shortlist/assessed candidates) —
  // a timeout or token-budget failure costs only the calls that never ran.
  const startCompetitorResearch = useCallback(async (resume = false) => {
    setCompResearch('running');
    setCompSteps([]);
    setCompError('');
    setCompNote('Handing your request to the agent…');
    try {
      const res = await apiFetch<{ already_running?: boolean; event_id?: string; run_id?: string }>(
        API.vani.researchCompetitors,
        { body: { resume } },
      );
      // Follow exactly the run this call produced (or the one already going).
      pollCompetitorResearch({ event_id: res.event_id, run_id: res.run_id });
    } catch (err) {
      setCompResearch('failed');
      setCompError((err as ApiError).message || 'Could not start competitor research');
    }
  }, [pollCompetitorResearch]);

  // Entering the step: resume a running research run, surface a failed one,
  // or — agent-led — auto-start research when nothing has been mapped yet.
  useEffect(() => {
    if (booting || STEPS[stepIndex]?.id !== 'competitors' || confirmed.has('competitors')) return;
    let cancelled = false;
    (async () => {
      const existing = await loadCompetitors();
      if (cancelled) return;
      try {
        const res = await apiFetch<{ run: ResearchRun | null }>(API.vani.competitorResearchStatus);
        if (cancelled) return;
        const run = res.run;
        if (run && (run.status === 'queued' || run.status === 'running')) {
          setCompResearch('running');
          if (Array.isArray(run.steps) && run.steps.length > 0) setCompSteps(run.steps);
          pollCompetitorResearch({ run_id: run.id });
          return;
        }
        if (run?.status === 'failed' && existing.length === 0) {
          setCompResearch('failed');
          setCompError(firstLine(run.error_trace) || 'Competitor research failed');
          return;
        }
        if (!run && existing.length === 0) {
          startCompetitorResearch();
          return;
        }
        setCompResearch('done');
      } catch {
        // Status endpoint unreachable — the list is still usable; research
        // can be started manually with the button.
        setCompResearch('idle');
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, stepIndex]);

  const confirmCompetitors = useCallback(async () => {
    setConfirmingCompetitors(true);
    try {
      const keep = competitors.filter((c) => !removedIds.has(c.id)).map((c) => c.id);
      const remove = [...removedIds];
      await apiFetch(API.vani.confirmCompetitors, { body: { keep, remove } });
      handoff('competitors', 3);
      showToast({
        message: keep.length > 0
          ? `Competitor map confirmed — ${keep.length} kept`
          : 'Confirmed — no named competitors, VaNi will position on category instead',
        type: 'success',
      });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Could not confirm competitors', type: 'error' });
    } finally {
      setConfirmingCompetitors(false);
    }
  }, [competitors, removedIds, handoff, showToast]);

  /* ── Step 4: confirm ICP — hands off to brand, the real finish line ── */

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
      queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      showToast({ message: 'Mission configured — Storytelling is now unlocked in mission control', type: 'success' });
      router.replace('/today');
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Could not finish setup', type: 'error' });
    } finally {
      setFinishing(false);
    }
  }, [onboardingStatus.data, queryClient, router, showToast]);

  const approveIcp = useCallback(async () => {
    setApproving(true);
    setMissingFields([]);
    try {
      // A field edited moments ago fires blur-save on the way to this click —
      // wait for every in-flight PUT so approve validates the saved profile.
      await Promise.all([...pendingSaves.current]);

      // The vocabulary is NOT ratified here any more. It was, and that was
      // the bug: competitor research runs on entering step 3 but only reads
      // APPROVED clusters, so approving them at the last step meant every
      // first-run search was ungrounded. It now has its own step, ahead of
      // the search that consumes it.
      await apiFetch(API.gtmProfile.approve);
      await refreshProfile();
      handoff('icp', 4);
      showToast({ message: 'Ideal customer confirmed — every agent now builds on it', type: 'success' });
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
  }, [handoff, refreshProfile, showToast]);

  /* ── Step 5: confirm brand — the mission's actual finish line ───────
     Same agent-proposes/human-confirms pattern as ICP: pre-filled from the
     step-1 site crawl (re-fetched independently — see brand.service.ts),
     editable, confirmed with one Confirm button. */

  const loadBrand = useCallback(async (): Promise<TenantBrand | null> => {
    try {
      const res = await apiFetch<{ brand: TenantBrand }>(API.gtmProfile.getBrand);
      setBrand(res.brand);
      return res.brand;
    } catch {
      return null;
    }
  }, []);

  // Entering the brand step: draft it if nothing exists yet — mirrors the
  // competitors step's auto-start-on-entry pattern.
  useEffect(() => {
    if (booting || STEPS[stepIndex]?.id !== 'brand' || confirmed.has('brand')) return;
    let cancelled = false;
    (async () => {
      const existing = await loadBrand();
      if (cancelled || existing) return;
      setGeneratingBrand(true);
      try {
        const res = await apiFetch<{ brand: TenantBrand }>(API.gtmProfile.generateBrand);
        if (!cancelled) setBrand(res.brand);
      } catch (err) {
        if (!cancelled) {
          showToast({ message: (err as ApiError).message || 'Could not draft your brand', type: 'error' });
        }
      } finally {
        if (!cancelled) setGeneratingBrand(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [booting, stepIndex, confirmed]);

  const brandFieldValue = (key: string): string => {
    if (key in brandEdits) return brandEdits[key];
    const v = brand?.[key as keyof TenantBrand];
    if (Array.isArray(v)) return v.join('\n');
    return '';
  };

  const saveBrandField = useCallback(async (key: string) => {
    if (!(key in brandEdits)) return;
    const value = brandEdits[key].split('\n').map((x) => x.trim()).filter(Boolean);
    const save = (async () => {
      try {
        const res = await apiFetch<{ brand: TenantBrand }>(API.gtmProfile.updateBrand, { body: { [key]: value } });
        setBrand(res.brand);
      } catch (err) {
        showToast({ message: (err as ApiError).message || `Failed to save ${key}`, type: 'error' });
      }
    })();
    brandPendingSaves.current.add(save);
    save.finally(() => brandPendingSaves.current.delete(save));
    await save;
  }, [brandEdits, showToast]);

  const approveBrand = useCallback(async () => {
    setApprovingBrand(true);
    try {
      await Promise.all([...brandPendingSaves.current]);
      await apiFetch(API.gtmProfile.approveBrand);
      await loadBrand();
      setConfirmed((prev) => new Set(prev).add('brand'));
      showToast({ message: 'Brand confirmed — every agent now builds on it', type: 'success' });
      await finishOnboarding();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Could not confirm the brand', type: 'error' });
    } finally {
      setApprovingBrand(false);
    }
  }, [finishOnboarding, loadBrand, showToast]);

  // A thin/unreachable site (or a transient fetch failure — see
  // brand.service.ts) can draft an all-empty brand. Retrying used to mean
  // abandoning the whole wizard, since nothing re-triggered generation once
  // the step-entry effect had already run once. Regenerate right here
  // instead — any in-progress human edits are discarded on purpose, since
  // "regenerate" means "throw away the draft and read the site again".
  const regenerateBrand = useCallback(async () => {
    setGeneratingBrand(true);
    setBrandEdits({});
    try {
      const res = await apiFetch<{ brand: TenantBrand }>(API.gtmProfile.generateBrand);
      setBrand(res.brand);
      showToast({ message: 'Redrafted from your site', type: 'success' });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Could not redraft the brand', type: 'error' });
    } finally {
      setGeneratingBrand(false);
    }
  }, [showToast]);

  // "Edit again" — un-seals whichever step is currently in view, scoped to
  // the same wizard session (no reopening a step you've already navigated
  // past and whose output a LATER confirmed step may already depend on —
  // see the vocabulary/competitors ordering note above). Brand needs an
  // extra backend call: its approved_at gates BOTH the score section and
  // generateBrand's overwrite guard, so without clearing it first
  // "Regenerate from site" would silently no-op against the approved row.
  const [reopening, setReopening] = useState(false);
  const reopenCurrentStep = useCallback(async (stepId: string) => {
    if (stepId === 'brand') {
      setReopening(true);
      try {
        const res = await apiFetch<{ brand: TenantBrand }>(API.gtmProfile.reopenBrand);
        setBrand(res.brand);
      } catch (err) {
        showToast({ message: (err as ApiError).message || 'Could not reopen the brand', type: 'error' });
        return;
      } finally {
        setReopening(false);
      }
    }
    setConfirmed((prev) => {
      const next = new Set(prev);
      next.delete(stepId);
      return next;
    });
  }, [showToast]);

  /* ── Mission rail ─────────────────────────────────────────────────── */

  // Mission memory: a finished step files its REAL ARTIFACT into the rail —
  // the agent's output re-laid narrow, not a digest line (ux-references
  // pages 1–8). Each step reduces in its own shape: the company card stays a
  // card, competitors keep only their domains, the ideal customer keeps the
  // buyer and the vocabulary. The top rail says where you are; the memory
  // says what was found. Neither repeats the other.
  const railItems: VdfMissionMemoryItem[] = useMemo(() => STEPS.map((step, i) => {
    const done = confirmed.has(step.id);
    let artifact: React.ReactNode;

    if (done && step.id === 'company') {
      artifact = (
        <VdfMissionCard
          name={profile?.product_name || 'Your company'}
          domain={domain.trim() || undefined}
          description={profile?.product_description || undefined}
          tags={(profile?.key_differentiators ?? []).slice(0, 3)}
        />
      );
    }

    if (done && step.id === 'vocabulary') {
      const keptClusters = clusters.filter((c) => !removedClusters.has(c.id));
      artifact = keptClusters.length > 0 ? (
        <VdfMissionSection label="Market vocabulary" count={keptClusters.length}>
          <VdfMissionChips
            chips={keptClusters.map((c) => ({ id: c.id, label: c.primary_term }))}
            visible={6}
          />
        </VdfMissionSection>
      ) : (
        <VdfMissionSection label="Market vocabulary">
          <p className={s.memoryLine}>Searching from your profile — no vocabulary confirmed.</p>
        </VdfMissionSection>
      );
    }

    if (done && step.id === 'competitors') {
      const kept = competitors.filter((c) => !removedIds.has(c.id));
      if (kept.length > 0) {
        artifact = (
          <VdfMissionSection label="Competitors" count={kept.length}>
            <VdfMissionChips
              chips={kept.map((c) => {
                const d = typeof c.properties?.domain === 'string' ? c.properties.domain : null;
                return {
                  id: c.id,
                  label: d || c.name,
                  href: d ? `https://${d}` : undefined,
                };
              })}
            />
          </VdfMissionSection>
        );
      } else if (competitorsKnown) {
        // Fetched and genuinely empty — this is a real finding, so say it.
        artifact = (
          <VdfMissionSection label="Competitors" count={0}>
            <p className={s.memoryLine}>No named competitors — positioning on category strength.</p>
          </VdfMissionSection>
        );
      } else {
        // Not fetched yet. Say nothing about the count rather than assert zero.
        artifact = (
          <VdfMissionSection label="Competitors">
            <p className={s.memoryLine}>Loading what you confirmed…</p>
          </VdfMissionSection>
        );
      }
    }

    // The vocabulary is step 2's artifact now — the ICP step keeps only the
    // buyer, so the rail never files the same thing under two steps.
    if (done && step.id === 'icp') {
      artifact = (
        <VdfMissionSection label="Ideal customer">
          <VdfMissionRows
            rows={[
              ...(profile?.icp_role ? [{ id: 'role', label: profile.icp_role, active: true }] : []),
              ...(profile?.icp_company_type ? [{ id: 'type', label: profile.icp_company_type }] : []),
              ...(profile?.primary_pain_points ?? []).slice(0, 4).map((pt, n) => ({
                id: `pain-${n}`, label: pt,
              })),
            ]}
          />
        </VdfMissionSection>
      );
    }

    if (done && step.id === 'brand') {
      const voiceChips = (brand?.voice_tone ?? []).slice(0, 4);
      artifact = (
        <VdfMissionSection label="Brand">
          {voiceChips.length > 0 && (
            <VdfMissionChips chips={voiceChips.map((v, n) => ({ id: `voice-${n}`, label: v }))} />
          )}
          <VdfMissionRows
            rows={(brand?.proof ?? []).slice(0, 3).map((p, n) => ({ id: `proof-${n}`, label: p }))}
          />
        </VdfMissionSection>
      );
    }

    return {
      id: step.id,
      step: i + 1,
      title: step.label,
      state: done ? 'done' : i === stepIndex ? 'active' : 'pending',
      artifact,
      expectsArtifact: ARTIFACT_STEPS.has(step.id),
    } as VdfMissionMemoryItem;
  }), [confirmed, stepIndex, profile, domain, competitors, competitorsKnown, removedIds, clusters, removedClusters, brand]);

  const current = STEPS[stepIndex];

  /* ── Render ───────────────────────────────────────────────────────── */

  if (booting) {
    return <div className={s.bootWrap}><VdfLoader message="Preparing your mission" overlay /></div>;
  }

  return (
    <VdfPathwayShell
      eyebrow="Mission · Onboarding"
      name="Set up your GTM engine"
      headerAction={onboardingStatus.data?.complete ? (
        <button type="button" className={s.backLink} onClick={() => router.push('/today')}>
          ← Back to today
        </button>
      ) : undefined}
      steps={STEPS.map(({ id, label }) => ({ id, label }))}
      currentIndex={stepIndex}
      completedSteps={confirmed}
      onStepClick={(i) => { if (confirmed.has(STEPS[i].id) || i <= stepIndex) setStepIndex(i); }}
      style={{ '--mission-rail-max': 'calc(100vh - 180px)' } as CSSProperties}
      artefacts={<VdfMissionMemory items={railItems} />}
      findings={parseSiteHealth(researchSteps) ? (
        <>
          <span className={s.findingsEyebrow}>VaNi&apos;s findings</span>
          <span className={s.findingsTitle}>Free site audit</span>
          <div className={s.findingsTags}>
            {parseSiteHealth(researchSteps)!.map((key) => (
              <div key={key} className={s.findingTag}>
                <span className={s.findingTagName}>{FINDING_TAGS[key]?.tag ?? key}</span>
                <span className={s.findingTagHook}>{FINDING_TAGS[key]?.hook ?? 'missing signal'}</span>
              </div>
            ))}
          </div>
          <p className={s.findingsTeaser}>
            The <strong>Auditor agent</strong> tracks these, scores your visibility, and
            guides every fix — arriving in your mission control.
          </p>
        </>
      ) : undefined}
    >
      <div
        ref={stageRef}
        className={`${s.stage} ${handingOff ? s.mainFlying : ''}`}
        key={current.id}
      >

        {/* Confirmed cards seal their action row (VdfApprovalCard) — this is
            the only way back in, and only while this step is still the one
            in view. Navigate away and it seals again for good this session. */}
        {confirmed.has(current.id) && (
          <div className={s.reopenRow}>
            <span className={s.memoryLine}>This step is confirmed.</span>
            <VdfButton variant="ghost" size="sm" loading={reopening} onClick={() => reopenCurrentStep(current.id)}>
              Edit again
            </VdfButton>
          </div>
        )}

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
                <VdfKgLoader
                  subject={domain.trim() || undefined}
                  message={researchNote || 'Reading your website'}
                  rotating={RESEARCH_ROTATION}
                />
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
              autoConfirmMs={autoMs}
              autoConfirmSilent={recording}
              onConfirm={() => { handoff('company', 1); }}
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

          {/* ── STEP 2 — Market vocabulary ─────────────────────────
              Ratified HERE, ahead of the competitor search that consumes it.
              It used to live on the ICP card at the end, which meant research
              only ever saw unapproved clusters and fell back to guessing from
              the profile — see research.agent.ts, listClusters({approvedOnly}). */}
          {current.id === 'vocabulary' && (
            <VdfApprovalCard
              eyebrow="VaNi · the words your market uses"
              title="Is this how your buyers talk?"
              subtitle="Every competitor search — and every match we make later — is framed from these terms. Drop anything that isn't you; that is the whole point of this step."
              status={confirmed.has('vocabulary') ? 'confirmed' : 'draft'}
              onConfirm={approveVocabulary}
              confirmLabel="Confirm vocabulary &amp; find competitors →"
              loading={approvingVocab}
            >
              {clusters.length === 0 ? (
                <VdfKgLoader
                  subject={profile?.product_name || domain.trim() || undefined}
                  message={vocabWaiting
                    ? 'Reading your knowledge graph for the language your market uses'
                    : 'No market vocabulary yet'}
                  rotating={vocabWaiting ? VOCAB_ROTATION : undefined}
                  patienceAfter={20000}
                />
              ) : (
                <div className={s.vocabList}>
                  {clusters.map((c) => {
                    const dropped = removedClusters.has(c.id);
                    return (
                      <div key={c.id} className={`${s.vocabCluster} ${dropped ? s.vocabClusterOut : ''}`}>
                        <div className={s.vocabHead}>
                          <span className={`${s.tag} ${c.cluster_type === 'category' ? s.tagVerified : s.tagDomain}`}>
                            {CLUSTER_TYPE_LABEL[c.cluster_type] ?? c.cluster_type}
                          </span>
                          <span className={s.vocabTerm}>{c.primary_term}</span>
                          <button
                            type="button"
                            className={s.vocabDrop}
                            onClick={() => setRemovedClusters((prev) => {
                              const next = new Set(prev);
                              if (next.has(c.id)) { next.delete(c.id); } else { next.add(c.id); }
                              return next;
                            })}
                          >
                            {dropped ? 'Undo' : 'Not us'}
                          </button>
                        </div>
                        {c.related_terms.length > 0 && (
                          <div className={s.vocabTerms}>
                            {c.related_terms.slice(0, 12).map((t) => (
                              <span key={t} className={s.vocabTermChip}>{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Never pretend the search will be grounded when it won't be. */}
              {!vocabWaiting && clusters.length === 0 && (
                <p className={s.vocabHint}>
                  VaNi couldn&apos;t draft a vocabulary from what it read. You can continue —
                  competitor research will frame its searches from your profile instead, and
                  it will say so in its own feed.
                </p>
              )}
            </VdfApprovalCard>
          )}

          {/* ── STEP 3 — Competitor map (pipeline v2 stage 1) ─────── */}
          {current.id === 'competitors' && (
            <VdfApprovalCard
              eyebrow={framedQueries.length > 0
                ? 'VaNi · searched your confirmed market terms'
                : 'VaNi · researched from your profile'}
              title="Who shapes your buyers' expectations?"
              subtitle="I research your category across the live web, verify each candidate against their real site, and map them here. Remove anyone who doesn't belong — I'll position against the rest in your stories and campaigns."
              status={confirmed.has('competitors') ? 'confirmed' : 'draft'}
              autoConfirmMs={compResearch === 'running' || compResearch === 'failed' ? undefined : autoMs}
              autoConfirmSilent={recording}
              onConfirm={compResearch === 'running' ? undefined : confirmCompetitors}
              confirmLabel={keptCount > 0
                ? `Confirm ${keptCount} competitor${keptCount === 1 ? '' : 's'}`
                : 'No competitors — continue'}
              loading={confirmingCompetitors}
            >
              {/* The searches the vocabulary produced — reference page 2 shows
                  the agent's working next to its results, and it is the only
                  place the confirmed terms are visibly cashed in. */}
              {framedQueries.length > 0 && (
                <VdfMissionSection label="Queries" count={framedQueries.length}>
                  <div className={s.queryList}>
                    {framedQueries.map((q) => (
                      <span key={q} className={s.queryChip}>
                        <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" aria-hidden>
                          <circle cx="5.2" cy="5.2" r="3.4" /><path d="M7.8 7.8L10.5 10.5" />
                        </svg>
                        {q}
                      </span>
                    ))}
                  </div>
                </VdfMissionSection>
              )}

              {compResearch === 'running' ? (
                <div className={s.researchSummary}>
                  <VdfKgLoader
                    subject={profile?.product_name || domain.trim() || undefined}
                    message={compNote || 'Researching your competitive landscape'}
                    rotating={COMPETITOR_ROTATION}
                  />
                  {compSteps.length > 0 && renderCompFeed(true)}
                  {/* Verified competitors land in the KG incrementally — show
                      them the moment they exist, mockup-style. */}
                  {competitors.length > 0 && (
                    <div className={s.liveMap}>
                      <span className={s.fieldLabel}>Mapped so far · {competitors.length}</span>
                      <div className={s.competitorGrid}>
                        {competitors.map((c) => {
                          const domain = typeof c.properties?.domain === 'string' ? c.properties.domain : null;
                          const verified = c.properties?.verified === true;
                          return (
                            <article key={c.id} className={s.compCard}>
                              <div className={s.compTags}>
                                <span className={`${s.tag} ${verified ? s.tagVerified : s.tagUnverified}`}>
                                  {verified ? 'Verified' : 'Unverified'}
                                </span>
                                {domain && <span className={`${s.tag} ${s.tagDomain}`}>{domain}</span>}
                              </div>
                              <span className={s.compName}>{c.name}</span>
                              {c.description && <p className={s.compDesc}>{c.description}</p>}
                            </article>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  {compResearch === 'failed' && (
                    <div className={s.errorNote}>
                      <p>{compError}</p>
                      <div className={s.errorActions}>
                        <VdfButton variant="primary" size="sm" onClick={() => startCompetitorResearch(true)}>
                          Resume from where it stopped
                        </VdfButton>
                        <VdfButton variant="ghost" size="sm" onClick={() => startCompetitorResearch(false)}>
                          Start fresh
                        </VdfButton>
                      </div>
                      {compSteps.length > 0 && renderCompFeed(false)}
                    </div>
                  )}

                  {competitorsLoading ? (
                    <VdfKgLoader message="Reading competitors from your knowledge graph" />
                  ) : competitors.length === 0 ? (
                    <div className={s.summaryField}>
                      <span className={s.fieldEmpty}>
                        {compResearch === 'done'
                          ? 'Research finished — no candidate survived verification against their real site. Some categories are genuinely uncrowded; re-run any time, or add competitor notes through the loop and confirm to keep moving.'
                          : 'No competitors on the map yet.'}
                      </span>
                      <div className={s.errorActions}>
                        {compResearch !== 'failed' && (
                          <VdfButton variant="outline" size="sm" onClick={() => startCompetitorResearch(false)}>
                            {compResearch === 'done' ? 'Research again' : 'Research competitors'}
                          </VdfButton>
                        )}
                        <VdfButton variant="ghost" size="sm" onClick={() => loadCompetitors()}>Refresh</VdfButton>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className={s.mapSummary}>
                        <span className={s.mapCount}>
                          <strong>{keptCount}</strong> on your map
                        </span>
                        {removedIds.size > 0 && (
                          <span className={s.mapIgnored}>{removedIds.size} moving to your ignore list</span>
                        )}
                      </div>

                      <div className={s.competitorGrid}>
                        {competitors.map((c) => {
                          const removed = removedIds.has(c.id);
                          const domain = typeof c.properties?.domain === 'string' ? c.properties.domain : null;
                          const verified = c.properties?.verified === true;
                          return (
                            <article key={c.id} className={`${s.compCard} ${removed ? s.compCardRemoved : ''}`}>
                              <div className={s.compTags}>
                                {removed ? (
                                  <span className={`${s.tag} ${s.tagIgnored}`}>Ignored</span>
                                ) : verified ? (
                                  <span className={`${s.tag} ${s.tagVerified}`}>Verified</span>
                                ) : (
                                  <span className={`${s.tag} ${s.tagUnverified}`}>Unverified</span>
                                )}
                                {domain && <span className={`${s.tag} ${s.tagDomain}`}>{domain}</span>}
                              </div>

                              <span className={s.compName}>{c.name}</span>
                              {c.description && <p className={s.compDesc}>{c.description}</p>}

                              <div className={s.compFoot}>
                                <VdfButton
                                  variant={removed ? 'outline' : 'ghost'}
                                  size="sm"
                                  onClick={() => setRemovedIds((prev) => {
                                    const next = new Set(prev);
                                    if (next.has(c.id)) { next.delete(c.id); } else { next.add(c.id); }
                                    return next;
                                  })}
                                >
                                  {removed ? 'Keep after all' : 'Remove'}
                                </VdfButton>
                              </div>
                            </article>
                          );
                        })}
                      </div>

                      <p className={s.mapHint}>
                        Removing a company adds it to your ignore list — VaNi won&apos;t propose it again on a future research run.
                      </p>

                      <div className={s.errorActions}>
                        {compResearch !== 'failed' && (
                          <VdfButton variant="outline" size="sm" onClick={() => startCompetitorResearch(false)}>Research again</VdfButton>
                        )}
                        <VdfButton variant="ghost" size="sm" onClick={() => loadCompetitors()}>Refresh</VdfButton>
                      </div>
                    </>
                  )}

                  {compResearch === 'done' && compSteps.length > 0 && (
                    <details className={s.feedDetails}>
                      <summary className={s.feedSummary}>How VaNi researched this</summary>
                      {renderCompFeed(false)}
                    </details>
                  )}
                </>
              )}
            </VdfApprovalCard>
          )}

          {/* ── STEP 4 — Confirm ICP: hands off to brand ───────────── */}
          {current.id === 'icp' && (
            <VdfApprovalCard
              eyebrow={`VaNi · profile score ${profile?.completion_score ?? 0}/100`}
              title="Confirm your ideal customer &amp; their pains"
              subtitle="Who you sell to, and what hurts them — the foundation every agent builds on."
              status={confirmed.has('icp') ? 'confirmed' : 'draft'}
              onConfirm={approveIcp}
              confirmLabel="Confirm &amp; continue →"
              loading={approving || finishing}
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
                        rows={f.list ? 6 : 4}
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

          {/* ── STEP 5 — Confirm brand: the mission's finish line ──── */}
          {current.id === 'brand' && (
            <VdfApprovalCard
              eyebrow={`VaNi · profile score ${profile?.completion_score ?? 0}/100`}
              title="Confirm your brand"
              subtitle="How you sound, what you claim, what you never claim — pre-filled from your site. Confirming completes your mission; Storytelling unlocks in mission control."
              status={confirmed.has('brand') ? 'confirmed' : 'draft'}
              onConfirm={approveBrand}
              onEdit={regenerateBrand}
              editLabel="Regenerate from site"
              confirmLabel="Confirm &amp; enter mission control →"
              loading={generatingBrand || approvingBrand || finishing}
            >
              {generatingBrand && !brand && (
                <p className={s.memoryLine}>Reading your site for voice, claims and proof…</p>
              )}
              {!generatingBrand && brand && !brand.voice_tone?.length && !brand.always_say?.length
                && !brand.never_say?.length && !brand.proof?.length && (
                <p className={s.memoryLine}>
                  Nothing came back grounded in your site text — type it in below, or hit
                  &quot;Regenerate from site&quot; to try the fetch again.
                </p>
              )}
              {(brand?.visual?.logo_url || brand?.visual?.colors?.length) ? (
                <div className={s.icpField}>
                  <label className={s.fieldLabel}>Visual — read from your site</label>
                  <div className={s.brandVisualRow}>
                    {brand?.visual?.logo_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={brand.visual.logo_url} alt="" className={s.brandLogo} />
                    )}
                    {(brand?.visual?.colors ?? []).map((c) => (
                      <span key={c} className={s.brandSwatch} style={{ background: c }} title={c} />
                    ))}
                    {brand?.visual?.typography && <span className={s.memoryLine}>{brand.visual.typography}</span>}
                  </div>
                </div>
              ) : null}
              <div className={s.icpFields}>
                {BRAND_FIELDS.map((f) => (
                  <div key={f.key} className={s.icpField}>
                    <label className={s.fieldLabel} htmlFor={`brand-${f.key}`}>{f.label}</label>
                    <textarea
                      id={`brand-${f.key}`}
                      className={s.input}
                      rows={4}
                      value={brandFieldValue(f.key)}
                      onChange={(e) => setBrandEdits((p) => ({ ...p, [f.key]: e.target.value }))}
                      onBlur={() => saveBrandField(f.key)}
                    />
                  </div>
                ))}
              </div>
            </VdfApprovalCard>
          )}

          {/* The enrichment loop lives at /knowledge (Teach VaNi) — user
              ruling: onboarding is a sprint to quick results, loops are a
              return activity. Pointer only, once the mission is configured. */}
          {onboardingStatus.data?.complete === true && (
            <div className={s.loopPointer}>
              <span>
                Want VaNi to know more? Feed it pages and context any time in{' '}
                <strong>Teach VaNi</strong> — every agent downstream builds on the richer profile.
              </span>
              <VdfButton variant="ghost" size="sm" href="/brain/teach">Teach VaNi →</VdfButton>
            </div>
          )}
      </div>
    </VdfPathwayShell>
  );
}
