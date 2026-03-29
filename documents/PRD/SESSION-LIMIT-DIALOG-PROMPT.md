# Session Limit Dialog — Claude Code Prompt

**Target repo:** VaNiBase (this is framework-level — all products need it)
**Branch:** `fix/session-limit-dialog`

```
Read CLAUDE.md first. Then read this entire prompt before writing any code.

## GOAL

When a user logs in and hits the session limit (HTTP 409), the login page must show a dialog listing active sessions with the option to revoke selected sessions and retry login. Currently the 409 response is silently swallowed and the user sees a frozen login screen.

## PRE-FLIGHT

Before writing any code, investigate the current state:

```bash
# 1. Check what the 409 response looks like from the backend
grep -n "SESSION_LIMIT\|session_limit\|409\|max_sessions\|active_sessions" framework/auth/auth.service.ts
grep -n "SESSION_LIMIT\|session_limit\|409" framework/routes/auth.ts

# 2. Check what the login page does with errors
cat shell/src/app/\(auth\)/login/page.tsx

# 3. Check if there's already a session revoke endpoint
grep -n "revoke\|sessions" framework/routes/auth.ts

# 4. Check AuthProvider login function — how does it handle 409?
grep -n "409\|SESSION_LIMIT\|session" shell/src/context/auth-provider.tsx

# 5. Check if modal VDF component exists
ls shell/src/components/vdf/modal* 2>/dev/null
```

Report what you find before proceeding. Pay special attention to:
- What fields the 409 response body contains (active_sessions array? session IDs? device info?)
- Whether the login page catches this error or lets it fall through silently
- Whether a revoke endpoint already exists

## TASK 0: Purge expired sessions before counting (CRITICAL)

The root cause of most session limit hits is stale sessions. When a user closes their browser tab, the app can't reliably call /auth/logout (beforeunload is unreliable for async requests). So expired refresh tokens pile up in the DB and count toward the session limit even though they're dead.

**Fix: In the login service, BEFORE counting active sessions, delete expired ones.**

Find where the login flow checks session count (look for MAX_SESSIONS, session_limit, or the count query on VN_refresh_tokens). Add this BEFORE the count:

```sql
DELETE FROM VN_refresh_tokens 
WHERE user_id = $1 
AND expires_at < NOW();
```

In code it will look something like:

```typescript
// BEFORE counting sessions — purge expired ones
await db.query(
  'DELETE FROM VN_refresh_tokens WHERE user_id = $1 AND expires_at < NOW()',
  [user.id]
);

// NOW count active sessions
const { rows } = await db.query(
  'SELECT COUNT(*) FROM VN_refresh_tokens WHERE user_id = $1',
  [user.id]
);
const activeCount = parseInt(rows[0].count, 10);

if (activeCount >= maxSessions) {
  // Return 409 with active session details
}
```

This ensures that only genuinely active (non-expired) sessions count toward the limit. Users who closed tabs, switched devices, or let tokens expire will no longer get blocked.

**Also add cleanup to the refresh token endpoint** — when a user refreshes their token, purge their expired sessions too:

Find the refresh token handler and add the same DELETE before processing the refresh.

## TASK 1: Verify/fix backend 409 response

The backend POST /auth/login should return this on session limit:

```json
{
  "error": "SESSION_LIMIT",
  "message": "Maximum active sessions reached",
  "max_sessions": 5,
  "active_sessions": [
    {
      "id": "session-uuid-1",
      "created_at": "2026-03-29T10:00:00Z",
      "last_active": "2026-03-29T14:30:00Z",
      "ip_address": "192.168.1.1",
      "user_agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)..."
    }
  ]
}
```

Check if this is already the case. If the 409 response doesn't include the `active_sessions` array with session details, fix it:

1. In the login service, when session count >= max_sessions:
   - Query VN_refresh_tokens (or wherever sessions are stored) for this user's active sessions
   - Return the session list with id, created_at, last_active (last used timestamp if available), ip_address, user_agent
   - Include max_sessions count in response

2. If ip_address and user_agent aren't stored on sessions, add them:
   - ALTER TABLE on the sessions/refresh_tokens table to add `ip_address VARCHAR(45)` and `user_agent TEXT` if missing
   - Store them during login when creating a new session
   - Create a migration file for this

## TASK 2: Verify/fix session revoke endpoint

There should be a POST /auth/sessions/revoke endpoint:

```
POST /api/v1/auth/sessions/revoke
Body: { 
  email: "user@example.com",
  password: "...",
  session_ids: ["session-uuid-1", "session-uuid-2"] 
}
Response: { success: true, revoked_count: 2 }
```

This endpoint must:
- Accept email + password (user isn't logged in yet, so no JWT)
- Validate credentials first
- Delete the specified sessions from the sessions table
- Return success with count of revoked sessions
- Also accept session_ids: ["all"] to revoke ALL sessions for this user

If the endpoint exists, verify it works as above. If missing, create it.

## TASK 3: Fix AuthProvider login error handling

In `shell/src/context/auth-provider.tsx`, find the `login()` function.

It must handle the 409 response explicitly:

```typescript
async function login(email: string, password: string): Promise<LoginResult> {
  try {
    const response = await fetch(`${apiUrl}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (response.status === 409) {
      const data = await response.json();
      // Return the session limit data so the login page can show the dialog
      return {
        success: false,
        error: 'SESSION_LIMIT',
        maxSessions: data.max_sessions,
        activeSessions: data.active_sessions,
      };
    }

    if (!response.ok) {
      const data = await response.json();
      return { success: false, error: data.message || 'Login failed' };
    }

    // ... normal login success flow
  } catch (err) {
    return { success: false, error: 'Network error' };
  }
}
```

Update the LoginResult type to include the session limit fields:

```typescript
interface LoginResult {
  success: boolean;
  error?: string;
  maxSessions?: number;
  activeSessions?: ActiveSession[];
}

interface ActiveSession {
  id: string;
  created_at: string;
  last_active?: string;
  ip_address?: string;
  user_agent?: string;
}
```

## TASK 4: Create SessionLimitDialog component

Create `shell/src/components/session-limit-dialog.tsx`

This is a modal dialog that appears over the login page when session limit is hit.

**Props:**
```typescript
interface SessionLimitDialogProps {
  isOpen: boolean;
  maxSessions: number;
  activeSessions: ActiveSession[];
  onRevoke: (sessionIds: string[]) => Promise<void>;
  onCancel: () => void;
  isRevoking: boolean;
}
```

**UI Requirements:**

1. Modal overlay (semi-transparent backdrop) centered on screen
2. Modal card with:
   - Header: "Session limit reached" + subtitle "You have {max} active sessions. Revoke one or more to continue."
   - Session list: each session shows:
     - Device icon (derive from user_agent: desktop/mobile/tablet — use simple heuristic)
     - Browser name (parse from user_agent: Chrome, Firefox, Safari, Edge, etc.)
     - IP address (or "Unknown" if null)
     - When created: relative time ("2 hours ago", "3 days ago")
     - Last active: relative time
     - Checkbox for selection
   - "Current session" should NOT appear (user isn't logged in yet, these are OTHER sessions)
   - Select all checkbox in header
3. Footer:
   - "Cancel" button (outline) — closes dialog, returns to login form
   - "Revoke selected & login" button (primary, theme-colored) — disabled until at least 1 selected
   - Loading state on the revoke button while revoking

**Relative time helper:**
```typescript
function timeAgo(dateString: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateString).getTime()) / 1000);
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
}
```

**User agent parser (simple):**
```typescript
function parseDevice(ua: string): { browser: string; device: string } {
  const browser = ua.includes('Chrome') ? 'Chrome' :
    ua.includes('Firefox') ? 'Firefox' :
    ua.includes('Safari') ? 'Safari' :
    ua.includes('Edge') ? 'Edge' : 'Unknown';
  const device = /Mobile|Android/i.test(ua) ? 'mobile' :
    /Tablet|iPad/i.test(ua) ? 'tablet' : 'desktop';
  return { browser, device };
}
```

**Styling:**
- ALL colors via CSS variables — no hardcoded values
- Modal width: 480px max, responsive on mobile
- Use var(--color-background-primary) for card bg
- Use var(--color-border-tertiary) for borders
- Selected session row: subtle highlight with var(--color-primary) at low opacity
- Revoke button: var(--color-danger) background when sessions selected
- Smooth appear/disappear animation (fade + scale)

## TASK 5: Wire into login page

In the login page (`shell/src/app/(auth)/login/page.tsx`):

1. Add state for session limit:
```typescript
const [sessionLimitData, setSessionLimitData] = useState<{
  maxSessions: number;
  activeSessions: ActiveSession[];
} | null>(null);
```

2. In the login submit handler, check for SESSION_LIMIT:
```typescript
const result = await login(email, password);
if (!result.success) {
  if (result.error === 'SESSION_LIMIT') {
    setSessionLimitData({
      maxSessions: result.maxSessions!,
      activeSessions: result.activeSessions!,
    });
    return; // Don't show error toast, show dialog instead
  }
  setError(result.error);
}
```

3. Add revoke handler:
```typescript
async function handleRevoke(sessionIds: string[]) {
  const response = await fetch(`${apiUrl}/auth/sessions/revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: passwordRef.current, session_ids: sessionIds }),
  });
  if (response.ok) {
    setSessionLimitData(null);
    // Auto-retry login after successful revoke
    await handleLogin();
  }
}
```

4. Render the dialog:
```tsx
<SessionLimitDialog
  isOpen={sessionLimitData !== null}
  maxSessions={sessionLimitData?.maxSessions ?? 0}
  activeSessions={sessionLimitData?.activeSessions ?? []}
  onRevoke={handleRevoke}
  onCancel={() => setSessionLimitData(null)}
  isRevoking={isRevoking}
/>
```

**IMPORTANT:** The password must be available for the revoke call (it re-authenticates). Store it in a ref, not state, so it doesn't trigger re-renders:
```typescript
const passwordRef = useRef<string>('');
// In onChange: passwordRef.current = value;
```

## TASK 6: Handle edge cases

1. What if revoke fails? Show error toast, keep dialog open
2. What if ALL sessions are revoked but login still returns 409? Show error: "Unable to create session. Contact support."
3. What if active_sessions array is empty in 409? Show: "Session limit reached but no sessions found. Try again or contact support."
4. After successful revoke + auto-login, clear the sessionLimitData state

## VALIDATION

1. `npm run build` passes
2. Test flow: 
   - Login with MAX_SESSIONS=1 in .env (or temporarily set to 1)
   - First login succeeds
   - Open incognito, try login again → should show session limit dialog
   - Dialog lists the first session with device/browser info
   - Select it, click "Revoke & login" → old session revoked, new login succeeds
3. No hardcoded colors in new components
4. Dialog is responsive (test at 400px width)
5. Cancel button returns to clean login form (no stale error state)

## COMMIT

"fix: session limit dialog — shows active sessions on 409, revoke & retry login"
```
