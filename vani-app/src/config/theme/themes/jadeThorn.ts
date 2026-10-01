import type { ThemeConfig } from '../types';

/**
 * Jade Thorn — RE-PINNED TO THE VaNi EDGE PALETTE (Charan, 2026-09-29).
 *
 * The values below are read off `VaNiGTM/docs/EDGE/vani-edge/styles/`
 * (tokens.css, app.css, mission.css), the Edge UX reference. Charan's ruling:
 * "update the product Jade-thorn to match the Edge specs … it will impact
 * complete product which will now carry the theme of Edge theme." So this is
 * no longer the contactnest-ux.html parchment-and-brass theme; the whole
 * console wears Edge's paper, ink green and lime when this theme is chosen.
 *
 * Edge has no dark mode of its own — the reference is light only — so the
 * dark block is derived here: the same greens lifted to read on near-black,
 * with the ink panel (`.value-summary`, `#173f36`) becoming the card surface.
 *
 * Fonts: Edge's, by ruling ("use Edge's fonts"). Edge sets one stack —
 * Inter / Segoe UI / Arial — for headings and body alike; its Georgia italic
 * is only for the accent words inside Edge's own screens and stays in Edge's
 * scoped stylesheet. So both faces are pinned here. (BrandFonts still fetches
 * Fraunces/DM Sans for the other three themes; Inter is not fetched — like the
 * reference, it renders Inter where the OS has it and Segoe/Arial otherwise.)
 */
export const JadeThornTheme: ThemeConfig = {
  id: 'jade-thorn',
  name: 'Jade Thorn',
  blurb: 'Paper, ink green and lime — the VaNi Edge palette.',
  fonts: {
    display: "Inter, 'Segoe UI', Arial, sans-serif",
    body: "Inter, 'Segoe UI', Arial, sans-serif",
  },
  colors: {
    brand: {
      primary: '#173f36',    // --ink: buttons, current step, the value panel
      secondary: '#d7eea2',  // --lime: the accent that reads against ink
      tertiary: '#718078',   // --muted: secondary copy, text buttons
      alternate: '#eaf0e6',  // --wash: tags, source banners, selected chips
    },
    utility: {
      primaryText: '#283f38',          // --text
      secondaryText: '#718078',        // --muted
      primaryBackground: '#f5f5ef',    // --paper
      secondaryBackground: '#ffffff',  // cards
    },
    accent: {
      accent1: '#22664e',  // --green: links, the live dot
      accent2: '#d7eea2',  // --lime
      accent3: '#a46a24',  // --amber: exceptions, needs-confirmation
      accent4: '#7c8f64',  // the Georgia-italic accent words
    },
    semantic: {
      success: '#22664e',  // --green
      error: '#a45040',    // --red
      warning: '#a46a24',  // --amber
      info: '#376653',     // the Ask Edge pill border
    },
    surface: {
      glass: 'rgba(23,63,54,0.04)',
      glassStrong: 'rgba(23,63,54,0.07)',
      glassBorder: '#dfe5de',          // --line, the exact border colour
      primaryDim: 'rgba(23,63,54,0.25)',
      primaryGlow: 'rgba(23,63,54,0.1)',
      primarySubtle: 'rgba(23,63,54,0.04)',
    },
  },
  darkMode: {
    colors: {
      brand: {
        primary: '#7eb58d',    // the orb's mid green, legible on near-black
        secondary: '#d7eea2',  // lime stays lime
        tertiary: '#8fa397',
        alternate: '#174c3c',  // the Ask Edge pill green as the raised surface
      },
      utility: {
        primaryText: '#f5f5ef',
        secondaryText: 'rgba(245,245,239,0.68)',
        primaryBackground: '#0c1b17',  // the process-explorer canvas
        secondaryBackground: '#173f36', // the value panel
      },
      accent: {
        accent1: '#7eb58d',
        accent2: '#d7eea2',
        accent3: '#d9a55a',
        accent4: '#b4cb9a',
      },
      semantic: {
        success: '#7eb58d',
        error: '#e07a68',
        warning: '#d9a55a',
        info: '#8fbfa8',
      },
      surface: {
        glass: 'rgba(126,181,141,0.07)',
        glassStrong: 'rgba(126,181,141,0.13)',
        glassBorder: 'rgba(126,181,141,0.24)',
        primaryDim: 'rgba(126,181,141,0.36)',
        primaryGlow: 'rgba(126,181,141,0.16)',
        primarySubtle: 'rgba(126,181,141,0.07)',
      },
    },
  },
};
