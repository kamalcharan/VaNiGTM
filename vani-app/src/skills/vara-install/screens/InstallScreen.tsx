'use client';

/**
 * Install — the screen that turns a published JD into a widget on the
 * tenant's own site.
 *
 * Three steps, in the order a person actually does them:
 *
 *   1. Copy the snippet          — one <script> tag, token already in it
 *   2. Allowlist the sites       — add/remove origins; boot is refused elsewhere
 *   3. Verify it booted          — per-origin liveness, read from real boots
 *
 * ── Why step 3 is a verification and not a preview ────────────────────────
 * The POA sketched an in-app iframe preview. Built literally it would boot
 * /embed/chat with `parent` = the CONSOLE's origin, which is not on any
 * tenant's allowlist — so it renders a permanent 403 — and the only way to
 * make it "work" is to send one of their real origins instead. That is a lie
 * to our own origin gate, and worse, it would write a boot_ping for a site
 * that never booted, corrupting the one signal this screen exists to report.
 *
 * So the loop is the real one: paste, load your page, come back and see it
 * green. Slower to demo, but it answers "is my site live?" with evidence
 * instead of a simulation. See the handover note for this slice.
 *
 * ── Declared vs observed ──────────────────────────────────────────────────
 * embed_origins is what the tenant DECLARED; boot_pings is what we OBSERVED.
 * The screen never collapses them: an allowlisted origin that has never booted
 * reads "Never booted", not "ready". A setup screen that reports an unpasted
 * snippet as installed is the failure rule 9b exists to prevent.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { DataBoundary, SkeletonRows, useToast } from '@/platform/feedback';
import { formatRelative } from '@/lib/format';
import type { SkillResult } from '@/lib/useSkill';
import u from '@/platform/shell/ui.module.css';
import s from './install.module.css';

interface EmbedDomain {
  id: string;
  domain: string;
  embed_origins: string[];
  /** origin → ISO timestamp of the last successful boot. */
  boot_pings: Record<string, string> | null;
}
interface EmbedResponse {
  token: string;
  subscription: string;
  checklist: { checks: { id: string; label: string; pass: boolean }[]; ready: boolean };
  domains: EmbedDomain[];
  embed_origins: string[];
  snippet: string;
}

/**
 * The API cannot know where the widget assets are served from — it issues the
 * token, not the bundle — so it emits CONSOLE_ORIGIN and the console fills in
 * its own. Guarded for SSR: this renders inside DataBoundary after the query
 * resolves, but a placeholder-bearing snippet is never worth shipping to a
 * clipboard, so an unresolved origin leaves the token alone and the copy
 * button reports it rather than handing over a broken tag.
 */
function resolveSnippet(raw: string): { snippet: string; resolved: boolean } {
  if (typeof window === 'undefined') return { snippet: raw, resolved: false };
  return { snippet: raw.replace('CONSOLE_ORIGIN', window.location.origin), resolved: true };
}

export default function InstallScreen() {
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const q = useQuery<SkillResult<EmbedResponse>, Error>({
    queryKey: ['vara', 'embed'],
    queryFn: async () => {
      const r = await apiFetch<EmbedResponse>(API.vara.embed);
      return { success: true, skill: 'vara', function: 'embed', data: r };
    },
  });

  /**
   * One mutation for both add and remove — the endpoint takes both arrays and
   * is idempotent by construction, so a double-click adds nothing twice and a
   * stale Remove on an already-removed origin reports changed:false rather
   * than erroring. That is also why no Idempotency-Key is minted here: there
   * is no server-side key store yet, and vani-app/CLAUDE.md is explicit that a
   * key nothing honours is worse than no key.
   */
  const edit = useCallback(
    async (domainId: string, patch: { add?: string[]; remove?: string[] }) => {
      const busyKey = `${domainId}:${patch.add?.[0] ?? patch.remove?.[0] ?? ''}`;
      if (busy) return;
      setBusy(busyKey);
      try {
        const r = await apiFetch<{ embed_origins: string[]; changed: boolean }>(
          API.vara.originsUpdate,
          { pathParams: { id: domainId }, body: patch },
        );
        if (patch.add?.length) {
          setDrafts((d) => ({ ...d, [domainId]: '' }));
          showToast({
            message: r.changed
              ? `${patch.add[0]} can now boot Vara.`
              : `${patch.add[0]} was already allowlisted.`,
            type: r.changed ? 'success' : 'info',
          });
        } else if (patch.remove?.length) {
          showToast({
            message: r.changed
              ? `${patch.remove[0]} can no longer boot Vara.`
              : `${patch.remove[0]} was not on the allowlist.`,
            type: r.changed ? 'success' : 'info',
          });
        }
        await qc.invalidateQueries({ queryKey: ['vara', 'embed'] });
      } catch (err) {
        const msg = err instanceof ApiError ? err.message : 'Could not update the allowlist';
        showToast({ message: msg, type: 'error' });
      } finally {
        setBusy(null);
      }
    },
    [busy, qc, showToast],
  );

  const copy = useCallback(async (snippet: string, resolved: boolean) => {
    if (!resolved) {
      showToast({ message: 'Snippet is still resolving — try again in a moment.', type: 'error' });
      return;
    }
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard is blocked outside a secure context or by permission. Say so
      // rather than showing a success tick over a clipboard that never changed.
      showToast({
        message: 'Could not reach the clipboard — select the snippet and copy it manually.',
        type: 'error',
      });
    }
  }, [showToast]);

  return (
    <div>
      <div className={u.eyebrow}>// AGENTS · VARA · INSTALL</div>
      <h1 className={u.h1}>Install</h1>
      <p className={s.lede}>
        One script tag puts Vara on your site — Wix, WordPress, Shopify or
        hand-written HTML. The tag carries a token that names your workspace and
        grants nothing on its own: every boot is re-checked against the origins
        you allowlist below, so removing a site takes effect on its next load.
      </p>

      <DataBoundary query={q} label="your install details" skeleton={<SkeletonRows rows={5} />}>
        {(d: EmbedResponse) => {
          if (d.subscription !== 'live') return <NotLive checklist={d.checklist} />;
          return (
            <div className={s.steps}>
              <SnippetStep snippet={d.snippet} copied={copied} onCopy={copy} />
              <OriginsStep
                domains={d.domains ?? []}
                drafts={drafts}
                setDrafts={setDrafts}
                busy={busy}
                onEdit={edit}
              />
              <VerifyStep domains={d.domains ?? []} onRefresh={() => q.refetch()} />
            </div>
          );
        }}
      </DataBoundary>
    </div>
  );
}

/* ── Not live ────────────────────────────────────────────────────────────
 * Rule 9b: an empty state carries its next action. The checklist already
 * names precisely what is missing, so it renders as the action list rather
 * than a flat "not available yet". */

function NotLive({ checklist }: { checklist: EmbedResponse['checklist'] }) {
  const missing = checklist?.checks?.filter((c) => !c.pass) ?? [];
  return (
    <div className={s.card}>
      <div className={s.cardHead}>
        <span className={`${u.tag} ${u.tagDim}`}>Not live yet</span>
      </div>
      <p className={s.note}>
        The snippet is issued once Vara is live for your workspace — a token for
        an agent that cannot answer is worse than no token. What is left:
      </p>
      <ul className={s.checklist}>
        {missing.map((c) => (
          <li key={c.id} className={s.checkFail}>
            <span aria-hidden="true">○</span> {c.label}
          </li>
        ))}
        {missing.length === 0 && (
          <li className={s.checkFail}>
            <span aria-hidden="true">○</span> Publish your first JD to go live.
          </li>
        )}
      </ul>
      <Link href="/agents/vara/onboarding" className={s.primaryLink}>
        Continue setup →
      </Link>
    </div>
  );
}

/* ── Step 1 · the snippet ─────────────────────────────────────────────── */

function SnippetStep({
  snippet,
  copied,
  onCopy,
}: {
  snippet: string;
  copied: boolean;
  onCopy: (snippet: string, resolved: boolean) => void;
}) {
  const { snippet: resolvedSnippet, resolved } = useMemo(() => resolveSnippet(snippet), [snippet]);
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <span className={s.stepNo}>1</span>
        <h2 className={s.stepTitle}>Copy your snippet</h2>
      </div>
      <p className={s.note}>
        Paste it once, anywhere before <code>&lt;/body&gt;</code>. It draws a
        launcher button; everything else runs in an iframe on our origin, so
        updates reach your site without you touching it again.
      </p>
      <pre className={s.snippet}>
        <code>{resolvedSnippet}</code>
      </pre>
      <button
        type="button"
        className={s.primary}
        onClick={() => onCopy(resolvedSnippet, resolved)}
      >
        {copied ? 'Copied' : 'Copy snippet'}
      </button>
    </section>
  );
}

/* ── Step 2 · the allowlist ───────────────────────────────────────────── */

function OriginsStep({
  domains,
  drafts,
  setDrafts,
  busy,
  onEdit,
}: {
  domains: EmbedDomain[];
  drafts: Record<string, string>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  busy: string | null;
  onEdit: (domainId: string, patch: { add?: string[]; remove?: string[] }) => void;
}) {
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <span className={s.stepNo}>2</span>
        <h2 className={s.stepTitle}>Allowlist the sites that may run it</h2>
      </div>
      <p className={s.note}>
        An origin is the scheme and host with no path — <code>https://acme.com</code>,
        not <code>https://acme.com/careers</code>. It must match what the browser
        reports on that page exactly, so <code>www.</code> and a bare domain are
        two different entries.
      </p>

      {domains.length === 0 && (
        <div className={s.empty}>
          No candidate-facing domain is declared yet. Add one in the Domain step
          of your Smart Profile, then allowlist its origins here.
          <Link href="/onboarding" className={s.primaryLink}>
            Go to the Domain step →
          </Link>
        </div>
      )}

      {domains.map((dom) => {
        const draft = drafts[dom.id] ?? '';
        return (
          <div key={dom.id} className={s.domainBlock}>
            <div className={s.domainName}>{dom.domain}</div>

            {dom.embed_origins.length === 0 ? (
              <div className={s.emptyInline}>
                Nothing allowlisted — Vara will refuse to boot on every site
                until you add one.
              </div>
            ) : (
              <ul className={s.originList}>
                {dom.embed_origins.map((origin) => (
                  <li key={origin} className={s.originRow}>
                    <Liveness lastBoot={dom.boot_pings?.[origin]} />
                    <span className={s.originName}>{origin}</span>
                    <button
                      type="button"
                      className={s.ghost}
                      disabled={busy !== null}
                      onClick={() => onEdit(dom.id, { remove: [origin] })}
                    >
                      {busy === `${dom.id}:${origin}` ? 'Removing…' : 'Remove'}
                    </button>
                  </li>
                ))}
              </ul>
            )}

            <form
              className={s.addRow}
              onSubmit={(e) => {
                e.preventDefault();
                const value = draft.trim();
                if (value) onEdit(dom.id, { add: [value] });
              }}
            >
              <input
                className={s.input}
                type="text"
                inputMode="url"
                placeholder="https://your-site.com"
                value={draft}
                onChange={(e) => setDrafts((prev) => ({ ...prev, [dom.id]: e.target.value }))}
                aria-label={`Add an allowed origin for ${dom.domain}`}
              />
              <button type="submit" className={s.primary} disabled={!draft.trim() || busy !== null}>
                {busy === `${dom.id}:${draft.trim()}` ? 'Adding…' : 'Add site'}
              </button>
            </form>
          </div>
        );
      })}
    </section>
  );
}

/** Declared and observed are different facts; this renders only the observed one. */
function Liveness({ lastBoot }: { lastBoot?: string }) {
  if (!lastBoot) {
    return (
      <span className={`${u.tag} ${u.tagDim} ${s.pill}`} title="No successful boot recorded yet">
        Never booted
      </span>
    );
  }
  return (
    <span
      className={`${u.tag} ${u.tagOk} ${s.pill}`}
      title={`Last booted ${new Date(lastBoot).toISOString()}`}
    >
      {formatRelative(lastBoot)}
    </span>
  );
}

/* ── Step 3 · verify ──────────────────────────────────────────────────── */

function VerifyStep({ domains, onRefresh }: { domains: EmbedDomain[]; onRefresh: () => void }) {
  const anyBooted = domains.some((d) => Object.keys(d.boot_pings ?? {}).length > 0);
  return (
    <section className={s.card}>
      <div className={s.cardHead}>
        <span className={s.stepNo}>3</span>
        <h2 className={s.stepTitle}>Check it booted</h2>
      </div>
      <p className={s.note}>
        Load a page that carries the snippet, then refresh this. A site shows a
        time above once the widget has actually booted from it — this reads real
        boots, so nothing here turns green until your page really runs it.
      </p>
      {!anyBooted && (
        <div className={s.emptyInline}>
          No boot recorded yet. If a site stays here after you have loaded it:
          the origin the browser reports must match the allowlist entry
          character for character — check <code>http</code> vs <code>https</code>,
          and <code>www.</code>
        </div>
      )}
      <button type="button" className={s.ghost} onClick={onRefresh}>
        Refresh status
      </button>
    </section>
  );
}
