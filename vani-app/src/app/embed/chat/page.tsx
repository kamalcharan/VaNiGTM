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
 * ── Two tiers of routing, and the cheap one is the default ───────────────
 * TIER 1 is the chips. Boot returns every live agent's visitor intents and a
 * click IS the routing — no embedding, no model call, and it works before the
 * embedding backfill has ever run. Most visitors will never do anything else.
 *
 * TIER 2 is the text box: POST /embed/intent, embeddings and nearest
 * neighbour, three visible outcomes — routed, disambiguated, catch-all. Every
 * one of them is a state the visitor can see and act on, which is what keeps
 * it on the right side of rule 12. A router that quietly picked its best guess
 * below the threshold would look identical to a confident one.
 *
 * ── What routing does NOT yet do ─────────────────────────────────────────
 * Routing is real and server-side. ANSWERING is not: `ANSWERS` below is a
 * marked placeholder, three short strings, standing in for the conversation
 * engine that lands with intake (Phase 5). It says only what the widget can
 * honestly say from what boot already returned. When the engine lands this map
 * is deleted, not extended — an agent's words belong to the agent.
 *
 * Query params are read from window.location rather than useSearchParams so
 * the route needs no Suspense boundary (same trade the wizard makes).
 */

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { API } from '@/lib/serviceURLs';

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

/** What an agent can be asked for. Declared by the agent, seeded in its own migration. */
interface Intent {
  id: string;
  code: string;
  label: string;
  description: string;
}

/**
 * Boot is agent-shaped, not Vara-shaped. One tenant pastes one tag; whatever
 * agents are live for that workspace contribute what they have to offer and
 * what they can be asked for. An agent with nothing for a visitor contributes
 * empty lists — that is a first-class case, not an error, and it is what Nova
 * is expected to be.
 */
interface Agent {
  code: string;
  name: string;
  offers: Offer[];
  intents: Intent[];
}

interface BootData {
  tenant: { name: string };
  agents: Agent[];
  session: string;
}

type BootState =
  | { kind: 'loading' }
  | { kind: 'ready'; data: BootData }
  | { kind: 'refused'; message: string }
  | { kind: 'error' };

/** One resolution from the router, or one chip click, rendered as a turn. */
type Turn =
  | { role: 'visitor'; text: string }
  | { role: 'agent'; kind: 'say'; text: string }
  | { role: 'agent'; kind: 'answer'; intent: Intent; agent: Agent }
  | { role: 'agent'; kind: 'choose'; text: string; options: Intent[] };

/**
 * PLACEHOLDER — see the file header. What the widget can honestly say today
 * for each intent, from data boot already returned. Deleted when the
 * conversation engine lands; never grown to cover a new intent, because an
 * intent that needs prose here is an intent whose agent should be answering.
 */
const ANSWERS: Record<string, { text: string; showOffers: boolean }> = {
  browse_openings: { text: 'Here is everything open right now:', showOffers: true },
  // Routing names the intent, not WHICH role — that is entity resolution, and
  // it lands with the conversation engine. So the honest response is the list
  // plus a lead-in that admits it, rather than a guess at which one was meant.
  role_detail: { text: 'Here are the roles, with what has been said about each:', showOffers: true },
  how_applying_works: {
    text: 'You apply right here — a short conversation instead of a form. That opens with the first intake release; there is nothing to email in the meantime.',
    showOffers: false,
  },
};

const C = {
  bg: '#141414',
  panel: '#1d1d1d',
  line: '#2a2a2a',
  text: '#eae6da',
  dim: '#8f8a7d',
  soft: '#c9c4b8',
  gold: '#c9a227',
};

const shell: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  height: '100dvh',
  background: C.bg,
  color: C.text,
  fontFamily: 'system-ui, -apple-system, sans-serif',
  fontSize: 14,
};

const bubble: React.CSSProperties = {
  background: C.panel,
  borderRadius: 12,
  padding: '10px 12px',
  marginBottom: 10,
  maxWidth: '85%',
  lineHeight: 1.5,
};

const chip: React.CSSProperties = {
  border: `1px solid ${C.line}`,
  background: 'transparent',
  color: C.text,
  borderRadius: 999,
  padding: '7px 12px',
  fontSize: 12.5,
  cursor: 'pointer',
  fontFamily: 'inherit',
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
    out.push(
      r.onsite_pct <= 0 ? 'Fully remote' : r.onsite_pct >= 100 ? 'Fully on-site' : `Hybrid — ${r.onsite_pct}% on-site`,
    );
  }
  if (r.locations?.length) out.push(r.locations.join(', '));
  if (r.band) out.push(r.band);
  return out;
}

function OfferCard({ r }: { r: Offer }) {
  return (
    <li style={{ border: `1px solid ${C.line}`, borderRadius: 10, padding: '10px 12px', marginBottom: 8 }}>
      <div style={{ fontWeight: 600 }}>{r.title}</div>
      {/* Whatever the tenant actually stated. Rendered only when present — an
          empty line reads as a broken card, and rule 9d says never invent what
          was not declared. */}
      {(r.one_liner || r.description) && (
        <div style={{ fontSize: 12.5, color: C.soft, marginTop: 4, lineHeight: 1.5 }}>
          {r.description || r.one_liner}
        </div>
      )}
      {offerMeta(r).length > 0 && (
        <div style={{ fontSize: 11.5, color: C.dim, marginTop: 6 }}>{offerMeta(r).join(' · ')}</div>
      )}
      <div style={{ fontSize: 12, color: C.dim, marginTop: 6 }}>Applications open here soon</div>
    </li>
  );
}

export default function EmbedChatPage() {
  const [state, setState] = useState<BootState>({ kind: 'loading' });
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [asking, setAsking] = useState(false);
  /**
   * Set when the server says free text is unavailable (embedding endpoint
   * down, or no intent embedded yet). The chips keep working, and the visitor
   * is TOLD which of the two things is true rather than being handed a
   * mysterious non-answer. Rule 12's allowed shape: a visible failure, then an
   * alternate path the person chooses.
   */
  const [textDown, setTextDown] = useState<string | null>(null);
  const feedRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const token = params.get('token') ?? '';
    const parent = params.get('parent') ?? '';

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`${API_ORIGIN}${API.publicEmbed.boot.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token, parent_origin: parent }),
        });
        if (cancelled) return;
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          setState({ kind: 'refused', message: body?.error?.message ?? 'This chat is not available here.' });
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

  // Keep the newest turn in view. Late-arriving turns are appended, never
  // reordered, so scrolling to the bottom is always right.
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' });
  }, [turns]);

  const data = state.kind === 'ready' ? state.data : null;
  const allIntents: Intent[] = data ? data.agents.flatMap((a) => a.intents ?? []) : [];
  const agentFor = useCallback(
    (intentId: string) => data?.agents.find((a) => (a.intents ?? []).some((i) => i.id === intentId)),
    [data],
  );

  /** Tier 1. A click needs no embedding and no model, so it never leaves the browser. */
  const pick = useCallback(
    (intent: Intent) => {
      const agent = agentFor(intent.id);
      if (!agent) return;
      setTurns((t) => [...t, { role: 'visitor', text: intent.label }, { role: 'agent', kind: 'answer', intent, agent }]);
    },
    [agentFor],
  );

  /** Tier 2. Free text goes to the router; the outcome decides what is rendered. */
  const ask = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const q = draft.trim();
      if (!q || asking || !data) return;
      setAsking(true);
      setDraft('');
      setTurns((t) => [...t, { role: 'visitor', text: q }]);
      try {
        const res = await fetch(`${API_ORIGIN}${API.publicEmbed.intent.path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ session: data.session, query: q }),
        });
        const body = await res.json().catch(() => null);

        if (!res.ok) {
          const code = body?.error?.code;
          if (code === 'INTENT_EMBED_UNAVAILABLE' || code === 'ROUTER_NOT_EMBEDDED') {
            setTextDown(
              code === 'ROUTER_NOT_EMBEDDED'
                ? 'Typed questions are not switched on for this site yet.'
                : 'Typed questions are briefly unavailable.',
            );
            setTurns((t) => [
              ...t,
              { role: 'agent', kind: 'choose', text: 'Pick one of these instead — they all work:', options: allIntents },
            ]);
            return;
          }
          setTurns((t) => [
            ...t,
            { role: 'agent', kind: 'say', text: body?.error?.message ?? 'Something went wrong with that question.' },
          ]);
          return;
        }

        if (body.outcome === 'routed') {
          const intent = allIntents.find((i) => i.id === body.intent.id);
          const agent = agentFor(body.intent.id);
          if (intent && agent) {
            setTurns((t) => [...t, { role: 'agent', kind: 'answer', intent, agent }]);
          }
          return;
        }

        if (body.outcome === 'disambiguated') {
          const options = (body.options as { id: string }[])
            .map((o) => allIntents.find((i) => i.id === o.id))
            .filter(Boolean) as Intent[];
          setTurns((t) => [...t, { role: 'agent', kind: 'choose', text: 'Did you mean:', options }]);
          return;
        }

        // Catch-all. Everything on offer, not the near misses — below the low
        // band the ranking carries no information, and a list of bad guesses
        // reads as a recommendation. Rule 9b: the empty state names the next
        // action rather than apologising.
        setTurns((t) => [
          ...t,
          {
            role: 'agent',
            kind: 'choose',
            text: allIntents.length
              ? "I did not catch that one. Here is everything I can help with:"
              : 'There is nothing I can help with on this site yet.',
            options: allIntents,
          },
        ]);
      } catch {
        setTurns((t) => [
          ...t,
          { role: 'agent', kind: 'say', text: 'I could not reach the server. Try that again in a moment.' },
        ]);
      } finally {
        setAsking(false);
      }
    },
    [agentFor, allIntents, asking, data, draft],
  );

  function close() {
    window.parent?.postMessage({ type: 'vani:close' }, '*');
  }

  return (
    <div style={shell}>
      <header
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px', borderBottom: `1px solid ${C.line}` }}
      >
        <span
          aria-hidden="true"
          style={{
            width: 28, height: 28, borderRadius: '50%', background: C.gold, color: C.bg,
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 12,
          }}
        >
          V
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600 }}>VaNi</div>
          <div style={{ fontSize: 11, color: C.dim }}>{data ? data.tenant.name : 'Loading…'}</div>
        </div>
        <button
          type="button"
          onClick={close}
          aria-label="Close chat"
          style={{ border: 'none', background: 'transparent', color: C.dim, fontSize: 18, cursor: 'pointer', padding: 4 }}
        >
          ✕
        </button>
      </header>

      <main ref={feedRef} style={{ flex: 1, overflowY: 'auto', padding: 16 }} aria-live="polite">
        {state.kind === 'loading' && <p style={{ color: C.dim }}>Connecting…</p>}

        {state.kind === 'refused' && (
          <div role="alert">
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Not available on this site</p>
            <p style={{ color: C.dim }}>{state.message}</p>
          </div>
        )}

        {state.kind === 'error' && (
          <div role="alert">
            <p style={{ fontWeight: 600, marginBottom: 6 }}>Cannot reach VaNi</p>
            <p style={{ color: C.dim }}>Check your connection and try again.</p>
          </div>
        )}

        {data && (
          <>
            <div style={bubble}>Hello — I&rsquo;m VaNi, {data.tenant.name}&rsquo;s agent.</div>

            {allIntents.length > 0 ? (
              <>
                <div style={bubble}>What would you like to do?</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
                  {allIntents.map((i) => (
                    <button key={i.id} type="button" style={chip} title={i.description} onClick={() => pick(i)}>
                      {i.label}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              /* No live agent declares anything a visitor can ask for. A real
                 state, not a fault — but it still owes a next action. */
              <div style={{ ...bubble, color: C.soft }}>
                There is nothing open right now. Check back soon — when there is, you&rsquo;ll be able to start right
                here, in a short conversation instead of a form.
              </div>
            )}

            {turns.map((t, n) =>
              t.role === 'visitor' ? (
                <div
                  key={n}
                  style={{ ...bubble, background: C.gold, color: C.bg, marginLeft: 'auto', fontWeight: 500 }}
                >
                  {t.text}
                </div>
              ) : t.kind === 'say' ? (
                <div key={n} style={bubble}>{t.text}</div>
              ) : t.kind === 'choose' ? (
                <div key={n} style={{ marginBottom: 14 }}>
                  <div style={bubble}>{t.text}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {t.options.map((o) => (
                      <button key={o.id} type="button" style={chip} title={o.description} onClick={() => pick(o)}>
                        {o.label}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div key={n} style={{ marginBottom: 14 }}>
                  {/* An intent with no entry here is one a later agent declared
                      after this placeholder was written. Saying so beats
                      reciting its description back as though it were an answer
                      — the description says what the intent IS, not what the
                      answer is, and the difference reads as a broken bot. */}
                  <div style={bubble}>
                    {ANSWERS[t.intent.code]?.text ??
                      `That is ${t.agent.name}'s to answer, and it cannot answer here yet.`}
                  </div>
                  {ANSWERS[t.intent.code]?.showOffers && t.agent.offers.length > 0 && (
                    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                      {t.agent.offers.map((r) => (
                        <OfferCard key={r.id} r={r} />
                      ))}
                    </ul>
                  )}
                </div>
              ),
            )}
          </>
        )}
      </main>

      <footer style={{ padding: '10px 16px', borderTop: `1px solid ${C.line}` }}>
        {textDown && (
          <p style={{ fontSize: 11.5, color: C.dim, margin: '0 0 8px' }} role="status">
            {textDown} The buttons above still work.
          </p>
        )}
        <form onSubmit={ask} style={{ display: 'flex', gap: 8 }}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            disabled={!data || allIntents.length === 0 || asking}
            maxLength={1000}
            placeholder={
              !data
                ? 'Connecting…'
                : allIntents.length === 0
                  ? 'Nothing to ask about here yet'
                  : 'Ask me anything about working here'
            }
            aria-label="Ask a question"
            style={{
              flex: 1, minWidth: 0, boxSizing: 'border-box', background: C.panel,
              border: `1px solid ${C.line}`, borderRadius: 10, color: C.text, padding: '10px 12px', fontSize: 13,
              fontFamily: 'inherit',
            }}
          />
          <button
            type="submit"
            disabled={!data || !draft.trim() || asking}
            style={{
              border: 'none', borderRadius: 10, padding: '0 14px', fontWeight: 600, fontSize: 13,
              background: draft.trim() && !asking ? C.gold : C.panel,
              color: draft.trim() && !asking ? C.bg : C.dim,
              cursor: draft.trim() && !asking ? 'pointer' : 'default',
              fontFamily: 'inherit',
            }}
          >
            {asking ? '…' : 'Ask'}
          </button>
        </form>
      </footer>
    </div>
  );
}
