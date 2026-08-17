/**
 * VaNi — Service URL registry.
 *
 * Ported from VaNiGTM's frontend/src/lib/serviceURLs.ts, trimmed to the base
 * slice. Same rule applies here: no component ever builds a URL by hand, and
 * an endpoint only appears once the functionality that uses it has moved.
 *
 * VaNiGTM declares 19 auth endpoints. These five are the account base;
 * invite, team, sessions, forgot/reset-password, switch-env, onboarding and
 * profile come later, with their features.
 */

export interface ServiceEndpoint {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly auth: boolean;
  readonly description: string;
}

export const API = {
  auth: {
    register: {
      method: 'POST',
      path: '/api/v1/auth/register',
      auth: false,
      description:
        'Create a tenant and its first user, then sign them in. Gated in the UI; open on the API.',
    },
    login: {
      method: 'POST',
      path: '/api/v1/auth/login',
      auth: false,
      description: 'Exchange credentials for an access token; sets the refresh cookie.',
    },
    refresh: {
      method: 'POST',
      path: '/api/v1/auth/refresh',
      auth: false,
      description: 'Rotate the session. The httpOnly cookie carries the refresh token.',
    },
    logout: {
      method: 'POST',
      path: '/api/v1/auth/logout',
      auth: true,
      description: 'Revoke the server session and clear the refresh cookie.',
    },
    me: {
      method: 'GET',
      path: '/api/v1/auth/me',
      auth: true,
      description: 'Hydrate the current user and tenant.',
    },
  },
} as const satisfies Record<string, Record<string, ServiceEndpoint>>;
