'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch, storeTokens, clearTokens, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { ME_QUERY_KEY } from './useMe';

/* ── Types ──────────────────────────────────────────── */

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  country_code?: string;
  mobile?: string;
  tenant_name?: string;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface ActiveSession {
  session_id: string;
  device_type: string;
  os: string;
  browser: string;
  ip_address: string;
  last_activity_at: string;
}

export interface AuthTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

interface AuthSuccessResponse {
  tokens: AuthTokens;
  user: Record<string, unknown>;
  tenant: Record<string, unknown>;
}

interface SessionLimitResponse {
  error: {
    code: 'SESSION_LIMIT';
    message: string;
    max_sessions: number;
    active_sessions: ActiveSession[];
  };
}

export interface RevokeSessionsPayload {
  email: string;
  password: string;
  session_ids: string[];
}

/* ── Register ───────────────────────────────────────── */

export function useRegister() {
  const queryClient = useQueryClient();

  return useMutation<AuthSuccessResponse, ApiError, RegisterPayload>({
    mutationFn: (data) =>
      apiFetch<AuthSuccessResponse>(API.auth.register, { body: data }),
    onSuccess: (data) => {
      if (data.tokens) {
        storeTokens(data.tokens);
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      }
    },
  });
}

/* ── Login ──────────────────────────────────────────── */

/**
 * Login mutation.
 *
 * On success: stores tokens, invalidates /me cache.
 * On 409 (session limit): throws with code 'SESSION_LIMIT' and active_sessions array.
 * Caller should check error.code === 'SESSION_LIMIT' to show the session dialog.
 */
export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation<AuthSuccessResponse, ApiError, LoginPayload>({
    mutationFn: (data) =>
      apiFetch<AuthSuccessResponse>(API.auth.login, { body: data }),
    onSuccess: (data) => {
      if (data.tokens) {
        storeTokens(data.tokens);
        queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
      }
    },
  });
}

/* ── Logout ─────────────────────────────────────────── */

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation<unknown, ApiError, void>({
    mutationFn: () => apiFetch(API.auth.logout),
    onSettled: () => {
      clearTokens();
      queryClient.clear();
    },
  });
}

/* ── Revoke Sessions (pre-login, email+password) ──── */

export function useRevokeSessions() {
  return useMutation<AuthSuccessResponse, ApiError, RevokeSessionsPayload>({
    mutationFn: (data) =>
      apiFetch<AuthSuccessResponse>(API.auth.sessionsRevoke, { body: data }),
    onSuccess: (data) => {
      if (data.tokens) {
        storeTokens(data.tokens);
      }
    },
  });
}

/* ── Forgot Password ────────────────────────────────── */

export interface ForgotPasswordPayload {
  email: string;
}

export interface ForgotPasswordResponse {
  message: string;
  token?: string; // MVP: returned directly
}

export function useForgotPassword() {
  return useMutation<ForgotPasswordResponse, ApiError, ForgotPasswordPayload>({
    mutationFn: (data) =>
      apiFetch<ForgotPasswordResponse>(API.auth.forgotPassword, { body: data }),
  });
}

/* ── Reset Password ─────────────────────────────────── */

export interface ResetPasswordPayload {
  token: string;
  new_password: string;
}

export function useResetPassword() {
  return useMutation<{ message: string }, ApiError, ResetPasswordPayload>({
    mutationFn: (data) =>
      apiFetch<{ message: string }>(API.auth.resetPassword, { body: data }),
  });
}
