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

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { MOCK_ROLE_FAMILIES, MOCK_TENANT_BRAND } from '../mock-data';
import Link from 'next/link';
import u from '@/platform/shell/ui.module.css';
import s from '../vara-onboarding.module.css';

export default function VaraOnboardingRunner() {
  const router = useRouter();
  const [family, setFamily] = useState<string | null>(null);
  const [title, setTitle] = useState('');

  const suggestions = useMemo(() => {
    const f = MOCK_ROLE_FAMILIES.find((x) => x.name === family);
    return f?.suggested_titles ?? [];
  }, [family]);

  const ready = family !== null && title.trim().length > 3;

  function toStudio() {
    const q = new URLSearchParams({ family: family!, title: title.trim(), mode: 'compose' });
    router.push(`/agents/vara/jd-studio?${q.toString()}`);
  }

  function toImport() {
    const q = new URLSearchParams({ family: family!, title: title.trim(), mode: 'import' });
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
        <div className={s.familyList}>
          {MOCK_ROLE_FAMILIES.map((f) => (
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
        </div>
      </div>

      {/* Role title ───────────────────────────────────────────────────── */}
      <div className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>What is the exact role you are hiring for?</h2>
          <span className={s.cardMeta}>your first JD in {family ?? 'this family'}</span>
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
          disabled={!family}
        />
        {family && suggestions.length > 0 && (
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
