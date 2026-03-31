'use client';

import { createContext, useContext, type ReactNode } from 'react';

/* ── Types ───────────────────────────────────────────── */

interface OnboardingStep {
  id: string;
  order: number;
  mandatory: boolean;
  component: string;
  title: string;
}

interface ShellConfig {
  apiUrl: string;
  product: {
    name: string;
    tagline: string;
  };
  onboarding: {
    steps: OnboardingStep[];
  };
}

interface ShellConfigContextValue extends ShellConfig {}

/* ── Default config ─────────────────────────────────── */

const defaultConfig: ShellConfig = {
  apiUrl: typeof window !== 'undefined'
    ? (window.location.origin)
    : 'http://localhost:3000',
  product: {
    name: 'KI-PRIME',
    tagline: 'by Vikuna Technologies',
  },
  onboarding: {
    steps: [
      { id: 'user_profile', order: 1, mandatory: true, component: 'OnboardUserProfile', title: 'Your Profile' },
      { id: 'business_profile', order: 2, mandatory: true, component: 'OnboardBusiness', title: 'Business Details' },
      { id: 'theme_selection', order: 3, mandatory: false, component: 'OnboardTheme', title: 'Theme' },
      { id: 'invite_team', order: 4, mandatory: false, component: 'OnboardInvite', title: 'Invite Team' },
      { id: 'risk_preferences', order: 5, mandatory: false, component: 'OnboardPreferences', title: 'Preferences' },
      { id: 'import_data', order: 6, mandatory: false, component: 'OnboardImport', title: 'Import Data' },
    ],
  },
};

/* ── Context ─────────────────────────────────────────── */

const ShellConfigContext = createContext<ShellConfigContextValue>(defaultConfig);

export function ShellConfigProvider({ children }: { children: ReactNode }) {
  return (
    <ShellConfigContext.Provider value={defaultConfig}>
      {children}
    </ShellConfigContext.Provider>
  );
}

export function useShellConfig(): ShellConfigContextValue {
  return useContext(ShellConfigContext);
}
