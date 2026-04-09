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

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { useSkillQuery, useSkillMutation } from '@/hooks/useSkill';
import { useToast } from '@/components/toast';
import { VdfLoader, VdfButton } from '@/components/vdf';
import s from './snapshot-tab.module.css';

// ── Types ─────────────────────────────────────────────────────────────────

interface AssetType   { id: number; code: string; label: string; is_liquid_default: boolean; }
interface LiabilityType { id: number; code: string; label: string; }

interface AssetRow    { asset_type_id: string; description: string; current_value: string; is_liquid: boolean; years_held: string; }
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

// ── Section headers ────────────────────────────────────────────────────────

// question: qBefore + <name> + qItalic — matches contactnest-ux.html pattern
const SECTIONS = [
  { num: '01', label: 'Cash Flow',
    qBefore: 'How does ', qItalic: ' earn and spend?',
    helper: 'Monthly income and expenses — the heartbeat of every financial plan.' },
  { num: '02', label: 'Assets',
    qBefore: 'What does ', qItalic: ' own?',
    helper: 'Property, investments, savings — capture everything of value.' },
  { num: '03', label: 'Liabilities',
    qBefore: 'What does ', qItalic: ' owe?',
    helper: 'Loans and outstanding debts. No judgment — clarity helps planning.' },
  { num: '04', label: 'Protection',
    qBefore: 'How protected is ', qItalic: '?',
    helper: 'Insurance coverage, life and health — quantify the safety net.' },
  { num: '05', label: 'Goals',
    qBefore: 'What are ', qItalic: "'s financial goals?",
    helper: 'Aspirations, risk appetite, and dreams to plan towards.' },
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
  housing: 'Housing / Rent', food: 'Groceries & Food', utilities: 'Utilities',
  transport: 'Transport', education: 'Education / Kids', lifestyle: 'Lifestyle',
};

// ── Main component ─────────────────────────────────────────────────────────

export function SnapshotTab({ contactId, isClient, contactName }: { contactId: number; isClient: boolean; contactName?: string }) {
  const them = contactName ? contactName : 'the client';
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
      years_held:     a.years_held != null ? String(a.years_held) : '',
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

  const sec = SECTIONS[activeSection];

  return (
    <div className={s.wrapper}>
      <div className={s.snapshotStage}>

        {/* ── 5-segment progress bar ─────────────────────────────── */}
        <div className={s.progressWrap}>
          {SECTIONS.map((_, i) => (
            <div
              key={i}
              className={`${s.progressSegment} ${i < activeSection ? s.progressSegmentDone : ''} ${i === activeSection ? s.progressSegmentActive : ''}`}
              onClick={() => setActiveSection(i)}
              style={{ cursor: 'pointer' }}
            />
          ))}
        </div>

        {/* ── Step counter + editorial question header ─────────────── */}
        <div className={s.stepCounterLabel}>
          Step {sec.num} of 05 · {sec.label}
        </div>
        <h2 className={s.stepQuestion}>
          {sec.qBefore}{them}<em className={s.stepQuestionEm}>{sec.qItalic}</em>
        </h2>
        <p className={s.stepHelper}>{sec.helper}</p>

        {/* ── 01 Cash Flow ─────────────────────────────────────────── */}
        {activeSection === 0 && (
          <div className={s.sectionBody}>
            <div className={s.subGroup}>
              <div className={s.subGroupLabel}>Monthly Income</div>
              <div className={s.inputGrid3}>
                {(['salary', 'partner', 'rental_other'] as const).map(key => (
                  <div key={key} className={s.bigInputCard}>
                    <label className={s.bigInputLabel}>
                      {key === 'salary' ? 'Take-home Salary' : key === 'partner' ? 'Partner Income' : 'Rental / Other'}
                      {key !== 'salary' && <span className={s.optionalTag}>optional</span>}
                    </label>
                    <div className={s.bigInputWrap}>
                      <span className={s.bigInputCurrency}>₹</span>
                      <input
                        className={s.bigInput}
                        type="number"
                        value={income[key]}
                        onChange={e => setIncome(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder="0"
                      />
                      <span className={s.bigInputSuffix}>/mo</span>
                    </div>
                    {Number(income[key]) > 0 && (
                      <div className={s.bigInputHelper}>{fmt(Number(income[key]))}</div>
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
                      <span className={s.expenseCurrency}>₹</span>
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

        {/* ── 02 Assets ────────────────────────────────────────────── */}
        {activeSection === 1 && (
          <div className={s.sectionBody}>
            {assets.map((asset, i) => (
              <div key={i} className={s.itemCard}>
                <div className={s.itemCardRow}>
                  <select
                    className={s.typeSelect}
                    value={asset.asset_type_id}
                    onChange={e => setAssets(prev => prev.map((a, j) => j === i ? {
                      ...a,
                      asset_type_id: e.target.value,
                      is_liquid: assetTypes.find(t => String(t.id) === e.target.value)?.is_liquid_default ?? false,
                    } : a))}
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
                <div className={s.assetValueRow}>
                  <div className={s.assetValueWrap}>
                    <span className={s.assetCurrency}>₹</span>
                    <input
                      className={s.assetValueInput}
                      type="number"
                      placeholder="Current value"
                      value={asset.current_value}
                      onChange={e => setAssets(prev => prev.map((a, j) => j === i ? { ...a, current_value: e.target.value } : a))}
                    />
                  </div>
                  <div className={s.yrsHeldWrap}>
                    <input
                      className={s.yrsHeldInput}
                      type="number"
                      placeholder="—"
                      min={0}
                      max={99}
                      value={asset.years_held}
                      onChange={e => setAssets(prev => prev.map((a, j) => j === i ? { ...a, years_held: e.target.value } : a))}
                    />
                    <span className={s.yrsHeldSuffix}>yrs</span>
                  </div>
                  <button
                    className={`${s.liquidToggle} ${asset.is_liquid ? s.liquidOn : s.liquidOff}`}
                    onClick={() => setAssets(prev => prev.map((a, j) => j === i ? { ...a, is_liquid: !a.is_liquid } : a))}
                  >
                    {asset.is_liquid ? '💧 Liquid' : '🔒 Illiquid'}
                  </button>
                </div>
                {Number(asset.current_value) > 0 && (
                  <div className={s.itemHelper}>{fmt(Number(asset.current_value))}</div>
                )}
              </div>
            ))}
            <button
              className={s.addItemBtn}
              onClick={() => setAssets(prev => [...prev, { asset_type_id: '', description: '', current_value: '', is_liquid: false, years_held: '' }])}
            >
              + Add asset
            </button>
            {assets.length > 0 && (
              <div className={s.sectionTotal}>
                Total: <strong>{fmt(metrics.totalAssets)}</strong>
                {' · '}Liquid: <strong style={{ color: 'var(--color-success)' }}>{fmt(metrics.liquidAssets)}</strong>
              </div>
            )}
          </div>
        )}

        {/* ── 03 Liabilities ───────────────────────────────────────── */}
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
                    <div className={s.loanInputWrap}>
                      <span className={s.loanCurrency}>₹</span>
                      <input className={s.loanInput} type="number" placeholder="0" value={liab.outstanding_amount}
                        onChange={e => setLiabs(prev => prev.map((l, j) => j === i ? { ...l, outstanding_amount: e.target.value } : l))} />
                    </div>
                  </div>
                  <div>
                    <label className={s.miniLabel}>Monthly EMI</label>
                    <div className={s.loanInputWrap}>
                      <span className={s.loanCurrency}>₹</span>
                      <input className={s.loanInput} type="number" placeholder="0" value={liab.monthly_emi}
                        onChange={e => setLiabs(prev => prev.map((l, j) => j === i ? { ...l, monthly_emi: e.target.value } : l))} />
                    </div>
                  </div>
                  <div>
                    <label className={s.miniLabel}>Interest Rate</label>
                    <div className={s.loanInputWrap}>
                      <input className={s.loanInput} type="number" placeholder="8.5" value={liab.interest_rate_pct}
                        onChange={e => setLiabs(prev => prev.map((l, j) => j === i ? { ...l, interest_rate_pct: e.target.value } : l))} />
                      <span className={s.loanSuffix}>%</span>
                    </div>
                  </div>
                </div>
                {Number(liab.outstanding_amount) > 0 && (
                  <div className={s.itemHelper}>{fmt(Number(liab.outstanding_amount))}</div>
                )}
              </div>
            ))}
            <button
              className={s.addItemBtn}
              onClick={() => setLiabs(prev => [...prev, { liability_type_id: '', description: '', outstanding_amount: '', monthly_emi: '', interest_rate_pct: '' }])}
            >
              + Add loan
            </button>
            {liabs.length > 0 && (
              <div className={s.sectionTotal}>
                Total: <strong>{fmt(metrics.totalLiabs)}</strong>
                {metrics.totalEmi > 0 && <> · EMI: <strong>{fmt(metrics.totalEmi)}</strong>/mo</>}
                {metrics.dti !== null && <> · DTI: <strong style={{ color: metrics.dti > 50 ? 'var(--color-danger)' : metrics.dti > 30 ? 'var(--color-warning)' : 'var(--color-success)' }}>{metrics.dti.toFixed(1)}%</strong></>}
              </div>
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

        {/* ── Navigation footer ────────────────────────────────────── */}
        <div className={s.navFooter}>
          <div className={s.navLeft}>
            {activeSection > 0 && (
              <VdfButton variant="ghost" onClick={() => setActiveSection(i => i - 1)}>← Back</VdfButton>
            )}
          </div>
          <span className={s.stepCounterNav}>
            <strong>{activeSection + 1}</strong> / 5
          </span>
          <div className={s.navRight}>
            <VdfButton variant="outline" loading={isSaving} onClick={handleDraft}>
              Save Draft
            </VdfButton>
            {activeSection < 4 ? (
              <VdfButton variant="primary" onClick={() => setActiveSection(i => i + 1)}>
                Continue →
              </VdfButton>
            ) : (
              <VdfButton variant="primary" loading={isSaving} onClick={handleSubmit}>
                Submit Snapshot
              </VdfButton>
            )}
          </div>
        </div>

        {/* ── Compact financial health strip ───────────────────────── */}
        {(metrics.monthlyIncome > 0 || metrics.totalAssets > 0) && (
          <div className={s.pulseStrip}>
            <div className={s.pulseStripItem}>
              <span className={s.pulseStripLabel}>Savings Rate</span>
              <span className={s.pulseStripValue} style={{ color: metrics.savingsRate !== null ? STATUS_COLOR[savingsStatus(metrics.savingsRate)] : undefined }}>
                {metrics.savingsRate !== null ? `${metrics.savingsRate.toFixed(0)}%` : <span className={s.pulseStripEmpty}>—</span>}
              </span>
            </div>
            <div className={s.pulseStripItem}>
              <span className={s.pulseStripLabel}>Net Worth</span>
              <span className={s.pulseStripValue}>
                {metrics.totalAssets > 0 ? fmt(metrics.netWorth) : <span className={s.pulseStripEmpty}>—</span>}
              </span>
            </div>
            <div className={s.pulseStripItem}>
              <span className={s.pulseStripLabel}>DTI</span>
              <span className={s.pulseStripValue} style={{ color: metrics.dti !== null ? STATUS_COLOR[dtiStatus(metrics.dti)] : undefined }}>
                {metrics.dti !== null ? `${metrics.dti.toFixed(0)}%` : <span className={s.pulseStripEmpty}>—</span>}
              </span>
            </div>
            <div className={s.pulseStripItem}>
              <span className={s.pulseStripLabel}>Liquidity</span>
              <span className={s.pulseStripValue} style={{ color: metrics.liquidityMonths !== null ? STATUS_COLOR[liquidityStatus(metrics.liquidityMonths)] : undefined }}>
                {metrics.liquidityMonths !== null ? `${metrics.liquidityMonths.toFixed(1)} mo` : <span className={s.pulseStripEmpty}>—</span>}
              </span>
            </div>
            <div className={s.pulseStripItem}>
              <span className={s.pulseStripLabel}>Protection</span>
              <span className={s.pulseStripValue} style={{ color: protRatio !== null ? STATUS_COLOR[protectionStatus(protRatio)] : undefined }}>
                {protRatio !== null ? `${protRatio.toFixed(1)}x` : <span className={s.pulseStripEmpty}>—</span>}
              </span>
            </div>
          </div>
        )}

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
    </div>
  );
}
