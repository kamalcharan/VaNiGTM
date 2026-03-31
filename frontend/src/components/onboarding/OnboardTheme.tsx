'use client';

import { useState } from 'react';
import { useTheme, getTheme } from '@/config/theme';
import { useToast } from '../toast';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import s from './OnboardTheme.module.css';

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
}

export default function OnboardTheme({ onComplete, onSkip }: Props) {
  const { themeId, setTheme, themes, colorMode, toggleColorMode } = useTheme();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function handleSelectTheme(id: string) {
    setTheme(id);
    // Save to backend silently
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
      // Save color mode preference
      await apiFetch(API.auth.preferences, {
        body: { preferred_theme: themeId, color_mode: colorMode },
      });
      showToast({ message: 'Theme applied', type: 'success' });
      onComplete();
    } catch (err) {
      const apiErr = err as ApiError;
      showToast({ message: apiErr.message || 'Save failed', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  // Get current theme colors for preview
  const currentTheme = getTheme(themeId);
  const previewColors = colorMode === 'dark' ? currentTheme.darkMode.colors : currentTheme.colors;

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

      {/* Appearance Settings Card */}
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

        {/* Display Mode */}
        <div className={s.sectionLabel}>Display Mode</div>
        <div className={s.modeToggle} onClick={toggleColorMode}>
          <div className={s.modeInfo}>
            <span className={s.modeIcon}>
              {colorMode === 'dark' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                  <path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="18" height="18">
                  <circle cx="12" cy="12" r="5" />
                  <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
                </svg>
              )}
            </span>
            <div>
              <div className={s.modeLabel}>{colorMode === 'dark' ? 'Dark Mode' : 'Light Mode'}</div>
              <div className={s.modeDesc}>
                {colorMode === 'dark' ? 'Better for low-light environments' : 'Better for well-lit environments'}
              </div>
            </div>
          </div>
          <div className={`${s.toggle} ${colorMode === 'dark' ? s.toggleOn : ''}`}>
            <div className={s.toggleDot} />
          </div>
        </div>

        {/* Color Theme */}
        <div className={s.sectionLabel}>Color Theme</div>
        <div className={s.themeGrid}>
          {themes.map(({ id, name }) => {
            const cfg = getTheme(id);
            const isDark = colorMode === 'dark';
            const colors = isDark ? cfg.darkMode.colors : cfg.colors;
            const isSelected = themeId === id;

            return (
              <div
                key={id}
                className={`${s.themeCard} ${isSelected ? s.themeCardSelected : ''}`}
                onClick={() => handleSelectTheme(id)}
              >
                {isSelected && <div className={s.checkBadge}>&#x2713;</div>}
                <div className={s.swatches}>
                  <div className={s.swatch} style={{ background: colors.brand.primary }} />
                  <div className={s.swatch} style={{ background: colors.utility.primaryText }} />
                  <div className={s.swatch} style={{ background: colors.accent.accent1 }} />
                </div>
                <div className={s.themeName}>{name}</div>
              </div>
            );
          })}
        </div>

        {/* Live Preview */}
        <div className={s.sectionLabel}>Live Preview</div>
        <div className={s.preview} style={{ background: previewColors.utility.primaryBackground, color: previewColors.utility.primaryText }}>
          <div className={s.previewHeader}>
            <span className={s.previewHeading} style={{ color: previewColors.utility.primaryText }}>Sample Heading</span>
            <span className={s.previewButton} style={{ background: previewColors.brand.primary, color: '#fff' }}>Primary Button</span>
          </div>
          <p className={s.previewText} style={{ color: previewColors.utility.secondaryText }}>
            This preview updates instantly as you select different themes and toggle dark mode.
          </p>
          <div className={s.previewBadges}>
            <span className={s.previewBadge} style={{ background: previewColors.semantic.success + '20', color: previewColors.semantic.success }}>Success</span>
            <span className={s.previewBadge} style={{ background: previewColors.semantic.warning + '20', color: previewColors.semantic.warning }}>Warning</span>
            <span className={s.previewBadge} style={{ background: previewColors.semantic.error + '20', color: previewColors.semantic.error }}>Error</span>
            <span className={s.previewBadge} style={{ background: previewColors.brand.primary + '20', color: previewColors.brand.primary }}>Secondary</span>
          </div>
        </div>
      </div>

      {/* Note */}
      <div className={s.note}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" width="16" height="16">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 16v-4M12 8h.01" />
        </svg>
        <span>
          Your theme changes are applied instantly and saved automatically. You can change these preferences anytime from your profile settings.
        </span>
      </div>

      {/* Footer */}
      <div className={s.footerNav}>
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
