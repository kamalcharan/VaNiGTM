/**
 * KI-Prime — Service URL Registry
 *
 * Single source of truth for all API endpoints.
 * Every hook calls api-client.ts which reads from here.
 * No .tsx file ever constructs a URL manually.
 *
 * NLP-ready: each entry has a description field that
 * VaNi can introspect for intent mapping.
 *
 * Path params use :param syntax (resolved by api-client).
 */

export interface ServiceEndpoint {
  readonly method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  readonly path: string;
  readonly auth: boolean;
  readonly description: string;
}

export const API = {

  /* ── Auth ──────────────────────────────────────────── */

  auth: {
    register: {
      method: 'POST',
      path: '/api/v1/auth/register',
      auth: false,
      description: 'Register a new user and create a tenant workspace',
    },
    login: {
      method: 'POST',
      path: '/api/v1/auth/login',
      auth: false,
      description: 'Sign in with email and password',
    },
    me: {
      method: 'GET',
      path: '/api/v1/auth/me',
      auth: true,
      description: 'Get current user profile, tenant, and onboarding status',
    },
    refresh: {
      method: 'POST',
      path: '/api/v1/auth/refresh',
      auth: false,
      description: 'Refresh access token using refresh token',
    },
    logout: {
      method: 'POST',
      path: '/api/v1/auth/logout',
      auth: true,
      description: 'Sign out and revoke current session',
    },
    forgotPassword: {
      method: 'POST',
      path: '/api/v1/auth/forgot-password',
      auth: false,
      description: 'Request a password reset link',
    },
    resetPassword: {
      method: 'POST',
      path: '/api/v1/auth/reset-password',
      auth: false,
      description: 'Reset password using a reset token',
    },
    changePassword: {
      method: 'POST',
      path: '/api/v1/auth/change-password',
      auth: true,
      description: 'Change password while logged in',
    },
    preferences: {
      method: 'PATCH',
      path: '/api/v1/auth/preferences',
      auth: true,
      description: 'Update user preferences (theme, profile fields)',
    },
    sessionsRevoke: {
      method: 'POST',
      path: '/api/v1/auth/sessions/revoke',
      auth: false,
      description: 'Revoke active sessions (pre-login, requires email+password)',
    },
    sessionsList: {
      method: 'GET',
      path: '/api/v1/auth/sessions',
      auth: true,
      description: 'List all active sessions for current user',
    },
  },

  /* ── Invitations ──────────────────────────────────── */

  invite: {
    send: {
      method: 'POST',
      path: '/api/v1/auth/invite',
      auth: true,
      description: 'Send team invitation(s) by email',
    },
    validate: {
      method: 'GET',
      path: '/api/v1/auth/invite/validate',
      auth: false,
      description: 'Validate an invitation token and get context',
    },
    accept: {
      method: 'POST',
      path: '/api/v1/auth/invite/accept',
      auth: false,
      description: 'Accept an invitation and create account or join tenant',
    },
    list: {
      method: 'GET',
      path: '/api/v1/auth/invitations',
      auth: true,
      description: 'List pending invitations for current tenant',
    },
    revoke: {
      method: 'DELETE',
      path: '/api/v1/auth/invitations/:id',
      auth: true,
      description: 'Revoke a pending invitation',
    },
  },

  /* ── Onboarding ───────────────────────────────────── */

  onboarding: {
    status: {
      method: 'GET',
      path: '/api/v1/onboarding/status',
      auth: true,
      description: 'Get onboarding completion status and mandatory steps',
    },
    completeStep: {
      method: 'PATCH',
      path: '/api/v1/onboarding/step',
      auth: true,
      description: 'Mark an onboarding step as completed',
    },
  },

  /* ── Tenant ───────────────────────────────────────── */

  tenant: {
    profileGet: {
      method: 'GET',
      path: '/api/v1/tenant/profile',
      auth: true,
      description: 'Get tenant business profile',
    },
    profile: {
      method: 'PATCH',
      path: '/api/v1/tenant/profile',
      auth: true,
      description: 'Update tenant business profile (name, ARN, theme)',
    },
  },

  /* ── ETL ──────────────────────────────────────────── */

  etl: {
    upload: {
      method: 'POST',
      path: '/api/v1/etl/upload',
      auth: true,
      description: 'Upload a file for import (multipart/form-data)',
    },
    headers: {
      method: 'GET',
      path: '/api/v1/etl/headers/:fileId',
      auth: true,
      description: 'Detect headers and sample rows from uploaded file',
    },
    sessions: {
      method: 'GET',
      path: '/api/v1/etl/sessions',
      auth: true,
      description: 'List all import sessions',
    },
    createSession: {
      method: 'POST',
      path: '/api/v1/etl/sessions',
      auth: true,
      description: 'Create import session with field mapping and stage data',
    },
    process: {
      method: 'POST',
      path: '/api/v1/etl/sessions/:id/process',
      auth: true,
      description: 'Process staged data into target table',
    },
    status: {
      method: 'GET',
      path: '/api/v1/etl/sessions/:id/status',
      auth: true,
      description: 'Get import session status and progress',
    },
  },

  /* ── Skills (generic) ─────────────────────────────── */

  skills: {
    execute: {
      method: 'POST',
      path: '/api/v1/skills/:skill/:fn',
      auth: true,
      description: 'Execute a skill function with parameters',
    },
  },

} as const;

/**
 * Type helper — extract the keys for a given service group.
 * Useful for NLP intent mapping.
 */
export type ApiGroup = keyof typeof API;
export type ApiEndpoint<G extends ApiGroup> = keyof (typeof API)[G];
