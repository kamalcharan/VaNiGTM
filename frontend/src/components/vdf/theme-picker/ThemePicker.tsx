'use client';

import { useTheme, getTheme } from '@/config/theme';
import s from './ThemePicker.module.css';

interface ThemePickerProps {
  onSelectTheme?: (id: string) => void;
}

/**
 * Reusable theme picker panel — display mode toggle, theme grid with swatches,
 * and live preview. Used by both OnboardTheme and Settings Appearance tab.
 */
export function ThemePicker({ onSelectTheme }: ThemePickerProps) {
  const { themeId, setTheme, themes, colorMode, toggleColorMode } = useTheme();

  function handleSelect(id: string) {
    setTheme(id);
    onSelectTheme?.(id);
  }

  const currentTheme = getTheme(themeId);
  const previewColors = colorMode === 'dark' ? currentTheme.darkMode.colors : currentTheme.colors;

  return (
    <div className={s.panel}>
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
              onClick={() => handleSelect(id)}
            >
              {isSelected && (
                <div
                  className={s.checkBadge}
                  style={{ background: colors.brand.primary, color: colors.utility.primaryBackground }}
                >
                  {'\u2713'}
                </div>
              )}
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
          <span className={s.previewButton} style={{ background: previewColors.brand.primary, color: previewColors.utility.primaryBackground }}>Primary Button</span>
        </div>
        <p className={s.previewText} style={{ color: previewColors.utility.secondaryText }}>
          This preview updates instantly as you select different themes and toggle dark mode.
        </p>
        <div className={s.previewBadges}>
          <span className={s.previewBadge} style={{ background: previewColors.semantic.success + '20', color: previewColors.semantic.success }}>Success</span>
          <span className={s.previewBadge} style={{ background: previewColors.semantic.warning + '20', color: previewColors.semantic.warning }}>Warning</span>
          <span className={s.previewBadge} style={{ background: previewColors.semantic.error + '20', color: previewColors.semantic.error }}>Error</span>
          <span className={s.previewBadge} style={{ background: previewColors.brand.primary + '20', color: previewColors.brand.primary }}>Accent</span>
        </div>
      </div>
    </div>
  );
}
