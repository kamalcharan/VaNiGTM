/**
 * VaNi API client.
 *
 * Ported from VaNiGTM's frontend/src/lib/api-client.ts. The security shape is
 * kept exactly:
 *
 *   - The access token lives in memory ONLY. Never localStorage, never a
 *     readable cookie — an XSS that can read storage should not walk away with
 *     a session.
 *   - The refresh token is an httpOnly cookie the browser holds and we never
 *     see. It is sent automatically because every call uses
 *     credentials:'include' and the API is same-origin via the Vercel proxy.
 *   - A 401 triggers exactly one silent refresh and one retry. Never a loop.
 */

import { API, type ServiceEndpoint } from './serviceURLs';

let accessToken: string | null = null;

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  accessToken = token;
}

export function clearTokens(): void {
  accessToken = null;
}

export class ApiError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Best-effort message extraction; never leaks a raw body to the UI. */
async function readError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    const msg = data?.error ?? data?.message;
    if (typeof msg === 'string' && msg.trim()) return msg;
  } catch {
    /* non-JSON error body — fall through */
  }
  if (res.status === 401) return 'Email and password do not match.';
  // A 404 on an /api path means the request was served by this app rather than
  // proxied — i.e. VANI_API_ORIGIN is unset or the rewrite is not in effect.
  // Say so plainly; the generic message sends people hunting in the wrong place.
  if (res.status === 404) return 'The VaNi service is not configured for this deployment.';
  if (res.status >= 500) return 'The VaNi service is unavailable. Please try again shortly.';
  return 'Something went wrong. Please try again.';
}

/**
 * Restore a session from the httpOnly refresh cookie. Runs on every app mount,
 * which is what makes reloads and new tabs survive. Resolves false rather than
 * throwing — a failed refresh is the normal "logged out" path.
 */
export async function silentRefresh(): Promise<boolean> {
  try {
    const res = await fetch(API.auth.refresh.path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({}),
    });
    if (!res.ok) return false;
    const data = await res.json();
    if (typeof data?.access_token !== 'string') return false;
    setAccessToken(data.access_token);
    return true;
  } catch {
    return false;
  }
}

interface FetchOptions {
  body?: unknown;
  signal?: AbortSignal;
  /** Internal: prevents a refresh/retry loop. */
  _retried?: boolean;
}

export async function apiFetch<T>(
  endpoint: ServiceEndpoint,
  options: FetchOptions = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  let res: Response;
  try {
    res = await fetch(endpoint.path, {
      method: endpoint.method,
      headers,
      credentials: 'include',
      signal: options.signal,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  } catch {
    // Network-level failure — most often the API origin is unset or unreachable.
    throw new ApiError('Cannot reach the VaNi service. Check your connection.', 0);
  }

  if (res.status === 401 && endpoint.auth && !options._retried) {
    const refreshed = await silentRefresh();
    if (refreshed) return apiFetch<T>(endpoint, { ...options, _retried: true });
    clearTokens();
  }

  if (!res.ok) throw new ApiError(await readError(res), res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}
