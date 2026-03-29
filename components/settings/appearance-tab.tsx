'use client';

import { useState } from 'react';
import { useShellConfig } from '@/lib/shell-config';
import { useAuth } from '@/context/auth-provider';
import { useTheme } from '@/components/theme-provider';
import { useToast } from '../toast';
import { getTheme } from '@/themes/registry';
import s from './settings-tabs.module.css';

export default function AppearanceTab() {
  const { apiUrl } = useShellConfig();
  const { getAuthHeaders } = useAuth();
  const { themeId, setTheme, themes, colorMode } = useTheme();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function selectTheme(id: string) {
    setTheme(id);
    setSaving(true);
    try {
      await fetch(`${apiUrl}/api/v1/auth/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ theme_override: id }),
      });
      showToast({ message: `Theme set to ${themes.find((t) => t.id === id)?.name || id}`, type: 'success' });
    } catch {
      showToast({ message: 'Failed to save theme preference', type: 'error' });
    } finally {
      setSaving(false);
    }
  }

  async function resetToDefault() {
    setSaving(true);
    try {
      await fetch(`${apiUrl}/api/v1/auth/preferences`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ theme_override: null }),
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
    <div className={s.card}>
      <div className={s.cardTitle}>Theme</div>
      <div className={s.cardDesc}>Your personal theme overrides the tenant default</div>

      <div className={s.infoBanner}>
        &#x2139;&#xFE0F; Theme priority: Your preference &rarr; Tenant config &rarr; Product default (Vikuna Black)
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
              {isSelected && <span className={s.themeCheckMark}>&#x2713;</span>}
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
  );
}
