'use client';

/**
 * SnapshotTab — MFD-fills flow (Flow 3)
 * Matches contactnest-ux.html reference: centered editorial wizard,
 * 720px max-width, Fraunces question headers, 4px progress segments,
 * 80px risk bars with taglines, horizontal goal bubbles.
 *
 * 5-section wizard:
 *   01 Cash Flow → 02 Assets → 03 Liabilities → 04 Protection → 05 Goals
 */

import { useState, useEffect, useCallback, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useMe } from '@/hooks/useMe';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfButton,
} from '@/components/vdf';
import s from './snapshot-tab.module.css';

// ── Types ─────────────────────────────────────────────────────────────────

interface AssetType    { id: number; code: string; label: string; is_liquid_default: boolean; }
interface LiabilityType { id: number; code: string; label: string; }
interface GoalType      { id: number; code: string; label: string; icon: string; default_horizon_years?: number; }

interface AssetRow    { _id: string; asset_type_id: string; description: string; current_value: string; is_liquid: boolean; years_held: string; }
interface LiabRow     { _id: string; liability_type_id: string; description: string; outstanding_amount: string; monthly_emi: string; interest_rate_pct: string; }
interface GoalRow     { goal_type: string; name: string; target_amount: string; timeline_years: string; }

interface Income      { salary: string; partner: string; rental_other: string; }
interface Expenses    { housing: string; food: string; utilities: string; transport: string; education: string; healthcare: string; lifestyle: string; other: string; }
interface Protection  { life_cover_amount: string; health_cover_amount: string; ci_cover_amount: string; life_premium_annual: string; health_premium_annual: string; has_term_plan: boolean; has_health_cover: boolean; health_cover_type: 'individual' | 'family_floater' | 'employer' | 'none' | ''; }

// ── Metric computation (mirrors backend computeMetrics) ───────────────────

function computeMetrics(income: Income, expenses: Expenses, assets: AssetRow[], liabs: LiabRow[]) {
  const monthlyIncome   = (Number(income.salary) || 0) + (Number(income.partner) || 0) + (Number(income.rental_other) || 0);
  const monthlyExpenses = Object.values(expenses).reduce((s, v) => s + (Number(v) || 0), 0);
  const monthlySavings  = monthlyIncome - monthlyExpenses;
  const savingsRate     = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : null;

  const totalAssets      = assets.reduce((s, r) => s + (Number(r.current_value) || 0), 0);
  const totalLiabs       = liabs.reduce((s, r) => s + (Number(r.outstanding_amount) || 0), 0);
  const netWorth         = totalAssets - totalLiabs;

  const totalEmi = liabs.reduce((s, r) => s + (Number(r.monthly_emi) || 0), 0);
  const dti      = monthlyIncome > 0 ? (totalEmi / monthlyIncome) * 100 : null;

  const liquidAssets    = assets.filter(a => a.is_liquid).reduce((s, r) => s + (Number(r.current_value) || 0), 0);
  const liquidityMonths = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : null;

  return { monthlyIncome, monthlyExpenses, monthlySavings, savingsRate, totalAssets, totalLiabs, netWorth, totalEmi, dti, liquidAssets, liquidityMonths };
}

// ── Pulse ring helpers ─────────────────────────────────────────────────────

type PulseStatus = 'good' | 'warn' | 'bad' | 'empty';

function savingsStatus(pct: number | null): PulseStatus {
  if (pct === null) return 'empty';
  if (pct >= 20) return 'good';
  if (pct >= 10) return 'warn';
  return 'bad';
}
function dtiStatus(pct: number | null): PulseStatus {
  if (pct === null) return 'empty';
  if (pct <= 30) return 'good';
  if (pct <= 50) return 'warn';
  return 'bad';
}
function protectionStatus(ratio: number | null): PulseStatus {
  if (ratio === null) return 'empty';
  if (ratio >= 10) return 'good';
  if (ratio >= 5)  return 'warn';
  return 'bad';
}
function liquidityStatus(months: number | null): PulseStatus {
  if (months === null) return 'empty';
  if (months >= 6) return 'good';
  if (months >= 3) return 'warn';
  return 'bad';
}

function fmt(v: number): string {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  return `₹${v.toLocaleString('en-IN')}`;
}

function fmtBench(key: string, v: number): string {
  if (key === 'savings' || key === 'debt') return `${v.toFixed(0)}%`;
  if (key === 'protection') return `${v.toFixed(1)}x`;
  if (key === 'liquidity') return `${v.toFixed(1)} mo`;
  return String(Math.round(v));
}

let _rseq = 0;
function genId() { return `r${++_rseq}`; }

function statusToTone(status: PulseStatus): 'success' | 'warning' | 'danger' | 'muted' {
  if (status === 'good') return 'success';
  if (status === 'warn') return 'warning';
  if (status === 'bad')  return 'danger';
  return 'muted';
}

// ── Section headers ────────────────────────────────────────────────────────

const SECTIONS = [
  { num: '01', label: 'Cash Flow',
    sectionTitle: 'Income & monthly expenses',
    sectionSub:   'Monthly cash in, monthly cash out. Savings rate computes automatically.' },
  { num: '02', label: 'Assets',
    sectionTitle: 'Assets & investments',
    sectionSub:   'Investments, property, savings, gold. Tag liquidity to flag concentration risk.' },
  { num: '03', label: 'Liabilities',
    sectionTitle: 'Loans & liabilities',
    sectionSub:   'Loans and outstanding debts. No judgment — clarity helps planning.' },
  { num: '04', label: 'Protection',
    sectionTitle: 'Insurance & protection',
    sectionSub:   'Life and health coverage — quantify the safety net.' },
  { num: '05', label: 'Goals & Risk',
    sectionTitle: 'Goals & risk profile',
    sectionSub:   'Aspirations and risk appetite — the plan\'s destination.' },
];

// Fallback goal types — used if get_goal_types API not yet available
const GOAL_TYPE_FALLBACK: GoalType[] = [
  { id: 1, code: 'retirement', label: 'Retirement',       icon: '🌿', default_horizon_years: 20 },
  { id: 2, code: 'education',  label: 'Education',        icon: '🎓', default_horizon_years: 10 },
  { id: 3, code: 'house',      label: 'Home / Property',  icon: '🏡', default_horizon_years: 7  },
  { id: 4, code: 'wedding',    label: 'Wedding',          icon: '💍', default_horizon_years: 3  },
  { id: 5, code: 'emergency',  label: 'Emergency Fund',   icon: '🛡️', default_horizon_years: 2  },
  { id: 6, code: 'vehicle',    label: 'Vehicle',          icon: '🚗', default_horizon_years: 3  },
  { id: 7, code: 'travel',     label: 'Travel',           icon: '✈️', default_horizon_years: 2  },
  { id: 8, code: 'custom',     label: 'Other',            icon: '⭐', default_horizon_years: 10 },
];

const HORIZON_PRESETS = [3, 5, 7, 10, 15, 20, 25, 30];

// Bar heights matching contactnest-ux.html reference exactly (5 bars per card)
const RISK_BARS: Record<'conservative' | 'moderate' | 'aggressive', number[]> = {
  conservative: [30, 35, 32, 38, 34],
  moderate:     [40, 65, 50, 72, 58],
  aggressive:   [30, 90, 45, 95, 60],
};
const RISK_BAR_COLORS: Record<'conservative' | 'moderate' | 'aggressive', string> = {
  conservative: 'var(--color-info, #4a7a8c)',
  moderate:     'var(--color-warning)',
  aggressive:   'var(--color-danger)',
};
const RISK_TAGLINES: Record<'conservative' | 'moderate' | 'aggressive', string> = {
  conservative: 'Sleep well at night. Capital protection first.',
  moderate:     'Balanced growth. Some bumps are okay.',
  aggressive:   'Long horizon. Volatility is the price of growth.',
};
const RISK_RETURNS: Record<'conservative' | 'moderate' | 'aggressive', string> = {
  conservative: '7–9%',
  moderate:     '10–13%',
  aggressive:   '14–18%',
};

const EXPENSE_LABELS: Record<keyof Expenses, string> = {
  housing: 'Housing', food: 'Groceries', utilities: 'Utilities',
  transport: 'Transport', education: 'Education / Kids', healthcare: 'Healthcare',
  lifestyle: 'Lifestyle', other: 'Other',
};

// ── Main component ─────────────────────────────────────────────────────────

export function SnapshotTab({ contactId, isClient, contactName }: { contactId: number; isClient: boolean; contactName?: string }) {
  const them = contactName ? contactName : 'the client';
  const router       = useRouter();
  const { showToast } = useToast();
  const queryClient  = useQueryClient();

  const [showWizard,    setShowWizard]    = useState(false);
  const [showCapture,   setShowCapture]   = useState(false);
  const [inheritedOpen, setInheritedOpen] = useState(false);
  const [intakeUrl,     setIntakeUrl]     = useState<string | null>(null);
  const [copied,        setCopied]        = useState(false);

  const { data: meData } = useMe();
  const mfdFirstName = meData?.user?.first_name || meData?.user?.name?.split(' ')[0] || '';
  const contactInitials = contactName
    ? contactName.split(' ').map(p => p[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const [activeSection, setActiveSection] = useState(0);
  const [riskProfile,   setRiskProfile]   = useState('');
  const [notes,         setNotes]         = useState('');

  const [income, setIncome] = useState<Income>({
    salary: '', partner: '', rental_other: '',
  });
  const [expenses, setExpenses] = useState<Expenses>({
    housing: '', food: '', utilities: '', transport: '', education: '', healthcare: '', lifestyle: '', other: '',
  });
  const [assets,      setAssets]      = useState<AssetRow[]>([]);
  const [liabs,       setLiabs]       = useState<LiabRow[]>([]);
  const [protection,  setProtection]  = useState<Protection>({
    life_cover_amount: '', health_cover_amount: '', ci_cover_amount: '',
    life_premium_annual: '', health_premium_annual: '',
    has_term_plan: false, has_health_cover: false, health_cover_type: '',
  });
  const [goals, setGoals] = useState<GoalRow[]>([]);

  // ── Data loading ──────────────────────────────────────────────────────────

  const { data: snapData, isLoading: snapLoading } = useSkillQuery<{ snapshot: Record<string, unknown> | null }>(
    'contact-skill', 'get_snapshot_full', { contact_id: contactId }
  );
  const { data: assetTypesData } = useSkillQuery<{ asset_types: AssetType[] }>(
    'contact-skill', 'get_asset_types', {}
  );
  const { data: liabTypesData } = useSkillQuery<{ liability_types: LiabilityType[] }>(
    'contact-skill', 'get_liability_types', {}
  );
  const { data: goalTypesData } = useSkillQuery<{ goal_types: GoalType[] }>(
    'contact-skill', 'get_goal_types', {}
  );

  const assetTypes = assetTypesData?.data?.asset_types ?? [];
  const liabTypes  = liabTypesData?.data?.liability_types ?? [];
  const goalTypes  = goalTypesData?.data?.goal_types?.length ? goalTypesData.data.goal_types : GOAL_TYPE_FALLBACK;
  const snap         = snapData?.data?.snapshot as Record<string, unknown> | null;

  // Auto-enter wizard when a snapshot already exists
  useEffect(() => {
    if (snap) setShowWizard(true);
  }, [snap]);

  // Populate form from loaded snapshot
  useEffect(() => {
    if (!snap) return;
    setRiskProfile((snap.risk_profile as string) ?? '');
    setNotes((snap.notes as string) ?? '');

    const snapIncome = (snap.income as Array<{ source: string; amount_monthly: number }>) ?? [];
    const inc: Income = { salary: '', partner: '', rental_other: '' };
    for (const row of snapIncome) {
      if (row.source in inc) (inc as Record<string, string>)[row.source] = String(row.amount_monthly);
    }
    setIncome(inc);

    const snapExp = (snap.expenses as Array<{ category: string; amount_monthly: number }>) ?? [];
    const exp: Expenses = { housing: '', food: '', utilities: '', transport: '', education: '', healthcare: '', lifestyle: '', other: '' };
    for (const row of snapExp) {
      if (row.category in exp) (exp as Record<string, string>)[row.category] = String(row.amount_monthly);
    }
    setExpenses(exp);

    const snapAssets = (snap.assets as Array<Record<string, unknown>>) ?? [];
    setAssets(snapAssets.map(a => ({
      _id:           genId(),
      asset_type_id: String(a.asset_type_id ?? ''),
      description:   String(a.description ?? ''),
      current_value: String(a.current_value ?? ''),
      is_liquid:     Boolean(a.is_liquid),
      years_held:    a.years_held != null ? String(a.years_held) : '',
    })));

    const snapLiabs = (snap.liabilities as Array<Record<string, unknown>>) ?? [];
    setLiabs(snapLiabs.map(l => ({
      _id:               genId(),
      liability_type_id: String(l.liability_type_id ?? ''),
      description:       String(l.description ?? ''),
      outstanding_amount:String(l.outstanding_amount ?? ''),
      monthly_emi:       String(l.monthly_emi ?? ''),
      interest_rate_pct: String(l.interest_rate_pct ?? ''),
    })));

    const snapProt = snap.protection as Record<string, unknown> | null;
    if (snapProt) {
      setProtection({
        life_cover_amount:   String(snapProt.life_cover_amount   ?? ''),
        health_cover_amount: String(snapProt.health_cover_amount ?? ''),
        ci_cover_amount:     String(snapProt.ci_cover_amount     ?? ''),
        life_premium_annual: String(snapProt.life_premium_annual ?? ''),
        health_premium_annual: String(snapProt.health_premium_annual ?? ''),
        has_term_plan:       Boolean(snapProt.has_term_plan),
        has_health_cover:    Boolean(snapProt.has_health_cover),
        health_cover_type:   (snapProt.health_cover_type as Protection['health_cover_type']) ?? '',
      });
    }

    const snapGoals = (snap.goals as Array<Record<string, unknown>>) ?? [];
    setGoals(snapGoals.map(g => ({
      goal_type:      String(g.goal_type ?? 'custom'),
      name:           String(g.name ?? ''),
      target_amount:  String(g.target_amount ?? ''),
      timeline_years: String(g.timeline_years ?? ''),
    })));
  }, [snap]);

  const handleAssetsChange = useCallback((asset: AssetRow, field: keyof AssetRow, value: string | boolean) => {
    setAssets(prev => prev.map(a => {
      if (a._id !== asset._id) return a;
      const updated = { ...a, [field]: value };
      // Auto-set liquidity when asset type changes
      if (field === 'asset_type_id') {
        const assetType = assetTypes.find(t => String(t.id) === String(value));
        if (assetType) updated.is_liquid = assetType.is_liquid_default;
      }
      return updated;
    }));
  }, [assetTypes]);

  // ── Build save payload ────────────────────────────────────────────────────

  const buildPayload = useCallback((status: 'draft' | 'active') => ({
    contact_id: contactId,
    status,
    risk_profile: riskProfile || undefined,
    notes: notes || undefined,
    income: Object.entries(income)
      .filter(([, v]) => Number(v) > 0)
      .map(([source, v]) => ({ source, amount_monthly: Number(v) })),
    expenses: Object.entries(expenses)
      .filter(([, v]) => Number(v) > 0)
      .map(([category, v]) => ({ category, amount_monthly: Number(v) })),
    assets: assets.filter(a => Number(a.current_value) > 0).map((a, i) => ({
      asset_type_id: Number(a.asset_type_id) || undefined,
      description:   a.description || undefined,
      current_value: Number(a.current_value),
      is_liquid:     a.is_liquid,
      years_held:    Number(a.years_held) > 0 ? Number(a.years_held) : undefined,
      sort_order:    i + 1,
    })),
    liabilities: liabs.filter(l => l.liability_type_id && Number(l.outstanding_amount) > 0).map((l, i) => ({
      liability_type_id: Number(l.liability_type_id),
      description:       l.description || undefined,
      outstanding_amount: Number(l.outstanding_amount),
      monthly_emi:       Number(l.monthly_emi) || 0,
      interest_rate_pct: Number(l.interest_rate_pct) || undefined,
      sort_order:        i + 1,
    })),
    protection: {
      life_cover_amount:    Number(protection.life_cover_amount)   || undefined,
      health_cover_amount:  Number(protection.health_cover_amount) || undefined,
      ci_cover_amount:      Number(protection.ci_cover_amount)     || undefined,
      life_premium_annual:  Number(protection.life_premium_annual) || undefined,
      health_premium_annual:Number(protection.health_premium_annual) || undefined,
      has_term_plan:        protection.has_term_plan,
      has_health_cover:     protection.has_health_cover,
      health_cover_type:    protection.health_cover_type || undefined,
    },
    goals: goals.filter(g => g.name && Number(g.target_amount) > 0).map((g, i) => ({
      goal_type:      g.goal_type || 'custom',
      name:           g.name,
      target_amount:  Number(g.target_amount),
      timeline_years: Number(g.timeline_years) || 10,
      sort_order:     i + 1,
    })),
  }), [contactId, riskProfile, notes, income, expenses, assets, liabs, protection, goals]);

  // ── Mutations ─────────────────────────────────────────────────────────────

  const { mutate: saveMutation, isPending: isSaving } = useSkillMutation(
    'contact-skill', 'save_snapshot',
    {
      onSuccess: (_, vars) => {
        const status = (vars as Record<string, unknown>).status as string;
        queryClient.invalidateQueries({ queryKey: ['skill', 'contact-skill', 'get_snapshot_full'] });
        queryClient.invalidateQueries({ queryKey: ['skill', 'contact-skill', 'get_contact'] });
        if (status === 'active') {
          showToast({ message: 'Snapshot submitted', type: 'success' });
        } else {
          showToast({ message: 'Draft saved', type: 'success' });
        }
      },
      onError: (e) => showToast({ message: e.message || 'Save failed', type: 'error' }),
    }
  );

  const handleDraft  = () => saveMutation(buildPayload('draft') as Record<string, unknown>);
  const handleSubmit = () => saveMutation(buildPayload('active') as Record<string, unknown>);

  const { mutate: genToken, isPending: isGenning } = useSkillMutation<{ intake_url: string }>(
    'contact-skill', 'generate_intake_token',
    {
      onSuccess: (res) => {
        const url = res.data?.intake_url;
        if (url) { setIntakeUrl(url); setCopied(false); }
      },
      onError: (e) => showToast({ message: e.message || 'Failed to generate link', type: 'error' }),
    }
  );

  const handleCopy = (url: string) => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  };

  // ── Live metrics ──────────────────────────────────────────────────────────

  const metrics = computeMetrics(income, expenses, assets, liabs);
  const protRatio = protection.life_cover_amount && metrics.monthlyIncome > 0
    ? Number(protection.life_cover_amount) / (metrics.monthlyIncome * 12)
    : null;

  // ── Section completeness for stepper ──────────────────────────────────────

  const sectionDone = [
    metrics.monthlyIncome > 0 || metrics.monthlyExpenses > 0,
    assets.some(a => Number(a.current_value) > 0),
    liabs.some(l => l.liability_type_id && Number(l.outstanding_amount) > 0),
    !!(protection.life_cover_amount || protection.health_cover_amount),
    goals.some(g => g.name && Number(g.target_amount) > 0),
  ];

  if (snapLoading) return <VdfLoader message="Loading snapshot…" />;

  // ── Empty state — no snapshot yet, user hasn't chosen an action ───────────

  if (!snap && !showWizard && !showCapture) {
    return (
      <div className={s.emptyState}>
        <div className={s.emptyIcon}>
          <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="1.5" width="48" height="48">
            <rect x="8" y="6" width="32" height="36" rx="4" />
            <path d="M16 16h16M16 22h16M16 28h10" />
          </svg>
        </div>
        <h3 className={s.emptyTitle}>No financial snapshot yet</h3>
        <p className={s.emptyDesc}>
          Capture this {isClient ? 'client' : 'prospect'}'s complete financial picture — cash flow, assets, liabilities, protection, and goals.
        </p>

        <div className={s.emptyActions}>
          <button className={s.emptyPrimaryBtn} onClick={() => setShowCapture(true)}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
              <path d="M10 4v12M4 10h12" />
            </svg>
            Fill snapshot myself
          </button>

          <div className={s.emptyDivider}>or</div>

          <button
            className={s.emptySendBtn}
            disabled={isGenning}
            onClick={() => genToken({ contact_id: contactId } as Record<string, unknown>)}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
              <path d="M17.5 2.5L9.5 10.5M17.5 2.5L12.5 17.5L9.5 10.5M17.5 2.5L2.5 7.5L9.5 10.5" />
            </svg>
            {isGenning ? 'Generating…' : 'Send intake link to client'}
          </button>
        </div>

        {intakeUrl && (
          <div className={s.intakeLinkBox}>
            <span className={s.intakeLinkUrl}>{intakeUrl}</span>
            <button className={s.intakeCopyBtn} onClick={() => handleCopy(intakeUrl)}>
              {copied ? '✓ Copied' : 'Copy'}
            </button>
            <button className={s.intakeDismiss} onClick={() => setIntakeUrl(null)}>×</button>
          </div>
        )}
      </div>
    );
  }

  // ── Capture confirmation screen ───────────────────────────────────────────

  if (showCapture && !showWizard) {
    return (
      <div className={s.captureWrap}>
        <div className={s.captureCard}>

          {/* Gradient top accent bar */}
          <div className={s.captureHeader}>
            <div className={s.captureEyebrow}>Snapshot Capture · MFD Mode</div>
            <h2 className={s.captureTitle}>
              Ready when<br />
              <em>you are{mfdFirstName ? `, ${mfdFirstName}.` : '.'}</em>
            </h2>
            <p className={s.captureSub}>
              You'll capture {contactName || 'the client'}'s cash flow, assets, loans, protection, and goals.
              About 10 minutes if you know the numbers.
            </p>
          </div>

          {/* Contact chip */}
          <div className={s.targetChip}>
            <div className={s.targetAvatar}>{contactInitials}</div>
            <div className={s.targetInfo}>
              <div className={s.targetName}>{contactName || 'Client'}</div>
              <div className={s.targetMeta}>
                <span>{isClient ? 'Client' : 'Prospect'}</span>
              </div>
            </div>
            <span className={`${s.captureBadge} ${isClient ? s.captureBadgeClient : s.captureBadgeProspect}`}>
              <span className={s.captureBadgeDot} />
              {isClient ? 'Client' : 'Prospect'}
            </span>
          </div>

          {/* Inherited fields accordion */}
          <div className={`${s.inheritedBlock} ${inheritedOpen ? s.inheritedOpen : ''}`}>
            <button
              className={s.inheritedHead}
              onClick={() => setInheritedOpen(o => !o)}
              type="button"
            >
              <div className={s.inheritedHeadLeft}>
                <div className={s.inheritedCheckmark}>✓</div>
                <div>
                  <div className={s.inheritedHeadTitle}>Inheriting fields from contact</div>
                  <div className={s.inheritedHeadSub}>Click to review basic details</div>
                </div>
              </div>
              <svg
                className={s.inheritedChevron}
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.5"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {inheritedOpen && (
              <div className={s.inheritedBody}>
                <div className={s.inheritedGrid}>
                  <div className={s.inheritedField}>
                    <div className={s.inheritedFieldLabel}>Full Name</div>
                    <div className={s.inheritedFieldValue}>{contactName || '—'}</div>
                  </div>
                  <div className={s.inheritedField}>
                    <div className={s.inheritedFieldLabel}>Status</div>
                    <div className={s.inheritedFieldValue}>{isClient ? 'Client' : 'Prospect'}</div>
                  </div>
                  <div className={s.inheritedField}>
                    <div className={s.inheritedFieldLabel}>Phone</div>
                    <div className={s.inheritedFieldValue}>From contact record</div>
                  </div>
                  <div className={s.inheritedField}>
                    <div className={s.inheritedFieldLabel}>City</div>
                    <div className={s.inheritedFieldValue}>From contact record</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* VaNi copilot preview */}
          <div className={s.vaniCard}>
            <div className={s.vaniAvatar}>V</div>
            <div className={s.vaniContent}>
              <div className={s.vaniLabel}>VaNi · Copilot Mode</div>
              <div className={s.vaniText}>
                Running pro mode. I'll flag benchmarks, gaps, and{' '}
                <strong>talking points</strong> as you type. Keyboard shortcuts enabled.
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className={s.captureFooter}>
            <button
              className={s.captureBackBtn}
              onClick={() => setShowCapture(false)}
              type="button"
            >
              ← Back to profile
            </button>
            <button
              className={s.captureStartBtn}
              onClick={() => { setShowCapture(false); setShowWizard(true); }}
              type="button"
            >
              Start capture
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </div>

        </div>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const sec = SECTIONS[activeSection];

  const benchData: Array<{ key: string; label: string; value: number | null; peerMedian: number; max: number; note: string }> = [
    { key: 'savings',    label: 'Savings Rate',   value: metrics.savingsRate,     peerMedian: 18, max: 45, note: 'Peer median 18%' },
    { key: 'debt',       label: 'Debt-to-Income', value: metrics.dti,             peerMedian: 35, max: 80, note: 'Under 30% healthy' },
    { key: 'protection', label: 'Protection',     value: protRatio,               peerMedian: 6,  max: 15, note: 'Target 10x income' },
    { key: 'liquidity',  label: 'Liquidity',      value: metrics.liquidityMonths, peerMedian: 4,  max: 12, note: '6+ months ideal' },
    { key: 'goals',      label: 'Goals',          value: goals.filter(g => g.name).length || null, peerMedian: 2, max: 6, note: '2+ active goals' },
  ];

  // ── VaNi Cash Flow pre-computed values (avoids IIFE in JSX) ──────────────
  const vaniSr         = metrics.savingsRate ?? 0;
  const vaniBracket    = vaniSr >= 50 ? 'p95' : vaniSr >= 35 ? 'p80' : vaniSr >= 25 ? 'p65' : vaniSr >= 18 ? 'p50' : vaniSr >= 10 ? 'p35' : 'p15';
  const vaniSrClass    = vaniSr >= 20 ? s.vaniOk : vaniSr >= 10 ? s.vaniWarn : s.vaniBad;
  const vaniHousingPct = metrics.monthlyIncome > 0 ? (Number(expenses.housing) / metrics.monthlyIncome) * 100 : 0;
  const vaniAnnual     = metrics.monthlySavings * 12;
  const vaniSrLabel    = vaniSr >= 30 ? 'Strong cash flow.' : vaniSr >= 15 ? 'Moderate cash flow.' : vaniSr >= 0 ? 'Tight margins.' : null;

  // ── VaNi Assets pre-computed values ──────────────────────────────────────
  const vaniLiqPct       = metrics.totalAssets > 0 ? (metrics.liquidAssets / metrics.totalAssets) * 100 : 0;
  const vaniLargestAsset = assets.length > 0
    ? assets.reduce((max, a) => Number(a.current_value) > Number(max.current_value) ? a : max, assets[0])
    : null;
  const vaniLargestPct   = vaniLargestAsset && metrics.totalAssets > 0
    ? (Number(vaniLargestAsset.current_value) / metrics.totalAssets) * 100
    : 0;
  const vaniLiqMonths    = metrics.monthlyExpenses > 0 ? metrics.liquidAssets / metrics.monthlyExpenses : null;

  // ── VaNi Liabilities pre-computed values ─────────────────────────────────
  const vaniDtiClass      = metrics.dti === null ? s.vaniHi : metrics.dti <= 30 ? s.vaniOk : metrics.dti <= 50 ? s.vaniWarn : s.vaniBad;
  const vaniLargestLiab   = liabs.length > 0
    ? liabs.reduce((max, l) => Number(l.outstanding_amount) > Number(max.outstanding_amount) ? l : max, liabs[0])
    : null;
  const vaniLargestLiabPct = vaniLargestLiab && metrics.totalLiabs > 0
    ? (Number(vaniLargestLiab.outstanding_amount) / metrics.totalLiabs) * 100
    : 0;

  // ── VaNi Protection pre-computed values ──────────────────────────────────
  const vaniProtClass   = protRatio === null ? s.vaniHi : protRatio >= 10 ? s.vaniOk : protRatio >= 5 ? s.vaniWarn : s.vaniBad;
  const vaniProtBracket = protRatio === null ? null : protRatio >= 15 ? 'p95' : protRatio >= 10 ? 'p80' : protRatio >= 7 ? 'p65' : protRatio >= 5 ? 'p50' : protRatio >= 3 ? 'p35' : 'p15';
  const vaniLifeGap     = metrics.monthlyIncome > 0 && Number(protection.life_cover_amount) > 0
    ? Math.max(0, metrics.monthlyIncome * 12 * 10 - Number(protection.life_cover_amount))
    : null;
  const vaniPremBurden  = metrics.monthlyIncome > 0
    ? ((Number(protection.life_premium_annual) + Number(protection.health_premium_annual)) / (metrics.monthlyIncome * 12)) * 100
    : null;

  // ── VaNi Goals pre-computed values ───────────────────────────────────────
  const vaniGoalsFilled   = goals.filter(g => g.name && Number(g.target_amount) > 0);
  const vaniTotalCorpus   = vaniGoalsFilled.reduce((s, g) => s + Number(g.target_amount), 0);
  const vaniTotalFV       = vaniGoalsFilled.reduce((s, g) => {
    const yrs = Number(g.timeline_years) || 10;
    return s + Number(g.target_amount) * Math.pow(1.06, yrs);
  }, 0);
  const vaniTotalSIP      = vaniGoalsFilled.reduce((s, g) => {
    const months = (Number(g.timeline_years) || 10) * 12;
    const r      = 0.12 / 12;
    const fv     = Number(g.target_amount) * Math.pow(1.06, Number(g.timeline_years) || 10);
    return s + fv * r / (Math.pow(1 + r, months) - 1);
  }, 0);

  return (
    <div className={s.formLayout}>

      {/* ── Pinned sticky header ────────────────────────────────────────────── */}
      <header className={s.pinnedHeader}>

        {/* Client chip */}
        <div className={s.headerChip}>
          <div className={s.headerAvatar}>{contactInitials}</div>
          <div className={s.headerChipMeta}>
            <span className={s.headerChipName}>{contactName || 'Client'}</span>
            <span className={s.headerChipSub}>{isClient ? 'Client' : 'Prospect'}</span>
          </div>
        </div>

        {/* Horizontal stepper */}
        <nav className={s.stepper}>
          {SECTIONS.map((section, i) => {
            const isPast   = i < activeSection;
            const isActive = i === activeSection;
            return (
              <Fragment key={i}>
                {i > 0 && (
                  <div className={`${s.stepConnector} ${isPast ? s.stepConnectorDone : ''}`} />
                )}
                <div
                  className={`${s.stepItem} ${isPast ? s.stepDone : ''} ${isActive ? s.stepActive : ''}`}
                  onClick={() => setActiveSection(i)}
                >
                  <div className={s.stepBullet}>
                    {isPast ? (
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    ) : (
                      <span>{i + 1}</span>
                    )}
                  </div>
                  <span className={s.stepLabel}>{section.label}</span>
                </div>
              </Fragment>
            );
          })}
        </nav>

        {/* Header right: save indicator + exit */}
        <div className={s.headerActions}>
          {isSaving && (
            <div className={s.saveIndicator}>
              <span className={s.saveDot} />
              Saving…
            </div>
          )}
          <button className={s.exitSaveBtn} onClick={handleDraft} disabled={isSaving}>
            Exit &amp; Save
          </button>
        </div>

      </header>

      {/* ── Form body: work area + pulse sidebar ────────────────────────────── */}
      <div className={s.formBody}>

        {/* Left: form work area */}
        <div className={s.formWork}>

          {/* Section head — compact reference style */}
          <div className={s.sectionHead}>
            <div className={s.sectionNum}>Section {sec.num} / 05 · {sec.label}</div>
            <h2 className={s.sectionTitle}>{sec.sectionTitle}</h2>
            <p className={s.sectionSub}>{sec.sectionSub}</p>
          </div>

        {/* ── 01 Cash Flow ─────────────────────────────────────────── */}
        {activeSection === 0 && (
          <div className={s.sectionBody}>

            {/* Monthly Income */}
            <div className={s.subBlock}>
              <div className={s.subHead}>Monthly Income</div>
              <div className={s.inputGrid3}>
                {([
                  { key: 'salary'       as const, label: 'Salary (take-home)', opt: false },
                  { key: 'partner'      as const, label: 'Partner income',      opt: true  },
                  { key: 'rental_other' as const, label: 'Rental / Other',      opt: true  },
                ]).map(({ key, label, opt }) => (
                  <div key={key} className={s.curField}>
                    <label className={s.curFieldLabel}>
                      {label}{opt && <span className={s.optionalTag}> opt</span>}
                    </label>
                    <div className={s.curInputWrap}>
                      <span className={s.curSym}>₹</span>
                      <input
                        className={s.curVal}
                        type="number"
                        value={income[key]}
                        onChange={e => setIncome(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder="0"
                      />
                      <span className={s.curSuffix}>/mo</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Monthly Expenses — 4-column grid, 8 fields */}
            <div className={s.subBlock}>
              <div className={s.subHead}>Monthly Expenses · Exclude EMIs</div>
              <div className={s.expenseGrid4}>
                {(['housing', 'food', 'utilities', 'transport', 'education', 'healthcare', 'lifestyle', 'other'] as const).map(key => (
                  <div key={key} className={s.curField}>
                    <label className={s.curFieldLabel}>{EXPENSE_LABELS[key]}</label>
                    <div className={s.curInputWrap}>
                      <span className={s.curSym}>₹</span>
                      <input
                        className={s.curVal}
                        type="number"
                        value={expenses[key]}
                        onChange={e => setExpenses(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder="0"
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* VaNi copilot — activates live as user types */}
            {(metrics.monthlyIncome > 0 || metrics.monthlyExpenses > 0) && (
              <div className={s.vaniCopilot}>
                <div className={s.vaniCopilotMarker}>V ▸</div>
                <div className={s.vaniCopilotText}>

                  {/* Full analysis: both income and expenses present */}
                  {metrics.monthlyIncome > 0 && metrics.monthlyExpenses > 0 && (
                    <>
                      <span className={s.vaniHi}>{fmt(metrics.monthlyIncome)}/mo income</span>
                      <span className={s.vaniSep}> · </span>
                      <span className={s.vaniHi}>{fmt(metrics.monthlyExpenses)}/mo expenses</span>
                      <span className={s.vaniSep}> · </span>
                      <span className={vaniSrClass}>Savings {vaniSr.toFixed(0)}% ▸ {vaniBracket} bracket</span>
                      <br />
                      {metrics.monthlySavings >= 0 ? (
                        <>
                          {vaniSrLabel}{vaniSrLabel ? ' ' : ''}
                          Savings capacity ≈ <span className={s.vaniHi}>{fmt(vaniAnnual)}/yr</span>.
                          {vaniHousingPct > 30 && (
                            <> Watch for lifestyle creep — housing at <span className={s.vaniWarn}>{vaniHousingPct.toFixed(0)}%</span> of income, above 30% threshold.</>
                          )}
                          {vaniHousingPct > 25 && vaniHousingPct <= 30 && (
                            <> Watch for lifestyle creep — housing share at {vaniHousingPct.toFixed(0)}% is near upper band.</>
                          )}
                        </>
                      ) : (
                        <><span className={s.vaniBad}>Expenses exceed income by {fmt(Math.abs(metrics.monthlySavings))}/mo.</span> Review discretionary spending.</>
                      )}
                    </>
                  )}

                  {/* Income only */}
                  {metrics.monthlyIncome > 0 && metrics.monthlyExpenses === 0 && (
                    <>Income locked at <span className={s.vaniHi}>{fmt(metrics.monthlyIncome)}/mo</span>. Add expenses to compute savings rate.</>
                  )}

                  {/* Expenses only */}
                  {metrics.monthlyIncome === 0 && metrics.monthlyExpenses > 0 && (
                    <>Expenses at <span className={s.vaniHi}>{fmt(metrics.monthlyExpenses)}/mo</span>. Add income to activate full analysis.</>
                  )}

                </div>
              </div>
            )}

          </div>
        )}

        {/* ── 02 Assets ────────────────────────────────────────────── */}
        {activeSection === 1 && (
          <div className={s.sectionBody}>

            {/* Item list or empty hint */}
            {assets.length === 0 ? (
              <div className={s.itemEmptyState}>
                Equity funds, property, savings, gold — add everything of value
              </div>
            ) : (
              <div className={s.itemList}>
                {assets.map((asset, i) => (
                  <div key={asset._id} className={s.itemCard}>
                    <div className={s.itemHead}>
                      <span className={s.itemNum}>ASSET_{String(i + 1).padStart(2, '0')}</span>
                      <button
                        type="button"
                        className={s.itemRemove}
                        onClick={() => setAssets(prev => prev.filter(a => a._id !== asset._id))}
                      >×</button>
                    </div>
                    {/* Row 1: Asset type + Liquidity */}
                    <div className={s.assetRow1}>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>Asset Type</label>
                        <select
                          className={s.plainSelect}
                          value={asset.asset_type_id}
                          onChange={e => handleAssetsChange(asset, 'asset_type_id', e.target.value)}
                        >
                          <option value="">Select type</option>
                          {assetTypes.map(t => (
                            <option key={t.id} value={String(t.id)}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>Liquidity</label>
                        <div className={s.liqToggle}>
                          <button type="button"
                            className={`${s.liqBtn} ${asset.is_liquid ? s.liqBtnActive : ''}`}
                            onClick={() => handleAssetsChange(asset, 'is_liquid', true)}
                          >💧 Liquid</button>
                          <button type="button"
                            className={`${s.liqBtn} ${!asset.is_liquid ? s.liqBtnIlliq : ''}`}
                            onClick={() => handleAssetsChange(asset, 'is_liquid', false)}
                          >🔒 Illiq</button>
                        </div>
                      </div>
                    </div>
                    {/* Row 2: Description + Value + Years Held */}
                    <div className={s.assetRow2}>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>Description</label>
                        <input
                          className={s.plainInput}
                          type="text"
                          placeholder="e.g. SBI Equity Fund, 2BHK Flat, FD"
                          value={asset.description}
                          onChange={e => handleAssetsChange(asset, 'description', e.target.value)}
                        />
                      </div>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>Current Value</label>
                        <div className={s.curInputWrap}>
                          <span className={s.curSym}>₹</span>
                          <input
                            className={s.curVal}
                            type="number"
                            placeholder="0"
                            value={asset.current_value}
                            onChange={e => handleAssetsChange(asset, 'current_value', e.target.value)}
                          />
                        </div>
                      </div>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>Yrs Held</label>
                        <input
                          className={s.plainInput}
                          type="number"
                          placeholder="—"
                          value={asset.years_held}
                          onChange={e => handleAssetsChange(asset, 'years_held', e.target.value)}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add asset button */}
            <button
              type="button"
              className={s.addItemBtn}
              onClick={() => setAssets(prev => [...prev, { _id: genId(), asset_type_id: '', description: '', current_value: '', is_liquid: true, years_held: '' }])}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M10 4v12M4 10h12" />
              </svg>
              Add asset
            </button>

            {/* VaNi copilot */}
            {metrics.totalAssets > 0 && (
              <div className={s.vaniCopilot}>
                <div className={s.vaniCopilotMarker}>V ▸</div>
                <div className={s.vaniCopilotText}>
                  <span className={s.vaniHi}>{fmt(metrics.totalAssets)} total</span>
                  <span className={s.vaniSep}> · </span>
                  <span className={vaniLiqPct >= 30 ? s.vaniOk : vaniLiqPct >= 15 ? s.vaniWarn : s.vaniBad}>
                    Liquid {vaniLiqPct.toFixed(0)}%
                  </span>
                  <span className={s.vaniSep}> · </span>
                  <span className={s.vaniHi}>Illiquid {(100 - vaniLiqPct).toFixed(0)}%</span>
                  {vaniLargestAsset && vaniLargestPct > 0 && (
                    <>
                      <br />
                      Concentration:{' '}
                      <span className={s.vaniHi}>{vaniLargestAsset.description || 'Top asset'}</span>
                      {' = '}
                      <span className={vaniLargestPct > 50 ? s.vaniBad : vaniLargestPct > 35 ? s.vaniWarn : s.vaniOk}>
                        {vaniLargestPct.toFixed(0)}% of total
                      </span>
                      {vaniLargestPct > 50 && (
                        <><span className={s.vaniSep}> · </span><span className={s.vaniWarn}>High concentration risk.</span></>
                      )}
                    </>
                  )}
                  {vaniLiqMonths !== null && (
                    <>
                      <br />
                      Emergency liquidity:{' '}
                      <span className={vaniLiqMonths >= 6 ? s.vaniOk : vaniLiqMonths >= 3 ? s.vaniWarn : s.vaniBad}>
                        {vaniLiqMonths.toFixed(1)} months runway
                      </span>
                      {vaniLiqMonths < 3 && (
                        <><span className={s.vaniSep}> · </span><span className={s.vaniBad}>Below 3-month threshold.</span></>
                      )}
                      {vaniLiqMonths >= 6 && (
                        <><span className={s.vaniSep}> · </span><span className={s.vaniOk}>Adequate buffer.</span></>
                      )}
                    </>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── 03 Liabilities ───────────────────────────────────────── */}
        {activeSection === 2 && (
          <div className={s.sectionBody}>

            {liabs.length === 0 ? (
              <div className={s.itemEmptyState}>
                Home loan, car loan, personal loan, credit card — list every outstanding debt
              </div>
            ) : (
              <div className={s.itemList}>
                {liabs.map((liab, i) => (
                  <div key={liab._id} className={s.itemCard}>
                    <div className={s.itemHead}>
                      <span className={s.itemNum}>LOAN_{String(i + 1).padStart(2, '0')}</span>
                      <button
                        type="button"
                        className={s.itemRemove}
                        onClick={() => setLiabs(prev => prev.filter(l => l._id !== liab._id))}
                      >×</button>
                    </div>
                    {/* Row 1: Loan Type (full width) */}
                    <div className={s.loanRow1}>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>Loan Type</label>
                        <select
                          className={s.plainSelect}
                          value={liab.liability_type_id}
                          onChange={e => setLiabs(prev => prev.map(l => l._id === liab._id ? { ...l, liability_type_id: e.target.value } : l))}
                        >
                          <option value="">Select type</option>
                          {liabTypes.map(t => (
                            <option key={t.id} value={String(t.id)}>{t.label}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    {/* Row 2: Description + Outstanding + EMI + Rate */}
                    <div className={s.loanRow2}>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>Description</label>
                        <input
                          className={s.plainInput}
                          type="text"
                          placeholder="e.g. SBI Home Loan"
                          value={liab.description}
                          onChange={e => setLiabs(prev => prev.map(l => l._id === liab._id ? { ...l, description: e.target.value } : l))}
                        />
                      </div>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>Outstanding</label>
                        <div className={s.curInputWrap}>
                          <span className={s.curSym}>₹</span>
                          <input
                            className={s.curVal}
                            type="number"
                            placeholder="0"
                            value={liab.outstanding_amount}
                            onChange={e => setLiabs(prev => prev.map(l => l._id === liab._id ? { ...l, outstanding_amount: e.target.value } : l))}
                          />
                        </div>
                      </div>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>EMI /mo</label>
                        <div className={s.curInputWrap}>
                          <span className={s.curSym}>₹</span>
                          <input
                            className={s.curVal}
                            type="number"
                            placeholder="0"
                            value={liab.monthly_emi}
                            onChange={e => setLiabs(prev => prev.map(l => l._id === liab._id ? { ...l, monthly_emi: e.target.value } : l))}
                          />
                        </div>
                      </div>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>Rate %</label>
                        <input
                          className={s.plainInput}
                          type="number"
                          placeholder="8.5"
                          value={liab.interest_rate_pct}
                          onChange={e => setLiabs(prev => prev.map(l => l._id === liab._id ? { ...l, interest_rate_pct: e.target.value } : l))}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add loan button */}
            <button
              type="button"
              className={s.addItemBtn}
              onClick={() => setLiabs(prev => [...prev, { _id: genId(), liability_type_id: '', description: '', outstanding_amount: '', monthly_emi: '', interest_rate_pct: '' }])}
            >
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M10 4v12M4 10h12" />
              </svg>
              Add loan
            </button>

            {/* VaNi copilot */}
            {metrics.totalLiabs > 0 && (
              <div className={s.vaniCopilot}>
                <div className={s.vaniCopilotMarker}>V ▸</div>
                <div className={s.vaniCopilotText}>
                  <span className={s.vaniHi}>{fmt(metrics.totalLiabs)} total debt</span>
                  {metrics.totalEmi > 0 && (
                    <><span className={s.vaniSep}> · </span><span className={s.vaniHi}>{fmt(metrics.totalEmi)}/mo EMI</span></>
                  )}
                  {metrics.dti !== null && (
                    <><span className={s.vaniSep}> · </span>
                    DTI{' '}
                    <span className={vaniDtiClass}>{metrics.dti.toFixed(0)}%
                      {metrics.dti <= 30 ? ' — healthy' : metrics.dti <= 50 ? ' — elevated' : ' — high'}
                    </span></>
                  )}
                  {vaniLargestLiab && vaniLargestLiabPct > 0 && (
                    <>
                      <br />
                      Largest:{' '}
                      <span className={s.vaniHi}>{vaniLargestLiab.description || 'Top loan'}</span>
                      {' = '}
                      <span className={vaniLargestLiabPct > 60 ? s.vaniWarn : s.vaniHi}>
                        {vaniLargestLiabPct.toFixed(0)}% of total debt
                      </span>
                    </>
                  )}
                  {metrics.dti !== null && metrics.dti > 50 && (
                    <><br /><span className={s.vaniBad}>DTI above 50% — debt repayment is constraining savings capacity.</span></>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── 04 Protection ────────────────────────────────────────── */}
        {activeSection === 3 && (
          <div className={s.sectionBody}>

            {/* Life Insurance sub-block */}
            <div className={s.subBlock}>
              <div className={s.subHead}>Life Insurance</div>
              <div className={s.protField}>
                <label className={s.curFieldLabel}>Has active term / life policy?</label>
                <div className={s.optCards2}>
                  <button
                    type="button"
                    className={`${s.optCard} ${protection.has_term_plan ? s.optCardSelected : ''}`}
                    onClick={() => setProtection(p => ({ ...p, has_term_plan: true }))}
                  >
                    <svg className={s.optCardIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2 4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-5z"/><path d="m9 12 2 2 4-4"/>
                    </svg>
                    <div>
                      <div className={s.optCardLabel}>Yes</div>
                      <div className={s.optCardSub}>Has coverage</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`${s.optCard} ${!protection.has_term_plan ? s.optCardSelected : ''}`}
                    onClick={() => setProtection(p => ({ ...p, has_term_plan: false }))}
                  >
                    <svg className={s.optCardIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>
                    </svg>
                    <div>
                      <div className={s.optCardLabel}>No / unsure</div>
                      <div className={s.optCardSub}>Gap flagged</div>
                    </div>
                  </button>
                </div>
              </div>
              <div className={s.protFieldRow3}>
                <div className={s.curField}>
                  <label className={s.curFieldLabel}>Sum Assured</label>
                  <div className={s.curInputWrap}>
                    <span className={s.curSym}>₹</span>
                    <input className={s.curVal} type="number" placeholder="0"
                      value={protection.life_cover_amount}
                      onChange={e => setProtection(p => ({ ...p, life_cover_amount: e.target.value }))} />
                  </div>
                </div>
                <div className={s.curField}>
                  <label className={s.curFieldLabel}>Annual Premium</label>
                  <div className={s.curInputWrap}>
                    <span className={s.curSym}>₹</span>
                    <input className={s.curVal} type="number" placeholder="0"
                      value={protection.life_premium_annual}
                      onChange={e => setProtection(p => ({ ...p, life_premium_annual: e.target.value }))} />
                    <span className={s.curSuffix}>/yr</span>
                  </div>
                </div>
                {protRatio !== null && (
                  <div className={s.curField}>
                    <label className={s.curFieldLabel}>Cover Ratio</label>
                    <div className={s.protRatioBadge}>
                      <span className={protRatio >= 10 ? s.protRatioOk : protRatio >= 5 ? s.protRatioWarn : s.protRatioBad}>
                        {protRatio.toFixed(1)}×
                      </span>
                      <span className={s.protRatioSub}>of annual income</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Health Insurance sub-block */}
            <div className={s.subBlock}>
              <div className={s.subHead}>Health Insurance</div>
              <div className={s.protField}>
                <label className={s.curFieldLabel}>Has health cover?</label>
                <div className={s.optCards2}>
                  <button
                    type="button"
                    className={`${s.optCard} ${protection.has_health_cover ? s.optCardSelected : ''}`}
                    onClick={() => setProtection(p => ({ ...p, has_health_cover: true }))}
                  >
                    <svg className={s.optCardIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M12 2 4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-5z"/><path d="m9 12 2 2 4-4"/>
                    </svg>
                    <div>
                      <div className={s.optCardLabel}>Yes</div>
                      <div className={s.optCardSub}>Has coverage</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className={`${s.optCard} ${!protection.has_health_cover ? s.optCardSelected : ''}`}
                    onClick={() => setProtection(p => ({ ...p, has_health_cover: false }))}
                  >
                    <svg className={s.optCardIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><path d="m15 9-6 6M9 9l6 6"/>
                    </svg>
                    <div>
                      <div className={s.optCardLabel}>No / unsure</div>
                      <div className={s.optCardSub}>Gap flagged</div>
                    </div>
                  </button>
                </div>
              </div>

              {/* Coverage type — 4 opt-cards */}
              <div className={s.protField}>
                <label className={s.curFieldLabel}>Coverage type</label>
                <div className={s.optCards4}>
                  {([
                    { key: 'individual'    as const, label: 'Individual',      sub: 'Self only'   },
                    { key: 'family_floater'as const, label: 'Family Floater',  sub: 'Household'   },
                    { key: 'employer'      as const, label: 'Employer',        sub: 'Corp group'  },
                    { key: 'none'          as const, label: 'None',            sub: 'Gap'         },
                  ]).map(({ key, label, sub }) => (
                    <button
                      key={key}
                      type="button"
                      className={`${s.optCard} ${protection.health_cover_type === key ? s.optCardSelected : ''}`}
                      onClick={() => setProtection(p => ({ ...p, health_cover_type: key }))}
                    >
                      <div>
                        <div className={s.optCardLabel}>{label}</div>
                        <div className={s.optCardSub}>{sub}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className={s.protFieldRow3}>
                <div className={s.curField}>
                  <label className={s.curFieldLabel}>Sum Insured</label>
                  <div className={s.curInputWrap}>
                    <span className={s.curSym}>₹</span>
                    <input className={s.curVal} type="number" placeholder="0"
                      value={protection.health_cover_amount}
                      onChange={e => setProtection(p => ({ ...p, health_cover_amount: e.target.value }))} />
                  </div>
                </div>
                <div className={s.curField}>
                  <label className={s.curFieldLabel}>Annual Premium</label>
                  <div className={s.curInputWrap}>
                    <span className={s.curSym}>₹</span>
                    <input className={s.curVal} type="number" placeholder="0"
                      value={protection.health_premium_annual}
                      onChange={e => setProtection(p => ({ ...p, health_premium_annual: e.target.value }))} />
                    <span className={s.curSuffix}>/yr</span>
                  </div>
                </div>
                <div className={s.curField}>
                  <label className={s.curFieldLabel}>Critical Illness <span className={s.optionalTag}>opt</span></label>
                  <div className={s.curInputWrap}>
                    <span className={s.curSym}>₹</span>
                    <input className={s.curVal} type="number" placeholder="0"
                      value={protection.ci_cover_amount}
                      onChange={e => setProtection(p => ({ ...p, ci_cover_amount: e.target.value }))} />
                  </div>
                </div>
              </div>
            </div>

            {/* VaNi copilot */}
            {(Number(protection.life_cover_amount) > 0 || Number(protection.health_cover_amount) > 0) && (
              <div className={s.vaniCopilot}>
                <div className={s.vaniCopilotMarker}>V ▸</div>
                <div className={s.vaniCopilotText}>
                  {Number(protection.life_cover_amount) > 0 && (
                    <>
                      Life cover{' '}
                      <span className={s.vaniHi}>{fmt(Number(protection.life_cover_amount))}</span>
                      {protRatio !== null && (
                        <><span className={s.vaniSep}> · </span>
                        <span className={vaniProtClass}>{protRatio.toFixed(1)}× annual income ▸ {vaniProtBracket}</span></>
                      )}
                      {vaniLifeGap !== null && vaniLifeGap > 0 && (
                        <><span className={s.vaniSep}> · </span>
                        <span className={s.vaniBad}>Gap vs 10× benchmark: {fmt(vaniLifeGap)}</span></>
                      )}
                    </>
                  )}
                  {!protection.has_term_plan && (
                    <><br /><span className={s.vaniBad}>No active life policy flagged.</span>{' '}Life cover is the #1 protection priority.</>
                  )}
                  {Number(protection.health_cover_amount) > 0 && (
                    <><br />Health cover{' '}
                    <span className={s.vaniHi}>{fmt(Number(protection.health_cover_amount))}</span>
                    {protection.health_cover_type && protection.health_cover_type !== 'none' && (
                      <><span className={s.vaniSep}> · </span>
                      {protection.health_cover_type === 'family_floater' ? 'Family floater' : protection.health_cover_type === 'employer' ? 'Employer group' : 'Individual'}</>
                    )}
                    {Number(protection.ci_cover_amount) > 0 && (
                      <><span className={s.vaniSep}> · </span>CI {fmt(Number(protection.ci_cover_amount))}</>
                    )}</>
                  )}
                  {!protection.has_health_cover && (
                    <><br /><span className={s.vaniWarn}>No health cover flagged.</span>{' '}Medical inflation in India is 14%/yr.</>
                  )}
                  {vaniPremBurden !== null && vaniPremBurden > 0 && (
                    <><br />Premium burden:{' '}
                    <span className={vaniPremBurden > 5 ? s.vaniWarn : s.vaniOk}>
                      {vaniPremBurden.toFixed(1)}% of annual income
                    </span></>
                  )}
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── 05 Goals + Risk Profile ───────────────────────────────── */}
        {activeSection === 4 && (
          <div className={s.sectionBody}>

            {/* Risk profile — big illustrated cards */}
            <div className={s.subGroup}>
              <div className={s.subGroupLabel}>Risk Profile</div>
              <div className={s.riskCards}>
                {(['conservative', 'moderate', 'aggressive'] as const).map(key => (
                  <button
                    key={key}
                    className={`${s.riskCard} ${riskProfile === key ? s.riskSelected : ''}`}
                    onClick={() => setRiskProfile(prev => prev === key ? '' : key)}
                  >
                    {riskProfile === key && <span className={s.riskCheck}>✓</span>}

                    {/* 5-bar volatility visualization */}
                    <div className={s.riskViz}>
                      {RISK_BARS[key].map((h, i) => (
                        <div
                          key={i}
                          className={s.riskBar}
                          style={{ height: `${h}%`, background: RISK_BAR_COLORS[key] }}
                        />
                      ))}
                    </div>

                    <div className={s.riskName}>{key.charAt(0).toUpperCase() + key.slice(1)}</div>
                    <div className={s.riskTagline}>{RISK_TAGLINES[key]}</div>

                    <div className={s.riskStat}>
                      <span className={s.riskStatLabel}>Expected return</span>
                      <span className={s.riskStatValue}>{RISK_RETURNS[key]}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            {/* Goals — item-card layout matching Assets / Loans */}
            <div className={s.subBlock}>
              <div className={s.subHead}>Aspirational Goals</div>

              {goals.length === 0 ? (
                <div className={s.itemEmptyState}>
                  Retirement, children's education, home, wedding — add every financial milestone
                </div>
              ) : (
                <div className={s.itemList}>
                  {goals.map((goal, i) => {
                    const gt = goalTypes.find(t => t.code === goal.goal_type);
                    return (
                      <div key={i} className={s.itemCard}>
                        <div className={s.itemHead}>
                          <span className={s.itemNum}>
                            {gt?.icon ?? '⭐'} GOAL_{String(i + 1).padStart(2, '0')}
                          </span>
                          <button type="button" className={s.itemRemove}
                            onClick={() => setGoals(prev => prev.filter((_, j) => j !== i))}
                          >×</button>
                        </div>
                        {/* Row 1: Goal type */}
                        <div className={s.goalRow1}>
                          <div className={s.curField}>
                            <label className={s.curFieldLabel}>Goal Type</label>
                            <select className={s.plainSelect} value={goal.goal_type}
                              onChange={e => {
                                const selected = goalTypes.find(t => t.code === e.target.value);
                                setGoals(prev => prev.map((g, j) => j !== i ? g : {
                                  ...g,
                                  goal_type: e.target.value,
                                  timeline_years: g.timeline_years || String(selected?.default_horizon_years ?? ''),
                                }));
                              }}
                            >
                              <option value="">Select type</option>
                              {goalTypes.map(t => (
                                <option key={t.code} value={t.code}>{t.icon} {t.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>
                        {/* Row 2: Name + Target + Horizon pills */}
                        <div className={s.goalRow2}>
                          <div className={s.curField}>
                            <label className={s.curFieldLabel}>Goal Name</label>
                            <input className={s.plainInput} type="text"
                              placeholder="e.g. Retire to Goa, IIT for Aryan"
                              value={goal.name}
                              onChange={e => setGoals(prev => prev.map((g, j) => j !== i ? g : { ...g, name: e.target.value }))}
                            />
                          </div>
                          <div className={s.curField}>
                            <label className={s.curFieldLabel}>Target (today's ₹)</label>
                            <div className={s.curInputWrap}>
                              <span className={s.curSym}>₹</span>
                              <input className={s.curVal} type="number" placeholder="0"
                                value={goal.target_amount}
                                onChange={e => setGoals(prev => prev.map((g, j) => j !== i ? g : { ...g, target_amount: e.target.value }))}
                              />
                            </div>
                          </div>
                          <div className={s.curField}>
                            <label className={s.curFieldLabel}>Horizon</label>
                            <div className={s.horizonPills}>
                              {HORIZON_PRESETS.map(yr => (
                                <button key={yr} type="button"
                                  className={`${s.horizonPill} ${Number(goal.timeline_years) === yr ? s.horizonPillActive : ''}`}
                                  onClick={() => setGoals(prev => prev.map((g, j) => j !== i ? g : { ...g, timeline_years: String(yr) }))}
                                >{yr}y</button>
                              ))}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              <button type="button" className={s.addItemBtn}
                onClick={() => setGoals(prev => [...prev, { goal_type: '', name: '', target_amount: '', timeline_years: '' }])}
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                  <path d="M10 4v12M4 10h12" />
                </svg>
                Add goal
              </button>

              {/* VaNi copilot */}
              {vaniGoalsFilled.length > 0 && (
                <div className={s.vaniCopilot}>
                  <div className={s.vaniCopilotMarker}>V ▸</div>
                  <div className={s.vaniCopilotText}>
                    <span className={s.vaniHi}>{vaniGoalsFilled.length} goal{vaniGoalsFilled.length > 1 ? 's' : ''}</span>
                    <span className={s.vaniSep}> · </span>
                    <span className={s.vaniHi}>{fmt(vaniTotalCorpus)} today</span>
                    <span className={s.vaniSep}> · </span>
                    FV @ 6% inflation ≈ <span className={s.vaniHi}>{fmt(Math.round(vaniTotalFV))}</span>
                    {vaniTotalSIP > 0 && (
                      <><span className={s.vaniSep}> · </span>
                      Combined SIP needed ≈ <span className={vaniTotalSIP > metrics.monthlySavings && metrics.monthlySavings > 0 ? s.vaniWarn : s.vaniOk}>{fmt(Math.round(vaniTotalSIP))}/mo</span></>
                    )}
                    {vaniTotalSIP > metrics.monthlySavings && metrics.monthlySavings > 0 && (
                      <><br /><span className={s.vaniWarn}>SIP requirement exceeds current savings capacity of {fmt(metrics.monthlySavings)}/mo.</span>{' '}Discuss goal prioritisation.</>
                    )}
                    {vaniGoalsFilled.map((g, i) => {
                      const yrs  = Number(g.timeline_years) || 10;
                      const fv   = Number(g.target_amount) * Math.pow(1.06, yrs);
                      const r    = 0.12 / 12;
                      const n    = yrs * 12;
                      const sip  = fv * r / (Math.pow(1 + r, n) - 1);
                      return (
                        <Fragment key={i}>
                          <br />
                          <span className={s.vaniHi}>{g.name || goalTypes.find(t => t.code === g.goal_type)?.label || 'Goal'}</span>
                          {' '}({yrs}y) — {fmt(Math.round(fv))} FV
                          <span className={s.vaniSep}> · </span>
                          SIP ≈ <span className={s.vaniOk}>{fmt(Math.round(sip))}/mo</span>
                        </Fragment>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>

            {/* MFD Notes */}
            <div className={s.subGroup}>
              <div className={s.subGroupLabel}>MFD Notes</div>
              <textarea
                className={s.textarea}
                rows={3}
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Observations about this prospect's financial situation…"
              />
            </div>
          </div>
        )}

          {/* ── Form footer ──────────────────────────────────────────── */}
          <div className={s.formFooter}>
            <div className={s.formFooterLeft}>
              {activeSection > 0 && (
                <button className={s.footerBackBtn} onClick={() => setActiveSection(i => i - 1)}>
                  ← Back
                </button>
              )}
            </div>
            <span className={s.footerStepMeta}>
              Step {activeSection + 1} of 5 · {sec.label}
            </span>
            <div className={s.formFooterRight}>
              {activeSection < 4 ? (
                <button className={s.footerContinueBtn} onClick={() => setActiveSection(i => i + 1)}>
                  Continue
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M5 12h14M12 5l7 7-7 7" />
                  </svg>
                </button>
              ) : (
                <button className={s.footerContinueBtn} onClick={handleSubmit} disabled={isSaving}>
                  {isSaving ? 'Submitting…' : 'Submit Snapshot'}
                </button>
              )}
            </div>
          </div>

          {/* Convert banner */}
          {!isClient && activeSection === 4 && riskProfile && goals.some(g => g.name) && (
            <div className={s.convertBanner}>
              Ready to convert?{' '}
              <button
                className={s.convertLink}
                onClick={() => router.push(`/contacts/${contactId}/convert`)}
              >
                Continue to Convert →
              </button>
            </div>
          )}

        </div>

        {/* Right: Benchmark Pulse sidebar */}
        <aside className={s.pulseSidebar}>
          <div className={s.pulseHdr}>
            <span className={s.pulseHdrDot} />
            <span className={s.pulseHdrLabel}>Benchmark Pulse</span>
          </div>

          <div className={s.benchMetrics}>
            {benchData.map(b => {
              const filledPct = b.value !== null ? Math.min(Math.max((b.value / b.max) * 100, 0), 100) : 0;
              const medianPct = Math.min((b.peerMedian / b.max) * 100, 100);
              const dotColor  = `var(--pulse-${b.key})`;
              return (
                <div key={b.key} className={s.benchMetric}>
                  <div className={s.benchTop}>
                    <div className={s.benchIdentity}>
                      <span className={s.benchDot} style={{ background: dotColor }} />
                      <span className={s.benchLabel}>{b.label}</span>
                    </div>
                    <span className={s.benchValue} style={{ color: b.value !== null ? dotColor : undefined }}>
                      {b.value !== null ? fmtBench(b.key, b.value) : '—'}
                    </span>
                  </div>
                  <div className={s.benchScaleWrap}>
                    <div className={s.benchScaleTrack}>
                      {b.value !== null && (
                        <div
                          className={s.benchScaleFill}
                          style={{ width: `${filledPct}%`, background: dotColor }}
                        />
                      )}
                      <div className={s.benchScaleMarker} style={{ left: `${medianPct}%` }} />
                    </div>
                    <div className={s.benchScaleLabels}>
                      <span>0</span>
                      <span className={s.benchScalePeer} style={{ left: `${medianPct}%` }}>peer</span>
                      <span>max</span>
                    </div>
                  </div>
                  <div className={s.benchNote}>{b.note}</div>
                </div>
              );
            })}
          </div>

          <div className={s.talkingBrief}>
            <div className={s.talkingBriefHdr}>▸ Talking Brief</div>
            <div className={s.talkingBriefText}>
              {metrics.monthlyIncome > 0 ? (
                <>
                  Income {fmt(metrics.monthlyIncome)}/mo
                  {metrics.savingsRate !== null && <> · saves <strong>{metrics.savingsRate.toFixed(0)}%</strong></>}
                  {metrics.dti !== null && <> · DTI <strong>{metrics.dti.toFixed(0)}%</strong></>}
                  {protRatio !== null && <> · protection <strong>{protRatio.toFixed(1)}x</strong></>}
                </>
              ) : (
                'Fill in cash flow to see talking points.'
              )}
            </div>
          </div>
        </aside>

      </div>
    </div>
  );
}
