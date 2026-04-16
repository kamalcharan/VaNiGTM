/**
 * KI-Prime — API Client (Interceptor)
 *
 * Single fetch wrapper that every hook uses. Handles:
 *   1. JWT injection (reads from in-memory token set by auth-provider)
 *   2. 401 interception → silent token refresh via httpOnly cookie → retry once
 *   3. Path param substitution (:skill → portfolio-skill)
 *   4. Consistent error shape (always { code, message, details? })
 *   5. Query string params for GET requests
 *
 * Token storage model:
 *   - Access token:  in-memory only (_accessToken module variable). Lost on page reload;
 *                   auth-provider re-hydrates via silentRefresh() on every app mount.
 *   - Refresh token: httpOnly cookie (pk_refresh_token), set by the backend.
 *                   Browser JS cannot read it. Sent automatically on /api/v1/auth/* requests.
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
  /** AbortSignal — pass React Query's signal to cancel in-flight requests on unmount */
  signal?: AbortSignal;
}

/* ── In-memory Token Store ──────────────────────────── */
// Access token lives here only. Never written to localStorage/sessionStorage.
// auth-provider sets it on login, register, and after bootstrap refresh.
// Lost on page reload — silentRefresh() re-hydrates via httpOnly cookie.

let _accessToken: string | null = null;

export function setAccessToken(token: string | null): void {
  _accessToken = token;
}

export function getAccessToken(): string | null {
  return _accessToken;
}

export function storeTokens(tokens: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
}): void {
  // Access token → in-memory only.
  // Refresh token → httpOnly cookie already set by backend response (not handled here).
  setAccessToken(tokens.access_token);
}

export function clearTokens(): void {
  setAccessToken(null);
  // Clean up any legacy storage keys from before this migration
  try {
    sessionStorage.removeItem('pk-access-token');
    sessionStorage.removeItem('pk-refresh-token');
    sessionStorage.removeItem('pk-token-expires-at');
    localStorage.removeItem('pk-access-token');
    localStorage.removeItem('pk-refresh-token');
    localStorage.removeItem('pk-token-expires-at');
  } catch {}
}

/* ── API Base URL ───────────────────────────────────── */

function getBaseUrl(): string {
  if (typeof window !== 'undefined') {
    return process.env.NEXT_PUBLIC_API_URL || window.location.origin;
  }
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
// Sends POST /auth/refresh with credentials:include so the browser automatically
// attaches the httpOnly pk_refresh_token cookie. No token value read from JS.
// On success: sets _accessToken from the JSON response and returns true.
// On failure: clears _accessToken and returns false.

let refreshPromise: Promise<boolean> | null = null;

export async function silentRefresh(): Promise<boolean> {
  // Deduplicate concurrent refresh attempts
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const baseUrl = getBaseUrl();
      const res = await fetch(`${baseUrl}${API.auth.refresh.path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',  // sends httpOnly cookie automatically
        // no body — refresh token is in the cookie
      });

      if (!res.ok) {
        setAccessToken(null);
        return false;
      }

      const data = await res.json();
      if (data.tokens?.access_token) {
        setAccessToken(data.tokens.access_token);
        return true;
      }

      setAccessToken(null);
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
  const { body, pathParams, queryParams, headers: extraHeaders, skipAuth, skipRetry, signal } = options;

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

  // JWT injection (in-memory access token)
  if (endpoint.auth && !skipAuth) {
    const token = getAccessToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
  }

  // Execute fetch — credentials:include ensures the httpOnly refresh cookie
  // is sent automatically on all requests to the same origin/site.
  const fetchOptions: RequestInit = {
    method: endpoint.method,
    headers,
    credentials: 'include',
    signal,
  };

  if (body && endpoint.method !== 'GET') {
    fetchOptions.body = JSON.stringify(body);
  }

  let res: Response;
  try {
    res = await fetch(url, fetchOptions);
  } catch (err) {
    // Re-throw AbortError as-is so React Query treats it as a cancellation (not an error state)
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw {
      code: 'NETWORK_ERROR',
      message: 'Network error — please check your connection and try again',
      status: 0,
    } satisfies ApiError;
  }

  // 401 → silent refresh via cookie → retry once
  if (res.status === 401 && endpoint.auth && !skipRetry) {
    const refreshed = await silentRefresh();
    if (refreshed) {
      return apiFetch<T>(endpoint, { ...options, skipRetry: true });
    }
    // Refresh failed — session is gone
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
  const errObj = typeof errorData === 'object' && errorData !== null
    ? errorData as Record<string, unknown>
    : null;

  throw {
    code: (errObj?.code ?? data?.code ?? `HTTP_${res.status}`) as string,
    message: (errObj?.message ?? (typeof errorData === 'string' ? errorData : data?.message) ?? `Request failed (${res.status})`) as string,
    // Include all extra fields from error object as details (session_limit, etc.)
    details: errObj
      ? Object.fromEntries(Object.entries(errObj).filter(([k]) => !['code', 'message'].includes(k)))
      : undefined,
    status: res.status,
  } satisfies ApiError;
}
