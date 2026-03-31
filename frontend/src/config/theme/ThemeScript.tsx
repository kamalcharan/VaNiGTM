import Script from 'next/script';
import { themes, defaultTheme } from './registry';
import { ThemeConfig, ThemeColors } from './types';

/**
 * ThemeScript — server component that injects:
 * 1. Inline <style> with default theme CSS variables (no-JS fallback, SSR paint)
 * 2. Blocking <script> that reads localStorage and swaps CSS variables before first paint
 *
 * This eliminates FOUC (flash of unstyled content) on navigation and initial load.
 */

function buildCSSVars(colors: ThemeColors, isDark: boolean, bg: string): string {
  return [
    `--color-primary:${colors.brand.primary}`,
    `--color-secondary:${colors.brand.secondary}`,
    `--color-tertiary:${colors.brand.tertiary}`,
    `--color-alternate:${colors.brand.alternate}`,
    `--color-fg:${colors.utility.primaryText}`,
    `--color-muted:${colors.utility.secondaryText}`,
    `--color-bg:${colors.utility.primaryBackground}`,
    `--color-surface:${colors.utility.secondaryBackground}`,
    `--color-accent:${colors.accent.accent1}`,
    `--color-accent2:${colors.accent.accent2}`,
    `--color-accent3:${colors.accent.accent3}`,
    `--color-accent4:${colors.accent.accent4}`,
    `--color-success:${colors.semantic.success}`,
    `--color-danger:${colors.semantic.error}`,
    `--color-warning:${colors.semantic.warning}`,
    `--color-info:${colors.semantic.info}`,
    `--glass:${colors.surface.glass}`,
    `--glass-strong:${colors.surface.glassStrong}`,
    `--glass-border:${colors.surface.glassBorder}`,
    `--color-primary-dim:${colors.surface.primaryDim}`,
    `--color-primary-glow:${colors.surface.primaryGlow}`,
    `--color-primary-subtle:${colors.surface.primarySubtle}`,
    `--color-border:${colors.surface.glassBorder}`,
    `--color-surface-hover:${isDark ? colors.utility.secondaryBackground + 'cc' : colors.utility.primaryBackground}`,
    `--color-primary-fg:${isDark ? colors.utility.primaryBackground : '#ffffff'}`,
    `--color-primary-hover:${colors.brand.primary}dd`,
    `--text-secondary:${colors.utility.secondaryText}`,
    `--text-muted:${isDark ? 'rgba(240,236,226,0.35)' : 'rgba(26,26,31,0.4)'}`,
    `--gold-dim:${colors.surface.primaryDim}`,
    `--gold-glow:${colors.surface.primaryGlow}`,
    `--gold-subtle:${colors.surface.primarySubtle}`,
    `color-scheme:${isDark ? 'dark' : 'light'}`,
  ].join(';');
}

function buildThemeMap(): string {
  // Build a compact JSON map: { themeId: { light: "css-string", dark: "css-string" } }
  const map: Record<string, { light: string; dark: string }> = {};
  for (const t of themes) {
    map[t.id] = {
      light: buildCSSVars(t.colors, false, t.colors.utility.primaryBackground),
      dark: buildCSSVars(t.darkMode.colors, true, t.darkMode.colors.utility.primaryBackground),
    };
  }
  return JSON.stringify(map);
}

interface ThemeScriptProps {
  defaultThemeId?: string;
  defaultColorMode?: 'light' | 'dark';
}

export function ThemeScript({
  defaultThemeId = 'vikuna-black',
  defaultColorMode = 'dark',
}: ThemeScriptProps) {
  const fallbackTheme = themes.find(t => t.id === defaultThemeId) || defaultTheme;
  const isDark = defaultColorMode === 'dark';
  const fallbackColors = isDark ? fallbackTheme.darkMode.colors : fallbackTheme.colors;
  const fallbackCSS = buildCSSVars(fallbackColors, isDark, fallbackColors.utility.primaryBackground);
  const themeMap = buildThemeMap();

  // The blocking script that runs synchronously before paint
  const script = `(function(){try{var m=${themeMap};var t=localStorage.getItem('pk-theme-id')||'${defaultThemeId}';var c=localStorage.getItem('pk-color-mode')||'${defaultColorMode}';var d=m[t];if(!d)d=m['${defaultThemeId}'];var v=c==='dark'?d.dark:d.light;document.documentElement.style.cssText+=';'+v;}catch(e){}})();`;

  // Form design tokens — structural, NOT theme-dependent
  // Every form control in every page reads from these. Change here = change everywhere.
  const formTokens = [
    '--input-height:44px',
    '--input-padding:13px 16px',
    '--input-radius:8px',
    '--input-font-size:0.9rem',
    '--input-border-width:1px',
    '--input-focus-ring-size:3px',
    '--input-focus-ring-opacity:12%',
    '--input-placeholder-opacity:0.35',
    '--label-font-size:0.65rem',
    '--label-font-weight:500',
    '--label-letter-spacing:0.12em',
    '--label-margin-bottom:6px',
    '--btn-height:44px',
    '--btn-padding:14px',
    '--btn-radius:8px',
    '--btn-font-size:0.85rem',
    '--btn-font-weight:700',
    '--btn-letter-spacing:0.08em',
    '--form-group-gap:16px',
    '--form-row-gap:12px',
  ].join(';');

  return (
    <>
      {/* Form design tokens — structural constants, same across all themes */}
      <style dangerouslySetInnerHTML={{ __html: `:root{${formTokens}}` }} />
      {/* SSR fallback: default theme colors */}
      <style
        dangerouslySetInnerHTML={{
          __html: `:root{${fallbackCSS}}`,
        }}
      />
      {/* Blocking script: reads localStorage and applies saved theme before paint */}
      <Script id="theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: script }} />
    </>
  );
}
