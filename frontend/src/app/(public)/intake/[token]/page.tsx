'use client';

/**
 * Public Intake Wizard — /intake/[token]
 *
 * Flow 1 (known_contact): MFD sent this link to a specific contact.
 *   - Name pre-filled, skip Step 0.
 *   - Steps: 01 Cash Flow → 02 Assets → 03 Liabilities → 04 Protection → 05 Goals
 *
 * Flow 2 (cold_lead): Generic MFD link (visiting card / QR code).
 *   - Step 0: capture name + mobile + email before the wizard.
 *   - Then Steps 01–05 as above.
 *
 * No JWT. Auth = the 64-char token in the URL.
 * Tenant brand colors injected via inline CSS vars from validate response.
 */

import { useState, useEffect, useCallback, Fragment, CSSProperties, type ReactNode } from 'react';
import { useParams } from 'next/navigation';
import { getTheme } from '@/config/theme';
import s from './intake.module.css';

// ── Types ──────────────────────────────────────────────────────────────────

interface AssetType    { id: number; code: string; label: string; is_liquid_default: boolean; }
interface LiabilityType { id: number; code: string; label: string; }

interface ValidateResponse {
  token_id:        number;
  flow:            'known_contact' | 'cold_lead';
  tenant:          { display_name: string; brand_color: string | null; theme_id: string | null };
  mfd_name:        string | null;
  expires_at:      string;
  contact_prefill: { prefix: string; name: string; mobile: string; email: string } | null;
  asset_types:     AssetType[];
  liability_types: LiabilityType[];
}

interface Income    { salary: string; partner: string; rental_other: string; }
interface Expenses  { housing: string; food: string; utilities: string; transport: string; education: string; lifestyle: string; }
interface AssetRow  { asset_type_id: string; description: string; current_value: string; is_liquid: boolean; years_held: string; }
interface LiabRow   { liability_type_id: string; description: string; outstanding_amount: string; monthly_emi: string; interest_rate_pct: string; }
interface Protection { life_cover_amount: string; health_cover_amount: string; ci_cover_amount: string; has_term_plan: boolean; has_health_cover: boolean; health_cover_type: 'individual' | 'family_floater' | 'employer' | 'none' | ''; }
interface GoalRow   { goal_type: string; name: string; target_amount: string; timeline_years: string; }

// ── Helpers ────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('NETWORK_ERROR');
  }
  const data = await res.json();
  if (!res.ok) {
    // In dev, expose the backend detail so we can see what's actually failing
    const detail = data?.error?.detail || '';
    const code   = data?.error?.code   || 'REQUEST_FAILED';
    throw new Error(detail ? `${code}: ${detail}` : code);
  }
  return data as T;
}

// Build inline CSS vars from tenant theme_id (light mode — warm client-facing context)
function buildThemeVars(themeId: string): CSSProperties {
  const theme = getTheme(themeId);
  const c = theme.colors; // always light mode for intake
  return {
    '--color-primary':   c.brand.primary,
    '--color-secondary': c.brand.secondary,
    '--color-fg':        c.utility.primaryText,
    '--color-muted':     c.utility.secondaryText,
    '--color-bg':        c.utility.primaryBackground,
    '--color-surface':   c.utility.secondaryBackground,
    '--color-success':   c.semantic.success,
    '--color-danger':    c.semantic.error,
    '--color-warning':   c.semantic.warning,
    '--color-border':    c.surface.glassBorder,
  } as CSSProperties;
}

function fmt(v: number): string {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`;
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`;
  if (v >= 1_000)       return `₹${(v / 1_000).toFixed(0)}K`;
  return `₹${v.toLocaleString('en-IN')}`;
}

const EXPENSE_LABELS: Record<keyof Expenses, string> = {
  housing: 'Housing / Rent', food: 'Groceries', utilities: 'Utilities',
  transport: 'Transport', education: 'Education', lifestyle: 'Lifestyle',
};

const GOAL_TYPES = ['retirement','education','house','wedding','emergency','vehicle','travel','custom'] as const;

const GOAL_ICONS: Record<string, string> = {
  retirement: '🌿', education: '🎓', house: '🏡', wedding: '💍',
  emergency: '🛡️', vehicle: '🚗', travel: '✈️', custom: '⭐',
};
const GOAL_LABELS: Record<string, string> = {
  retirement: 'Retirement', education: 'Education', house: 'Home / Property',
  wedding: 'Wedding', emergency: 'Emergency Fund', vehicle: 'Vehicle',
  travel: 'Travel', custom: 'Other',
};
const HORIZON_PRESETS = [3, 5, 7, 10, 15, 20, 25, 30];

const RISK_BARS: Record<'conservative' | 'moderate' | 'aggressive', number[]> = {
  conservative: [30, 35, 32, 38, 34],
  moderate:     [40, 65, 50, 72, 58],
  aggressive:   [30, 90, 45, 95, 60],
};
const RISK_BAR_COLORS: Record<'conservative' | 'moderate' | 'aggressive', string> = {
  conservative: '#4a7a8c',
  moderate:     '#c47e1a',
  aggressive:   '#b54034',
};
const RISK_TAGLINES: Record<'conservative' | 'moderate' | 'aggressive', string> = {
  conservative: 'Sleep well at night. Capital protection first.',
  moderate:     'Balanced growth. Some bumps are okay.',
  aggressive:   'Long horizon. Volatility is the price of growth.',
};
const RISK_RETURNS: Record<'conservative' | 'moderate' | 'aggressive', string> = {
  conservative: '7–9%', moderate: '10–13%', aggressive: '14–18%',
};

// ── Main Component ─────────────────────────────────────────────────────────

type Stage = 'loading' | 'server-error' | 'invalid' | 'welcome' | 'step0' | 'wizard' | 'done';

function initials(name: string | null): string {
  if (!name) return '?';
  return name.trim().split(/\s+/).map(w => w[0]?.toUpperCase() ?? '').filter(Boolean).slice(0, 2).join('');
}

// ── Pulse helpers (module-level) ──────────────────────────────────────────

function pulseBarState(
  metric: 'savings' | 'debt' | 'protection' | 'liquidity',
  val: number | null,
): 'empty' | 'low' | 'mid' | 'good' {
  if (val === null) return 'empty';
  if (metric === 'savings')    return val >= 30 ? 'good' : val >= 10 ? 'mid' : 'low';
  if (metric === 'debt')       return val <= 30 ? 'good' : val <= 50 ? 'mid' : 'low';
  if (metric === 'protection') return val >= 10 ? 'good' : val >= 5  ? 'mid' : 'low';
  return                              val >= 6  ? 'good' : val >= 3  ? 'mid' : 'low'; // liquidity
}

function pulseBarWidth(
  metric: 'savings' | 'debt' | 'protection' | 'liquidity' | 'future',
  val: number | null,
): number {
  if (val === null) return 0;
  if (metric === 'savings')    return Math.min(val * 2,    100);
  if (metric === 'debt')       return Math.max(0, 100 - val * 1.5);
  if (metric === 'protection') return Math.min(val * 7,    100);
  if (metric === 'liquidity')  return Math.min(val * 10,   100);
  return                              Math.min(val,        100); // future
}

function PulseMetric({ dotColor, label, value, hint, barPct, state }: {
  dotColor: string; label: string; value: string | null;
  hint: string; barPct: number; state: 'empty' | 'low' | 'mid' | 'good';
}) {
  const fillCls = state === 'good' ? s.pulseBarGood
                : state === 'mid'  ? s.pulseBarMid
                : state === 'low'  ? s.pulseBarLow
                :                   s.pulseBarEmpty;
  return (
    <div className={s.pulseMetric}>
      <div className={s.pulseMetricHead}>
        <span className={s.pulseMetricLabel}>
          <span className={s.pulseDot} style={{ background: dotColor }} />
          {label}
        </span>
        {value != null
          ? <span className={s.pulseValue}>{value}</span>
          : <span className={s.pulseValueEmpty}>—</span>}
      </div>
      <div className={s.pulseBar}>
        <div className={`${s.pulseBarFill} ${fillCls}`} style={{ width: `${barPct}%` }} />
      </div>
      <div className={s.pulseHint}>{hint}</div>
    </div>
  );
}

export default function IntakePage() {
  const { token } = useParams() as { token: string };

  const [stage,      setStage]      = useState<Stage>('loading');
  const [meta,       setMeta]       = useState<ValidateResponse | null>(null);
  const [error,      setError]      = useState('');
  const [initError,  setInitError]  = useState('');

  // Step 0 (Flow 2)
  const [leadName,   setLeadName]   = useState('');
  const [leadMobile, setLeadMobile] = useState('');
  const [leadEmail,  setLeadEmail]  = useState('');

  // Wizard state
  const [step,       setStep]       = useState(0); // 0=CashFlow, 1=Assets, 2=Liabs, 3=Protection, 4=Goals
  const [income,     setIncome]     = useState<Income>({ salary: '', partner: '', rental_other: '' });
  const [expenses,   setExpenses]   = useState<Expenses>({ housing: '', food: '', utilities: '', transport: '', education: '', lifestyle: '' });
  const [assets,     setAssets]     = useState<AssetRow[]>([]);
  const [liabs,      setLiabs]      = useState<LiabRow[]>([]);
  const [protection, setProtection] = useState<Protection>({ life_cover_amount: '', health_cover_amount: '', ci_cover_amount: '', has_term_plan: false, has_health_cover: false, health_cover_type: '' });
  const [goals,      setGoals]      = useState<GoalRow[]>([]);
  const [riskProfile, setRiskProfile] = useState('');
  const [notes,      setNotes]      = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ── Validate on mount ────────────────────────────────────────────────────

  useEffect(() => {
    if (!token) { setStage('invalid'); return; }
    post<ValidateResponse>('/api/v1/intake/validate', { token })
      .then(data => {
        setMeta(data);
        setStage('welcome');
      })
      .catch((err: Error) => {
        setInitError(err.message);
        if (err.message === 'NETWORK_ERROR' || err.message.startsWith('DB_UNAVAILABLE')) {
          setStage('server-error');
        } else {
          setStage('invalid');
        }
      });
  }, [token]);

  // ── Brand CSS variables (scoped to page wrapper — does not affect global theme) ──

  const brandStyle: CSSProperties = {
    // Full theme vars from tenant's chosen theme (light mode)
    ...(meta?.tenant.theme_id ? buildThemeVars(meta.tenant.theme_id) : {}),
    // Brand color overrides intake accent — takes priority over theme primary
    ...(meta?.tenant.brand_color ? {
      '--intake-primary':        meta.tenant.brand_color,
      '--intake-primary-soft':   `${meta.tenant.brand_color}18`,
      '--intake-primary-border': `${meta.tenant.brand_color}40`,
      '--color-primary':         meta.tenant.brand_color,
    } : {}),
  };

  // ── Derived metrics ──────────────────────────────────────────────────────

  const monthlyIncome   = Object.values(income).reduce((s, v) => s + (Number(v) || 0), 0);
  const monthlyExpenses = Object.values(expenses).reduce((s, v) => s + (Number(v) || 0), 0);
  const monthlySavings  = monthlyIncome - monthlyExpenses;

  // ── Build submit payload ─────────────────────────────────────────────────

  const buildPayload = useCallback(() => ({
    token,
    lead_name:   leadName   || undefined,
    lead_mobile: leadMobile || undefined,
    lead_email:  leadEmail  || undefined,
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
      description: a.description || undefined,
      current_value: Number(a.current_value),
      is_liquid: a.is_liquid,
      years_held: Number(a.years_held) > 0 ? Number(a.years_held) : undefined,
      sort_order: i + 1,
    })),
    liabilities: liabs.filter(l => l.liability_type_id && Number(l.outstanding_amount) > 0).map((l, i) => ({
      liability_type_id: Number(l.liability_type_id),
      description: l.description || undefined,
      outstanding_amount: Number(l.outstanding_amount),
      monthly_emi: Number(l.monthly_emi) || 0,
      interest_rate_pct: Number(l.interest_rate_pct) || undefined,
      sort_order: i + 1,
    })),
    protection: {
      life_cover_amount:   Number(protection.life_cover_amount)   || undefined,
      health_cover_amount: Number(protection.health_cover_amount) || undefined,
      ci_cover_amount:     Number(protection.ci_cover_amount)     || undefined,
      has_term_plan:       protection.has_term_plan,
      has_health_cover:    protection.has_health_cover,
      health_cover_type:   protection.health_cover_type || undefined,
    },
    goals: goals.filter(g => g.name && Number(g.target_amount) > 0).map((g, i) => ({
      goal_type: g.goal_type || 'custom',
      name: g.name,
      target_amount: Number(g.target_amount),
      timeline_years: Number(g.timeline_years) || 10,
      sort_order: i + 1,
    })),
  }), [token, leadName, leadMobile, leadEmail, riskProfile, notes, income, expenses, assets, liabs, protection, goals]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    setError('');
    try {
      await post('/api/v1/intake/submit', buildPayload() as unknown as Record<string, unknown>);
      setStage('done');
    } catch (e) {
      setError((e as Error).message || 'Submission failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── Render states ────────────────────────────────────────────────────────

  if (stage === 'loading') {
    return (
      <div className={s.centered}>
        <div className={s.spinner} />
        <p className={s.loadingText}>Loading your form…</p>
      </div>
    );
  }

  if (stage === 'server-error') {
    return (
      <div className={s.centered}>
        <div className={s.invalidIcon}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"/>
            <path d="M8 12h8M12 8v8"/>
          </svg>
        </div>
        <h2 className={s.invalidTitle}>Server unavailable</h2>
        <p className={s.invalidSub}>We couldn't reach the server. Please try again in a moment, or contact your advisor if the problem persists.</p>
        {initError && <pre style={{ fontSize: '0.7rem', color: 'var(--color-muted)', maxWidth: 480, textAlign: 'left', whiteSpace: 'pre-wrap', marginTop: 12 }}>{initError}</pre>}
      </div>
    );
  }

  if (stage === 'invalid' && initError && initError !== 'TOKEN_NOT_FOUND') {
    return (
      <div className={s.centered}>
        <div className={s.invalidIcon}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 className={s.invalidTitle}>Something went wrong</h2>
        <pre style={{ fontSize: '0.7rem', color: 'var(--color-muted)', maxWidth: 480, textAlign: 'left', whiteSpace: 'pre-wrap', marginTop: 8 }}>{initError}</pre>
      </div>
    );
  }

  if (stage === 'invalid') {
    return (
      <div className={s.centered}>
        <div className={s.invalidIcon}>
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
          </svg>
        </div>
        <h2 className={s.invalidTitle}>This link is no longer valid</h2>
        <p className={s.invalidSub}>It may have expired or already been used. Ask your advisor for a fresh link.</p>
      </div>
    );
  }

  // ── Welcome screen ──────────────────────────────────────────────────────

  if (stage === 'welcome' && meta) {
    const mfdName = meta.mfd_name || meta.tenant.display_name || 'your advisor';
    const contactFirstName = meta.contact_prefill?.name?.split(' ')[0] || null;
    const vaniGreeting = contactFirstName
      ? `"Hi ${contactFirstName} — I'll walk you through this. No jargon, no judgement. I'll even do some of the math for you along the way. Ready when you are."`
      : `"Hi — I'll walk you through this. No jargon, no judgement. I'll even do some of the math for you along the way. Ready when you are."`;
    const nextStage = meta.flow === 'known_contact' ? 'wizard' : 'step0';

    return (
      <div className={s.welcomeWrap} style={brandStyle}>
        <div className={s.welcomeCard}>

          {/* MFD sent-by pill */}
          <div className={s.mfdPill}>
            <div className={s.mfdInitials}>{initials(meta.mfd_name)}</div>
            <span className={s.mfdPillText}>Sent to you by <strong>{mfdName}</strong></span>
          </div>

          {/* Eyebrow */}
          <div className={s.welcomeEyebrow}>● Financial Snapshot</div>

          {/* Headline */}
          <h1 className={s.welcomeTitle}>
            {contactFirstName
              ? <>{contactFirstName}, let&rsquo;s see<br /><em>your whole picture.</em></>
              : <>Let&rsquo;s paint<br /><em>your money picture.</em></>
            }
          </h1>

          {/* Subtitle */}
          <p className={s.welcomeSub}>
            In about 10 minutes, you&rsquo;ll see your complete financial health in one view —
            net worth, savings rate, protection, and the gaps worth closing.
          </p>

          {/* Vani intro card */}
          <div className={s.vaniCard}>
            <div className={s.vaniCardHeader}>
              <div className={s.vaniAvatar}>V</div>
              <span className={s.vaniLabel}>Vani</span>
              <span className={s.vaniGuideTag}>Your Guide</span>
            </div>
            <p className={s.vaniMessage}>{vaniGreeting}</p>
          </div>

          {/* Trust signals */}
          <div className={s.trustList}>
            <div className={s.trustItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 2 4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-5z"/>
                <path d="m9 12 2 2 4-4"/>
              </svg>
              <span><strong>Your data is private.</strong> Only {meta.mfd_name || 'your advisor'} sees it — never shared, never sold.</span>
            </div>
            <div className={s.trustItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
              </svg>
              <span><strong>Takes ~10 minutes.</strong> Skip anything you&rsquo;re unsure about — fill what you can.</span>
            </div>
            <div className={s.trustItem}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M12 20V10M18 20V4M6 20v-4"/>
              </svg>
              <span><strong>You&rsquo;ll walk away with a snapshot.</strong> A clear summary of where you stand financially.</span>
            </div>
          </div>

          {/* CTA */}
          <button className={s.beginBtn} onClick={() => setStage(nextStage)}>
            Let&rsquo;s Begin
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>

        </div>
      </div>
    );
  }

  if (stage === 'done') {
    const n = (v: unknown) => Number(v) || 0;
    const firstName = (meta?.contact_prefill?.name || leadName || '').split(' ')[0] || 'You';
    const advisorName = meta?.mfd_name || meta?.tenant.display_name || 'your advisor';

    // ── Compute metrics ──────────────────────────────────────────────────
    const monthlyIncome   = n(income.salary) + n(income.partner) + n(income.rental_other);
    const monthlyExpenses = (Object.values(expenses) as string[]).reduce((s, v) => s + n(v), 0);
    const monthlySavings  = monthlyIncome - monthlyExpenses;
    const totalAssets     = assets.reduce((s, a) => s + n(a.current_value), 0);
    const liquidAssets    = assets.filter(a => a.is_liquid).reduce((s, a) => s + n(a.current_value), 0);
    const totalLiabs      = liabs.reduce((s, l) => s + n(l.outstanding_amount), 0);
    const totalEmi        = liabs.reduce((s, l) => s + n(l.monthly_emi), 0);
    const netWorth        = totalAssets - totalLiabs;
    const savingsRatePct  = monthlyIncome > 0 ? (monthlySavings / monthlyIncome) * 100 : 0;
    const dtiPct          = monthlyIncome > 0 ? (totalEmi / monthlyIncome) * 100 : 0;
    const liquidityMonths = monthlyExpenses > 0 ? liquidAssets / monthlyExpenses : 0;
    const lifeCover       = n(protection.life_cover_amount);
    const protTimes       = monthlyIncome > 0 && lifeCover > 0 ? lifeCover / (monthlyIncome * 12) : 0;

    // ── Format helpers ───────────────────────────────────────────────────
    const fmt = (v: number): string => {
      const abs = Math.abs(v);
      const sign = v < 0 ? '−' : '';
      if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(1)} Cr`;
      if (abs >= 1_00_000)    return `${sign}₹${(abs / 1_00_000).toFixed(1)} L`;
      if (abs >= 1_000)       return `${sign}₹${(abs / 1_000).toFixed(1)} K`;
      return `${sign}₹${abs.toFixed(0)}`;
    };
    const today = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    // ── Health scores (0–100) ────────────────────────────────────────────
    const savingsScore    = savingsRatePct >= 50 ? 95 : savingsRatePct >= 35 ? 80 : savingsRatePct >= 20 ? 60 : savingsRatePct >= 10 ? 35 : 15;
    const debtScore       = totalLiabs === 0 ? 92 : dtiPct <= 20 ? 82 : dtiPct <= 30 ? 70 : dtiPct <= 40 ? 55 : dtiPct <= 50 ? 35 : 15;
    const protScore       = protTimes >= 12 ? 95 : protTimes >= 8 ? 75 : protTimes >= 5 ? 50 : protTimes >= 3 ? 30 : 15;
    const liquidityScore  = liquidityMonths >= 12 ? 95 : liquidityMonths >= 6 ? 80 : liquidityMonths >= 3 ? 55 : liquidityMonths >= 1 ? 30 : 10;
    const futureScore     = goals.length >= 4 ? 95 : goals.length === 3 ? 80 : goals.length === 2 ? 60 : goals.length === 1 ? 35 : 10;

    const healthState = (score: number) => {
      if (score >= 80) return { label: 'Excellent', color: 'var(--ok)' };
      if (score >= 60) return { label: 'Good', color: 'var(--ok)' };
      if (score >= 40) return { label: 'Could improve', color: 'var(--warn-w)' };
      return { label: 'Action needed', color: 'var(--danger-w)' };
    };

    // SVG mini-ring: r=16, circ≈100.53
    const CIRC = 100.53;
    const ringFill = (score: number) => `${((score / 100) * CIRC).toFixed(1)} ${CIRC}`;

    // ── Vani observations ────────────────────────────────────────────────
    type Obs = { text: ReactNode };
    const observations: Obs[] = [];
    if (savingsScore >= 80) {
      observations.push({ text: <>Your savings rate of <em>{savingsRatePct.toFixed(0)}%</em> is genuinely exceptional. <strong>Whatever you&rsquo;re doing, keep doing it.</strong></> });
    } else if (savingsScore < 40) {
      observations.push({ text: <>Your savings rate of <em>{savingsRatePct.toFixed(0)}%</em> has room to grow. <strong>Ask {advisorName} about automating a monthly SIP.</strong></> });
    } else {
      observations.push({ text: <>You&rsquo;re saving <em>{savingsRatePct.toFixed(0)}%</em> of your income each month. A solid start — <strong>there&rsquo;s room to push it further.</strong></> });
    }
    if (protScore < 50) {
      observations.push({ text: <>Your life cover at <em>{protTimes > 0 ? `${protTimes.toFixed(1)}× annual income` : 'not captured'}</em> is the biggest gap I see. <strong>With dependents, most advisors recommend 10–15×. This is the single most important conversation to have.</strong></> });
    } else if (protScore >= 75) {
      observations.push({ text: <>Your protection cover of <em>{protTimes.toFixed(1)}× annual income</em> is strong. <strong>Your family has a solid safety net.</strong></> });
    }
    if (liquidityScore < 55) {
      observations.push({ text: <>Only <em>{liquidityMonths.toFixed(1)} months</em> of expenses are in liquid assets. <strong>Building a 6-month emergency buffer should be the first goal.</strong></> });
    } else if (liquidityScore >= 80) {
      observations.push({ text: <>With <em>{liquidityMonths.toFixed(1)} months</em> of liquid cover, your emergency cushion is healthy. <strong>Excess idle cash beyond 12 months could be put to work.</strong></> });
    }
    if (dtiPct > 40) {
      observations.push({ text: <>Your EMIs eat up <em>{dtiPct.toFixed(0)}%</em> of your income. <strong>That&rsquo;s a heavy load — a debt-reduction plan would free up significant cash flow.</strong></> });
    }
    if (goals.filter(g => g.name && n(g.target_amount) > 0).length > 0) {
      observations.push({ text: <>You&rsquo;ve captured <em>{goals.filter(g => g.name && n(g.target_amount) > 0).length} financial goals</em>. <strong>{advisorName} will now show you exactly how to fund each one.</strong></> });
    }
    const topObs = observations.slice(0, 3);

    // ── Asset donut segments ─────────────────────────────────────────────
    const DONUT_COLORS = ['#6b4e8a', '#0e5240', '#c47e1a', '#d97757', '#2e7d4f', '#4a6fa8', '#b54034', '#8b8575'];
    const CIRC_D = 238.76; // r=38
    const assetSegments = assets
      .filter(a => n(a.current_value) > 0)
      .map((a, i) => ({ label: a.description || 'Asset', value: n(a.current_value), color: DONUT_COLORS[i % DONUT_COLORS.length] }));
    let runningOffset = 0;
    const donutSegments = assetSegments.map(seg => {
      const pct = totalAssets > 0 ? seg.value / totalAssets : 0;
      const arc = pct * CIRC_D;
      const offset = -runningOffset;
      runningOffset += arc;
      return { ...seg, arc, offset, pct };
    });

    return (
      <div className={s.snapshotPage} style={brandStyle}>
        {/* ── Header ── */}
        <div className={s.snapshotHeader}>
          <div className={s.snapshotHeaderBrand}>{meta?.tenant.display_name}</div>
          {meta?.mfd_name && <div className={s.headerSub}>with {meta.mfd_name}</div>}
        </div>

        {/* ── Hero ── */}
        <div className={s.snapshotHero}>
          <div className={s.snapshotHeroInner}>
            <div className={s.snapshotEyebrow}>● Your Financial Snapshot</div>
            <h1 className={s.snapshotHeadline}>
              {firstName}, here&rsquo;s<br/><em>your whole picture.</em>
            </h1>
            <p className={s.snapshotHeroSub}>
              Shared with {advisorName}. They&rsquo;ll use this as the starting point for your first real money conversation.
            </p>
            <div className={s.snapshotHeroMeta}>
              <div className={s.heroMetaItem}>Generated<strong>{today}</strong></div>
              <div className={s.heroMetaItem}>Advisor<strong>{advisorName}</strong></div>
            </div>
          </div>
        </div>

        {/* ── Body ── */}
        <div className={s.snapshotBody}>

          {/* Net worth */}
          <div className={s.networthCard}>
            <div className={s.networthLabel}>Your net worth</div>
            <div className={s.networthValue}>
              <span className={s.networthCurrency}>₹</span>
              <span className={s.networthAmount}>{fmt(netWorth).replace('₹', '').replace('−₹', '')}</span>
              {netWorth < 0 && <span style={{ fontSize: 18, color: 'var(--danger-w)', alignSelf: 'flex-end', marginBottom: 6 }}>deficit</span>}
            </div>
            <div className={s.networthBreakdown}>
              <div className={s.breakdownItem}>
                <div className={s.breakdownLabel}>Total Assets</div>
                <div className={`${s.breakdownValue} ${s.plus}`}>+ {fmt(totalAssets)}</div>
              </div>
              <div className={s.breakdownItem}>
                <div className={s.breakdownLabel}>Total Liabilities</div>
                <div className={`${s.breakdownValue} ${s.minus}`}>− {fmt(totalLiabs)}</div>
              </div>
              <div className={s.breakdownItem}>
                <div className={s.breakdownLabel}>Monthly Savings</div>
                <div className={`${s.breakdownValue} ${s.savings}`}>{fmt(monthlySavings)}</div>
              </div>
            </div>
          </div>

          {/* Vani observations */}
          {topObs.length > 0 && (
            <div className={s.vaniObsCard}>
              <div className={s.vaniObsHeader}>
                <div className={s.vaniObsAvatar}>V</div>
                <div>
                  <div className={s.vaniObsName}>Vani&rsquo;s take</div>
                  <div className={s.vaniObsTag}>{topObs.length} things worth knowing</div>
                </div>
              </div>
              <div className={s.vaniObsList}>
                {topObs.map((obs, i) => (
                  <div key={i} className={s.vaniObsItem}>
                    <div className={s.vaniObsNum}>{String(i + 1).padStart(2, '0')}</div>
                    <div className={s.vaniObsText}>{obs.text}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Asset allocation + Health rings */}
          <div className={s.snapGrid}>
            <div className={s.snapCard}>
              <div className={s.snapCardTitle}>Where your money lives</div>
              <div className={s.snapCardSub}>Asset allocation</div>
              {totalAssets > 0 ? (
                <div className={s.donutWrap}>
                  <svg className={s.donutSvg} viewBox="0 0 100 100">
                    <circle cx="50" cy="50" r="38" fill="none" stroke="var(--line-w)" strokeWidth="14"/>
                    {donutSegments.map((seg, i) => (
                      <circle key={i} cx="50" cy="50" r="38" fill="none"
                        stroke={seg.color} strokeWidth="14"
                        strokeDasharray={`${seg.arc.toFixed(1)} ${CIRC_D}`}
                        strokeDashoffset={seg.offset.toFixed(1)}
                        transform="rotate(-90 50 50)"
                      />
                    ))}
                    <text x="50" y="46" textAnchor="middle" className={s.donutCenterLabel}>Total</text>
                    <text x="50" y="58" textAnchor="middle" className={s.donutCenterValue}>{fmt(totalAssets)}</text>
                  </svg>
                  <div className={s.donutLegend}>
                    {donutSegments.map((seg, i) => (
                      <div key={i} className={s.legendRow}>
                        <div className={s.legendSwatch} style={{ background: seg.color }}/>
                        <div className={s.legendLabel}>{seg.label.length > 16 ? seg.label.slice(0, 15) + '…' : seg.label}</div>
                        <div className={s.legendPct}>{(seg.pct * 100).toFixed(0)}%</div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className={s.noGoals}>No assets entered.</div>
              )}
            </div>

            <div className={s.snapCard}>
              <div className={s.snapCardTitle}>Health rings</div>
              <div className={s.snapCardSub}>Your 5 vital signs</div>
              <div className={s.healthRings}>
                {([
                  { label: 'Savings Rate', score: savingsScore },
                  { label: 'Debt Load',    score: debtScore },
                  { label: 'Protection',   score: protScore },
                  { label: 'Liquidity',    score: liquidityScore },
                  { label: 'Future Focus', score: futureScore },
                ] as { label: string; score: number }[]).map(({ label, score }) => {
                  const hs = healthState(score);
                  return (
                    <div key={label} className={s.healthRingRow}>
                      <div className={s.miniRing}>
                        <svg viewBox="0 0 40 40">
                          <circle className={s.miniRingBg} cx="20" cy="20" r="16"/>
                          <circle className={s.miniRingFill} cx="20" cy="20" r="16"
                            stroke={hs.color}
                            strokeDasharray={ringFill(score)}
                            transform="rotate(-90 20 20)"
                          />
                        </svg>
                        <div className={s.miniRingText}>{score}</div>
                      </div>
                      <div>
                        <div className={s.healthRingLabel}>{label}</div>
                        <div className={s.healthRingState} style={{ color: hs.color }}>● {hs.label}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Cash flow + Goals */}
          <div className={s.snapGrid}>
            <div className={s.snapCard}>
              <div className={s.snapCardTitle}>Your monthly rhythm</div>
              <div className={s.snapCardSub}>How the money moves</div>
              {monthlyIncome > 0 ? (
                <>
                  <div className={s.cashflowBars}>
                    {([
                      { label: 'Income',   value: monthlyIncome,   color: 'var(--jade)',    pct: 100 },
                      { label: 'Expenses', value: monthlyExpenses,  color: 'var(--warn-w)', pct: monthlyIncome > 0 ? (monthlyExpenses / monthlyIncome) * 100 : 0 },
                      { label: 'Savings',  value: monthlySavings,   color: 'var(--coral)',  pct: monthlyIncome > 0 ? Math.max(0, (monthlySavings / monthlyIncome) * 100) : 0 },
                    ] as { label: string; value: number; color: string; pct: number }[]).map(row => (
                      <div key={row.label} className={s.cfRow}>
                        <div className={s.cfLabel} style={{ color: row.color }}>{row.label}</div>
                        <div className={s.cfTrack}>
                          <div className={s.cfFill} style={{ width: `${row.pct}%`, background: row.color }}/>
                        </div>
                        <div className={s.cfAmount}>{fmt(row.value)}</div>
                      </div>
                    ))}
                  </div>
                  {savingsRatePct > 0 && (
                    <div className={s.cfNote}>
                      You&rsquo;re keeping <strong>{savingsRatePct.toFixed(0)}% of every rupee</strong> that comes in.
                      {savingsRatePct >= 35 ? ' That\'s in the top quartile.' : savingsRatePct >= 20 ? ' A healthy cushion.' : ' There\'s room to grow.'}
                    </div>
                  )}
                </>
              ) : (
                <div className={s.noGoals}>No income data entered.</div>
              )}
            </div>

            <div className={s.snapCard}>
              <div className={s.snapCardTitle}>Your dreams, on a timeline</div>
              <div className={s.snapCardSub}>What you&rsquo;re saving towards</div>
              {goals.filter(g => g.name && n(g.target_amount) > 0).length > 0 ? (
                <div className={s.goalsTimeline}>
                  {goals.filter(g => g.name && n(g.target_amount) > 0).map((g, i) => {
                    const yr = n(g.timeline_years) || 10;
                    const targetYear = new Date().getFullYear() + yr;
                    return (
                      <div key={i} className={s.goalItem}>
                        <div className={s.goalItemHead}>
                          <div className={s.goalItemName}>{g.name}</div>
                          <div className={s.goalItemAmount}>{fmt(n(g.target_amount))}</div>
                        </div>
                        <div className={s.goalItemMeta}>In {yr} year{yr !== 1 ? 's' : ''} · by {targetYear}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className={s.noGoals}>No goals captured yet. Ask {advisorName} to help you set your first goal.</div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className={s.snapshotActions}>
            <button className={`${s.snapActionBtn} ${s.snapActionBtnGhost}`} onClick={() => window.print()}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              Save / Print
            </button>
          </div>

        </div>
      </div>
    );
  }

  const assetTypes   = meta?.asset_types     ?? [];
  const liabTypes    = meta?.liability_types ?? [];

  // ── Step 0: Lead capture (Flow 2 only) ──────────────────────────────────

  if (stage === 'step0') {
    return (
      <div className={s.page} style={brandStyle}>
        <div className={s.header}>
          <div className={s.headerBrand}>{meta?.tenant.display_name}</div>
          {meta?.mfd_name && <div className={s.headerSub}>with {meta.mfd_name}</div>}
        </div>

        <div className={s.card}>
          <div className={s.stepLabel}>Let's start</div>
          <h1 className={s.stepTitle}>Who are we speaking with?</h1>
          <p className={s.stepSub}>A few quick details before we begin your financial snapshot.</p>

          <div className={s.formGroup}>
            <label className={s.label}>Your full name <span className={s.req}>*</span></label>
            <input
              className={s.input}
              type="text"
              placeholder="e.g. Rahul Sharma"
              value={leadName}
              onChange={e => setLeadName(e.target.value)}
              autoFocus
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Mobile number</label>
            <input
              className={s.input}
              type="tel"
              inputMode="numeric"
              placeholder="10-digit mobile"
              value={leadMobile}
              onChange={e => setLeadMobile(e.target.value)}
            />
          </div>
          <div className={s.formGroup}>
            <label className={s.label}>Email address</label>
            <input
              className={s.input}
              type="email"
              placeholder="you@email.com"
              value={leadEmail}
              onChange={e => setLeadEmail(e.target.value)}
            />
          </div>
        </div>

        <div className={s.navBar}>
          <div />
          <button
            className={s.primaryBtn}
            disabled={!leadName.trim()}
            onClick={() => setStage('wizard')}
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  // ── Wizard Steps 01–05 ───────────────────────────────────────────────────

  // Pulse sidebar — derived metrics from current form state
  const pulseAssets  = assets.reduce((sum, a) => sum + (Number(a.current_value) || 0), 0);
  const pulseLiquid  = assets.filter(a => a.is_liquid).reduce((sum, a) => sum + (Number(a.current_value) || 0), 0);
  const pulseEmi     = liabs.reduce((sum, l) => sum + (Number(l.monthly_emi) || 0), 0);
  const pulseCover   = Number(protection.life_cover_amount) || 0;
  const pulseGoals   = goals.reduce((sum, g) => sum + (Number(g.target_amount) || 0), 0);

  const savingsRate   = monthlyIncome > 0 ? Math.round((monthlySavings / monthlyIncome) * 100) : null;
  const debtLoadPct   = monthlyIncome > 0 && pulseEmi > 0 ? Math.round((pulseEmi / monthlyIncome) * 100) : null;
  const protectionX   = monthlyIncome > 0 && pulseCover > 0 ? parseFloat((pulseCover / (monthlyIncome * 12)).toFixed(1)) : null;
  const liquidityMths = monthlyExpenses > 0 && pulseLiquid > 0 ? parseFloat((pulseLiquid / monthlyExpenses).toFixed(1)) : null;
  const futurePct     = pulseAssets > 0 && pulseGoals > 0 ? Math.round((pulseGoals / pulseAssets) * 100) : null;

  // Asset Vani metrics
  const assetLiquidPct  = pulseAssets > 0 ? Math.round((pulseLiquid / pulseAssets) * 100) : 0;
  const largestAsset    = assets.reduce<AssetRow | null>((max, a) =>
    Number(a.current_value) > Number(max?.current_value ?? 0) ? a : max, null);
  const largestAssetPct = largestAsset && pulseAssets > 0
    ? Math.round((Number(largestAsset.current_value) / pulseAssets) * 100) : 0;

  // Liability Vani metrics
  const totalLiabs   = liabs.reduce((sum, l) => sum + (Number(l.outstanding_amount) || 0), 0);
  const largestLiab  = liabs.reduce<LiabRow | null>((max, l) =>
    Number(l.outstanding_amount) > Number(max?.outstanding_amount ?? 0) ? l : max, null);
  const largestLiabPct = largestLiab && totalLiabs > 0
    ? Math.round((Number(largestLiab.outstanding_amount) / totalLiabs) * 100) : 0;

  const STEPS = [
    { num: '01', label: 'Cash Flow' },
    { num: '02', label: 'Assets'    },
    { num: '03', label: 'Liabilities' },
    { num: '04', label: 'Protection' },
    { num: '05', label: 'Goals'     },
  ];

  const displayName = meta?.contact_prefill?.name
    ? `${meta.contact_prefill.prefix} ${meta.contact_prefill.name}`.trim()
    : leadName || 'there';

  return (
    <div className={s.page} style={brandStyle}>

      {/* ── Header ── */}
      <div className={s.header}>
        <div className={s.headerBrand}>{meta?.tenant.display_name}</div>
        {meta?.mfd_name && <div className={s.headerSub}>with {meta.mfd_name}</div>}
      </div>

      {/* ── Stepper nav ── */}
      <div className={s.stepperNav}>
        <div className={s.stepper}>
          {STEPS.map((st, i) => (
            <Fragment key={i}>
              {i > 0 && (
                <div className={`${s.stepConnector} ${i <= step ? s.stepConnectorDone : ''}`} />
              )}
              <div className={`${s.stepItem} ${i < step ? s.stepDone : i === step ? s.stepActive : ''}`}>
                <div className={s.stepBullet}>
                  {i < step
                    ? <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 12l5 5L19 7"/></svg>
                    : <span>{i + 1}</span>}
                </div>
                <span className={s.stepLabel}>{st.label}</span>
              </div>
            </Fragment>
          ))}
        </div>
      </div>

      {/* ── 2-col layout: form + pulse sidebar ── */}
      <div className={s.wizardLayout}>
      <div className={s.formCol}>

      {/* ════════════════════════════════════════════════════
          01 — Cash Flow
          ════════════════════════════════════════════════════ */}
      {step === 0 && (
        <div className={s.stepBody}>
          <div className={s.sectionHead}>
            <div className={s.sectionNum}>Section 01 / 05 · Cash Flow</div>
            <h2 className={s.sectionTitle}>What comes in,<br /><em>what goes out.</em></h2>
            <p className={s.sectionSub}>Your monthly rhythm. This is the single most important thing — it tells us how much you can actually save.</p>
          </div>

          {/* Monthly Income */}
          <div className={s.subBlock}>
            <div className={s.cfSubTitle}>Money coming in</div>
            <p className={s.cfSubHint}>Take-home (after tax) monthly income from all sources.</p>

            {/* Salary — hero full-width */}
            <div className={s.curField} style={{ marginBottom: 14 }}>
              <label className={s.curFieldLabel}>Your take-home salary</label>
              <div className={s.curInputWrapLg}>
                <span className={s.curSymLg}>₹</span>
                <input className={s.curValLg} type="number" inputMode="numeric"
                  placeholder="0" value={income.salary}
                  onChange={e => setIncome(p => ({ ...p, salary: e.target.value }))} />
                <span className={s.curSuffix}>/ mo</span>
              </div>
              {Number(income.salary) > 0 && <span className={s.curHint}>{fmt(Number(income.salary))}</span>}
            </div>

            {/* Partner + Other — 2-col secondary */}
            <div className={s.incomeRow2}>
              <div className={s.curField}>
                <label className={s.curFieldLabel}>Partner&apos;s income <span className={s.curOptTag}>optional</span></label>
                <div className={s.curInputWrapMd}>
                  <span className={s.curSymMd}>₹</span>
                  <input className={s.curValMd} type="number" inputMode="numeric"
                    placeholder="0" value={income.partner}
                    onChange={e => setIncome(p => ({ ...p, partner: e.target.value }))} />
                </div>
                {Number(income.partner) > 0 && <span className={s.curHint}>{fmt(Number(income.partner))}</span>}
              </div>
              <div className={s.curField}>
                <label className={s.curFieldLabel}>Other (rent, business) <span className={s.curOptTag}>optional</span></label>
                <div className={s.curInputWrapMd}>
                  <span className={s.curSymMd}>₹</span>
                  <input className={s.curValMd} type="number" inputMode="numeric"
                    placeholder="0" value={income.rental_other}
                    onChange={e => setIncome(p => ({ ...p, rental_other: e.target.value }))} />
                </div>
                {Number(income.rental_other) > 0 && <span className={s.curHint}>{fmt(Number(income.rental_other))}</span>}
              </div>
            </div>
          </div>

          {/* Monthly Expenses — 3-col grid */}
          <div className={s.subBlock}>
            <div className={s.cfSubTitle}>Money going out</div>
            <p className={s.cfSubHint}>Monthly spending — <em>excluding EMIs</em>. We&apos;ll cover loans separately.</p>
            <div className={s.expenseGrid}>
              {(Object.keys(EXPENSE_LABELS) as Array<keyof Expenses>).map(key => (
                <div key={key} className={s.curField}>
                  <label className={s.curFieldLabel}>{EXPENSE_LABELS[key]}</label>
                  <div className={s.curInputWrap}>
                    <span className={s.curSym}>₹</span>
                    <input className={s.curVal} type="number" inputMode="numeric"
                      placeholder="0" value={expenses[key]}
                      onChange={e => setExpenses(p => ({ ...p, [key]: e.target.value }))} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Savings summary */}
          {monthlyIncome > 0 && monthlyExpenses > 0 && (
            <div className={s.savingsRow}>
              <span className={s.savingsRowLabel}>Monthly savings</span>
              <span className={s.savingsRowValue}
                style={{ color: monthlySavings >= 0 ? 'var(--ok, #2e7d4f)' : 'var(--danger-w, #b54034)' }}>
                {monthlySavings >= 0 ? '+' : ''}{fmt(monthlySavings)}
                {monthlyIncome > 0 && ` · ${Math.round((monthlySavings / monthlyIncome) * 100)}%`}
              </span>
            </div>
          )}

          {/* Vani copilot */}
          {monthlyIncome > 0 && (
            <div className={s.vaniCopilot}>
              <div className={s.vaniCopilotMarker}>
                <div className={s.vaniCopilotAvatar}>V</div>
                <span className={s.vaniCopilotName}>Vani</span>
              </div>
              <p className={s.vaniCopilotText}>
                {monthlyIncome > 0 && monthlyExpenses > 0
                  ? `${fmt(monthlyIncome)}/mo income · ${fmt(monthlyExpenses)}/mo expenses · Savings ${Math.round((monthlySavings / monthlyIncome) * 100)}% of income. ${monthlySavings >= 0 ? `Savings capacity ≈ ${fmt(monthlySavings * 12)}/yr.` : 'Expenses exceed income — review discretionary spending.'}`
                  : `Income at ${fmt(monthlyIncome)}/mo. Add expenses to compute your savings rate.`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          02 — Assets
          ════════════════════════════════════════════════════ */}
      {step === 1 && (
        <div className={s.stepBody}>
          <div className={s.sectionHead}>
            <div className={s.sectionNum}>Section 02 / 05 · Assets</div>
            <h2 className={s.sectionTitle}>Your assets,<br /><em>big and small.</em></h2>
            <p className={s.sectionSub}>Investments, savings, property, gold — anything with value. Rough estimates are fine.</p>
          </div>

          <div className={s.itemList}>
            {assets.map((asset, i) => (
              <div key={i} className={s.assetCard}>
                {/* Header */}
                <div className={s.assetCardHead}>
                  <span className={s.assetCardNum}>ASSET {String(i + 1).padStart(2, '0')}</span>
                  <button className={s.assetCardRemove}
                    onClick={() => setAssets(p => p.filter((_, j) => j !== i))}>×</button>
                </div>

                {/* Row 1: Asset Type select + Liquidity toggle */}
                <div className={s.assetTypeRow}>
                  <div className={s.curField}>
                    <label className={s.curFieldLabel}>Asset Type</label>
                    <select className={s.plainSelect} value={asset.asset_type_id}
                      onChange={e => {
                        const t = meta.asset_types.find(t => String(t.id) === e.target.value);
                        setAssets(p => p.map((a, j) => j === i ? {
                          ...a,
                          asset_type_id: e.target.value,
                          is_liquid: t?.is_liquid_default ?? a.is_liquid,
                        } : a));
                      }}>
                      <option value="">Select type</option>
                      {meta.asset_types.map(t => (
                        <option key={t.id} value={String(t.id)}>{t.label}</option>
                      ))}
                    </select>
                  </div>
                  <div className={s.curField}>
                    <label className={s.curFieldLabel}>Liquidity</label>
                    <div className={s.liqToggle}>
                      <button type="button"
                        className={`${s.liqBtn} ${asset.is_liquid ? s.liqBtnActive : ''}`}
                        onClick={() => setAssets(p => p.map((a, j) => j === i ? { ...a, is_liquid: true } : a))}>
                        💧 Liquid
                      </button>
                      <button type="button"
                        className={`${s.liqBtn} ${!asset.is_liquid ? s.liqBtnIlliq : ''}`}
                        onClick={() => setAssets(p => p.map((a, j) => j === i ? { ...a, is_liquid: false } : a))}>
                        🔒 Illiq
                      </button>
                    </div>
                  </div>
                </div>

                {/* Row 2: Description | Current Value | Yrs Held */}
                <div className={s.assetRow2}>
                  <div className={s.curField}>
                    <label className={s.curFieldLabel}>Description</label>
                    <input className={s.plainInput} type="text"
                      placeholder="e.g. SBI Equity Fund, 2BHK Flat, FD"
                      value={asset.description}
                      onChange={e => setAssets(p => p.map((a, j) => j === i ? { ...a, description: e.target.value } : a))} />
                  </div>
                  <div className={s.curField}>
                    <label className={s.curFieldLabel}>Current Value</label>
                    <div className={s.curInputWrap}>
                      <span className={s.curSym}>₹</span>
                      <input className={s.curVal} type="number" inputMode="numeric" placeholder="0"
                        value={asset.current_value}
                        onChange={e => setAssets(p => p.map((a, j) => j === i ? { ...a, current_value: e.target.value } : a))} />
                    </div>
                    {Number(asset.current_value) > 0 && (
                      <span className={s.curHint}>{fmt(Number(asset.current_value))}</span>
                    )}
                  </div>
                  <div className={s.curField}>
                    <label className={s.curFieldLabel}>Yrs Held</label>
                    <input className={s.plainInput} type="number" inputMode="numeric" placeholder="—"
                      min="0" max="99"
                      value={asset.years_held ?? ''}
                      onChange={e => setAssets(p => p.map((a, j) => j === i ? { ...a, years_held: e.target.value } : a))} />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button className={s.addItemBtn}
            onClick={() => setAssets(p => [...p, { asset_type_id: '', description: '', current_value: '', is_liquid: true, years_held: '' }])}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M10 4v12M4 10h12" />
            </svg>
            Add asset
          </button>

          {/* Vani copilot — appears once first asset has a value */}
          {pulseAssets > 0 && (
            <div className={s.vaniCopilot}>
              <div className={s.vaniCopilotMarker}>
                <div className={s.vaniCopilotAvatar}>V</div>
                <span className={s.vaniCopilotName}>Vani</span>
              </div>
              <p className={s.vaniCopilotText}>
                <span className={s.vaniHi}>{fmt(pulseAssets)} total</span>
                {' · '}
                <span className={assetLiquidPct >= 30 ? s.vaniOk : assetLiquidPct >= 15 ? s.vaniWarn : s.vaniBad}>
                  Liquid {assetLiquidPct}%
                </span>
                {' · '}
                <span>Illiquid {100 - assetLiquidPct}%</span>
                {largestAsset && largestAssetPct > 0 && (
                  <>
                    {' · '}
                    <span className={s.vaniHi}>{largestAsset.description || 'Top asset'}</span>
                    {' = '}
                    <span className={largestAssetPct > 50 ? s.vaniBad : largestAssetPct > 35 ? s.vaniWarn : s.vaniOk}>
                      {largestAssetPct}% of total
                    </span>
                    {largestAssetPct > 50 && <> · <span className={s.vaniWarn}>High concentration risk.</span></>}
                  </>
                )}
                {liquidityMths !== null && (
                  <>
                    {' · '}
                    <span className={liquidityMths >= 6 ? s.vaniOk : liquidityMths >= 3 ? s.vaniWarn : s.vaniBad}>
                      {liquidityMths.toFixed(1)} mo emergency runway
                    </span>
                    {liquidityMths < 3 && <> · <span className={s.vaniBad}>Below 3-month threshold.</span></>}
                  </>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          03 — Liabilities
          ════════════════════════════════════════════════════ */}
      {step === 2 && (
        <div className={s.stepBody}>
          <div className={s.sectionHead}>
            <div className={s.sectionNum}>Section 03 / 05 · What you owe</div>
            <h2 className={s.sectionTitle}>Loans<br /><em>and liabilities.</em></h2>
            <p className={s.sectionSub}>Home loan, car loan, personal loan, credit card debt — anything you owe. If you&apos;re debt-free, just skip.</p>
          </div>

          {liabs.length === 0 ? (
            <div className={s.itemEmptyState}>
              Home loan, car loan, personal loan, credit card — list every outstanding debt
            </div>
          ) : (
            <div className={s.itemList}>
              {liabs.map((liab, i) => (
                <div key={i} className={s.assetCard}>
                  <div className={s.assetCardHead}>
                    <span className={s.assetCardNum}>LOAN_{String(i + 1).padStart(2, '0')}</span>
                    <button className={s.assetCardRemove}
                      onClick={() => setLiabs(p => p.filter((_, j) => j !== i))}>×</button>
                  </div>

                  {/* Loan Type — full width */}
                  <div className={s.curField}>
                    <label className={s.curFieldLabel}>Loan Type</label>
                    <select className={s.plainSelect} value={liab.liability_type_id}
                      onChange={e => setLiabs(p => p.map((l, j) => j === i ? { ...l, liability_type_id: e.target.value } : l))}>
                      <option value="">Select type</option>
                      {liabTypes.map(t => (
                        <option key={t.id} value={String(t.id)}>{t.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* Description + Outstanding + EMI + Rate */}
                  <div className={s.loanRow2}>
                    <div className={s.curField}>
                      <label className={s.curFieldLabel}>Description</label>
                      <input className={s.plainInput} type="text"
                        placeholder="e.g. SBI Home Loan"
                        value={liab.description}
                        onChange={e => setLiabs(p => p.map((l, j) => j === i ? { ...l, description: e.target.value } : l))} />
                    </div>
                    <div className={s.curField}>
                      <label className={s.curFieldLabel}>Outstanding</label>
                      <div className={s.curInputWrap}>
                        <span className={s.curSym}>₹</span>
                        <input className={s.curVal} type="number" inputMode="numeric" placeholder="0"
                          value={liab.outstanding_amount}
                          onChange={e => setLiabs(p => p.map((l, j) => j === i ? { ...l, outstanding_amount: e.target.value } : l))} />
                      </div>
                      {Number(liab.outstanding_amount) > 0 && <span className={s.curHint}>{fmt(Number(liab.outstanding_amount))}</span>}
                    </div>
                    <div className={s.curField}>
                      <label className={s.curFieldLabel}>EMI /mo</label>
                      <div className={s.curInputWrap}>
                        <span className={s.curSym}>₹</span>
                        <input className={s.curVal} type="number" inputMode="numeric" placeholder="0"
                          value={liab.monthly_emi}
                          onChange={e => setLiabs(p => p.map((l, j) => j === i ? { ...l, monthly_emi: e.target.value } : l))} />
                      </div>
                    </div>
                    <div className={s.curField}>
                      <label className={s.curFieldLabel}>Rate %</label>
                      <input className={s.plainInput} type="number" inputMode="decimal" placeholder="8.5"
                        value={liab.interest_rate_pct}
                        onChange={e => setLiabs(p => p.map((l, j) => j === i ? { ...l, interest_rate_pct: e.target.value } : l))} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className={s.addItemBtn}
            onClick={() => setLiabs(p => [...p, { liability_type_id: '', description: '', outstanding_amount: '', monthly_emi: '', interest_rate_pct: '' }])}>
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
              <path d="M10 4v12M4 10h12" />
            </svg>
            Add loan
          </button>

          {totalLiabs > 0 && (
            <div className={s.vaniCopilot}>
              <div className={s.vaniCopilotMarker}>
                <div className={s.vaniCopilotAvatar}>V</div>
                <span className={s.vaniCopilotName}>Vani</span>
              </div>
              <p className={s.vaniCopilotText}>
                <span className={s.vaniHi}>{fmt(totalLiabs)} total debt</span>
                {pulseEmi > 0 && <> · <span className={s.vaniHi}>{fmt(pulseEmi)}/mo EMI</span></>}
                {debtLoadPct !== null && (
                  <> · DTI{' '}
                  <span className={debtLoadPct <= 30 ? s.vaniOk : debtLoadPct <= 50 ? s.vaniWarn : s.vaniBad}>
                    {debtLoadPct}%{debtLoadPct <= 30 ? ' — healthy' : debtLoadPct <= 50 ? ' — elevated' : ' — high'}
                  </span></>
                )}
                {largestLiab && largestLiabPct > 0 && (
                  <> · <span className={s.vaniHi}>{largestLiab.description || 'Top loan'}</span>{' = '}
                  <span className={largestLiabPct > 60 ? s.vaniWarn : s.vaniHi}>{largestLiabPct}% of total</span></>
                )}
                {debtLoadPct !== null && debtLoadPct > 50 && (
                  <><br /><span className={s.vaniBad}>DTI above 50% — debt repayment is constraining savings capacity.</span></>
                )}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          04 — Protection
          ════════════════════════════════════════════════════ */}
      {step === 3 && (
        <div className={s.stepBody}>
          <div className={s.sectionHead}>
            <div className={s.sectionNum}>Section 04 / 05 · Protection</div>
            <h2 className={s.sectionTitle}>Safety nets<br /><em>for your family.</em></h2>
            <p className={s.sectionSub}>Life and health insurance. This is often the most-skipped step — but it&apos;s the difference between a setback and a disaster.</p>
          </div>

          {/* Life Insurance */}
          <div className={s.subBlock}>
            <div className={s.subHead}>Life Insurance</div>
            <div className={s.protField}>
              <label className={s.curFieldLabel}>Active term / life policy?</label>
              <div className={s.optCards2}>
                <button type="button"
                  className={`${s.optCard} ${protection.has_term_plan ? s.optCardSelected : ''}`}
                  onClick={() => setProtection(p => ({ ...p, has_term_plan: true }))}>
                  <svg className={s.optCardIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2 4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-5z"/><path d="m9 12 2 2 4-4"/>
                  </svg>
                  <div>
                    <div className={s.optCardLabel}>Yes</div>
                    <div className={s.optCardSub}>Has coverage</div>
                  </div>
                </button>
                <button type="button"
                  className={`${s.optCard} ${!protection.has_term_plan ? s.optCardSelected : ''}`}
                  onClick={() => setProtection(p => ({ ...p, has_term_plan: false }))}>
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
            <div className={s.protFieldRow2}>
              <div className={s.curField}>
                <label className={s.curFieldLabel}>Sum Assured</label>
                <div className={s.curInputWrap}>
                  <span className={s.curSym}>₹</span>
                  <input className={s.curVal} type="number" inputMode="numeric" placeholder="0"
                    value={protection.life_cover_amount}
                    onChange={e => setProtection(p => ({ ...p, life_cover_amount: e.target.value }))} />
                </div>
                {Number(protection.life_cover_amount) > 0 && (
                  <span className={s.curHint}>{fmt(Number(protection.life_cover_amount))}</span>
                )}
              </div>
              {protectionX !== null && (
                <div className={s.curField}>
                  <label className={s.curFieldLabel}>Cover Ratio</label>
                  <div className={s.protRatioBadge}>
                    <span className={protectionX >= 10 ? s.protRatioOk : protectionX >= 5 ? s.protRatioWarn : s.protRatioBad}>
                      {protectionX.toFixed(1)}×
                    </span>
                    <span className={s.protRatioSub}>of annual income</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Health Insurance */}
          <div className={s.subBlock}>
            <div className={s.subHead}>Health Insurance</div>
            <div className={s.protField}>
              <label className={s.curFieldLabel}>Has health cover?</label>
              <div className={s.optCards2}>
                <button type="button"
                  className={`${s.optCard} ${protection.has_health_cover ? s.optCardSelected : ''}`}
                  onClick={() => setProtection(p => ({ ...p, has_health_cover: true }))}>
                  <svg className={s.optCardIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 2 4 7v6c0 5 3.5 9 8 10 4.5-1 8-5 8-10V7l-8-5z"/><path d="m9 12 2 2 4-4"/>
                  </svg>
                  <div>
                    <div className={s.optCardLabel}>Yes</div>
                    <div className={s.optCardSub}>Has coverage</div>
                  </div>
                </button>
                <button type="button"
                  className={`${s.optCard} ${!protection.has_health_cover ? s.optCardSelected : ''}`}
                  onClick={() => setProtection(p => ({ ...p, has_health_cover: false }))}>
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
                  { key: 'individual'    as const, label: 'Individual',     sub: 'Self only'  },
                  { key: 'family_floater'as const, label: 'Family Floater', sub: 'Household'  },
                  { key: 'employer'      as const, label: 'Employer',       sub: 'Corp group' },
                  { key: 'none'          as const, label: 'None',           sub: 'Gap'        },
                ]).map(({ key, label, sub }) => (
                  <button key={key} type="button"
                    className={`${s.optCard} ${protection.health_cover_type === key ? s.optCardSelected : ''}`}
                    onClick={() => setProtection(p => ({ ...p, health_cover_type: key }))}>
                    <div>
                      <div className={s.optCardLabel}>{label}</div>
                      <div className={s.optCardSub}>{sub}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className={s.protFieldRow2}>
              <div className={s.curField}>
                <label className={s.curFieldLabel}>Sum Insured</label>
                <div className={s.curInputWrap}>
                  <span className={s.curSym}>₹</span>
                  <input className={s.curVal} type="number" inputMode="numeric" placeholder="0"
                    value={protection.health_cover_amount}
                    onChange={e => setProtection(p => ({ ...p, health_cover_amount: e.target.value }))} />
                </div>
                {Number(protection.health_cover_amount) > 0 && (
                  <span className={s.curHint}>{fmt(Number(protection.health_cover_amount))}</span>
                )}
              </div>
              <div className={s.curField}>
                <label className={s.curFieldLabel}>Critical Illness <span className={s.curOptTag}>opt</span></label>
                <div className={s.curInputWrap}>
                  <span className={s.curSym}>₹</span>
                  <input className={s.curVal} type="number" inputMode="numeric" placeholder="0"
                    value={protection.ci_cover_amount}
                    onChange={e => setProtection(p => ({ ...p, ci_cover_amount: e.target.value }))} />
                </div>
              </div>
            </div>
          </div>

          {/* Vani copilot */}
          {(Number(protection.life_cover_amount) > 0 || Number(protection.health_cover_amount) > 0
            || !protection.has_term_plan || !protection.has_health_cover) && (
            <div className={s.vaniCopilot}>
              <div className={s.vaniCopilotMarker}>
                <div className={s.vaniCopilotAvatar}>V</div>
                <span className={s.vaniCopilotName}>Vani</span>
              </div>
              <p className={s.vaniCopilotText}>
                {Number(protection.life_cover_amount) > 0 ? (
                  <>Life cover <span className={s.vaniHi}>{fmt(Number(protection.life_cover_amount))}</span>
                  {protectionX !== null && (
                    <> · <span className={protectionX >= 10 ? s.vaniOk : protectionX >= 5 ? s.vaniWarn : s.vaniBad}>
                      {protectionX.toFixed(1)}× annual income{protectionX >= 10 ? ' — adequate' : protectionX >= 5 ? ' — below 10× benchmark' : ' — critically underinsured'}
                    </span></>
                  )}</>
                ) : !protection.has_term_plan ? (
                  <span className={s.vaniBad}>No active life policy flagged. Life cover is the #1 protection priority.</span>
                ) : null}
                {Number(protection.health_cover_amount) > 0 ? (
                  <><br />Health cover <span className={s.vaniHi}>{fmt(Number(protection.health_cover_amount))}</span>
                  {Number(protection.ci_cover_amount) > 0 && <> · CI {fmt(Number(protection.ci_cover_amount))}</>}</>
                ) : !protection.has_health_cover ? (
                  <><br /><span className={s.vaniWarn}>No health cover flagged. Medical inflation in India is 14%/yr.</span></>
                ) : null}
              </p>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════════════════════════════════════
          05 — Goals + Risk Profile
          ════════════════════════════════════════════════════ */}
      {step === 4 && (
        <div className={s.stepBody}>
          <div className={s.sectionHead}>
            <div className={s.sectionNum}>Section 05 / 05 · Dreams</div>
            <h2 className={s.sectionTitle}>What are you<br /><em>saving for?</em></h2>
            <p className={s.sectionSub}>The reason behind the numbers. Your dreams give your money a job to do.</p>
          </div>

          {/* Aspirational Goals */}
          <div className={s.subBlock}>
            <div className={s.subHead}>Aspirational Goals</div>

            {goals.length === 0 ? (
              <div className={s.itemEmptyState}>
                Retirement, children&rsquo;s education, home, wedding — add every financial milestone
              </div>
            ) : (
              <div className={s.itemList}>
                {goals.map((goal, i) => (
                  <div key={i} className={s.assetCard}>
                    <div className={s.assetCardHead}>
                      <span className={s.assetCardNum}>
                        {GOAL_ICONS[goal.goal_type] ?? '⭐'} GOAL_{String(i + 1).padStart(2, '0')}
                      </span>
                      <button className={s.assetCardRemove}
                        onClick={() => setGoals(p => p.filter((_, j) => j !== i))}>×</button>
                    </div>
                    {/* Goal Type */}
                    <div className={s.curField}>
                      <label className={s.curFieldLabel}>Goal Type</label>
                      <select className={s.plainSelect} value={goal.goal_type}
                        onChange={e => setGoals(p => p.map((g, j) => j !== i ? g : { ...g, goal_type: e.target.value }))}>
                        <option value="">Select type</option>
                        {GOAL_TYPES.map(t => (
                          <option key={t} value={t}>{GOAL_ICONS[t]} {GOAL_LABELS[t]}</option>
                        ))}
                      </select>
                    </div>
                    {/* Name + Target + Horizon */}
                    <div className={s.goalRow2}>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>Goal Name</label>
                        <input className={s.plainInput} type="text"
                          placeholder="e.g. Retire to Goa, IIT for Aryan"
                          value={goal.name}
                          onChange={e => setGoals(p => p.map((g, j) => j !== i ? g : { ...g, name: e.target.value }))} />
                      </div>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>Target (₹)</label>
                        <div className={s.curInputWrap}>
                          <span className={s.curSym}>₹</span>
                          <input className={s.curVal} type="number" inputMode="numeric" placeholder="0"
                            value={goal.target_amount}
                            onChange={e => setGoals(p => p.map((g, j) => j !== i ? g : { ...g, target_amount: e.target.value }))} />
                        </div>
                        {Number(goal.target_amount) > 0 && (
                          <span className={s.curHint}>{fmt(Number(goal.target_amount))}</span>
                        )}
                      </div>
                      <div className={s.curField}>
                        <label className={s.curFieldLabel}>Horizon</label>
                        <div className={s.horizonPills}>
                          {HORIZON_PRESETS.map(yr => (
                            <button key={yr} type="button"
                              className={`${s.horizonPill} ${Number(goal.timeline_years) === yr ? s.horizonPillActive : ''}`}
                              onClick={() => setGoals(p => p.map((g, j) => j !== i ? g : { ...g, timeline_years: String(yr) }))}>
                              {yr}y
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <button className={s.addItemBtn}
              onClick={() => setGoals(p => [...p, { goal_type: 'custom', name: '', target_amount: '', timeline_years: '' }])}>
              <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" width="14" height="14">
                <path d="M10 4v12M4 10h12" />
              </svg>
              Add goal
            </button>
          </div>

          {/* Notes */}
          <div className={s.inputGroup} style={{ marginTop: 8 }}>
            <label className={s.label}>Anything else for your advisor? <span className={s.opt}>optional</span></label>
            <textarea className={s.textarea} rows={3}
              placeholder="Any specific financial concerns or goals…"
              value={notes}
              onChange={e => setNotes(e.target.value)} />
          </div>

          {error && <div className={s.errorBanner}>{error}</div>}
        </div>
      )}

      {/* ── Navigation bar ── */}
      <div className={s.navBar}>
        <button
          className={s.ghostBtn}
          style={{ visibility: step > 0 ? 'visible' : 'hidden' }}
          onClick={() => setStep(s => s - 1)}
        >
          ← Back
        </button>

        {step < 4 ? (
          <button className={s.primaryBtn} onClick={() => setStep(s => s + 1)}>
            Next →
          </button>
        ) : (
          <button
            className={s.primaryBtn}
            disabled={isSubmitting}
            onClick={handleSubmit}
          >
            {isSubmitting ? 'Submitting…' : 'Submit ✓'}
          </button>
        )}
      </div>

      </div>{/* /formCol */}

      {/* ── Pulse Sidebar (desktop only) ── */}
      <aside className={s.pulseSidebar}>

        {/* Progress Rail */}
        <div className={s.railSection}>
          <div className={s.railTitle}>Your Journey</div>
          <div className={s.railTrack}>
            {STEPS.map((st, i) => (
              <div key={i} className={`${s.railStep} ${i < step ? s.railDone : i === step ? s.railActive : ''}`}>
                <div className={s.railBullet}>
                  {i < step
                    ? <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5"><path d="M5 12l5 5L19 7"/></svg>
                    : <span>{i + 1}</span>}
                </div>
                <span className={s.railLabel}>{st.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Financial Pulse */}
        <div className={s.pulseSection}>
          <div className={s.pulseTitleRow}>
            <span className={s.pulseTitle}>Financial Pulse</span>
            <span className={s.pulseTag}>LIVE</span>
          </div>
          <p className={s.pulseSub}>Updates as you fill each section.</p>

          <PulseMetric dotColor="var(--color-primary)" label="Savings Rate"
            value={savingsRate !== null ? `${savingsRate}%` : null}
            hint="% of income you keep each month"
            barPct={pulseBarWidth('savings', savingsRate)}
            state={pulseBarState('savings', savingsRate)} />

          <PulseMetric dotColor="#4a7a8c" label="Debt Load"
            value={debtLoadPct !== null ? `${debtLoadPct}%` : null}
            hint="EMI as % of income · <40% is healthy"
            barPct={pulseBarWidth('debt', debtLoadPct)}
            state={pulseBarState('debt', debtLoadPct)} />

          <PulseMetric dotColor="#d97757" label="Protection"
            value={protectionX !== null ? `${protectionX}×` : null}
            hint="Life cover as × of annual income"
            barPct={pulseBarWidth('protection', protectionX)}
            state={pulseBarState('protection', protectionX)} />

          <PulseMetric dotColor="#c47e1a" label="Liquidity"
            value={liquidityMths !== null ? `${liquidityMths} mo` : null}
            hint="Emergency fund in months of expenses"
            barPct={pulseBarWidth('liquidity', liquidityMths)}
            state={pulseBarState('liquidity', liquidityMths)} />

          <PulseMetric dotColor="#6b4e8a" label="Future Focus"
            value={futurePct !== null ? `${futurePct}%` : null}
            hint="Goal corpus as % of total assets"
            barPct={pulseBarWidth('future', futurePct)}
            state="mid" />
        </div>

      </aside>

      </div>{/* /wizardLayout */}
    </div>
  );
}
