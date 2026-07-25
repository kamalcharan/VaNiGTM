'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { ME_QUERY_KEY } from '@/hooks/useMe';
import type { OnboardingStatus, OnboardingStep } from '@/hooks/useOnboarding';
import {
  VdfPageHeader,
  VdfWizard,
  VdfCard,
  VdfReadinessRing,
  VdfKpiCard,
  VdfLoader,
  VdfErrorScreen,
  VdfInput,
  VdfButton,
} from '@/components/vdf';
import { SaveStatusIndicator, type SaveState } from './save-status';
import { ArrayFieldEditor } from './array-field-editor';
import s from './icp-builder-page.module.css';
import f from '@/styles/forms.module.css';

/* ── Types (mirrors backend/src/skills/profile-skill/profile.service.ts) ── */

interface CompletionDetail {
  product: number; // 0-40
  icp: number;      // 0-30
  gtm: number;      // 0-20
  vision: number;   // 0-10
}

interface TenantProfile {
  product_name: string | null;
  product_tagline: string | null;
  product_category: string | null;
  product_description: string | null;
  core_problem: string | null;
  key_differentiators: string[] | null;
  pricing_model: string | null;
  pricing_range: string | null;

  icp_role: string | null;
  icp_company_type: string | null;
  icp_company_size: string | null;
  icp_industry: string | null;
  icp_geography: string | null;
  primary_pain_points: string[] | null;

  gtm_stage: string | null;
  active_channels: string[] | null;
  current_mrr: string | null;
  team_size: number | null;

  vision_statement: string | null;
  target_market_size: string | null;

  completion_score: number;
  completion_detail: CompletionDetail;
}

type ProfileKey = keyof TenantProfile;

const EMPTY_PROFILE: TenantProfile = {
  product_name: null, product_tagline: null, product_category: null, product_description: null,
  core_problem: null, key_differentiators: null, pricing_model: null, pricing_range: null,
  icp_role: null, icp_company_type: null, icp_company_size: null, icp_industry: null,
  icp_geography: null, primary_pain_points: null,
  gtm_stage: null, active_channels: null, current_mrr: null, team_size: null,
  vision_statement: null, target_market_size: null,
  completion_score: 0,
  completion_detail: { product: 0, icp: 0, gtm: 0, vision: 0 },
};

/* ── Section / field definitions ──────────────────────────────────────────
   Mirrors the exact weighting in profile.service.ts calculateCompletionScore
   (product 0-40, icp 0-30, gtm 0-20, vision 0-10) — not inferred from naming. */

type SectionId = keyof CompletionDetail;

interface FieldDef {
  key: ProfileKey;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'array';
}

interface SectionDef {
  id: SectionId;
  label: string;
  max: number;
  fields: FieldDef[];
}

const SECTIONS: SectionDef[] = [
  {
    id: 'product', label: 'Product', max: 40,
    fields: [
      { key: 'product_name', label: 'Product Name', type: 'text' },
      { key: 'product_tagline', label: 'Tagline', type: 'text' },
      { key: 'product_category', label: 'Category', type: 'text' },
      { key: 'product_description', label: 'Description', type: 'textarea' },
      { key: 'core_problem', label: 'Core Problem', type: 'textarea' },
      { key: 'key_differentiators', label: 'Key Differentiators', type: 'array' },
      { key: 'pricing_model', label: 'Pricing Model', type: 'text' },
      { key: 'pricing_range', label: 'Pricing Range', type: 'text' },
    ],
  },
  {
    id: 'icp', label: 'ICP', max: 30,
    fields: [
      { key: 'icp_role', label: 'Buyer Role', type: 'text' },
      { key: 'icp_company_type', label: 'Company Type', type: 'text' },
      { key: 'icp_company_size', label: 'Company Size', type: 'text' },
      { key: 'icp_industry', label: 'Industry', type: 'text' },
      { key: 'icp_geography', label: 'Geography', type: 'text' },
      { key: 'primary_pain_points', label: 'Primary Pain Points', type: 'array' },
    ],
  },
  {
    id: 'gtm', label: 'GTM', max: 20,
    fields: [
      { key: 'gtm_stage', label: 'GTM Stage', type: 'text' },
      { key: 'active_channels', label: 'Active Channels', type: 'array' },
      { key: 'current_mrr', label: 'Current MRR', type: 'text' },
      { key: 'team_size', label: 'Team Size', type: 'number' },
    ],
  },
  {
    id: 'vision', label: 'Vision', max: 10,
    fields: [
      { key: 'vision_statement', label: 'Vision Statement', type: 'textarea' },
      { key: 'target_market_size', label: 'Target Market Size', type: 'text' },
    ],
  },
];

const WIZARD_STEPS = SECTIONS.map((sec) => ({ id: sec.id, label: sec.label }));

const FIELD_LABEL_BY_KEY: Partial<Record<ProfileKey, string>> = Object.fromEntries(
  SECTIONS.flatMap((sec) => sec.fields.map((field) => [field.key, field.label])),
);

// Maps a profile field key back to its section id — used to highlight which
// section card(s) contain the fields POST /profile/approve reports missing.
const FIELD_TO_SECTION: Partial<Record<ProfileKey, SectionId>> = Object.fromEntries(
  SECTIONS.flatMap((sec) => sec.fields.map((field) => [field.key, sec.id])),
);

const ARRAY_DEBOUNCE_MS = 450;

type ConfirmPhase = 'idle' | 'running' | 'error';

function isNotFound(err: unknown): boolean {
  const e = err as Partial<ApiError> | undefined;
  return e?.code === 'PROFILE_NOT_FOUND' || e?.status === 404;
}

function sectionPct(sec: SectionDef, profile: TenantProfile): number {
  const raw = profile.completion_detail?.[sec.id] ?? 0;
  return Math.round((raw / sec.max) * 100);
}

export default function IcpBuilderPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [draft, setDraft] = useState<TenantProfile | null>(null);
  const [draftInitialized, setDraftInitialized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pickedDefault, setPickedDefault] = useState(false);
  const [saveStatus, setSaveStatus] = useState<Partial<Record<ProfileKey, SaveState>>>({});
  const [confirmPhase, setConfirmPhase] = useState<ConfirmPhase>('idle');
  const [confirmErrorMessage, setConfirmErrorMessage] = useState<string | null>(null);
  const [missingSections, setMissingSections] = useState<Set<SectionId>>(new Set());

  const lastAttempt = useRef<Partial<Record<ProfileKey, unknown>>>({});
  const debounceTimers = useRef<Partial<Record<ProfileKey, ReturnType<typeof setTimeout>>>>({});
  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({
    product: null, icp: null, gtm: null, vision: null,
  });

  /* ── Initial fetch ── */
  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const res = await apiFetch<{ profile: TenantProfile }>(API.gtmProfile.get);
        if (cancelled) return;
        setProfile(res.profile);
      } catch (err) {
        if (cancelled) return;
        if (isNotFound(err)) {
          // Fresh tenant — no profile row yet. Render the empty skeleton, not an error.
          setProfile(EMPTY_PROFILE);
        } else {
          showToast({ message: (err as ApiError).message || 'Failed to load ICP profile', type: 'error' });
          setLoadError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [showToast]);

  /* ── Initialize the editable draft once, from the first loaded profile.
     Never re-synced wholesale afterward — that would clobber in-progress
     edits in other fields whenever any single field's save resolves. ── */
  useEffect(() => {
    if (profile && !draftInitialized) {
      setDraft(profile);
      setDraftInitialized(true);
    }
  }, [profile, draftInitialized]);

  /* ── Default focus: the lowest-scoring section, so attention goes to the
     biggest gap first. Only picked once, after the initial load. ── */
  useEffect(() => {
    if (!profile || pickedDefault) return;
    const pcts = SECTIONS.map((sec) => sectionPct(sec, profile));
    const lowest = pcts.indexOf(Math.min(...pcts));
    setCurrentIndex(lowest === -1 ? 0 : lowest);
    setPickedDefault(true);
  }, [profile, pickedDefault]);

  /* ── Clear any pending array-field debounce timers on unmount ── */
  useEffect(() => {
    const timers = debounceTimers.current;
    return () => {
      Object.values(timers).forEach((t) => t && clearTimeout(t));
    };
  }, []);

  async function persistField(key: ProfileKey, value: unknown) {
    setSaveStatus((prev) => ({ ...prev, [key]: 'saving' }));
    lastAttempt.current[key] = value;

    try {
      const res = await apiFetch<{ profile: TenantProfile }>(API.gtmProfile.update, {
        body: { [key]: value } as Record<string, unknown>,
      });

      // Full replace — response is the canonical row with recomputed
      // completion_score/completion_detail, which drives the KPI card,
      // per-section rings, and wizard completedSteps.
      setProfile(res.profile);

      // Scalar/number fields: sync the confirmed value back into draft too.
      // Arrays are skipped here — the user may still be mid-edit (e.g. a
      // freshly-added blank row) and a wholesale sync would erase that.
      if (!Array.isArray(value)) {
        setDraft((prev) => (prev ? { ...prev, [key]: res.profile[key] } : prev));
      }

      setSaveStatus((prev) => ({ ...prev, [key]: 'saved' }));
      window.setTimeout(() => {
        setSaveStatus((prev) => (prev[key] === 'saved' ? { ...prev, [key]: 'idle' } : prev));
      }, 2000);
    } catch (err) {
      setSaveStatus((prev) => ({ ...prev, [key]: 'error' }));
      const label = FIELD_LABEL_BY_KEY[key] ?? key;
      showToast({ message: (err as ApiError).message || `Failed to save ${label}`, type: 'error' });
    }
  }

  function retryField(key: ProfileKey) {
    if (!(key in lastAttempt.current)) return;
    persistField(key, lastAttempt.current[key]);
  }

  function updateDraft(key: ProfileKey, value: unknown) {
    setDraft((prev) => (prev ? { ...prev, [key]: value } : prev));
  }

  function handleScalarBlur(key: ProfileKey) {
    if (!draft || !profile) return;
    const raw = draft[key];
    const current = profile[key];
    const normalized = typeof raw === 'string' && raw.trim() === '' ? null : raw;
    if (normalized === current) return; // unchanged — skip the save call
    persistField(key, normalized);
  }

  function handleArrayChange(key: ProfileKey, next: string[]) {
    updateDraft(key, next);
    const timers = debounceTimers.current;
    if (timers[key]) clearTimeout(timers[key]);
    timers[key] = setTimeout(() => {
      const clean = next.map((v) => v.trim()).filter((v) => v.length > 0);
      persistField(key, clean);
    }, ARRAY_DEBOUNCE_MS);
  }

  function handleStepClick(index: number) {
    setCurrentIndex(index);
    const sec = SECTIONS[index];
    sectionRefs.current[sec.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ── Confirm ICP — one atomic 3-call sequence:
     1. POST gtmProfile.approve (400 PROFILE_INCOMPLETE lists every missing field)
     2. Complete every still-pending onboarding step (GET status → PATCH each)
     3. Refetch /auth/me so the layout guard sees onboarding_complete before
        navigating — otherwise it bounces straight back to /onboarding. ── */
  async function handleConfirmIcp() {
    setConfirmPhase('running');
    setConfirmErrorMessage(null);
    setMissingSections(new Set());

    // 1. Approve the profile
    try {
      await apiFetch(API.gtmProfile.approve);
    } catch (err) {
      const apiErr = err as ApiError;
      const missing = (apiErr.details?.missing as string[] | undefined) ?? [];

      if (missing.length > 0) {
        const sections = new Set<SectionId>();
        for (const key of missing) {
          const sec = FIELD_TO_SECTION[key as ProfileKey];
          if (sec) sections.add(sec);
        }
        setMissingSections(sections);
        showToast({
          message: `Profile incomplete — missing: ${missing.map((k) => FIELD_LABEL_BY_KEY[k as ProfileKey] ?? k).join(', ')}`,
          type: 'error',
        });
      } else {
        showToast({ message: apiErr.message || 'Failed to approve profile', type: 'error' });
      }

      setConfirmErrorMessage('Approval failed — see the highlighted section(s) above.');
      setConfirmPhase('error');
      return;
    }

    // 2. Complete every still-pending onboarding step (dynamic — discovered
    // via GET /onboarding/status, not hardcoded step ids).
    let finalOnboardingComplete = false;
    try {
      const status = await apiFetch<OnboardingStatus>(API.onboarding.status);
      finalOnboardingComplete = status.complete;

      const pending = status.steps.filter((step) => step.status !== 'completed');
      for (const step of pending) {
        const result = await apiFetch<{ step: OnboardingStep; next_step: string | null; onboarding_complete: boolean }>(
          API.onboarding.completeStep,
          { body: { step_id: step.step_id, status: 'completed' } },
        );
        finalOnboardingComplete = result.onboarding_complete;
      }
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Failed to complete onboarding steps', type: 'error' });
      setConfirmErrorMessage('Profile approved, but completing onboarding steps failed. Try again.');
      setConfirmPhase('error');
      return;
    }

    // 3. Verify + navigate
    if (!finalOnboardingComplete) {
      showToast({ message: 'Onboarding did not complete — please retry', type: 'error' });
      setConfirmErrorMessage('Onboarding steps completed, but the server still reports it incomplete. Please retry.');
      setConfirmPhase('error');
      return;
    }

    try {
      // Refresh the cached tenant so app/(app)/layout.tsx's guard sees
      // onboarding_complete: true before we navigate — otherwise it redirects
      // straight back to /onboarding on stale state.
      await queryClient.refetchQueries({ queryKey: ME_QUERY_KEY });
    } catch {
      // Non-fatal — navigate anyway; the guard re-checks on every render.
    }

    showToast({ message: 'ICP confirmed — welcome to your dashboard!', type: 'success' });
    router.push('/dashboard');
  }

  if (loading || !draft || !profile) {
    return <VdfLoader message="Loading your ICP profile" hint="Fetching product, ICP, GTM, and vision data" />;
  }

  if (loadError) {
    return (
      <VdfErrorScreen
        code={500}
        icon="⚠️"
        title="Couldn't load your ICP profile"
        description="Something went wrong fetching your profile data. Please try refreshing the page."
      />
    );
  }

  const completedSteps = new Set(
    SECTIONS.filter((sec) => sectionPct(sec, profile) >= 60).map((sec) => sec.id),
  );

  function renderField(field: FieldDef) {
    const status = saveStatus[field.key] ?? 'idle';
    const retry = () => retryField(field.key);

    if (field.type === 'text') {
      return (
        <VdfInput
          label={field.label}
          value={(draft![field.key] as string) ?? ''}
          onChange={(e) => updateDraft(field.key, e.target.value)}
          onBlur={() => handleScalarBlur(field.key)}
          rightElement={<SaveStatusIndicator state={status} onRetry={retry} />}
        />
      );
    }

    if (field.type === 'number') {
      const raw = draft![field.key] as number | null;
      return (
        <VdfInput
          label={field.label}
          type="number"
          value={raw != null ? String(raw) : ''}
          onChange={(e) => {
            const digits = e.target.value.replace(/[^\d]/g, '');
            updateDraft(field.key, digits === '' ? null : Number(digits));
          }}
          onBlur={() => handleScalarBlur(field.key)}
          rightElement={<SaveStatusIndicator state={status} onRetry={retry} />}
        />
      );
    }

    if (field.type === 'textarea') {
      return (
        <div className={s.fieldGroup}>
          <div className={s.fieldLabelRow}>
            <label className={`${f.label} ${s.fieldLabelText}`}>{field.label}</label>
            <SaveStatusIndicator state={status} onRetry={retry} />
          </div>
          <textarea
            className={f.textarea}
            rows={6}
            value={(draft![field.key] as string) ?? ''}
            onChange={(e) => updateDraft(field.key, e.target.value)}
            onBlur={() => handleScalarBlur(field.key)}
          />
        </div>
      );
    }

    // array
    return (
      <div className={s.fieldGroup}>
        <div className={s.fieldLabelRow}>
          <label className={`${f.label} ${s.fieldLabelText}`}>{field.label}</label>
          <SaveStatusIndicator state={status} onRetry={retry} />
        </div>
        <ArrayFieldEditor
          values={(draft![field.key] as string[] | null) ?? []}
          onChange={(next) => handleArrayChange(field.key, next)}
          placeholder="Add an item…"
        />
      </div>
    );
  }

  return (
    <div className={s.page}>
      <VdfPageHeader
        eyebrow="GTM PROFILE"
        title="Build Your ICP"
        meta={<>This profile feeds every VaNi agent — Storyteller, Lead Finder, and Campaigns all read from it.</>}
      />

      <div className={s.body}>
        <VdfKpiCard title="Profile Completion" icon="🎯">
          <div className={s.kpiRow}>
            <VdfReadinessRing pct={profile.completion_score} size={56} strokeWidth={4} />
            <div>
              <div className={s.kpiScore}>{profile.completion_score}%</div>
              <div className={s.kpiHint}>Overall completion — 60% unlocks dashboard access</div>
            </div>
          </div>
        </VdfKpiCard>

        <div className={s.wizardWrap}>
          <VdfWizard
            steps={WIZARD_STEPS}
            currentIndex={currentIndex}
            completedSteps={completedSteps}
            onStepClick={handleStepClick}
          />
        </div>

        {SECTIONS.map((sec, i) => {
          const pct = sectionPct(sec, profile);
          return (
            <div
              key={sec.id}
              ref={(el) => { sectionRefs.current[sec.id] = el; }}
              className={s.sectionCard}
            >
              <VdfCard
                hoverLift={false}
                className={[
                  currentIndex === i ? s.sectionActive : '',
                  missingSections.has(sec.id) ? s.sectionMissing : '',
                ].filter(Boolean).join(' ')}
              >
                <div className={s.sectionHeader}>
                  <div className={s.sectionTitle}>{sec.label}</div>
                  <VdfReadinessRing pct={pct} size={40} strokeWidth={3} />
                </div>
                <div className={s.fieldGrid}>
                  {sec.fields.map((field) => (
                    <div key={field.key} className={field.type === 'textarea' || field.type === 'array' ? s.fieldFull : undefined}>
                      {renderField(field)}
                    </div>
                  ))}
                </div>
              </VdfCard>
            </div>
          );
        })}

        <div className={s.confirmBar}>
          {profile.completion_score < 60 && (
            <div className={s.confirmHint}>Reach 60% overall completion to confirm your ICP.</div>
          )}
          <VdfButton
            variant="primary"
            disabled={profile.completion_score < 60}
            loading={confirmPhase === 'running'}
            onClick={handleConfirmIcp}
          >
            Confirm ICP
          </VdfButton>
          {confirmPhase === 'error' && confirmErrorMessage && (
            <div className={s.confirmErrorText}>{confirmErrorMessage}</div>
          )}
        </div>
      </div>
    </div>
  );
}
