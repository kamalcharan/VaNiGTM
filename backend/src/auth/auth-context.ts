/**
 * VaNi GTM — The single place a request's identity is resolved.
 *
 * User ruling (2026-07-28): *"why do we need so many code paths … it should be
 * 1 single code — just a flag, admin / non admin, that's it."*
 *
 * Two resolutions of the same claim had already drifted apart:
 *
 *   etl.routes.ts   is_live: jwt.is_live !== false     -> true when absent
 *   server.ts       is_live: jwt.is_live               -> undefined when absent
 *
 * On a token issued before the claim existed, the importer wrote
 * `is_live = true` while every skill queried `is_live = NULL`, which matches
 * nothing. Records landed and were invisible. Nobody wrote that bug; it
 * appeared in the gap between two copies of the same three lines.
 *
 * The same was true of admin: read from the JWT in one place and re-queried
 * from vn_tenants in another. Same claim, two answers available.
 *
 * So: ONE resolver. Every entry point calls it, nothing re-derives, and admin
 * is exactly what the ruling asks for — a flag on the context.
 */

import { verifyAccessToken } from './token.service';

export interface AuthContext {
  user_id: string;
  tenant_id: string;
  /** Environment from the JWT. Absent claim means live, never NULL. */
  is_live: boolean;
  /** vn_tenants.is_admin, carried in the token. NEVER read from a body. */
  is_admin: boolean;
}

/**
 * Resolve identity from an Authorization header.
 * Returns null when the header is missing or the token does not verify —
 * callers turn that into their own 401.
 */
export function resolveAuth(authHeader: string | undefined): AuthContext | null {
  if (!authHeader?.startsWith('Bearer ')) return null;
  try {
    const jwt = verifyAccessToken(authHeader.slice(7));
    return {
      user_id: jwt.user_id,
      tenant_id: jwt.tenant_id,
      // `!== false` and not a bare read: an older token has no claim, and
      // `undefined` reaching SQL becomes NULL, which equals nothing.
      is_live: jwt.is_live !== false,
      is_admin: jwt.is_admin === true,
    };
  } catch {
    return null;
  }
}
