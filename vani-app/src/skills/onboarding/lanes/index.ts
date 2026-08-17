'use client';

/**
 * Lane registration, done explicitly.
 *
 * This was a bare side-effect import from the route file at first, and it did
 * not work: the route is a server component, so `registerLane()` ran in the
 * server bundle only. The client rendered "unknown lane" and React reported a
 * hydration mismatch, because the two halves genuinely disagreed.
 *
 * So registration lives in a client module that the engine imports directly.
 * Adding an agent's lane is still one file plus one line here — and now the line
 * is load-bearing and visible, rather than an import someone could tidy away.
 */

import { registerLane } from '../lane';
import { productLane } from './product';

registerLane(productLane);

// Agent lanes register here as agents ship, e.g.
//   import { varaLane } from '@/skills/vara/onboarding';
//   registerLane(varaLane);
// The engine does not change.

export { productLane };
