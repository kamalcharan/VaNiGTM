'use client';

import { useState } from 'react';
import { useTheme } from '@/config/theme';
import { ThemePicker } from '@/components/vdf';
import { apiFetch } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { useToast } from '@/components/toast';
import s from './settings-tabs.module.css';

export default function AppearanceTab() {
  const { setTheme } = useTheme();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function handleSelectTheme(id: string) {
    setSaving(true);
    try {
      await apiFetch(API.auth.preferences, { body: { preferred_theme: id } });
      showToast({ message: 'Theme updated', type: 'success' });
    } catch {
      showToast({ message: 'Failed to save theme', type: 'error' });
    } finally {
      setSaving(false);
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
    <div className={s.card}>
      <div className={s.cardTitle}>Appearance</div>
      <div className={s.cardDesc}>Customize your display mode, color theme, and preview changes live</div>

      <ThemePicker onSelectTheme={handleSelectTheme} />

      <div className={s.actions}>
        <button className={s.btnCancel} onClick={resetToDefault} disabled={saving}>
          Reset to Tenant Default
        </button>
      </div>
    </div>
  );
}
