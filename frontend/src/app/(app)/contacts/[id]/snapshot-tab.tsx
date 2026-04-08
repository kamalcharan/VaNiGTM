'use client';

/**
 * SnapshotTab — MFD-fills flow (Flow 3)
 * Matches mfd-snapshot-flow.html reference design.
 *
 * 5-section stepper:
 *   01 Cash Flow → 02 Assets → 03 Liabilities → 04 Protection → 05 Goals
 *
 * Benchmark Pulse sidebar: 5 health rings computed live from form state.
 * Draft/Submit lifecycle: draft auto-saved, submit archives old active.
 */

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import { VdfLoader, VdfButton, VdfReadinessRing } from '@/components/vdf';
import s from './snapshot-tab.module.css';

// ── Types ─────────────────────────────────────────────────────────────────

interface AssetType   { id: number; code: string; label: string; is_liquid_default: boolean; }
interface LiabilityType { id: number; code: string; label: string; }

interface AssetRow    { asset_type_id: string; description: string; current_value: string; is_liquid: boolean; }
interface LiabRow     { liability_type_id: string; description: string; outstanding_amount: string; monthly_emi: string; interest_rate_pct: string; }
interface GoalRow     { goal_type: string; name: string; target_amount: string; timeline_years: string; }

interface Income      { salary: string; partner: string; rental_other: string; }
interface Expenses    { housing: string; food: string; utilities: string; transport: string; education: string; lifestyle: string; }
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

const STATUS_COLOR: Record<PulseStatus, string> = {
  good:  'var(--color-success)',
  warn:  'var(--color-warning)',
  bad:   'var(--color-danger)',
  empty: 'var(--color-border)',
};

function pulsePct(val: number | null, max: number, invert = false): number {
  if (val === null) return 0;
  const raw = Math.min(100, Math.max(0, (val / max) * 100));
  return invert ? 100 - raw : raw;
}

function fmt(v: number): string {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  return `₹${v.toLocaleString('en-IN')}`;
}

// ── Talking Brief ──────────────────────────────────────────────────────────

function talkingBrief(metrics: ReturnType<typeof computeMetrics>, goalsCount: number): string[] {
  const lines: string[] = [];
  if (metrics.savingsRate !== null) {
    if (metrics.savingsRate >= 30) lines.push(`Savings rate of ${metrics.savingsRate.toFixed(0)}% — impressive discipline.`);
    else if (metrics.savingsRate >= 10) lines.push(`Savings rate at ${metrics.savingsRate.toFixed(0)}% — room to grow.`);
    else lines.push(`Low savings rate (${metrics.savingsRate.toFixed(0)}%) — review expenses.`);
  }
  if (metrics.dti !== null) {
    if (metrics.dti > 50) lines.push(`Debt load at ${metrics.dti.toFixed(0)}% DTI — high. Prioritise reduction.`);
    else if (metrics.dti > 30) lines.push(`Moderate debt load (${metrics.dti.toFixed(0)}% DTI) — manageable.`);
    else if (metrics.dti > 0) lines.push(`Healthy debt level at ${metrics.dti.toFixed(0)}% DTI.`);
  }
  if (metrics.liquidityMonths !== null) {
    if (metrics.liquidityMonths < 3) lines.push(`Emergency fund below 3 months — critical gap.`);
    else if (metrics.liquidityMonths < 6) lines.push(`Emergency fund ${metrics.liquidityMonths.toFixed(1)} months — build towards 6.`);
    else lines.push(`Good liquidity buffer: ${metrics.liquidityMonths.toFixed(1)} months covered.`);
  }
  if (goalsCount > 0) lines.push(`${goalsCount} goal${goalsCount > 1 ? 's' : ''} captured — ready for planning.`);
  if (lines.length === 0) lines.push('Fill in the sections to see a financial brief.');
  return lines;
}

// ── Pulse Ring Component ───────────────────────────────────────────────────

function PulseRing({ label, value, unit, pct, status }: {
  label: string; value: string; unit: string; pct: number; status: PulseStatus;
}) {
  const color = STATUS_COLOR[status];
  return (
    <div className={s.pulseRing}>
      <VdfReadinessRing pct={pct} size={48} strokeWidth={4} color={color} showLabel={false} />
      <div className={s.pulseRingInfo}>
        <span className={s.pulseRingLabel}>{label}</span>
        <span className={s.pulseRingValue} style={{ color }}>
          {value}<span className={s.pulseRingUnit}>{unit}</span>
        </span>
      </div>
    </div>
  );
}

// ── Section headers ────────────────────────────────────────────────────────

const SECTIONS = [
  { num: '01', title: 'Cash Flow',   sub: 'Income & monthly expenses'      },
  { num: '02', title: 'Assets',      sub: 'What they own'                  },
  { num: '03', title: 'Liabilities', sub: 'Loans & outstanding debts'      },
  { num: '04', title: 'Protection',  sub: 'Insurance coverage'             },
  { num: '05', title: 'Goals',       sub: 'Aspirational financial targets'  },
];

const GOAL_TYPES = ['retirement','education','house','wedding','emergency','vehicle','travel','custom'] as const;

const EXPENSE_LABELS: Record<keyof Expenses, string> = {
  housing: 'Housing / Rent', food: 'Groceries & Food', utilities: 'Utilities',
  transport: 'Transport', education: 'Education / Kids', lifestyle: 'Lifestyle',
};

// ── Main component ─────────────────────────────────────────────────────────

export function SnapshotTab({ contactId, isClient }: { contactId: number; isClient: boolean }) {
  const router       = useRouter();
  const { showToast } = useToast();
  const queryClient  = useQueryClient();

  const [showWizard,    setShowWizard]    = useState(false);
  const [intakeUrl,     setIntakeUrl]     = useState<string | null>(null);
  const [copied,        setCopied]        = useState(false);

  const [activeSection, setActiveSection] = useState(0);
  const [riskProfile,   setRiskProfile]   = useState('');
  const [notes,         setNotes]         = useState('');

  const [income, setIncome] = useState<Income>({
    salary: '', partner: '', rental_other: '',
  });
  const [expenses, setExpenses] = useState<Expenses>({
    housing: '', food: '', utilities: '', transport: '', education: '', lifestyle: '',
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
    const exp: Expenses = { housing: '', food: '', utilities: '', transport: '', education: '', lifestyle: '' };
    for (const row of snapExp) {
      if (row.category in exp) (exp as Record<string, string>)[row.category] = String(row.amount_monthly);
    }
    setExpenses(exp);

    const snapAssets = (snap.assets as Array<Record<string, unknown>>) ?? [];
    setAssets(snapAssets.map(a => ({
      asset_type_id:  String(a.asset_type_id ?? ''),
      description:    String(a.description ?? ''),
      current_value:  String(a.current_value ?? ''),
      is_liquid:      Boolean(a.is_liquid),
    })));

    const snapLiabs = (snap.liabilities as Array<Record<string, unknown>>) ?? [];
    setLiabs(snapLiabs.map(l => ({
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

  const brief = talkingBrief(metrics, goals.filter(g => g.name).length);

  if (snapLoading) return <VdfLoader message="Loading snapshot…" />;

  // ── Empty state — no snapshot yet, user hasn't chosen an action ───────────

  if (!snap && !showWizard) {
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
          <button className={s.emptyPrimaryBtn} onClick={() => setShowWizard(true)}>
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

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={s.wrapper}>

      {/* ── Left: Form ─────────────────────────────────────── */}
      <div className={s.formArea}>

        {/* Stepper */}
        <div className={s.stepper}>
          {SECTIONS.map((sec, i) => (
            <button
              key={i}
              className={`${s.stepDot} ${i === activeSection ? s.stepActive : ''} ${sectionDone[i] ? s.stepDone : ''}`}
              onClick={() => setActiveSection(i)}
              title={sec.title}
            >
              <span className={s.stepNum}>{sectionDone[i] && i !== activeSection ? '✓' : sec.num}</span>
              <span className={s.stepLabel}>{sec.title}</span>
            </button>
          ))}
          <div
            className={s.stepProgress}
            style={{ width: `${(sectionDone.filter(Boolean).length / 5) * 100}%` }}
          />
        </div>

        {/* Section header */}
        <div className={s.sectionHeader}>
          <span className={s.sectionNum}>{SECTIONS[activeSection].num} / 05</span>
          <h2 className={s.sectionTitle}>{SECTIONS[activeSection].title}</h2>
          <p className={s.sectionSub}>{SECTIONS[activeSection].sub}</p>
        </div>

        {/* ── 01 Cash Flow ─────────────────────────────────── */}
        {activeSection === 0 && (
          <div className={s.sectionBody}>
            <div className={s.subGroup}>
              <div className={s.subGroupLabel}>Monthly Income</div>
              <div className={s.inputGrid3}>
                {(['salary', 'partner', 'rental_other'] as const).map(key => (
                  <div key={key} className={s.amountCard}>
                    <label className={s.amountLabel}>
                      {key === 'salary' ? 'Take-home Salary' : key === 'partner' ? 'Partner Income' : 'Rental / Other'}
                      {key !== 'salary' && <span className={s.optionalTag}>optional</span>}
                    </label>
                    <div className={s.amountInputWrap}>
                      <span className={s.currencyPrefix}>₹</span>
                      <input
                        className={s.amountInput}
                        type="number"
                        value={income[key]}
                        onChange={e => setIncome(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder="0"
                      />
                      <span className={s.amountSuffix}>/mo</span>
                    </div>
                    {Number(income[key]) > 0 && (
                      <div className={s.amountHelper}>{fmt(Number(income[key]))}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <div className={s.subGroup}>
              <div className={s.subGroupLabel}>Monthly Expenses</div>
              <div className={s.inputGrid2}>
                {(Object.keys(EXPENSE_LABELS) as Array<keyof Expenses>).map(key => (
                  <div key={key} className={s.expenseRow}>
                    <label className={s.expenseLabel}>{EXPENSE_LABELS[key]}</label>
                    <div className={s.expenseInputWrap}>
                      <span className={s.currencyPrefix}>₹</span>
                      <input
                        className={s.expenseInput}
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

            {metrics.monthlyIncome > 0 && (
              <div className={s.savingsSummary}>
                <span className={s.savingsLabel}>Monthly Savings</span>
                <span className={s.savingsValue} style={{ color: metrics.monthlySavings >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {metrics.monthlySavings >= 0 ? '+' : ''}{fmt(metrics.monthlySavings)}
                </span>
                {metrics.savingsRate !== null && (
                  <span className={s.savingsRate}>{metrics.savingsRate.toFixed(1)}% savings rate</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 02 Assets ────────────────────────────────────── */}
        {activeSection === 1 && (
          <div className={s.sectionBody}>
            {assets.map((asset, i) => (
              <div key={i} className={s.itemCard}>
                <div className={s.itemCardRow}>
                  <select
                    className={s.typeSelect}
                    value={asset.asset_type_id}
                    onChange={e => setAssets(prev => prev.map((a, j) => j === i ? { ...a, asset_type_id: e.target.value, is_liquid: assetTypes.find(t => String(t.id) === e.target.value)?.is_liquid_default ?? false } : a))}
                  >
                    <option value="">Select asset type</option>
                    {assetTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <button className={s.removeBtn} onClick={() => setAssets(prev => prev.filter((_, j) => j !== i))}>×</button>
                </div>
                <input
                  className={s.descInput}
                  placeholder="Description (e.g. 2BHK in Koramangala)"
                  value={asset.description}
                  onChange={e => setAssets(prev => prev.map((a, j) => j === i ? { ...a, description: e.target.value } : a))}
                />
                <div className={s.itemCardRow}>
                  <div className={s.amountInputWrap} style={{ flex: 1 }}>
                    <span className={s.currencyPrefix}>₹</span>
                    <input
                      className={s.amountInput}
                      type="number"
                      placeholder="Current value"
                      value={asset.current_value}
                      onChange={e => setAssets(prev => prev.map((a, j) => j === i ? { ...a, current_value: e.target.value } : a))}
                    />
                  </div>
                  <button
                    className={`${s.liquidToggle} ${asset.is_liquid ? s.liquidOn : s.liquidOff}`}
                    onClick={() => setAssets(prev => prev.map((a, j) => j === i ? { ...a, is_liquid: !a.is_liquid } : a))}
                  >
                    {asset.is_liquid ? '💧 Liquid' : '🔒 Illiquid'}
                  </button>
                </div>
                {Number(asset.current_value) > 0 && (
                  <div className={s.amountHelper}>{fmt(Number(asset.current_value))}</div>
                )}
              </div>
            ))}
            <button className={s.addItemBtn} onClick={() => setAssets(prev => [...prev, { asset_type_id: '', description: '', current_value: '', is_liquid: false }])}>
              + Add asset
            </button>
            {assets.length > 0 && (
              <div className={s.sectionTotal}>
                Total Assets: <strong>{fmt(metrics.totalAssets)}</strong>
                {' · '}Liquid: <strong style={{ color: 'var(--color-success)' }}>{fmt(metrics.liquidAssets)}</strong>
              </div>
            )}
          </div>
        )}

        {/* ── 03 Liabilities ───────────────────────────────── */}
        {activeSection === 2 && (
          <div className={s.sectionBody}>
            {liabs.map((liab, i) => (
              <div key={i} className={s.itemCard}>
                <div className={s.itemCardRow}>
                  <select
                    className={s.typeSelect}
                    value={liab.liability_type_id}
                    onChange={e => setLiabs(prev => prev.map((l, j) => j === i ? { ...l, liability_type_id: e.target.value } : l))}
                  >
                    <option value="">Select loan type</option>
                    {liabTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                  <button className={s.removeBtn} onClick={() => setLiabs(prev => prev.filter((_, j) => j !== i))}>×</button>
                </div>
                <input
                  className={s.descInput}
                  placeholder="Description (e.g. SBI Home Loan)"
                  value={liab.description}
                  onChange={e => setLiabs(prev => prev.map((l, j) => j === i ? { ...l, description: e.target.value } : l))}
                />
                <div className={s.loanFieldGrid}>
                  <div>
                    <label className={s.miniLabel}>Outstanding</label>
                    <div className={s.amountInputWrap}>
                      <span className={s.currencyPrefix}>₹</span>
                      <input className={s.amountInput} type="number" placeholder="0" value={liab.outstanding_amount}
                        onChange={e => setLiabs(prev => prev.map((l, j) => j === i ? { ...l, outstanding_amount: e.target.value } : l))} />
                    </div>
                  </div>
                  <div>
                    <label className={s.miniLabel}>Monthly EMI</label>
                    <div className={s.amountInputWrap}>
                      <span className={s.currencyPrefix}>₹</span>
                      <input className={s.amountInput} type="number" placeholder="0" value={liab.monthly_emi}
                        onChange={e => setLiabs(prev => prev.map((l, j) => j === i ? { ...l, monthly_emi: e.target.value } : l))} />
                    </div>
                  </div>
                  <div>
                    <label className={s.miniLabel}>Interest Rate %</label>
                    <div className={s.amountInputWrap}>
                      <input className={s.amountInput} type="number" placeholder="e.g. 8.5" value={liab.interest_rate_pct}
                        onChange={e => setLiabs(prev => prev.map((l, j) => j === i ? { ...l, interest_rate_pct: e.target.value } : l))} />
                      <span className={s.amountSuffix}>%</span>
                    </div>
                  </div>
                </div>
                {Number(liab.outstanding_amount) > 0 && (
                  <div className={s.amountHelper}>{fmt(Number(liab.outstanding_amount))}</div>
                )}
              </div>
            ))}
            <button className={s.addItemBtn} onClick={() => setLiabs(prev => [...prev, { liability_type_id: '', description: '', outstanding_amount: '', monthly_emi: '', interest_rate_pct: '' }])}>
              + Add loan
            </button>
            {liabs.length > 0 && (
              <div className={s.sectionTotal}>
                Total Liabilities: <strong>{fmt(metrics.totalLiabs)}</strong>
                {metrics.totalEmi > 0 && <> · Monthly EMI: <strong>{fmt(metrics.totalEmi)}</strong></>}
                {metrics.dti !== null && <> · DTI: <strong style={{ color: metrics.dti > 50 ? 'var(--color-danger)' : metrics.dti > 30 ? 'var(--color-warning)' : 'var(--color-success)' }}>{metrics.dti.toFixed(1)}%</strong></>}
              </div>
            )}
          </div>
        )}

        {/* ── 04 Protection ────────────────────────────────── */}
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
                <div key={key} className={s.amountCard}>
                  <label className={s.amountLabel}>{label}<span className={s.optionalTag}>optional</span></label>
                  <div className={s.amountInputWrap}>
                    <span className={s.currencyPrefix}>₹</span>
                    <input
                      className={s.amountInput}
                      type="number"
                      value={protection[key]}
                      onChange={e => setProtection(p => ({ ...p, [key]: e.target.value }))}
                      placeholder="0"
                    />
                  </div>
                  {Number(protection[key]) > 0 && (
                    <div className={s.amountHelper}>{fmt(Number(protection[key]))}</div>
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

        {/* ── 05 Goals ─────────────────────────────────────── */}
        {activeSection === 4 && (
          <div className={s.sectionBody}>
            {/* Risk profile — lives in goals section as final step */}
            <div className={s.subGroup}>
              <div className={s.subGroupLabel}>Risk Appetite</div>
              <div className={s.riskCards}>
                {(['conservative', 'moderate', 'aggressive'] as const).map(key => (
                  <button
                    key={key}
                    className={`${s.riskCard} ${riskProfile === key ? s.riskSelected : ''}`}
                    onClick={() => setRiskProfile(prev => prev === key ? '' : key)}
                  >
                    {riskProfile === key && <span className={s.riskCheck}>✓</span>}
                    <span className={s.riskLabel}>{key.charAt(0).toUpperCase() + key.slice(1)}</span>
                    <span className={s.riskSub}>
                      {key === 'conservative' ? '7–9% p.a.' : key === 'moderate' ? '10–13% p.a.' : '14–18% p.a.'}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className={s.subGroup}>
              <div className={s.subGroupLabel}>Aspirational Goals</div>
              {goals.map((goal, i) => (
                <div key={i} className={s.goalCard}>
                  <div className={s.goalCardRow}>
                    <select
                      className={s.typeSelect}
                      value={goal.goal_type}
                      onChange={e => setGoals(prev => prev.map((g, j) => j === i ? { ...g, goal_type: e.target.value } : g))}
                    >
                      {GOAL_TYPES.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                    <button className={s.removeBtn} onClick={() => setGoals(prev => prev.filter((_, j) => j !== i))}>×</button>
                  </div>
                  <input
                    className={s.descInput}
                    placeholder="Goal name (e.g. Daughter's Education)"
                    value={goal.name}
                    onChange={e => setGoals(prev => prev.map((g, j) => j === i ? { ...g, name: e.target.value } : g))}
                  />
                  <div className={s.loanFieldGrid}>
                    <div>
                      <label className={s.miniLabel}>Target Amount</label>
                      <div className={s.amountInputWrap}>
                        <span className={s.currencyPrefix}>₹</span>
                        <input className={s.amountInput} type="number" placeholder="0" value={goal.target_amount}
                          onChange={e => setGoals(prev => prev.map((g, j) => j === i ? { ...g, target_amount: e.target.value } : g))} />
                      </div>
                    </div>
                    <div>
                      <label className={s.miniLabel}>Timeline</label>
                      <div className={s.amountInputWrap}>
                        <input className={s.amountInput} type="number" placeholder="10" min={1} max={40} value={goal.timeline_years}
                          onChange={e => setGoals(prev => prev.map((g, j) => j === i ? { ...g, timeline_years: e.target.value } : g))} />
                        <span className={s.amountSuffix}>yrs</span>
                      </div>
                    </div>
                  </div>
                  {Number(goal.target_amount) > 0 && (
                    <div className={s.amountHelper}>{fmt(Number(goal.target_amount))} in {goal.timeline_years || '?'} years</div>
                  )}
                </div>
              ))}
              <button className={s.addItemBtn} onClick={() => setGoals(prev => [...prev, { goal_type: 'custom', name: '', target_amount: '', timeline_years: '' }])}>
                + Add goal
              </button>
            </div>

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

        {/* ── Section nav footer ───────────────────────────── */}
        <div className={s.navFooter}>
          <div className={s.navLeft}>
            {activeSection > 0 && (
              <VdfButton variant="ghost" onClick={() => setActiveSection(s => s - 1)}>← Back</VdfButton>
            )}
          </div>
          <div className={s.navRight}>
            <VdfButton variant="outline" loading={isSaving} onClick={handleDraft}>
              Save Draft
            </VdfButton>
            {activeSection < 4 ? (
              <VdfButton variant="primary" onClick={() => setActiveSection(s => s + 1)}>
                Next →
              </VdfButton>
            ) : (
              <VdfButton variant="primary" loading={isSaving} onClick={handleSubmit}>
                Submit Snapshot
              </VdfButton>
            )}
          </div>
        </div>

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

      {/* ── Right: Benchmark Pulse ─────────────────────────── */}
      <aside className={s.pulseSidebar}>
        <div className={s.pulseHeader}>
          <span className={s.pulseTitle}>Benchmark Pulse</span>
          <span className={s.pulseSubtitle}>Live financial health</span>
        </div>

        <div className={s.pulseRings}>
          <PulseRing
            label="Savings Rate"
            value={metrics.savingsRate !== null ? metrics.savingsRate.toFixed(1) : '—'}
            unit="%"
            pct={pulsePct(metrics.savingsRate, 50)}
            status={savingsStatus(metrics.savingsRate)}
          />
          <PulseRing
            label="Debt Load (DTI)"
            value={metrics.dti !== null ? metrics.dti.toFixed(1) : '—'}
            unit="%"
            pct={pulsePct(metrics.dti, 60, true)}
            status={dtiStatus(metrics.dti)}
          />
          <PulseRing
            label="Protection"
            value={protRatio !== null ? protRatio.toFixed(1) : '—'}
            unit="x"
            pct={pulsePct(protRatio, 15)}
            status={protectionStatus(protRatio)}
          />
          <PulseRing
            label="Liquidity"
            value={metrics.liquidityMonths !== null ? metrics.liquidityMonths.toFixed(1) : '—'}
            unit=" mo"
            pct={pulsePct(metrics.liquidityMonths, 12)}
            status={liquidityStatus(metrics.liquidityMonths)}
          />
          <PulseRing
            label="Future Focus"
            value={goals.filter(g => g.name).length > 0 ? String(goals.filter(g => g.name).length) : '—'}
            unit={goals.filter(g => g.name).length === 1 ? ' goal' : ' goals'}
            pct={Math.min(100, goals.filter(g => g.name).length * 20)}
            status={goals.filter(g => g.name).length >= 3 ? 'good' : goals.filter(g => g.name).length > 0 ? 'warn' : 'empty'}
          />
        </div>

        {metrics.monthlyIncome > 0 && (
          <div className={s.netWorthCard}>
            <span className={s.netWorthLabel}>Net Worth</span>
            <span className={s.netWorthValue} style={{ color: metrics.netWorth >= 0 ? 'var(--color-fg)' : 'var(--color-danger)' }}>
              {metrics.netWorth >= 0 ? '' : '−'}{fmt(Math.abs(metrics.netWorth))}
            </span>
            <div className={s.netWorthBreakdown}>
              <span>Assets {fmt(metrics.totalAssets)}</span>
              <span>Liabs {fmt(metrics.totalLiabs)}</span>
            </div>
          </div>
        )}

        <div className={s.talkingBrief}>
          <span className={s.briefTitle}>Talking Brief</span>
          {brief.map((line, i) => (
            <p key={i} className={s.briefLine}>{line}</p>
          ))}
        </div>
      </aside>
    </div>
  );
}
