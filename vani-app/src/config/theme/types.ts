/**
 * A theme, in the shape VaNiGTM already uses.
 *
 * Deliberately the SAME structure as `VaNiGTM/frontend/src/config/theme/types.ts`
 * so a theme file copies between the two repos unchanged. That is the whole
 * reason not to invent a nicer shape: these definitions are handed around as
 * text, and a second dialect means every paste needs translating and the two
 * products drift apart one field at a time.
 *
 * `colors` is LIGHT mode. `darkMode.colors` is dark. Everything in dark is
 * optional — what a theme leaves out is derived (see tokens.ts), so a new
 * theme is a dozen hex values, not forty.
 */

export interface ThemeColorSet {
  brand: {
    /** The action colour. Buttons, focus rings, the agent's own accent. */
    primary: string;
    /** Strong contrast partner — headings on light, cream text on dark. */
    secondary: string;
    /** Muted bridge tone. Borders and dividers in most themes. */
    tertiary: string;
    /** The elevated surface a card sits on above the page background. */
    alternate: string;
  };
  utility: {
    primaryText: string;
    secondaryText: string;
    /** The page. */
    primaryBackground: string;
    /** Cards and panels. */
    secondaryBackground: string;
  };
  accent: {
    accent1: string;
    accent2: string;
    accent3: string;
    accent4: string;
  };
  semantic: {
    success: string;
    error: string;
    warning: string;
    info: string;
  };
  /**
   * Optional, and usually omitted. A theme that has been tuned against a real
   * reference design can pin its glass and primary-alpha steps here instead of
   * letting them be derived. Jade Thorn does; the other two do not.
   */
  surface?: {
    glass?: string;
    glassStrong?: string;
    glassBorder?: string;
    primaryDim?: string;
    primaryGlow?: string;
    primarySubtle?: string;
  };
}

export interface ThemeFonts {
  display?: string;
  body?: string;
  mono?: string;
}

export interface ThemeConfig {
  /** Stable id. This is what is persisted per user — never the name. */
  id: string;
  /** What the picker shows. */
  name: string;
  /** One line saying what it is for, shown under the name. */
  blurb?: string;
  colors: ThemeColorSet;
  darkMode: { colors: ThemeColorSet };
  fonts?: ThemeFonts;
}

export type ColorMode = 'light' | 'dark';
