/**
 * TypeScript view of the redirect map. The list itself lives in
 * `route-map.js` because next.config.js must require() it at build time to
 * emit the redirects — this file exists so application code (breadcrumbs,
 * tests) reads the same array rather than a second copy that drifts.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const map = require('./route-map.js') as {
  ROUTE_REDIRECTS: { from: string; to: string; why: string }[];
  RETAINED_UNMOVED: string[];
};

export const ROUTE_REDIRECTS = map.ROUTE_REDIRECTS;
export const RETAINED_UNMOVED = map.RETAINED_UNMOVED;
