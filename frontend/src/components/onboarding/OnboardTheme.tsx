'use client';

import { useState } from 'react';
import { useTheme } from '@/config/theme';
import { useToast } from '../toast';
import { ThemePicker } from '@/components/vdf';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import s from './OnboardTheme.module.css';

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
  onBack?: () => void;
}

export default function OnboardTheme({ onComplete, onSkip, onBack }: Props) {
  const { themeId, colorMode } = useTheme();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function handleSelectTheme(id: string) {
    try {
      await apiFetch(API.tenant.profile, { body: { theme_id: id } });
      await apiFetch(API.auth.preferences, { body: { preferred_theme: id } });
    } catch {
      // Non-critical — theme is saved locally
    }
  }

  async function handleContinue() {
    setSaving(true);
    try {
      await apiFetch(API.auth.preferences, {
        body: { preferred_theme: themeId, color_mode: colorMode },
      });
      showToast({ message: 'Theme applied', type: 'success' });
      onComplete();
    } catch (err) {
      showToast({ message: (err as ApiError).message || 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.pageHeader}>
        <div className={s.headerIcon}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="28" height="28">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="7" r="1.5" fill="currentColor" />
            <circle cx="8" cy="10" r="1.5" fill="currentColor" />
            <circle cx="16" cy="10" r="1.5" fill="currentColor" />
            <circle cx="9" cy="15" r="1.5" fill="currentColor" />
          </svg>
        </div>
        <h1 className={s.pageTitle}>Choose Your Theme</h1>
        <p className={s.pageSubtitle}>Customize the look and feel of your workspace</p>
      </div>

      {/* Shared Theme Picker */}
      <div className={s.card}>
        <div className={s.cardHeader}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
            <circle cx="12" cy="12" r="10" />
            <circle cx="12" cy="7" r="1.5" fill="currentColor" />
            <circle cx="8" cy="10" r="1.5" fill="currentColor" />
            <circle cx="16" cy="10" r="1.5" fill="currentColor" />
            <circle cx="9" cy="15" r="1.5" fill="currentColor" />
          </svg>
          <span className={s.cardTitle}>Appearance Settings</span>
        </div>
        <ThemePicker onSelectTheme={handleSelectTheme} />
      </div>

      {/* Note */}
      <div className={s.note}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span>
          Your theme changes are applied instantly and saved automatically. You can change these preferences anytime from Settings.
        </span>
      </div>

      {/* Footer */}
      <div className={s.footerNav}>
        {onBack && (
          <button className={s.backBtn} onClick={onBack} type="button">
            &larr; Back
          </button>
        )}
        <div style={{ flex: 1 }} />
        <button className={s.skipBtn} onClick={onSkip} disabled={saving}>
          Skip — use default
        </button>
        <button className={s.saveBtn} onClick={handleContinue} disabled={saving}>
          {saving ? 'Saving...' : 'Continue \u2192'}
        </button>
      </div>
    </div>
  );
}
