/**
 * The Settings tabs. Three of them are "bring your own" surfaces and share one
 * posture shape — platform or yours; the key goes in and never comes back; an
 * empty key on save means keep the stored one — so they read as one idea.
 *
 * A planned tab still appears and says what it will be (the console's habit
 * for unbuilt destinations), and says plainly that nothing behind it exists.
 * A tab that hid until it worked would leave "where do I connect Apollo?"
 * unanswerable.
 */
export type SettingsTabStatus = 'live' | 'planned';

export interface SettingsTab {
  id: string;
  label: string;
  href: string;
  status: SettingsTabStatus;
  /** One line under the label on a planned tab: what it will be, and what does not exist yet. */
  summary?: string;
  /** Only an admin tenant (vn_tenants.is_admin) sees this tab; the server enforces it too. */
  adminOnly?: boolean;
}

export const SETTINGS_TABS: SettingsTab[] = [
  { id: 'appearance', label: 'Appearance', href: '/settings/appearance', status: 'live' },
  { id: 'model',      label: 'Model',      href: '/settings/model',      status: 'live' },
  { id: 'consent',    label: 'Outreach consent', href: '/settings/consent', status: 'live' },
  { id: 'scoring',    label: 'Scoring',    href: '/settings/scoring',    status: 'live' },
  { id: 'tokens',     label: 'Tokens',     href: '/settings/tokens',     status: 'live' },
  { id: 'platform-models', label: 'Platform models', href: '/settings/platform-models', status: 'live', adminOnly: true },
  { id: 'industries', label: 'Industry master', href: '/settings/industries', status: 'live', adminOnly: true },
  { id: 'data',       label: 'Data',       href: '/settings/data',       status: 'planned',
    summary: 'Your own data provider — Apollo, Clay, anything with an API. Same shape as Model: platform or yours, the key never comes back. '
      + 'What it pulls stays in your workspace and never enters the shared pool. Nothing behind this tab is built yet — no table, no connector.' },
  { id: 'channels',   label: 'Channels',   href: '/settings/channels',   status: 'planned',
    summary: 'The identity you send as, and the channels connected to it — email, WhatsApp, LinkedIn, X. '
      + 'Arrives with the GTM agent. Nothing sends until this workspace accepts the DPDP notice (Outreach consent) and a channel is connected here — and none can be yet.' },
];

export const SETTINGS_HOME = SETTINGS_TABS[0].href;
