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

import { useState, useEffect, useCallback, Fragment, CSSProperties } from 'react';
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
interface AssetRow  { description: string; current_value: string; is_liquid: boolean; }
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
  const { token } = useParams<{ token: string }>();

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
      description: a.description || undefined,
      current_value: Number(a.current_value),
      is_liquid: a.is_liquid,
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
      await post('/api/v1/intake/submit', buildPayload() as Record<string, unknown>);
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
            Let&rsquo;s paint<br /><em>your money picture.</em>
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
    return (
      <div className={s.centered} style={brandStyle}>
        <div className={s.doneIcon}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
            <polyline points="22 4 12 14.01 9 11.01"/>
          </svg>
        </div>
        <h2 className={s.doneTitle}>Thank you!</h2>
        <p className={s.doneSub}>
          Your financial snapshot has been shared with{' '}
          <strong>{meta?.mfd_name || meta?.tenant.display_name || 'your advisor'}</strong>.
          They'll be in touch soon.
        </p>
        {meta?.tenant.display_name && (
          <p className={s.doneBy}>{meta.tenant.display_name}</p>
        )}
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
            <h2 className={s.sectionTitle}>Income &amp; monthly expenses</h2>
            <p className={s.sectionSub}>Monthly cash in, monthly cash out. Savings rate computes automatically.</p>
          </div>

          {/* Monthly Income — 3-col grid */}
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
                    {label}{opt && <span className={s.curOptTag}> opt</span>}
                  </label>
                  <div className={s.curInputWrap}>
                    <span className={s.curSym}>₹</span>
                    <input className={s.curVal} type="number" inputMode="numeric"
                      placeholder="0" value={income[key]}
                      onChange={e => setIncome(p => ({ ...p, [key]: e.target.value }))} />
                    <span className={s.curSuffix}>/mo</span>
                  </div>
                  {Number(income[key]) > 0 && <span className={s.curHint}>{fmt(Number(income[key]))}</span>}
                </div>
              ))}
            </div>
          </div>

          {/* Monthly Expenses — 4-col grid (always visible) */}
          <div className={s.subBlock}>
            <div className={s.subHead}>Monthly Expenses · Exclude EMIs</div>
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

                {/* Row 1: What is it? (full width) */}
                <div className={s.curField}>
                  <label className={s.curFieldLabel}>What is it?</label>
                  <input className={s.plainInput} type="text"
                    placeholder="e.g. Equity Mutual Funds, PPF, 2BHK flat, Gold"
                    value={asset.description}
                    onChange={e => setAssets(p => p.map((a, j) => j === i ? { ...a, description: e.target.value } : a))} />
                </div>

                {/* Row 2: Current Value | Can you sell quickly? */}
                <div className={s.assetValueRow}>
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
                    <label className={s.curFieldLabel}>Can you sell quickly?</label>
                    <div className={s.liqToggle}>
                      <button type="button"
                        className={`${s.liqBtn} ${asset.is_liquid ? s.liqBtnActive : ''}`}
                        onClick={() => setAssets(p => p.map((a, j) => j === i ? { ...a, is_liquid: true } : a))}>
                        💧 Liquid
                      </button>
                      <button type="button"
                        className={`${s.liqBtn} ${!asset.is_liquid ? s.liqBtnIlliq : ''}`}
                        onClick={() => setAssets(p => p.map((a, j) => j === i ? { ...a, is_liquid: false } : a))}>
                        🔒 Illiquid
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <button className={s.addItemBtn}
            onClick={() => setAssets(p => [...p, { description: '', current_value: '', is_liquid: true }])}>
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
            <div className={s.sectionNum}>Section 03 / 05 · Liabilities</div>
            <h2 className={s.sectionTitle}>Loans &amp; liabilities</h2>
            <p className={s.sectionSub}>Loans and outstanding debts. No judgement — clarity helps planning.</p>
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
            <h2 className={s.sectionTitle}>Insurance &amp; protection</h2>
            <p className={s.sectionSub}>Life and health coverage — quantify the safety net.</p>
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
            <div className={s.sectionNum}>Section 05 / 05 · Goals &amp; Risk</div>
            <h2 className={s.sectionTitle}>Goals &amp; risk profile</h2>
            <p className={s.sectionSub}>Aspirations and risk appetite — the plan&rsquo;s destination.</p>
          </div>

          {/* Risk Profile */}
          <div className={s.subBlock}>
            <div className={s.subHead}>Risk Profile</div>
            <div className={s.riskCards}>
              {(['conservative', 'moderate', 'aggressive'] as const).map(key => (
                <button key={key}
                  className={`${s.riskCard} ${riskProfile === key ? s.riskSelected : ''}`}
                  onClick={() => setRiskProfile(p => p === key ? '' : key)}>
                  {riskProfile === key && <span className={s.riskCheck}>✓</span>}
                  <div className={s.riskViz}>
                    {RISK_BARS[key].map((h, i) => (
                      <div key={i} className={s.riskBar}
                        style={{ height: `${h}%`, background: RISK_BAR_COLORS[key] }} />
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
