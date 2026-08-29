'use client';

/**
 * The VaNi chat surface — what the embed iframe shows inside a TENANT'S site.
 *
 * PLATFORM-owned, not Vara's. One tag, every live agent. The header names the
 * platform rather than an agent because a visitor may be talking to any of
 * them, and a widget branded for whichever agent shipped first is a rename
 * waiting to happen on somebody else's website.
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

interface Offer {
  id: string;
  title: string;
  one_liner: string | null;
  description: string | null;
  employment_type: string | null;
  onsite_pct: number | null;
  locations: string[] | null;
  band: string | null;
}
/**
 * Boot is agent-shaped, not Vara-shaped. One tenant pastes one tag; whatever
 * agents are live for that workspace contribute what they have to offer. An
 * agent with nothing for a visitor contributes an empty list — that is a
 * first-class case, not an error.
 */
interface BootData {
  tenant: { name: string };
  agents: { code: string; name: string; offers: Offer[] }[];
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

/**
 * The public-facing facts, in the order a candidate weighs them. Built here
 * rather than server-side so the widget controls its own presentation — the
 * API ships values, not sentences.
 */
function offerMeta(r: Offer): string[] {
  const out: string[] = [];
  const type = { full_time: 'Full time', part_time: 'Part time', freelance: 'Freelance' }[
    r.employment_type ?? ''
  ];
  if (type) out.push(type);
  if (typeof r.onsite_pct === 'number') {
    out.push(r.onsite_pct <= 0 ? 'Fully remote'
      : r.onsite_pct >= 100 ? 'Fully on-site'
      : `Hybrid — ${r.onsite_pct}% on-site`);
  }
  if (r.locations?.length) out.push(r.locations.join(', '));
  if (r.band) out.push(r.band);
  return out;
}

export default function EmbedChatPage() {
  const [state, setState] = useState<BootState>({ kind: 'loading' });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') ?? '';
    const parent = params.get('parent') ?? '';

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_ORIGIN}/api/v1/embed/boot`, {
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
    window.parent?.postMessage({ type: 'vani:close' }, '*');
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
          <div style={{ fontWeight: 600 }}>VaNi</div>
          <div style={{ fontSize: 11, color: '#8f8a7d' }}>
            {state.kind === 'ready' ? state.data.tenant.name : 'Loading…'}
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
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Cannot reach VaNi</p>
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
              Hello — I&rsquo;m VaNi, {state.data.tenant.name}&rsquo;s agent.
            </div>

            {state.data.agents.every((a) => a.offers.length === 0) ? (
              <div
                style={{
                  background: '#1d1d1d',
                  borderRadius: 12,
                  padding: '10px 12px',
                  maxWidth: '85%',
                  color: '#bdb8ab',
                }}
              >
                There is nothing open right now. Check back soon — when there
                is, you&rsquo;ll be able to start right here, in a short
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
                  {state.data.agents.find((a) => a.offers.length > 0)?.code === 'vara'
                    ? 'These roles are open:'
                    : 'Here is what I can help with:'}
                </div>
                <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                  {state.data.agents.flatMap((a) => a.offers).map((r) => (
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
                      {/* Whatever the tenant actually stated. Rendered only
                          when present — an empty line reads as a broken card,
                          and rule 9d says never invent what was not declared. */}
                      {(r.one_liner || r.description) && (
                        <div style={{ fontSize: 12.5, color: '#c9c4b8', marginTop: 4, lineHeight: 1.5 }}>
                          {r.description || r.one_liner}
                        </div>
                      )}
                      {offerMeta(r).length > 0 && (
                        <div style={{ fontSize: 11.5, color: '#8f8a7d', marginTop: 6 }}>
                          {offerMeta(r).join(' · ')}
                        </div>
                      )}
                      <div style={{ fontSize: 12, color: '#8f8a7d', marginTop: 6 }}>
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
