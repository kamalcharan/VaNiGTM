/**
 * KI-Prime Shell Configuration
 *
 * Product-level config consumed by the VaNiBase shell's ShellConfigProvider.
 * Must conform to ShellConfig from vani-base/shell/src/lib/shell-config.ts
 */
import type { ShellConfig } from './vani-base/shell/src/lib/shell-config-types';
import LoginVault from './components/login-vault';
import LandingPage from './components/landing-page';
import RegisterPage from './components/register-page';
import ForgotPasswordPage from './components/forgot-password-page';
import ResetPasswordPage from './components/reset-password-page';
import InviteAcceptPage from './components/invite-accept-page';
import { ToastProvider } from './components/toast';
import OnboardUserProfile from './components/onboarding/OnboardUserProfile';
import OnboardBusiness from './components/onboarding/OnboardBusiness';
import OnboardTheme from './components/onboarding/OnboardTheme';
import OnboardInvite from './components/onboarding/OnboardInvite';
import OnboardPreferences from './components/onboarding/OnboardPreferences';
import OnboardImport from './components/onboarding/OnboardImport';

const shellConfig: ShellConfig = {
  product: {
    name: 'KI-Prime',
    tagline: 'Financial Planning for MFDs',
  },
  apiUrl: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
 auth: {
    customHeaders: {
      'X-Dev-Tenant-Id': 'a0000000-0000-0000-0000-000000000001',
      'X-Dev-User-Id': 'a0000000-0000-0000-0000-000000000002',
    },
},
  recipes: [
    // ── Wired (Priority 1–5) ──
    {
      recipe: 'client-list',
      label: 'Clients',
      route: '/client-list',
      skills: [
        { skill: 'client-skill', function: 'get_clients' },
      ],
    },
    {
      recipe: 'portfolio-view',
      label: 'Portfolio Overview',
      route: '/portfolio-view',
      skills: [
        { skill: 'portfolio-skill', function: 'get_holdings', params: { client_id: 1 } },
        { skill: 'portfolio-skill', function: 'get_allocation', params: { client_id: 1 } },
      ],
    },
   {
  recipe: 'client-360',
  label: 'Client 360',
  route: '/client-360',
  skills: [
    { skill: 'client-skill', function: 'get_client_profile', params: { client_id: 1 } },
    { skill: 'portfolio-skill', function: 'get_portfolio_summary', params: { client_id: 1 } },
    { skill: 'planning-skill', function: 'get_goals', params: { client_id: 1 } },
  ],
},
  {
  recipe: 'goal-dashboard',
  label: 'Financial Goals',
  route: '/goal-dashboard',
  skills: [
    { skill: 'planning-skill', function: 'get_goals', params: { client_id: 1 } },
    { skill: 'portfolio-skill', function: 'get_allocation', params: { client_id: 1 } },
  ],
},
    {
      recipe: 'scheme-explorer',
      label: 'Scheme Explorer',
      route: '/scheme-explorer',
      skills: [
        { skill: 'market-skill', function: 'search_schemes' },
      ],
    },
    // ── Deferred ──
    {
      recipe: 'daily-briefing',
      label: 'VaNi Command Center',
      route: '/daily-briefing',
      skills: [],
    },
    {
      recipe: 'goal-deep-dive',
      label: 'Goal Analysis',
      route: '/goal-deep-dive',
      skills: [],
    },
    {
      recipe: 'planning-playground',
      label: 'Planning Playground',
      route: '/planning-playground',
      skills: [],
    },
    {
      recipe: 'plan-vs-reality',
      label: 'Plan vs Reality',
      route: '/plan-vs-reality',
      skills: [],
    },
  ],
  onboarding: {
    steps: [
      { id: 'user_profile', label: 'Your Profile', mandatory: true, component: 'OnboardUserProfile' },
      { id: 'business_profile', label: 'Business Details', mandatory: true, component: 'OnboardBusiness' },
      { id: 'theme_selection', label: 'Theme', mandatory: false, component: 'OnboardTheme' },
      { id: 'invite_team', label: 'Invite Team', mandatory: false, component: 'OnboardInvite' },
      { id: 'risk_preferences', label: 'Preferences', mandatory: false, component: 'OnboardPreferences' },
      { id: 'import_data', label: 'Import Data', mandatory: false, component: 'OnboardImport' },
    ],
  },
  providers: [ToastProvider],
  pages: {
    login: LoginVault,
    landing: LandingPage,
    register: RegisterPage,
    forgotPassword: ForgotPasswordPage,
    resetPassword: ResetPasswordPage,
    inviteAccept: InviteAcceptPage,
  } as ShellConfig['pages'],
};

export default shellConfig;