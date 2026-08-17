'use client';

/**
 * The Vara chat surface — what the embed iframe shows inside a TENANT'S site.
 *
 * This route lives outside both the console and onboarding groups on purpose:
 * there is no platform session here and there must never need to be one. The
 * visitor is the tenant's candidate on the tenant's own page (Wix, WordPress,
 * anything); identity is the origin-bound embed token, checked server-side
 * against the workspace's allowlist on boot.
 *
 * What it does today is exactly what the channel slice owes: boots against
 * the platform, proves the origin gate both ways, shows the tenant's name and
 * published roles, and says honestly that applications open with intake. The
 * conversation engine (question generation from the JD, consent, artifacts)
 * lands in the intake slice — this page is its address, not its promise.
 *
 * Query params are read from window.location rather than useSearchParams so
 * the route needs no Suspense boundary (same trade the wizard makes).
 */

import { useEffect, useState } from 'react';

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? '';

interface BootData {
  tenant: { name: string };
  roles: { id: string; title: string }[];
  session: string;
}

type BootState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BootData }
  | { kind: 'refused'; message: string }
  | { kind: 'error' };

const shell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100dvh',
  background: '#141414',
  color: '#eae6da',
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 14,
};

export default function EmbedChatPage() {
  const [state, setState] = useState<BootState>({ kind: 'loading' });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') ?? '';
    const parent = params.get('parent') ?? '';

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_ORIGIN}/api/v1/vara/embed/boot`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, parent_origin: parent }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setState({
            kind: 'refused',
            message:
              body?.error?.message ??
              'This chat is not available here.',
          });
          return;
        }
        const data = (await res.json()) as BootData;
        setState({ kind: 'ready', data });
      } catch {
        if (!cancelled) setState({ kind: 'error' });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  function close() {
    window.parent?.postMessage({ type: 'vara:close' }, '*');
  }

  return (
    <div style={shell}>
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '14px 16px',
          borderBottom: '1px solid #2a2a2a',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#c9a227',
            color: '#141414',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 12,
          }}
        >
          V
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>Vara</div>
          <div style={{ fontSize: 11, color: '#8f8a7d' }}>
            {state.kind === 'ready' ? `Talent · ${state.data.tenant.name}` : 'Talent agent'}
          </div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close chat"
          style={{
            border: 'none',
            background: 'transparent',
            color: '#8f8a7d',
            fontSize: 18,
            cursor: 'pointer',
            padding: 4,
          }}
        >
          ✕
        </button>
      </header>

      <main style={{ flex: 1, overflowY: 'auto', padding: 16 }}>
        {state.kind === 'loading' && <p style={{ color: '#8f8a7d' }}>Connecting…</p>}

        {state.kind === 'refused' && (
          <div role="alert">
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Not available on this site</p>
            <p style={{ color: '#8f8a7d' }}>{state.message}</p>
          </div>
        )}

        {state.kind === 'error' && (
          <div role="alert">
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Cannot reach Vara</p>
            <p style={{ color: '#8f8a7d' }}>Check your connection and try again.</p>
          </div>
        )}

        {state.kind === 'ready' && (
          <>
            <div
              style={{
                background: '#1d1d1d',
                borderRadius: 12,
                padding: '10px 12px',
                marginBottom: 12,
                maxWidth: '85%',
              }}
            >
              Hello — I&rsquo;m Vara, {state.data.tenant.name}&rsquo;s talent agent.
            </div>

            {state.data.roles.length === 0 ? (
              <div
                style={{
                  background: '#1d1d1d',
                  borderRadius: 12,
                  padding: '10px 12px',
                  maxWidth: '85%',
                  color: '#bdb8ab',
                }}
              >
                There are no open roles right now. Check back soon — when a role
                opens, you&rsquo;ll be able to apply right here, in a short
                conversation instead of a form.
              </div>
            ) : (
              <>
                <div
                  style={{
                    background: '#1d1d1d',
                    borderRadius: 12,
                    padding: '10px 12px',
                    marginBottom: 12,
                    maxWidth: '85%',
                  }}
                >
                  These roles are open:
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {state.data.roles.map((r) => (
                    <li
                      key={r.id}
                      style={{
                        border: '1px solid #2a2a2a',
                        borderRadius: 10,
                        padding: '10px 12px',
                        marginBottom: 8,
                      }}
                    >
                      <div style={{ fontWeight: 600 }}>{r.title}</div>
                      <div style={{ fontSize: 12, color: '#8f8a7d' }}>
                        Applications open here soon
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </main>

      <footer style={{ padding: '10px 16px', borderTop: '1px solid #2a2a2a' }}>
        <input
          disabled
          placeholder="Applying by chat arrives with the first open role"
          style={{
            width: '100%',
            boxSizing: 'border-box',
            background: '#1d1d1d',
            border: '1px solid #2a2a2a',
            borderRadius: 10,
            color: '#eae6da',
            padding: '10px 12px',
            fontSize: 13,
          }}
        />
      </footer>
    </div>
  );
}
