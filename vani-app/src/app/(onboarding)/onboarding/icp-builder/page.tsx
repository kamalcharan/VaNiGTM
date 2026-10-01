/**
 * /onboarding/icp-builder — the post-onboarding refine surface.
 *
 * Ported from VaNiGTM `frontend/src/app/(app)/brain/mission/icp-builder/`. The
 * mission wizard's own header comment names this route, so its absence was a
 * dangling reference: the wizard confirms an ideal customer in one pass, and
 * this is where a tenant comes back to edit it field by field, with per-field
 * save state and section completeness.
 *
 * It sits under the same route group as the wizard — outside the console shell —
 * so the onboarding gate still cannot be clicked past.
 */

import IcpBuilder from '@/skills/onboarding/screens/icp-builder/IcpBuilder';

export default function IcpBuilderPage() {
  return <IcpBuilder />;
}
