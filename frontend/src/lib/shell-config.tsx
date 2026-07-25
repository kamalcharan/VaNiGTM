'use client';

import { createContext, useContext, type ReactNode } from 'react';
import { BRAND } from '@/constants/brand';

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

/* ── Default config ─────────────────────────────────── */

const defaultConfig: ShellConfig = {
  apiUrl: typeof window !== 'undefined'
    ? window.location.origin
    : 'http://localhost:3000',
  product: {
    name: BRAND.name,
    tagline: BRAND.tagline,
  },
  onboarding: {
    steps: [
      { id: 'user_profile',    order: 1, mandatory: true,  component: 'OnboardUserProfile', title: 'Your Profile' },
      { id: 'business_profile', order: 2, mandatory: true,  component: 'OnboardBusiness',    title: 'Business Details' },
      { id: 'platform',         order: 3, mandatory: true,  component: 'OnboardPlatform',    title: 'Your Platform' },
      { id: 'theme_selection',  order: 4, mandatory: false, component: 'OnboardTheme',       title: 'Theme' },
      { id: 'invite_team',      order: 5, mandatory: false, component: 'OnboardInvite',      title: 'Invite Team' },
      { id: 'risk_preferences', order: 6, mandatory: false, component: 'OnboardPreferences', title: 'Preferences' },
    ],
  },
};

/* ── Context ─────────────────────────────────────────── */

const ShellConfigContext = createContext<ShellConfig>(defaultConfig);

export function ShellConfigProvider({ children }: { children: ReactNode }) {
  return (
    <ShellConfigContext.Provider value={defaultConfig}>
      {children}
    </ShellConfigContext.Provider>
  );
}

export function useShellConfig(): ShellConfig {
  return useContext(ShellConfigContext);
}
