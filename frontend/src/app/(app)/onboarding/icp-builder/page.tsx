'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import {
  VdfPageHeader,
  VdfWizard,
  VdfCard,
  VdfReadinessRing,
  VdfKpiCard,
  VdfLoader,
  VdfErrorScreen,
} from '@/components/vdf';
import s from './icp-builder-page.module.css';

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
  key: keyof TenantProfile;
  label: string;
  type: 'text' | 'array';
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
      { key: 'product_description', label: 'Description', type: 'text' },
      { key: 'core_problem', label: 'Core Problem', type: 'text' },
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
      { key: 'team_size', label: 'Team Size', type: 'text' },
    ],
  },
  {
    id: 'vision', label: 'Vision', max: 10,
    fields: [
      { key: 'vision_statement', label: 'Vision Statement', type: 'text' },
      { key: 'target_market_size', label: 'Target Market Size', type: 'text' },
    ],
  },
];

const WIZARD_STEPS = SECTIONS.map((sec) => ({ id: sec.id, label: sec.label }));

function isNotFound(err: unknown): boolean {
  const e = err as Partial<ApiError> | undefined;
  return e?.code === 'PROFILE_NOT_FOUND' || e?.status === 404;
}

function sectionPct(sec: SectionDef, profile: TenantProfile): number {
  const raw = profile.completion_detail?.[sec.id] ?? 0;
  return Math.round((raw / sec.max) * 100);
}

function fieldValue(profile: TenantProfile, field: FieldDef): ReactNode {
  const raw = profile[field.key];

  if (field.type === 'array') {
    const arr = (raw as string[] | null) ?? [];
    if (arr.length === 0) return <span className={s.emptyValue}>{'—'}</span>;
    return (
      <ul className={s.bulletList}>
        {arr.map((item, i) => <li key={i}>{item}</li>)}
      </ul>
    );
  }

  if (raw === null || raw === undefined || raw === '') {
    return <span className={s.emptyValue}>{'—'}</span>;
  }
  return String(raw);
}

export default function IcpBuilderPage() {
  const { showToast } = useToast();
  const [profile, setProfile] = useState<TenantProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [pickedDefault, setPickedDefault] = useState(false);
  const sectionRefs = useRef<Record<SectionId, HTMLDivElement | null>>({
    product: null, icp: null, gtm: null, vision: null,
  });

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

  // Default focus: the lowest-scoring section, so the user's attention goes
  // to the biggest gap first. Only picked once, after the initial load.
  useEffect(() => {
    if (!profile || pickedDefault) return;
    const pcts = SECTIONS.map((sec) => sectionPct(sec, profile));
    const lowest = pcts.indexOf(Math.min(...pcts));
    setCurrentIndex(lowest === -1 ? 0 : lowest);
    setPickedDefault(true);
  }, [profile, pickedDefault]);

  function handleStepClick(index: number) {
    setCurrentIndex(index);
    const sec = SECTIONS[index];
    sectionRefs.current[sec.id]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  if (loading) {
    return <VdfLoader message="Loading your ICP profile" hint="Fetching product, ICP, GTM, and vision data" />;
  }

  if (loadError || !profile) {
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
              <VdfCard hoverLift={false} className={currentIndex === i ? s.sectionActive : ''}>
                <div className={s.sectionHeader}>
                  <div className={s.sectionTitle}>{sec.label}</div>
                  <VdfReadinessRing pct={pct} size={40} strokeWidth={3} />
                </div>
                <div className={s.readGrid}>
                  {sec.fields.map((field) => (
                    <div key={field.key} className={s.readItem}>
                      <div className={s.readLabel}>{field.label}</div>
                      <div className={s.readValue}>{fieldValue(profile, field)}</div>
                    </div>
                  ))}
                </div>
              </VdfCard>
            </div>
          );
        })}
      </div>
    </div>
  );
}
