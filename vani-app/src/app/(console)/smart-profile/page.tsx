/**
 * /smart-profile — the record.
 *
 * Inside the console shell, unlike the build flow at /onboarding, which sits
 * outside it so a gated tenant cannot click past onboarding. This page is for
 * tenants who have already been through it.
 */

import SmartProfileView from '@/skills/smart-profile/screens/SmartProfileView';

export default function SmartProfilePage() {
  return <SmartProfileView />;
}
