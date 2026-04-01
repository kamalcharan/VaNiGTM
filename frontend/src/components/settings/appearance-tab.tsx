'use client';

import { useState } from 'react';
import { useTheme, getTheme } from '@/config/theme';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import s from './settings-tabs.module.css';

export default function AppearanceTab() {
  const { themeId, setTheme, themes, colorMode, toggleColorMode } = useTheme();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function selectTheme(id: string) {
    setTheme(id);
    setSaving(true);
    try {
      await apiFetch(API.auth.preferences, {
        body: { preferred_theme: id },
      });
      showToast({ message: `Theme set to ${themes.find((t) => t.id === id)?.name || id}`, type: 'success' });
    } catch {
      showToast({ message: 'Failed to save theme preference', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleMode() {
    toggleColorMode();
    const newMode = colorMode === 'dark' ? 'light' : 'dark';
    try {
      await apiFetch(API.auth.preferences, {
        body: { color_mode: newMode },
      });
    } catch {
      // Theme toggled locally, server save failed — non-critical
    }
  }

  async function resetToDefault() {
    setSaving(true);
    try {
      await apiFetch(API.auth.preferences, {
        body: { preferred_theme: null, color_mode: null },
      });
      setTheme('vikuna-black');
      showToast({ message: 'Reset to tenant default', type: 'success' });
    } catch {
      showToast({ message: 'Failed to reset theme', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      {/* Color Mode Toggle */}
      <div className={s.card}>
        <div className={s.cardTitle}>Display Mode</div>
        <div className={s.cardDesc}>Switch between light and dark variants</div>

        <div className={s.modeToggle}>
          <button
            className={`${s.modeBtn} ${colorMode === 'light' ? s.modeBtnActive : ''}`}
            onClick={colorMode !== 'light' ? handleToggleMode : undefined}
            disabled={saving}
          >
            <span className={s.modeIcon}>{'\u2600'}</span>
            <span>Light</span>
          </button>
          <button
            className={`${s.modeBtn} ${colorMode === 'dark' ? s.modeBtnActive : ''}`}
            onClick={colorMode !== 'dark' ? handleToggleMode : undefined}
            disabled={saving}
          >
            <span className={s.modeIcon}>{'\u{1F319}'}</span>
            <span>Dark</span>
          </button>
        </div>
      </div>

      {/* Theme Selection */}
      <div className={s.card}>
        <div className={s.cardTitle}>Theme</div>
        <div className={s.cardDesc}>Your personal theme overrides the tenant default</div>

        <div className={s.infoBanner}>
          {'\u2139\uFE0F'} Theme priority: Your preference {'\u2192'} Tenant config {'\u2192'} Product default (Vikuna Black)
        </div>

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
                onClick={() => selectTheme(id)}
              >
                {isSelected && <span className={s.themeCheckMark}>{'\u2713'}</span>}
                <div className={s.themeMock} style={{ background: colors.utility.primaryBackground }}>
                  <div className={s.themeMockSidebar} style={{ background: colors.utility.secondaryBackground }} />
                  <div className={s.themeMockMain}>
                    <div className={s.themeMockTopbar} style={{ background: colors.utility.secondaryBackground }} />
                    <div className={s.themeMockCard} style={{ background: colors.accent.accent4 }} />
                  </div>
                </div>
                <div className={s.themeNameSm}>{name}</div>
              </div>
            );
          })}
        </div>

        <div className={s.actions}>
          <button className={s.btnCancel} onClick={resetToDefault} disabled={saving}>
            Reset to Tenant Default
          </button>
        </div>
      </div>
    </>
  );
}
