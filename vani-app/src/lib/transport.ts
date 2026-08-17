'use client';

/**
 * Transport selection, in one place.
 *
 * Live when NEXT_PUBLIC_API_ORIGIN is set, mock otherwise — the same condition
 * the session and onboarding guards use, so the app is never half-wired: a
 * gated console talking to a mock that cannot persist would loop a new tenant
 * through onboarding forever.
 *
 * Called at module scope by each layout. Idempotent, so more than one layout
 * calling it is fine.
 */

import { setSkillTransport } from './useSkill';
import { mockTransport } from './mock-transport';
import { liveTransport, IS_LIVE } from './live-transport';

let installed = false;

export function installSkillTransport(): void {
  if (installed) return;
  installed = true;
  setSkillTransport(IS_LIVE ? liveTransport : mockTransport);
}

export { IS_LIVE };
