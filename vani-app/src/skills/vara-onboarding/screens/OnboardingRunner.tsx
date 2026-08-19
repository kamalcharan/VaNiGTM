'use client';

/**
 * Vara onboarding — the doorway to JD Studio.
 *
 * UX PREVIEW ONLY. Charan's model (2026-08-17): onboarding does NOT complete
 * on its own. It confirms what Smart Profile already knows (visually — colors
 * and name, not self-describing adjectives), asks what role the tenant is
 * hiring for right now, and hands off to JD Studio. Publishing the first JD
 * is what takes Vara live.
 *
 * Family playbook defaults (weights, thresholds, knockouts) are DERIVED from
 * the first JD in a family and stored silently — the tenant is not asked to
 * abstract before they have built anything concrete.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';
import { useMemo, useState } from 'react';
import {
  MOCK_ROLE_FAMILIES, MOCK_TENANT_BRAND,
  readPublishedJds, UX_DRAFT_KEY,
  type PublishedJd, type DraftJd,
} from '../mock-data';
import u from '@/platform/shell/ui.module.css';
import s from '../vara-onboarding.module.css';

function newId(): string {
  return `jd-${Math.floor(performance.now() * 1000).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function VaraOnboardingRunnerInner() {
  const router = useRouter();
  const [family, setFamily] = useState<string | null>(null);
  const [otherFamily, setOtherFamily] = useState('');
  const [title, setTitle] = useState('');

  const emptyMode = useSearchParams().get('empty') === '1';

  // Published-JDs list — hydrated from sessionStorage on mount, kept fresh
  // when the tab regains focus (returning from JD Studio after a publish).
  // Latest version per identity so v2 supersedes v1 in the visible list;
  // the original v1 still exists in the append-only store, honouring V-14.
  const [published, setPublished] = useState<PublishedJd[]>([]);
  useEffect(() => {
    function refresh() {
      const all = readPublishedJds();
      const latest = new Map<string, PublishedJd>();
      for (const jd of all) {
        const cur = latest.get(jd.id);
        if (!cur || jd.version > cur.version) latest.set(jd.id, jd);
      }
      setPublished(Array.from(latest.values()));
    }
    refresh();
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

  function duplicate(jd: PublishedJd) {
    const d: DraftJd = {
      id: newId(),           // brand-new identity — publishes as v1 of a new JD
      family: jd.family,
      title: `${jd.title} (copy)`,
      facts: jd.facts,
      mode: 'duplicate',
      baseVersion: jd.version,
    };
    try { sessionStorage.setItem(UX_DRAFT_KEY, JSON.stringify(d)); } catch { /* private mode */ }
    router.push('/agents/vara/jd-studio?mode=compose');
  }

  function edit(jd: PublishedJd) {
    const d: DraftJd = {
      id: jd.id,             // same identity — publishes as v+1 of the same JD
      family: jd.family,
      title: jd.title,
      facts: jd.facts,
      mode: 'edit',
      baseVersion: jd.version,
    };
    try { sessionStorage.setItem(UX_DRAFT_KEY, JSON.stringify(d)); } catch { /* private mode */ }
    router.push('/agents/vara/jd-studio?mode=compose');
  }
  // Empty mode simulates a fresh industry with NO seeded playbooks — the
  // list of families is empty and Other is the only path. In Phase 1 this
  // is what a tenant sees when their business_profile.industry has no
  // published playbooks in vani_domain_pack yet.
  const shownFamilies = emptyMode ? [] : MOCK_ROLE_FAMILIES;

  // "Other" is a real value the tenant can pick — but the family the JD is
  // filed under comes from their typed input, not from the mock list.
  const effectiveFamily = family === '__other__' ? (otherFamily.trim() || null) : family;

  const suggestions = useMemo(() => {
    const f = MOCK_ROLE_FAMILIES.find((x) => x.name === effectiveFamily);
    return f?.suggested_titles ?? [];
  }, [effectiveFamily]);

  const ready = effectiveFamily !== null && title.trim().length > 3;

  function toStudio() {
    const q = new URLSearchParams({ family: effectiveFamily!, title: title.trim(), mode: 'compose' });
    router.push(`/agents/vara/jd-studio?${q.toString()}`);
  }

  function toImport() {
    const q = new URLSearchParams({ family: effectiveFamily!, title: title.trim(), mode: 'import' });
    router.push(`/agents/vara/jd-studio?${q.toString()}`);
  }

  const b = MOCK_TENANT_BRAND;

  return (
    <div className={s.wrap}>
      <div className={u.eyebrow}>// AGENTS · VARA · ONBOARDING</div>
      <h1 className={u.h1}>One JD from live</h1>

      <div className={s.uxBanner}>
        <b>Design preview.</b> Onboarding is the doorway to JD Studio — publishing
        your first JD is what takes Vara live. Nothing here writes to the
        backend yet; waiting on your sign-off before the recommender and
        writes are wired.
      </div>

      {/* Your published JDs — Duplicate / Edit ─────────────────────── */}
      {published.length > 0 && (
        <div className={s.card}>
          <div className={s.cardHead}>
            <h2 className={s.cardTitle}>Your published JDs</h2>
            <span className={s.cardMeta}>{published.length} JD{published.length === 1 ? '' : 's'} live</span>
          </div>
          <p className={s.cardWhat}>
            <b>Duplicate</b> mints a new JD (v1) from the same starting facts —
            good for a near-neighbour role. <b>Edit</b> keeps the same JD identity
            and publishes as v{'{n+1}'}; older versions stay honest in the
            history per the append-only rule.
          </p>
          <div className={s.jdList}>
            {published.map((jd) => (
              <div key={jd.id} className={s.jdRow}>
                <div className={s.jdRowMain}>
                  <div className={s.jdRowTitle}>
                    {jd.title}{' '}
                    <span className={s.jdRowVer}>v{jd.version}</span>
                  </div>
                  <div className={s.jdRowMeta}>
                    {jd.family} · {jd.facts.musthaves.length} must-have{jd.facts.musthaves.length === 1 ? '' : 's'}
                    {' · '}{jd.facts.knockouts.length} knockout{jd.facts.knockouts.length === 1 ? '' : 's'}
                    {jd.facts.band ? <> · {jd.facts.band}</> : null}
                  </div>
                </div>
                <div className={s.jdRowActions}>
                  <button type="button" className={s.ghost} onClick={() => duplicate(jd)}>
                    Duplicate
                  </button>
                  <button type="button" className={s.ghost} onClick={() => edit(jd)}>
                    Edit → v{jd.version + 1}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Inheritance — visual, not verbal ─────────────────────────────── */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>What Vara already knows about you</h2>
          <span className={s.cardMeta}>inherited from Smart Profile</span>
        </div>
        <p className={s.cardWhat}>
          Correct any of this in the Smart Profile — Vara does not ask you
          again for what you have already declared.
        </p>

        <div className={s.brand}>
          <span
            className={s.brandLogo}
            style={{ background: b.colors.primary }}
            aria-hidden="true"
          >
            V
          </span>
          <div>
            <div className={s.brandName}>{b.name}</div>
            <div className={s.brandMeta}>{b.industry} · {b.domain}</div>
          </div>
          <div className={s.brandColors} aria-label="Your brand colors">
            {(['primary', 'secondary', 'accent'] as const).map((k) => (
              <span
                key={k}
                className={s.brandSwatch}
                style={{ background: b.colors[k] }}
                title={`${k}: ${b.colors[k]}`}
              />
            ))}
          </div>
        </div>

        <div className={s.brandQuote}>
          &ldquo;{b.site_quote}&rdquo;
          <div className={s.brandQuoteMeta}>from your site — Vara reads tone from here</div>
        </div>
      </div>

      {/* Role family ──────────────────────────────────────────────────── */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>Which family is the role in?</h2>
          <span className={s.cardMeta}>Vara has starting playbooks for these under {b.industry}</span>
        </div>
        <p className={s.cardWhat}>
          Pick the closest family — the first JD you build here shapes the
          starting playbook for it, and Vara reuses that for the next role you
          add in the same family.
        </p>
        {emptyMode && (
          <div className={s.familyHint} style={{ marginBottom: 10, fontStyle: 'italic' }}>
            No playbooks seeded for <b>{b.industry}</b> yet — start with a manual
            skeleton (default weights, empty knockouts). Your first JD shapes
            the family; the second one seeds the family defaults.
          </div>
        )}
        <div className={s.familyList}>
          {shownFamilies.map((f) => (
            <button
              key={f.name}
              type="button"
              className={
                family === f.name
                  ? `${s.familyItem} ${s.familyItemActive}`
                  : s.familyItem
              }
              onClick={() => setFamily(f.name)}
            >
              <div className={s.familyName}>{f.name}</div>
              <div className={s.familyHint}>{f.hint}</div>
            </button>
          ))}
          <button
            key="__other__"
            type="button"
            className={
              family === '__other__'
                ? `${s.familyItem} ${s.familyItemActive}`
                : s.familyItem
            }
            onClick={() => setFamily('__other__')}
          >
            <div className={s.familyName}>Other — I&rsquo;ll name it</div>
            <div className={s.familyHint}>
              Manual skeleton — default 33/33/33 weights, no knockouts. You tune
              everything in the next screen.
            </div>
          </button>
        </div>
        {family === '__other__' && (
          <div style={{ marginTop: 12 }}>
            <input
              type="text"
              className={s.textInput}
              placeholder="Data Engineering · Field Sales · Staff Nurse · …"
              value={otherFamily}
              onChange={(e) => setOtherFamily(e.target.value)}
              autoFocus
            />
            <div className={s.familyHint} style={{ marginTop: 6 }}>
              Vara will file this JD under a new family with this name. When
              you add a second JD to it, family defaults get seeded from the
              two together.
            </div>
          </div>
        )}
      </div>

      {/* Role title ───────────────────────────────────────────────────── */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>What is the exact role you are hiring for?</h2>
          <span className={s.cardMeta}>your first JD in {effectiveFamily ?? 'this family'}</span>
        </div>
        <p className={s.cardWhat}>
          The title as it will appear on your careers page. You will shape the
          rest — must-haves, band, knockouts — in the next screen, by chatting
          with Vara.
        </p>
        <input
          type="text"
          className={s.textInput}
          placeholder="Senior Backend Engineer for the VaNi platform"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={!effectiveFamily}
        />
        {effectiveFamily && suggestions.length > 0 && (
          <div className={s.suggested} aria-label="Suggested titles">
            {suggestions.map((t) => (
              <button
                key={t}
                type="button"
                className={s.suggChip}
                onClick={() => setTitle(t)}
              >
                {t}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Choice — the two doorways into JD Studio ─────────────────── */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>How do you want to build this JD?</h2>
          <span className={s.cardMeta}>both paths end at the same Publish</span>
        </div>
        <div className={s.familyList}>
          <button
            type="button"
            className={s.familyItem}
            onClick={toStudio}
            disabled={!ready}
            style={{ opacity: ready ? 1 : 0.45 }}
          >
            <div className={s.familyName}>Compose with Vara →</div>
            <div className={s.familyHint}>
              A short chat with Vara. Answer 5 questions, watch the JD build
              itself on the right. ~4 minutes.
            </div>
          </button>
          <button
            type="button"
            className={s.familyItem}
            onClick={toImport}
            disabled={!ready}
            style={{ opacity: ready ? 1 : 0.45 }}
          >
            <div className={s.familyName}>Import existing JDs →</div>
            <div className={s.familyHint}>
              Drag a docx or pdf. Vara extracts must-haves, knockouts and band
              with evidence — you review, tune, publish.
            </div>
          </button>
        </div>
        <p className={s.note} style={{ marginTop: 10 }}>
          Publishing a JD (either way) takes Vara live for your workspace.
          The second JD in the same family becomes the seed for family defaults.
        </p>
      </div>
    </div>
  );
}

export default function VaraOnboardingRunner() {
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <VaraOnboardingRunnerInner />
    </Suspense>
  );
}
