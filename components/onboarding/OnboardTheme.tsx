'use client';

import { useState } from 'react';
import { useShellConfig } from '@/lib/shell-config';
import { useAuth } from '@/context/auth-provider';
import { useTheme } from '@/components/theme-provider';
import { useToast } from '../toast';
import { getTheme } from '@/themes/registry';
import l from './step-layout.module.css';
import s from './OnboardTheme.module.css';

interface Props {
  onComplete: () => void;
  onSkip?: () => void;
}

export default function OnboardTheme({ onComplete, onSkip }: Props) {
  const { apiUrl } = useShellConfig();
  const { getAuthHeaders } = useAuth();
  const { themeId, setTheme, themes, colorMode } = useTheme();
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);

  async function selectTheme(id: string) {
    setTheme(id);

    try {
      setSaving(true);
      await fetch(`${apiUrl}/api/v1/tenant/profile`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeaders() },
        body: JSON.stringify({ theme_id: id }),
      });
    } catch {
      // Non-critical — theme is saved locally already
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={l.full}>
      <div className={l.fullContent}>
        <div className={s.header}>
          <div className={l.chapter}>Step 3 of 6</div>
          <h2 className={`${l.narrTitle} ${s.centerTitle}`}>
            Choose your <span className={l.glow}>visual identity</span>.
          </h2>
          <p className={s.headerDesc}>
            This theme applies to your entire workspace — dashboard, client portal,
            and reports. You can change it anytime in settings.
          </p>
          <div className={l.optionalBadge}>&#x25CB; Optional — defaults to Vikuna Black</div>
        </div>

        <div className={s.grid}>
          {themes.map(({ id, name }) => {
            const cfg = getTheme(id);
            const isDark = colorMode === 'dark';
            const colors = isDark ? cfg.darkMode.colors : cfg.colors;
            const isSelected = themeId === id;
            const isDefault = id === 'vikuna-black';

            return (
              <div
                key={id}
                className={`${s.card} ${isSelected ? s.cardSelected : ''}`}
                onClick={() => selectTheme(id)}
              >
                {isDefault && <span className={s.defaultTag}>DEFAULT</span>}
                {isSelected && <span className={s.checkMark}>&#x2713;</span>}

                <div className={s.preview}>
                  <div className={s.swatchRow}>
                    <div style={{ background: colors.utility.primaryBackground }} />
                    <div style={{ background: colors.brand.primary }} />
                    <div style={{ background: colors.semantic.success }} />
                    <div style={{ background: colors.semantic.info }} />
                  </div>
                  <div className={s.mock} style={{ background: colors.utility.primaryBackground }}>
                    <div className={s.mockSidebar} style={{ background: colors.utility.secondaryBackground }} />
                    <div className={s.mockMain}>
                      <div className={s.mockTopbar} style={{ background: colors.utility.secondaryBackground }} />
                      <div className={s.mockCard} style={{ background: colors.accent.accent4 }} />
                    </div>
                  </div>
                </div>

                <div className={s.info}>
                  <div className={s.themeName}>{name}</div>
                </div>
              </div>
            );
          })}
        </div>

        <div className={l.nav}>
          <div />
          <div className={l.navRight}>
            <button className={l.navSkip} onClick={onSkip} disabled={saving}>
              Skip — use default
            </button>
            <button className={l.navNext} onClick={onComplete} disabled={saving}>
              APPLY &amp; CONTINUE &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
