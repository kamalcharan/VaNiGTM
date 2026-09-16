'use client';

/**
 * Vara onboarding — the doorway to JD Studio. Phase 1 wiring: real API,
 * mock retained only for the empty-state preview.
 *
 * Backend truth (via GET /vara/onboarding/context, in one call):
 *   - industry declared by the tenant (slugified against vani_domain_pack.domain)
 *   - families we have starting playbooks for under that industry
 *   - tenant brand fields (name, website — colors/site_quote null until the
 *     brand step lands)
 *   - the tenant's own published JDs (for Duplicate on the doorway)
 *
 * Client-side niceties:
 *   - Other affordance: an ad-hoc family the tenant names, filed under a
 *     new vani_role_family row at publish time. Same code path as a
 *     pack-matched family; the pack just supplies richer defaults.
 *   - ?empty=1 URL flag simulates an industry with no seeded families, so
 *     the Other-only empty state can be reviewed without seeding a fresh DB.
 *
 * Not wired yet (deliberate — Phase 3 territory per docs/vani/vara-execution-poa.md):
 *   - Edit an existing JD → publishes v2. Needs POST /vara/jd/:id/version.
 *     The Edit affordance is hidden with a small note. Duplicate covers the
 *     tenant's near-neighbour case in the meantime.
 *   - Family-defaults derivation prompt. Needs vara_family_profile writes
 *     from statistics over N JDs, which is what Phase 3 owns.
 */

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch, ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import type { SkillResult } from '@/lib/useSkill';
import { UX_DRAFT_KEY, type DraftJd, type PublishedFacts } from '../mock-data';
import { ResearchCard } from './ResearchCard';
import u from '@/platform/shell/ui.module.css';
import s from '../vara-onboarding.module.css';

/** Wire shape of GET /vara/onboarding/context. Kept alongside the screen
 *  because there is one caller and the response is not a domain type. */
interface ContextFamily {
  pack_code: string;
  pack_version: number;
  name: string;
  hint: string | null;
  suggested_titles: string[];
  starter: {
    role_summary_hint?: string;
    musthaves?: { name: string; weight: number }[];
    knockouts?: { label: string; rule: string }[];
    threshold?: number;
    band_hint?: string;
  };
}
interface ContextPublishedJd {
  id: string;
  title: string;
  family: string;
  version: number;
  facts: PublishedFacts & Record<string, unknown>;
}
interface OnboardingContext {
  industry: { raw: string; slug: string };
  brand: { name: string; website: string | null; colors: null; site_quote: null };
  families: ContextFamily[];
  published_jds: ContextPublishedJd[];
  subscription: string;
}

function newId(): string {
  return `jd-${Math.floor(performance.now() * 1000).toString(36)}-${Math.floor(Math.random() * 1e6).toString(36)}`;
}

function VaraOnboardingRunnerInner() {
  const router = useRouter();
  const [family, setFamily] = useState<string | null>(null);
  const [otherFamily, setOtherFamily] = useState('');
  const [title, setTitle] = useState('');

  const emptyMode = useSearchParams().get('empty') === '1';

  const ctx = useQuery<SkillResult<OnboardingContext>, Error>({
    queryKey: ['vara', 'onboarding-context'],
    queryFn: async () => {
      try {
        const r = await apiFetch<OnboardingContext>(API.vara.onboardingContext);
        return { success: true, skill: 'vara', function: 'onboarding.context', data: r };
      } catch (err) {
        // NO_INDUSTRY and TENANT_NOT_PROVISIONED both come back as ApiError;
        // surface them through the boundary's error copy rather than as
        // silent empties. The boundary shows the message with a retry, which
        // is the right shape for a "go set your industry" pointer.
        if (err instanceof ApiError) throw err;
        throw new Error('Could not read onboarding context');
      }
    },
  });

  return (
    <div className={s.wrap}>
      <div className={u.eyebrow}>// AGENTS · VARA · ONBOARDING</div>
      <h1 className={u.h1}>One JD from live</h1>

      <DataBoundary query={ctx} label="onboarding context" skeleton={<SkeletonRows rows={4} />}>
        {(c: OnboardingContext) => {
          // Empty mode is a client-side simulation: keep everything real
          // (families still loaded, published JDs still shown) but pretend
          // the family list is empty. Useful to preview the empty state
          // without seeding a fresh DB.
          const shownFamilies = emptyMode ? [] : c.families;
          const effectiveFamily = family === '__other__' ? (otherFamily.trim() || null) : family;
          const activeFamily = shownFamilies.find((f) => f.name === effectiveFamily) ?? null;
          const suggestions = activeFamily?.suggested_titles ?? [];
          const ready = effectiveFamily !== null && title.trim().length > 3;

          function toStudio(mode: 'compose' | 'import') {
            const q = new URLSearchParams({
              family: effectiveFamily!,
              title: title.trim(),
              mode,
            });
            // Prefill the studio with the pack's starter facts. Ad-hoc
            // (Other) families skip prefill — the tenant fills from scratch.
            if (activeFamily) {
              const draft: DraftJd = {
                id: newId(),
                family: effectiveFamily!,
                title: title.trim(),
                facts: {
                  musthaves: activeFamily.starter.musthaves ?? [],
                  knockouts: activeFamily.starter.knockouts ?? [],
                  threshold: activeFamily.starter.threshold ?? 30,
                  one_liner: activeFamily.starter.role_summary_hint,
                },
                mode: 'duplicate',   // pack starter is a starting shape, not a real prior version
                baseVersion: 0,
              };
              try { sessionStorage.setItem(UX_DRAFT_KEY, JSON.stringify(draft)); } catch { /* private mode */ }
            } else {
              try { sessionStorage.removeItem(UX_DRAFT_KEY); } catch { /* ignore */ }
            }
            router.push(`/agents/vara/jd-studio?${q.toString()}`);
          }

          function duplicate(jd: ContextPublishedJd) {
            const draft: DraftJd = {
              id: newId(),
              family: jd.family,
              title: `${jd.title} (copy)`,
              facts: jd.facts,
              mode: 'duplicate',
              baseVersion: jd.version,
            };
            try { sessionStorage.setItem(UX_DRAFT_KEY, JSON.stringify(draft)); } catch { /* private mode */ }
            router.push('/agents/vara/jd-studio?mode=compose');
          }

          return (
            <>
              {/* Your published JDs — from the backend now ─────────────── */}
              {c.published_jds.length > 0 && (
                <div className={s.card}>
                  <div className={s.cardHead}>
                    <h2 className={s.cardTitle}>Your published JDs</h2>
                    <span className={s.cardMeta}>
                      {c.published_jds.length} JD{c.published_jds.length === 1 ? '' : 's'} live · from your workspace
                    </span>
                  </div>
                  <p className={s.cardWhat}>
                    <b>Duplicate</b> mints a new JD (v1) with the same starting facts —
                    good for a near-neighbour role. Edit-in-place (publishing as v2)
                    arrives with JD versioning; for now, Duplicate covers the shape.
                  </p>
                  <div className={s.jdList}>
                    {c.published_jds.map((jd) => (
                      <div key={jd.id} className={s.jdRow}>
                        <div className={s.jdRowMain}>
                          <div className={s.jdRowTitle}>
                            {jd.title} <span className={s.jdRowVer}>v{jd.version}</span>
                          </div>
                          <div className={s.jdRowMeta}>
                            {jd.family} · {jd.facts.musthaves?.length ?? 0} must-have
                            {(jd.facts.musthaves?.length ?? 0) === 1 ? '' : 's'}
                            {' · '}{jd.facts.knockouts?.length ?? 0} knockout
                            {(jd.facts.knockouts?.length ?? 0) === 1 ? '' : 's'}
                            {typeof jd.facts.band === 'string' ? <> · {jd.facts.band}</> : null}
                          </div>
                        </div>
                        <div className={s.jdRowActions}>
                          <button type="button" className={s.ghost} onClick={() => duplicate(jd)}>
                            Duplicate
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Inheritance — visual, not verbal ─────────────────────── */}
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
                  <span className={s.brandLogo} style={{ background: 'var(--gold)' }} aria-hidden="true">
                    {(c.brand.name?.[0] ?? 'W').toUpperCase()}
                  </span>
                  <div>
                    <div className={s.brandName}>{c.brand.name}</div>
                    <div className={s.brandMeta}>
                      {c.industry.raw}{c.brand.website ? <> · {c.brand.website}</> : null}
                    </div>
                  </div>
                </div>
              </div>

              {/* Role family ─────────────────────────────────────────── */}
              <div className={s.card}>
                <div className={s.cardHead}>
                  <h2 className={s.cardTitle}>Which family is the role in?</h2>
                  <span className={s.cardMeta}>
                    Vara has starting playbooks for these under {c.industry.raw}
                  </span>
                </div>
                <p className={s.cardWhat}>
                  Pick the closest family — Vara starts you with its playbook so the
                  first JD is a tune-and-publish, not a build-from-scratch.
                </p>
                {/* One line used to cover every reason this list can be empty.
                    ResearchCard asks the server which one it is, and offers the
                    retry when there is one to offer. */}
                {(emptyMode || c.families.length === 0) && (
                  <ResearchCard industryRaw={c.industry.raw} />
                )}
                <div className={s.familyList}>
                  {shownFamilies.map((f) => (
                    <button
                      key={f.pack_code}
                      type="button"
                      className={
                        family === f.name
                          ? `${s.familyItem} ${s.familyItemActive}`
                          : s.familyItem
                      }
                      onClick={() => setFamily(f.name)}
                    >
                      <div className={s.familyName}>{f.name}</div>
                      <div className={s.familyHint}>{f.hint ?? ''}</div>
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
                      Manual skeleton — default 33/33/33 weights, no knockouts. You
                      tune everything in the next screen.
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
                      Vara will file this JD under a new family with this name.
                    </div>
                  </div>
                )}
              </div>

              {/* Role title ──────────────────────────────────────────── */}
              <div className={s.card}>
                <div className={s.cardHead}>
                  <h2 className={s.cardTitle}>What is the exact role you are hiring for?</h2>
                  <span className={s.cardMeta}>your first JD in {effectiveFamily ?? 'this family'}</span>
                </div>
                <p className={s.cardWhat}>
                  The title as it will appear on your careers page. You will shape the
                  rest — must-haves, band, knockouts — in the next screen.
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

              {/* Choice ─────────────────────────────────────────────── */}
              <div className={s.card}>
                <div className={s.cardHead}>
                  <h2 className={s.cardTitle}>How do you want to build this JD?</h2>
                  <span className={s.cardMeta}>both paths end at the same Publish</span>
                </div>
                <div className={s.familyList}>
                  <button
                    type="button"
                    className={s.familyItem}
                    onClick={() => toStudio('compose')}
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
                    onClick={() => toStudio('import')}
                    disabled={!ready}
                    style={{ opacity: ready ? 1 : 0.45 }}
                  >
                    <div className={s.familyName}>Import existing JDs →</div>
                    <div className={s.familyHint}>
                      Drag a docx or pdf. Vara extracts must-haves, knockouts and band
                      with evidence — you review, tune, publish. (Preview — extraction
                      wires in Phase 2.)
                    </div>
                  </button>
                </div>
                <p className={s.note} style={{ marginTop: 10 }}>
                  Publishing the first JD takes Vara live for your workspace and
                  writes it as v1 in the DB — check the doorway list on the next visit.
                </p>
              </div>
            </>
          );
        }}
      </DataBoundary>
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
