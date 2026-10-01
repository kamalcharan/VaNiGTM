/**
 * ThemeConfig + mode → the CSS custom properties the console actually uses.
 *
 * ONE PLACE. Every colour a screen can reference is produced here, from a
 * dozen values per mode in a theme file. `globals.css` declares no palette of
 * its own any more; it declares structure (radii, control metrics, spacing)
 * and consumes these.
 *
 * ── Why both token families are emitted ────────────────────────────────────
 * The console's screens use two naming schemes, and both are load-bearing:
 *
 *   --bg / --surf / --tx / --gold / --ac / --teal     vani-app's own
 *   --color-bg / --color-primary / --glass / ...      VaNiGTM's, used by every
 *                                                      ported screen and by
 *                                                      platform/vdf
 *
 * Emitting one and not the other does not degrade — it BLANKS. A CSS
 * declaration with an undefined var is discarded by the browser, silently.
 * That already shipped once: the live-progress spinner was
 * `border: 2px solid var(--color-primary-dim)` and painted nothing at all, so
 * a four-minute research run looked frozen. Any token added to a screen must
 * be added here, or it fails that way again.
 *
 * ── What is derived, and why ───────────────────────────────────────────────
 * A theme gives two backgrounds and two text colours. The console wants three
 * surface steps, three text steps and two border steps. Writing all of them per
 * theme is how a light mode ends up with a third surface nobody tuned. So the
 * in-between steps are mixed from the values the theme DID state, which keeps a
 * new theme to about a dozen numbers.
 *
 * A theme may pin its own `surface` block and skip the derivation — Jade Thorn
 * does, because it was matched to a real reference design.
 */

import type { ColorMode, ThemeConfig, ThemeColorSet } from './types';
import { alpha, bestTextOn, lighten, luminance, mix } from './color';

export const TOKEN_ATTR = 'data-theme';
export const MODE_ATTR = 'data-mode';

const DEFAULT_FONTS = {
  display: "'Fraunces', Georgia, serif",
  body: "'DM Sans', ui-sans-serif, system-ui, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace",
};

export function resolveTokens(theme: ThemeConfig, mode: ColorMode): Record<string, string> {
  const c: ThemeColorSet = mode === 'dark' ? theme.darkMode.colors : theme.colors;
  const dark = mode === 'dark';

  const bg = c.utility.primaryBackground;
  const surf = c.utility.secondaryBackground;
  const tx = c.utility.primaryText;
  const tx2 = c.utility.secondaryText;
  const primary = c.brand.primary;

  /**
   * The second surface, and the one place a theme's field can mean two things.
   *
   * `brand.alternate` is the elevated surface in most themes — #1C2030,
   * #2b3238, #1a2e22 are all a step above their page. In the VaNi theme it is
   * `#ff8f5a`, a soft ORANGE: that theme uses the slot for a brand tone, not a
   * surface. Taking it at face value paints every raised card orange.
   *
   * So it is accepted as a surface only when it sits near the page in
   * brightness, which is what makes something read as a surface at all.
   * Anything further away is a brand colour in a surface's slot, and the step
   * is derived instead. Measured rather than special-cased by theme id: the
   * next theme to do this would otherwise break the same way.
   */
  const alt = c.brand.alternate;
  const altIsSurface = Math.abs(luminance(alt) - luminance(bg)) < 60;
  const surf2 = altIsSurface ? alt : mix(tx, surf, dark ? 0.08 : 0.05);

  // Elevation. Each step moves a little further from the page toward the text
  // colour, which reads as "closer to the viewer" in dark and in light alike.
  const bg2 = mix(surf, bg, 0.5);
  const surf3 = mix(tx, surf2, dark ? 0.06 : 0.04);

  // Borders. Derived from TEXT over BACKGROUND rather than from a brand tone,
  // so a divider never carries the accent colour — the mistake that makes an
  // interface look tinted. A theme that pinned `glassBorder` wins.
  const line = c.surface?.glassBorder ?? mix(tx, bg, dark ? 0.14 : 0.12);
  const line2 = c.surface?.glassBorder ? mix(tx, bg, dark ? 0.26 : 0.2) : mix(tx, bg, dark ? 0.26 : 0.2);

  // A third text step for the quietest labels. `mix` weights its FIRST
  // argument, so this is 55% of the muted text over the page in dark mode.
  // In light mode that measured 1.9:1 on Jade Thorn's paper — every eyebrow,
  // counter label and role line vanished — so it keeps 90% (3.2:1), the
  // faintest step that still reads (2026-09-29).
  const tx3 = mix(tx2, bg, dark ? 0.55 : 0.9);

  // The primary at three alphas, and its glass counterparts. VaNiGTM's exact
  // steps — .38 / .16 / .07 for primary, .07 / .12 / .24 for glass — because
  // ported screens were composed against them.
  const primaryDim = c.surface?.primaryDim ?? alpha(primary, dark ? 0.38 : 0.28);
  const primaryGlow = c.surface?.primaryGlow ?? alpha(primary, dark ? 0.16 : 0.12);
  const primarySubtle = c.surface?.primarySubtle ?? alpha(primary, dark ? 0.07 : 0.05);
  const glass = c.surface?.glass ?? alpha(primary, dark ? 0.07 : 0.04);
  const glassStrong = c.surface?.glassStrong ?? alpha(primary, dark ? 0.12 : 0.07);
  const glassBorder = c.surface?.glassBorder ?? alpha(primary, dark ? 0.24 : 0.18);

  // Text ON the primary — whichever of the theme's own ink and white actually
  // reads better against it, by WCAG contrast rather than by a brightness
  // guess. Amber, gold and the VaNi orange take dark text; deep jade takes
  // white. Choosing by hand makes one theme in four illegible on every button.
  const primaryFg = bestTextOn(primary, mix('#000000', bg, 0.82), '#ffffff');

  const fonts = { ...DEFAULT_FONTS, ...(theme.fonts ?? {}) };

  return {
    /* ── vani-app's own names ─────────────────────────────────────────── */
    '--bg': bg,
    '--bg2': bg2,
    '--surf': surf,
    '--surf2': surf2,
    '--surf3': surf3,
    '--line': line,
    '--line2': line2,
    '--tx': tx,
    '--tx2': tx2,
    '--tx3': tx3,

    // `--gold` and `--ac` were two separate brand colours when the palette was
    // fixed: gold for VaNi, orange for the marketing site's actions. A theme
    // has ONE action colour, so both families now resolve to it. Screens keep
    // their existing var names and simply follow the theme.
    '--gold': primary,
    '--gold-light': lighten(primary, 0.18),
    '--ac': primary,
    '--ac-light': lighten(primary, 0.18),
    '--ac-dim': primarySubtle,
    '--ac-line': primaryDim,

    // The secondary/positive family. Bound to the theme's success colour, not
    // to brand.secondary — in Vikuna Black that field is a cream text tone, and
    // using it for "positive" would paint a success state in body text.
    '--teal': c.semantic.success,
    '--teal-light': lighten(c.semantic.success, 0.2),

    '--ok': c.semantic.success,
    '--warn': c.semantic.warning,
    '--bad': c.semantic.error,

    '--display': fonts.display,
    '--sans': fonts.body,
    '--mono': fonts.mono,

    /* ── VaNiGTM's names, used by platform/vdf and every ported screen ── */
    '--color-bg': bg,
    '--color-surface': surf,
    '--color-border': line,
    '--color-fg': tx,
    '--color-text': tx,
    '--color-text-dim': tx2,
    '--color-muted': tx2,
    '--card-accent': primary,

    '--color-primary': primary,
    '--color-primary-hover': lighten(primary, 0.18),
    '--color-primary-fg': primaryFg,
    '--color-primary-dim': primaryDim,
    '--color-primary-glow': primaryGlow,
    '--color-primary-subtle': primarySubtle,

    '--color-success': c.semantic.success,
    '--color-warning': c.semantic.warning,
    '--color-danger': c.semantic.error,
    '--color-info': c.semantic.info,

    '--glass': glass,
    '--glass-strong': glassStrong,
    '--glass-border': glassBorder,

    '--font-display': fonts.display,
    '--font-body': fonts.body,
    '--font-mono': fonts.mono,
    // Uppercase labels wear the body face (Edge does; mono at 400 read thin).
    '--font-label': fonts.body,
  };
}

/** The same map as a CSS declaration body, for the pre-paint <style>. */
export function tokensToCss(tokens: Record<string, string>): string {
  return Object.entries(tokens).map(([k, v]) => `${k}:${v}`).join(';');
}
