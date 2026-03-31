'use client';

import { useState } from 'react';
import { useShellConfig } from '@/lib/shell-config';
import { useAuth } from '@/context/auth-provider';
import { useToast } from '../toast';
import { InlineLoader } from '../loader';
import l from './step-layout.module.css';

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
  onBack?: () => void;
}

export default function OnboardPreferences({ onComplete, onSkip, onBack }: Props) {
  const { apiUrl } = useShellConfig();
  const { getAuthHeaders } = useAuth();
  const { showToast } = useToast();

  const [riskProfile, setRiskProfile] = useState('moderate');
  const [horizon, setHorizon] = useState('medium');
  const [sipDay, setSipDay] = useState('1');
  const [sipFrequency, setSipFrequency] = useState('monthly');
  const [loading, setLoading] = useState(false);

  async function handleSubmit() {
    setLoading(true);
    try {
      const res = await fetch(`${apiUrl}/api/v1/auth/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({
          default_risk_profile: riskProfile,
          preferred_investment_horizon: horizon,
          sip_default_day: Number(sipDay),
          default_sip_frequency: sipFrequency,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error?.message || 'Failed to save preferences');
      }

      showToast({ message: 'Preferences saved', type: 'success' });
      onComplete();
    } catch (err) {
      showToast({ message: err instanceof Error ? err.message : 'Save failed', type: 'error' });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={l.split}>
      <div className={l.narrative}>
        <div>
          <div className={l.chapter}>Step 5 of 6</div>
          <h2 className={l.narrTitle}>
            What&apos;s your<br /><span className={l.glow}>investment</span><br />philosophy?
          </h2>
          <p className={l.narrText}>
            These preferences help VaNi give you better recommendations and
            personalize the planning engine for your practice.
          </p>
          <div className={l.optionalBadge}>&#x25CB; Can be configured later</div>
        </div>
      </div>

      <div className={l.form}>
        <div className={l.sectionTitle}>Investment Preferences</div>

        <div className={l.selectGroup}>
          <label className={l.selectLabel}>Default Risk Profile for New Clients</label>
          <select
            className={l.select}
            value={riskProfile}
            onChange={(e) => setRiskProfile(e.target.value)}
            disabled={loading}
          >
            <option value="conservative">Conservative</option>
            <option value="moderate">Moderate</option>
            <option value="aggressive">Aggressive</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        <div className={l.selectGroup}>
          <label className={l.selectLabel}>Preferred Investment Horizon</label>
          <select
            className={l.select}
            value={horizon}
            onChange={(e) => setHorizon(e.target.value)}
            disabled={loading}
          >
            <option value="short">Short-term (&lt;1 year)</option>
            <option value="medium">Medium (1–3 years)</option>
            <option value="long">Long-term (3+ years)</option>
          </select>
        </div>

        <div className={l.formRow}>
          <div className={l.selectGroup}>
            <label className={l.selectLabel}>SIP Default Day</label>
            <select
              className={l.select}
              value={sipDay}
              onChange={(e) => setSipDay(e.target.value)}
              disabled={loading}
            >
              {Array.from({ length: 28 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>
                  {i + 1}
                </option>
              ))}
            </select>
          </div>
          <div className={l.selectGroup}>
            <label className={l.selectLabel}>Default SIP Frequency</label>
            <select
              className={l.select}
              value={sipFrequency}
              onChange={(e) => setSipFrequency(e.target.value)}
              disabled={loading}
            >
              <option value="monthly">Monthly</option>
              <option value="quarterly">Quarterly</option>
            </select>
          </div>
        </div>

        <div className={l.nav}>
          {onBack ? (
            <button className={l.backBtn} onClick={onBack} type="button">
              &larr; Back
            </button>
          ) : <div />}
          <div className={l.navRight}>
            <button className={l.navSkip} onClick={onSkip} disabled={loading}>
              Skip for now
            </button>
            <button className={l.navNext} onClick={handleSubmit} disabled={loading}>
              {loading ? <InlineLoader size="sm" message="SAVING..." /> : 'SAVE & CONTINUE \u2192'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
