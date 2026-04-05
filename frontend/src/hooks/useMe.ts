'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, getAccessToken } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';

/* ── Types ──────────────────────────────────────────── */

export interface MeUser {
  id: string;
  email: string;
  name: string;
  first_name?: string;
  last_name?: string;
  role_id: string;
  avatar_url?: string;
  designation?: string;
  mobile?: string;
  preferences?: Record<string, unknown>;
}

export interface MeTenant {
  id: string;
  name: string;
  slug: string;
  theme_id?: string;
  logo_url?: string;
  onboarding_complete: boolean;
  is_live: boolean;   // TRUE = live environment, FALSE = sandbox
  is_admin: boolean;  // TRUE = tenant has admin privileges
}

export interface MeResponse {
  user: MeUser;
  tenant: MeTenant;
}

/* ── Query Key ──────────────────────────────────────── */

export const ME_QUERY_KEY = ['auth', 'me'] as const;

/* ── Hook ───────────────────────────────────────────── */

/**
 * Fetch current user + tenant from /auth/me.
 * Only runs when an access token exists in sessionStorage.
 * Cached for 5 minutes, refetches on window focus.
 */
export function useMe() {
  return useQuery<MeResponse>({
    queryKey: ME_QUERY_KEY,
    queryFn: () => apiFetch<MeResponse>(API.auth.me),
    enabled: !!getAccessToken(),
    staleTime: 5 * 60 * 1000,
  });
}

/**
 * Imperatively invalidate the /auth/me cache.
 * Call after login, register, profile update, onboarding step completion.
 */
export function useInvalidateMe() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ME_QUERY_KEY });
}
