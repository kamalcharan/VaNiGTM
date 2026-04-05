'use client';

import { useState, useEffect } from 'react';
import { useMe } from '@/hooks';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import { InlineLoader } from '@/components/loader';
import s from './settings-tabs.module.css';

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

export default function PreferencesTab() {
  const { data: me } = useMe();
  const { showToast } = useToast();

  const [riskProfile, setRiskProfile] = useState('moderate');
  const [horizon, setHorizon] = useState('medium');
  const [sipDay, setSipDay] = useState('1');
  const [sipFrequency, setSipFrequency] = useState('monthly');
  const [loading, setLoading] = useState(false);

  // Populate from saved preferences
  useEffect(() => {
    if (me?.user?.preferences) {
      const p = me.user.preferences as Record<string, any>;
      if (p.default_risk_profile) setRiskProfile(p.default_risk_profile);
      if (p.investment_horizon) setHorizon(p.investment_horizon);
      if (p.sip_default_day) setSipDay(String(p.sip_default_day));
      if (p.sip_frequency) setSipFrequency(p.sip_frequency);
    }
  }, [me]);

  async function handleSave() {
    setLoading(true);
    try {
      await apiFetch(API.auth.preferences, {
        body: {
          default_risk_profile: riskProfile,
          investment_horizon: horizon,
          sip_default_day: sipDay,
          sip_frequency: sipFrequency,
        },
      });
      showToast({ message: 'Preferences updated', type: 'success' });
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Save failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Risk & Horizon */}
      <div className={s.card}>
        <div className={s.cardTitle}>Investment Defaults</div>
        <div className={s.cardDesc}>Default settings for new client plans and projections</div>

        <div className={s.selectGroup}>
          <label className={s.selectLabel}>Default Risk Profile</label>
          <div className={s.optionGrid}>
            {RISK_PROFILES.map((r) => (
              <div
                key={r.value}
                className={`${s.optionCard} ${riskProfile === r.value ? s.optionSelected : ''}`}
                onClick={() => setRiskProfile(r.value)}
              >
                {riskProfile === r.value && <span className={s.checkBadge}>{'\u2713'}</span>}
                <span className={s.optionIcon}>{r.icon}</span>
                <span className={s.optionLabel}>{r.label}</span>
                <span className={s.optionDesc}>{r.desc}</span>
              </div>
            ))}
          </div>
        </div>

        <div className={s.selectGroup}>
          <label className={s.selectLabel}>Investment Horizon</label>
          <div className={s.optionGrid}>
            {HORIZONS.map((h) => (
              <div
                key={h.value}
                className={`${s.optionCard} ${horizon === h.value ? s.optionSelected : ''}`}
                onClick={() => setHorizon(h.value)}
              >
                {horizon === h.value && <span className={s.checkBadge}>{'\u2713'}</span>}
                <span className={s.optionLabel}>{h.label}</span>
                <span className={s.optionDesc}>{h.desc}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SIP Defaults */}
      <div className={s.card}>
        <div className={s.cardTitle}>SIP Defaults</div>
        <div className={s.cardDesc}>Default SIP configuration for new investment plans</div>

        <div className={s.formRow}>
          <div className={s.selectGroup}>
            <label className={s.selectLabel}>SIP Default Day</label>
            <select className={s.select} value={sipDay} onChange={(e) => setSipDay(e.target.value)} disabled={loading}>
              {Array.from({ length: 28 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>{i + 1}</option>
              ))}
            </select>
          </div>
          <div className={s.selectGroup}>
            <label className={s.selectLabel}>SIP Frequency</label>
            <select className={s.select} value={sipFrequency} onChange={(e) => setSipFrequency(e.target.value)} disabled={loading}>
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
        </div>

        <div className={s.actions}>
          <button className={s.btnSave} onClick={handleSave} disabled={loading}>
            {loading ? <InlineLoader size="sm" message="Saving..." /> : 'Save Preferences'}
          </button>
        </div>
      </div>
    </>
  );
}
