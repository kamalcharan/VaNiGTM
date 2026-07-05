/**
 * Central brand constants — single source of truth for the product name.
 *
 * Every user-facing brand string flows from here. Do not hardcode "Vikuna GTM"
 * / "VaNi" per component. CSS-module `content:` values (e.g. VdfLoader shimmer)
 * cannot import this — keep those literals in sync with BRAND.name manually.
 */
export const BRAND = {
  name: 'Vikuna GTM',
  shortName: 'VaNi',
  tagline: 'by Vikuna Technologies',
  legalName: 'Vikuna Technologies',
} as const;
