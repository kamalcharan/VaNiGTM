'use client';

import { useState } from 'react';
import { useToast } from '../toast';
import { InlineLoader } from '../loader';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import s from './OnboardPreferences.module.css';

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
  onBack?: () => void;
}

const RISK_PROFILES = [
  { value: 'conservative', label: 'Conservative', desc: 'Capital preservation, low volatility', icon: '\u{1F6E1}' },
  { value: 'moderate', label: 'Moderate', desc: 'Balanced growth and safety', icon: '\u{2696}' },
  { value: 'aggressive', label: 'Aggressive', desc: 'High growth, higher risk tolerance', icon: '\u{1F680}' },
];

const HORIZONS = [
  { value: 'short', label: 'Short-term', desc: 'Less than 1 year' },
  { value: 'medium', label: 'Medium', desc: '1 to 3 years' },
  { value: 'long', label: 'Long-term', desc: '3+ years' },
];

export default function OnboardPreferences({ onComplete, onSkip, onBack }: Props) {
  const { showToast } = useToast();

  const [riskProfile, setRiskProfile] = useState('moderate');
  const [horizon, setHorizon] = useState('medium');
  const [sipDay, setSipDay] = useState('1');
  const [sipFrequency, setSipFrequency] = useState('monthly');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      await apiFetch(API.auth.preferences, {
        body: {
          default_risk_profile: riskProfile,
          preferred_investment_horizon: horizon,
          sip_default_day: Number(sipDay),
          default_sip_frequency: sipFrequency,
        },
      });
      showToast({ message: 'Preferences saved', type: 'success' });
      onComplete();
    } catch (err) {
      const apiErr = err as ApiError;
      showToast({ message: apiErr.message || 'Save failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.pageHeader}>
        <div className={s.headerIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z" />
          </svg>
        </div>
        <h1 className={s.pageTitle}>Investment Preferences</h1>
        <p className={s.pageSubtitle}>Personalize the planning engine for your practice</p>
      </div>

      {/* Risk Profile Card */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          <span className={s.cardTitle}>Default Risk Profile</span>
        </div>
        <p className={s.cardDesc}>Applied to new clients as a starting point. Can be customized per client.</p>

        <div className={s.optionGrid}>
          {RISK_PROFILES.map((rp) => (
            <div
              key={rp.value}
              className={`${s.optionCard} ${riskProfile === rp.value ? s.optionSelected : ''}`}
              onClick={() => setRiskProfile(rp.value)}
            >
              <span className={s.optionIcon}>{rp.icon}</span>
              <div className={s.optionLabel}>{rp.label}</div>
              <div className={s.optionDesc}>{rp.desc}</div>
              {riskProfile === rp.value && <div className={s.checkBadge}>&#x2713;</div>}
            </div>
          ))}
        </div>
      </div>

      {/* Horizon Card */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className={s.cardTitle}>Investment Horizon</span>
        </div>

        <div className={s.optionGrid}>
          {HORIZONS.map((h) => (
            <div
              key={h.value}
              className={`${s.optionCard} ${horizon === h.value ? s.optionSelected : ''}`}
              onClick={() => setHorizon(h.value)}
            >
              <div className={s.optionLabel}>{h.label}</div>
              <div className={s.optionDesc}>{h.desc}</div>
              {horizon === h.value && <div className={s.checkBadge}>&#x2713;</div>}
            </div>
          ))}
        </div>
      </div>

      {/* SIP Settings Card */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <span className={s.cardTitle}>SIP Defaults</span>
        </div>

        <div className={s.row2}>
          <div className={s.field}>
            <label className={s.label}>Default SIP Day</label>
            <select className={s.select} value={sipDay} onChange={(e) => setSipDay(e.target.value)} disabled={loading}>
              {Array.from({ length: 28 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
              ))}
            </select>
          </div>
          <div className={s.field}>
            <label className={s.label}>Default Frequency</label>
            <select className={s.select} value={sipFrequency} onChange={(e) => setSipFrequency(e.target.value)} disabled={loading}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
        </div>
      </div>

      {/* Note */}
      <div className={s.note}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span>These are workspace defaults. Each client can have individual preferences that override these.</span>
      </div>

      {/* Footer */}
      <div className={s.footerNav}>
        {onBack ? (
          <button className={s.backBtn} onClick={onBack} type="button">&larr; Back</button>
        ) : <div />}
        <div className={s.navRight}>
          <button className={s.skipBtn} onClick={onSkip} disabled={loading}>Skip for now</button>
          <button className={s.saveBtn} onClick={handleSubmit} disabled={loading}>
            {loading ? <InlineLoader size="sm" message="SAVING..." /> : 'SAVE & CONTINUE \u2192'}
          </button>
        </div>
      </div>
    </div>
  );
}
