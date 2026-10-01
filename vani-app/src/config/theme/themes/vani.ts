import type { ThemeConfig } from '../types';

/**
 * VaNi — the signature orange skin, and the console's DEFAULT.
 *
 * It arrived as an onboarding-only skin, and its original header said "NOT
 * shown in the workspace theme picker ... used exclusively during the
 * onboarding flow (screens 1–4)". That is no longer true: Charan made it the
 * product default on 2026-09-22, so it is in the picker like the rest. A
 * default nobody can see or return to is not a default, it is a trap — pick
 * another theme once and VaNi would be unreachable.
 *
 * `accent1` is annotated in the original as the floating island's background.
 * Nothing in tokens.ts reads the accent slots today; they are carried so the
 * definition stays identical to VaNiGTM's copy.
 */
export const VaniTheme: ThemeConfig = {
  id: 'vani',
  name: 'VaNi',
  blurb: 'The signature orange. Warm; the default until 2026-09-29.',
  colors: {
    brand: {
      primary: '#ff6b2b',   // signature VaNi orange
      secondary: '#ff8f5a', // soft orange
      tertiary: '#e85520',  // deep orange
      alternate: '#ff8f5a',
    },
    utility: {
      primaryText: '#1a1816',
      secondaryText: '#6a6460',
      primaryBackground: '#f0ece6',   // warm off-white
      secondaryBackground: '#ffffff',
    },
    accent: {
      accent1: '#1a1816',   // near-black — the floating island's background
      accent2: '#2a2420',
      accent3: '#f0ece6',
      accent4: '#6a6460',
    },
    semantic: {
      success: '#22c55e',
      error: '#ef4444',
      warning: '#f59e0b',
      info: '#3b82f6',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#ff6b2b',
        secondary: '#ff8f5a',
        tertiary: '#e85520',
        alternate: '#ff8f5a',
      },
      utility: {
        primaryText: '#f0ece6',
        secondaryText: '#9a9490',
        primaryBackground: '#1a1816',
        secondaryBackground: '#2a2420',
      },
      accent: {
        accent1: '#0a0806',
        accent2: '#1a1816',
        accent3: '#f0ece6',
        accent4: '#6a6460',
      },
      semantic: {
        success: '#22c55e',
        error: '#ef4444',
        warning: '#f59e0b',
        info: '#3b82f6',
      },
    },
  },
};
