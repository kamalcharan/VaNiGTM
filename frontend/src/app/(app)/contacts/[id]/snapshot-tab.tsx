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

import { useState, useEffect, useCallback, useMemo, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useMe } from '@/hooks/useMe';
import { useToast } from '@/components/toast';
import {
  VdfLoader, VdfButton, VdfItemCardList, VdfMetricLabel, VdfProactiveCard,
  type ItemRow, type ItemFieldDef,
} from '@/components/vdf';
import s from './snapshot-tab.module.css';

// ── Types ─────────────────────────────────────────────────────────────────

interface AssetType   { id: number; code: string; label: string; is_liquid_default: boolean; }
interface LiabilityType { id: number; code: string; label: string; }

interface AssetRow    { _id: string; asset_type_id: string; description: string; current_value: string; is_liquid: boolean; years_held: string; }
interface LiabRow     { _id: string; liability_type_id: string; description: string; outstanding_amount: string; monthly_emi: string; interest_rate_pct: string; }
interface GoalRow     { goal_type: string; name: string; target_amount: string; timeline_years: string; }

interface Income      { salary: string; partner: string; rental_other: string; }
interface Expenses    { housing: string; food: string; utilities: string; transport: string; education: string; healthcare: string; lifestyle: string; other: string; }
interface Protection  { life_cover_amount: string; health_cover_amount: string; ci_cover_amount: string; life_premium_annual: string; health_premium_annual: string; has_term_plan: boolean; has_health_cover: boolean; }

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

const GOAL_TYPES = ['retirement','education','house','wedding','emergency','vehicle','travel','custom'] as const;

const GOAL_ICONS: Record<string, string> = {
  retirement: '🌿', education: '🎓', house: '🏡', wedding: '💍',
  emergency: '🛡️', vehicle: '🚗', travel: '✈️', custom: '⭐',
};

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
    has_term_plan: false, has_health_cover: false,
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

  const assetTypes   = assetTypesData?.data?.asset_types ?? [];
  const liabTypes    = liabTypesData?.data?.liability_types ?? [];
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
      _id:            genId(),
      asset_type_id:  String(a.asset_type_id ?? ''),
      description:    String(a.description ?? ''),
      current_value:  String(a.current_value ?? ''),
      is_liquid:      Boolean(a.is_liquid),
      years_held:     a.years_held != null ? String(a.years_held) : '',
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

  // ── Schemas for VdfItemCardList ───────────────────────────────────────────

  const assetSchema = useMemo<ItemFieldDef[]>(() => [
    { type: 'select', key: 'asset_type_id', label: 'Asset Type',
      options: [{ value: '', label: 'Select type' }, ...assetTypes.map(t => ({ value: String(t.id), label: t.label }))] },
    { type: 'text',     key: 'description',   label: 'Description',  placeholder: 'e.g. 2BHK in Koramangala' },
    { type: 'currency', key: 'current_value', label: 'Current Value' },
    { type: 'text',     key: 'years_held',    label: 'Yrs Held',     placeholder: '—' },
    { type: 'liquidity',key: 'is_liquid',     label: 'Liquidity' },
  ], [assetTypes]);

  const liabSchema = useMemo<ItemFieldDef[]>(() => [
    { type: 'select', key: 'liability_type_id', label: 'Loan Type',
      options: [{ value: '', label: 'Select type' }, ...liabTypes.map(t => ({ value: String(t.id), label: t.label }))] },
    { type: 'text',     key: 'description',       label: 'Description',  placeholder: 'e.g. SBI Home Loan' },
    { type: 'currency', key: 'outstanding_amount', label: 'Outstanding' },
    { type: 'currency', key: 'monthly_emi',        label: 'Monthly EMI',  suffix: '/mo' },
    { type: 'text',     key: 'interest_rate_pct',  label: 'Rate %',       placeholder: '8.5' },
  ], [liabTypes]);

  const handleAssetsChange = useCallback((rows: ItemRow[]) => {
    const updated = rows.map(row => {
      const prev = assets.find(a => a._id === row._id);
      if (prev && String(prev.asset_type_id) !== String(row.asset_type_id)) {
        const assetType = assetTypes.find(t => String(t.id) === String(row.asset_type_id));
        return { ...row, is_liquid: assetType?.is_liquid_default ?? false };
      }
      return row;
    });
    setAssets(updated as unknown as AssetRow[]);
  }, [assets, assetTypes]);

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
    assets: assets.filter(a => a.asset_type_id && Number(a.current_value) > 0).map((a, i) => ({
      asset_type_id: Number(a.asset_type_id),
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
    assets.some(a => a.asset_type_id && Number(a.current_value) > 0),
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
                  {metrics.monthlyIncome > 0 && metrics.monthlyExpenses > 0 ? (() => {
                    const sr = metrics.savingsRate ?? 0;
                    const bracket = sr >= 50 ? 'p95' : sr >= 35 ? 'p80' : sr >= 25 ? 'p65' : sr >= 18 ? 'p50' : sr >= 10 ? 'p35' : 'p15';
                    const srClass = sr >= 20 ? s.vaniOk : sr >= 10 ? s.vaniWarn : s.vaniBad;
                    const housingPct = (Number(expenses.housing) / metrics.monthlyIncome) * 100;
                    const annualSavings = metrics.monthlySavings * 12;
                    return (
                      <>
                        <span className={s.vaniHi}>{fmt(metrics.monthlyIncome)}/mo income</span>
                        <span className={s.vaniSep}> · </span>
                        <span className={s.vaniHi}>{fmt(metrics.monthlyExpenses)}/mo expenses</span>
                        <span className={s.vaniSep}> · </span>
                        <span className={srClass}>Saves {sr.toFixed(0)}% ▸ {bracket} bracket</span>
                        <br />
                        {metrics.monthlySavings >= 0
                          ? <>Savings capacity ≈ <span className={s.vaniHi}>{fmt(annualSavings)}/yr</span>.{' '}
                              {housingPct > 30
                                ? <>Housing at <span className={s.vaniWarn}>{housingPct.toFixed(0)}%</span> of income — above 30% threshold.</>
                                : housingPct > 25
                                  ? <>Housing at {housingPct.toFixed(0)}% — near upper band.</>
                                  : null
                              }
                            </>
                          : <><span className={s.vaniBad}>Expenses exceed income by {fmt(Math.abs(metrics.monthlySavings))}/mo.</span> Review discretionary spending.</>
                        }
                      </>
                    );
                  })()
                  : metrics.monthlyIncome > 0
                    ? <>Income locked at <span className={s.vaniHi}>{fmt(metrics.monthlyIncome)}/mo</span>. Add expenses to compute savings rate.</>
                    : <>Expenses at <span className={s.vaniHi}>{fmt(metrics.monthlyExpenses)}/mo</span>. Add income to activate full analysis.</>
                  }
                </div>
              </div>
            )}

          </div>
        )}

        {/* ── 02 Assets ────────────────────────────────────────────── */}
        {activeSection === 1 && (
          <div className={s.sectionBody}>
            <VdfItemCardList
              schema={assetSchema}
              value={assets as unknown as ItemRow[]}
              onChange={handleAssetsChange}
              columns={3}
              prefix="ASSET"
              addLabel="+ Add asset"
              maxItems={20}
            />
            {assets.length > 0 && (
              <div className={s.sectionTotal}>
                Total: <strong>{fmt(metrics.totalAssets)}</strong>
                {' · '}Liquid: <strong style={{ color: 'var(--color-success)' }}>{fmt(metrics.liquidAssets)}</strong>
              </div>
            )}
            {metrics.totalAssets > 0 && (
              <VdfProactiveCard
                variant="data"
                label="VaNi"
                message={`Total assets ${fmt(metrics.totalAssets)} · Liquid ${fmt(metrics.liquidAssets)} · Illiquid ${fmt(metrics.totalAssets - metrics.liquidAssets)}`}
                tags={[
                  metrics.totalAssets > 0 && metrics.liquidAssets / metrics.totalAssets >= 0.3
                    ? { text: 'liquidity ok', status: 'ok' }
                    : { text: 'illiquid-heavy', status: 'warn' },
                ]}
              />
            )}
          </div>
        )}

        {/* ── 03 Liabilities ───────────────────────────────────────── */}
        {activeSection === 2 && (
          <div className={s.sectionBody}>
            <VdfItemCardList
              schema={liabSchema}
              value={liabs as unknown as ItemRow[]}
              onChange={(rows) => setLiabs(rows as unknown as LiabRow[])}
              columns={3}
              prefix="LOAN"
              addLabel="+ Add loan"
              maxItems={10}
            />
            {liabs.length > 0 && (
              <div className={s.sectionTotal}>
                Total: <strong>{fmt(metrics.totalLiabs)}</strong>
                {metrics.totalEmi > 0 && <> · EMI: <strong>{fmt(metrics.totalEmi)}</strong>/mo</>}
                {metrics.dti !== null && <> · DTI: <strong style={{ color: metrics.dti > 50 ? 'var(--color-danger)' : metrics.dti > 30 ? 'var(--color-warning)' : 'var(--color-success)' }}>{metrics.dti.toFixed(1)}%</strong></>}
              </div>
            )}
            {metrics.totalLiabs > 0 && (
              <VdfProactiveCard
                variant="data"
                label="VaNi"
                message={`Total debt ${fmt(metrics.totalLiabs)}${metrics.dti !== null ? ` · DTI ${metrics.dti.toFixed(0)}%` : ''}`}
                tags={metrics.dti !== null ? [
                  { text: metrics.dti <= 30 ? 'DTI healthy' : metrics.dti <= 50 ? 'DTI elevated' : 'DTI high',
                    status: (metrics.dti <= 30 ? 'ok' : metrics.dti <= 50 ? 'warn' : 'bad') as 'ok' | 'warn' | 'bad' },
                ] : undefined}
              />
            )}
          </div>
        )}

        {/* ── 04 Protection ────────────────────────────────────────── */}
        {activeSection === 3 && (
          <div className={s.sectionBody}>
            <div className={s.protectionToggles}>
              <button
                className={`${s.protToggle} ${protection.has_term_plan ? s.protToggleOn : ''}`}
                onClick={() => setProtection(p => ({ ...p, has_term_plan: !p.has_term_plan }))}
              >
                {protection.has_term_plan ? '✓' : '○'} Term Plan
              </button>
              <button
                className={`${s.protToggle} ${protection.has_health_cover ? s.protToggleOn : ''}`}
                onClick={() => setProtection(p => ({ ...p, has_health_cover: !p.has_health_cover }))}
              >
                {protection.has_health_cover ? '✓' : '○'} Health Cover
              </button>
            </div>

            <div className={s.inputGrid2}>
              {([
                { key: 'life_cover_amount',    label: 'Life Cover (Sum Assured)' },
                { key: 'life_premium_annual',  label: 'Life Premium (Annual)' },
                { key: 'health_cover_amount',  label: 'Health Cover (Sum Insured)' },
                { key: 'health_premium_annual',label: 'Health Premium (Annual)' },
                { key: 'ci_cover_amount',      label: 'Critical Illness Cover' },
              ] as const).map(({ key, label }) => (
                <div key={key} className={s.bigInputCard}>
                  <label className={s.bigInputLabel}>{label}<span className={s.optionalTag}>optional</span></label>
                  <div className={s.bigInputWrap}>
                    <span className={s.bigInputCurrency}>₹</span>
                    <input
                      className={s.bigInput}
                      type="number"
                      value={protection[key]}
                      onChange={e => setProtection(p => ({ ...p, [key]: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  {Number(protection[key]) > 0 && (
                    <div className={s.bigInputHelper}>{fmt(Number(protection[key]))}</div>
                  )}
                </div>
              ))}
            </div>

            {protRatio !== null && (
              <div className={s.savingsSummary}>
                <span className={s.savingsLabel}>Protection Ratio</span>
                <span className={s.savingsValue} style={{ color: protRatio >= 10 ? 'var(--color-success)' : protRatio >= 5 ? 'var(--color-warning)' : 'var(--color-danger)' }}>
                  {protRatio.toFixed(1)}x
                </span>
                <span className={s.savingsRate}>life cover / annual income — target 10x</span>
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

            {/* Aspirational goals — horizontal bubble layout */}
            <div className={s.subGroup}>
              <div className={s.subGroupLabel}>Aspirational Goals</div>
              <div className={s.goalList}>
                {goals.map((goal, i) => (
                  <div key={i} className={s.goalBubble}>
                    {/* Left: icon + type + name */}
                    <div className={s.goalBubbleLeft}>
                      <div className={s.goalBubbleIcon}>{GOAL_ICONS[goal.goal_type] ?? '⭐'}</div>
                      <div className={s.goalBubbleMeta}>
                        <select
                          className={s.goalTypeSelectInline}
                          value={goal.goal_type}
                          onChange={e => setGoals(prev => prev.map((g, j) => j === i ? { ...g, goal_type: e.target.value } : g))}
                        >
                          {GOAL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                        </select>
                        <input
                          className={s.goalNameInput}
                          placeholder="Goal name…"
                          value={goal.name}
                          onChange={e => setGoals(prev => prev.map((g, j) => j === i ? { ...g, name: e.target.value } : g))}
                        />
                      </div>
                    </div>

                    {/* Amount badge */}
                    <div className={s.goalAmountBadge}>
                      <span className={s.goalAmountCurrency}>₹</span>
                      <input
                        className={s.goalAmountInput}
                        type="number"
                        placeholder="0"
                        value={goal.target_amount}
                        onChange={e => setGoals(prev => prev.map((g, j) => j === i ? { ...g, target_amount: e.target.value } : g))}
                      />
                    </div>

                    {/* Timeline chip */}
                    <div className={s.goalTimelineChip}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
                      </svg>
                      <input
                        className={s.goalTimelineInput}
                        type="number"
                        placeholder="10"
                        min={1}
                        max={40}
                        value={goal.timeline_years}
                        onChange={e => setGoals(prev => prev.map((g, j) => j === i ? { ...g, timeline_years: e.target.value } : g))}
                      />
                      <span>yrs</span>
                    </div>

                    {/* Delete */}
                    <button
                      className={s.goalDeleteBtn}
                      onClick={() => setGoals(prev => prev.filter((_, j) => j !== i))}
                    >×</button>
                  </div>
                ))}
              </div>

              <button
                className={s.addGoalBtn}
                onClick={() => setGoals(prev => [...prev, { goal_type: 'custom', name: '', target_amount: '', timeline_years: '' }])}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14"/>
                </svg>
                Add another goal
              </button>
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
