/**
 * KI-Prime — API Client (Interceptor)
 *
 * Single fetch wrapper that every hook uses. Handles:
 *   1. JWT injection (reads from sessionStorage)
 *   2. 401 interception → silent token refresh → retry once
 *   3. Path param substitution (:skill → portfolio-skill)
 *   4. Consistent error shape (always { code, message, details? })
 *   5. Query string params for GET requests
 *
 * No .tsx file imports this directly — only hooks do.
 * AuthProvider is the one exception (bootstraps before hooks).
 */

import type { ServiceEndpoint } from './serviceURLs';
import { API } from './serviceURLs';

/* ── Types ──────────────────────────────────────────── */

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  status: number;
}

export interface ApiFetchOptions {
  /** Request body (auto-serialized to JSON) */
  body?: Record<string, unknown> | object;
  /** Path params to substitute (:skill → value) */
  pathParams?: Record<string, string>;
  /** Query string params (for GET requests) */
  queryParams?: Record<string, string>;
  /** Override headers */
  headers?: Record<string, string>;
  /** Skip auth header even if endpoint.auth is true */
  skipAuth?: boolean;
  /** Skip 401 refresh retry (used internally to prevent loops) */
  skipRetry?: boolean;
}

/* ── Token Storage ──────────────────────────────────── */

const TOKEN_KEYS = {
  access: 'pk-access-token',
  refresh: 'pk-refresh-token',
  expiresAt: 'pk-token-expires-at',
} as const;

export function getAccessToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEYS.access);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEYS.refresh);
  } catch {
    return null;
  }
}

export function storeTokens(tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}): void {
  try {
    sessionStorage.setItem(TOKEN_KEYS.access, tokens.access_token);
    sessionStorage.setItem(TOKEN_KEYS.refresh, tokens.refresh_token);
    sessionStorage.setItem(
      TOKEN_KEYS.expiresAt,
      String(Date.now() + tokens.expires_in * 1000),
    );
  } catch {
    // sessionStorage unavailable (SSR)
  }
}

export function clearTokens(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEYS.access);
    sessionStorage.removeItem(TOKEN_KEYS.refresh);
    sessionStorage.removeItem(TOKEN_KEYS.expiresAt);
  } catch {}
}

export function getTokenExpiresAt(): number {
  try {
    return Number(sessionStorage.getItem(TOKEN_KEYS.expiresAt)) || 0;
  } catch {
    return 0;
  }
}

/* ── API Base URL ───────────────────────────────────── */

function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    // Client-side: use env var or same origin
    return process.env.NEXT_PUBLIC_API_URL || window.location.origin;
  }
  // SSR: use env var or default
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
}

/* ── Path Param Resolution ──────────────────────────── */

function resolvePath(
  path: string,
  pathParams?: Record<string, string>,
): string {
  if (!pathParams) return path;

  let resolved = path;
  for (const [key, value] of Object.entries(pathParams)) {
    resolved = resolved.replace(`:${key}`, encodeURIComponent(value));
  }
  return resolved;
}

/* ── Silent Token Refresh ───────────────────────────── */

let refreshPromise: Promise<boolean> | null = null;

async function silentRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = getRefreshToken();
    if (!refreshToken) return false;

    try {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}${API.auth.refresh.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        clearTokens();
        return false;
      }

      const data = await res.json();
      if (data.tokens) {
        storeTokens(data.tokens);
        return true;
      }

      clearTokens();
      return false;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/* ── Main Fetch ─────────────────────────────────────── */

/**
 * Execute an API call through the interceptor.
 *
 * Usage in hooks:
 *   const data = await apiFetch(API.auth.login, { body: { email, password } });
 *   const user = await apiFetch(API.auth.me);
 *   const result = await apiFetch(API.skills.execute, {
 *     pathParams: { skill: 'portfolio-skill', fn: 'get_holdings' },
 *     body: { params: { client_id: 123 } },
 *   });
 */
export async function apiFetch<T = Record<string, unknown>>(
  endpoint: ServiceEndpoint,
  options: ApiFetchOptions = {},
): Promise<T> {
  const { body, pathParams, queryParams, headers: extraHeaders, skipAuth, skipRetry } = options;

  // Build URL
  const baseUrl = getBaseUrl();
  let url = `${baseUrl}${resolvePath(endpoint.path, pathParams)}`;

  if (queryParams) {
    const qs = new URLSearchParams(queryParams).toString();
    if (qs) url += `?${qs}`;
  }

  // Build headers
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...extraHeaders,
  };

  // JWT injection
  if (endpoint.auth && !skipAuth) {
    const token = getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Execute fetch
  const fetchOptions: RequestInit = {
    method: endpoint.method,
    headers,
  };

  if (body && endpoint.method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err) {
    throw {
      code: 'NETWORK_ERROR',
      message: 'Network error — please check your connection and try again',
      status: 0,
    } satisfies ApiError;
  }

  // 401 → silent refresh → retry once
  if (res.status === 401 && endpoint.auth && !skipRetry) {
    const refreshed = await silentRefresh();
    if (refreshed) {
      return apiFetch<T>(endpoint, { ...options, skipRetry: true });
    }
    // Refresh failed — clear tokens, throw auth error
    clearTokens();
    throw {
      code: 'AUTH_EXPIRED',
      message: 'Session expired. Please sign in again.',
      status: 401,
    } satisfies ApiError;
  }

  // Parse response
  let data: Record<string, unknown>;
  try {
    data = await res.json();
  } catch {
    if (res.ok) return {} as T;
    throw {
      code: 'PARSE_ERROR',
      message: `Server returned ${res.status} with non-JSON body`,
      status: res.status,
    } satisfies ApiError;
  }

  // Success
  if (res.ok) return data as T;

  // Error response — normalize to ApiError shape
  const errorData = data?.error;
  throw {
    code: (typeof errorData === 'object' && errorData !== null
      ? (errorData as Record<string, unknown>).code
      : data?.code) as string || `HTTP_${res.status}`,
    message: (typeof errorData === 'object' && errorData !== null
      ? (errorData as Record<string, unknown>).message
      : typeof errorData === 'string'
        ? errorData
        : data?.message) as string || `Request failed (${res.status})`,
    details: (typeof errorData === 'object' && errorData !== null
      ? (errorData as Record<string, unknown>).details
      : undefined) as Record<string, unknown> | undefined,
    status: res.status,
  } satisfies ApiError;
}
