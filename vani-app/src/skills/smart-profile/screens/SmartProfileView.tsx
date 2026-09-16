'use client';

/**
 * The Smart Profile — see all of it, edit any part.
 *
 * This is NOT the build flow. The build flow is a pathway: linear, one step at
 * a time, designed for the first pass. This is the record: everything VaNi
 * knows, on one page, each section stating whether it is captured and opening
 * the exact step that owns it. Asking someone to re-walk a wizard to check what
 * their brand voice says is not a view.
 *
 * Each section owns its own read, so a failure in competitors does not blank
 * the brand. That is deliberate: one query per section, one DataBoundary per
 * section, five states each.
 *
 * Editing deep-links into the build flow at the owning step rather than
 * duplicating its forms here. Two editors for one field is how they drift, and
 * the pathway already handles validation, save state and confirmation.
 */

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { UseQueryResult } from '@tanstack/react-query';
import type { SkillResult } from '@/lib/useSkill';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import {
  useProfileRead,
  useVocabularyRead,
  useCompetitorsRead,
  useBrandRead,
  useDomainsRead,
  type GtmProfile,
  type SemanticCluster,
  type Competitor,
  type TenantBrand,
  type TenantDomain,
} from '../useSmartProfile';
import { PeopleSection } from './PeopleSection';
import s from '../smart-profile.module.css';

/** Deep link into the build flow at the step that owns a section. */
const EDIT = (step: string) => `/onboarding?step=${step}`;

function Section({
  n,
  title,
  what,
  editStep,
  editHref,
  editLabel,
  query,
  isEmpty,
  empty,
  children,
}: {
  n: number;
  title: string;
  /** Why this section exists, in the tenant's terms — not a field list. */
  what: string;
  editStep: string;
  /** Overrides the wizard deep link for sections whose step lives elsewhere. */
  editHref?: string;
  editLabel: string;
  query: UseQueryResult<SkillResult<any>, Error>;
  isEmpty: (d: any) => boolean;
  empty: string;
  children: (d: any) => ReactNode;
}) {
  return (
    <section className={s.section}>
      <header className={s.sectionHead}>
        <span className={s.sectionNum}>{n}</span>
        <div className={s.sectionTitles}>
          <h2 className={s.sectionTitle}>{title}</h2>
          <p className={s.sectionWhat}>{what}</p>
        </div>
        <Link href={editHref ?? EDIT(editStep)} className={s.sectionEdit}>
          {editLabel}
        </Link>
      </header>
      <div className={s.sectionBody}>
        <DataBoundary
          query={query}
          label={title.toLowerCase()}
          skeleton={<SkeletonRows rows={2} />}
          isEmpty={isEmpty}
          empty={empty}
        >
          {children}
        </DataBoundary>
      </div>
    </section>
  );
}

function Field({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null; // never render an empty field as an em-dash
  return (
    <div className={s.field}>
      <span className={s.fieldLabel}>{label}</span>
      <span className={s.fieldValue}>{value}</span>
    </div>
  );
}

function Chips({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <div className={s.chips}>
      {items.map((t, i) => (
        <span key={`${t}-${i}`} className={s.chip}>{t}</span>
      ))}
    </div>
  );
}

/** Declared in the lane catalog, no screen yet. Stated, not hidden. */
function NotYet({ n, title, what }: { n: number; title: string; what: string }) {
  return (
    <section className={`${s.section} ${s.sectionLocked}`}>
      <header className={s.sectionHead}>
        <span className={s.sectionNum}>{n}</span>
        <div className={s.sectionTitles}>
          <h2 className={s.sectionTitle}>{title}</h2>
          <p className={s.sectionWhat}>{what}</p>
        </div>
        <span className={s.sectionSoon}>Not yet</span>
      </header>
    </section>
  );
}

export default function SmartProfileView() {
  const profile = useProfileRead();
  const vocab = useVocabularyRead();
  const competitors = useCompetitorsRead();
  const brand = useBrandRead();
  const domains = useDomainsRead();

  const score = profile.data?.data?.completion_score ?? 0;

  return (
    <div className={s.page}>
      <header className={s.head}>
        <span className={s.eyebrow}>Smart Profile</span>
        <h1 className={s.title}>What VaNi knows about you</h1>
        <p className={s.lede}>
          Declared once, for the whole organisation. Every agent you activate
          builds on this and will not ask again.
        </p>
        <div className={s.scoreRow}>
          <span className={s.scoreValue}>{score}<span className={s.scoreMax}>/100</span></span>
          <span className={s.scoreLabel}>profile completeness</span>
          <Link href="/onboarding" className={s.headAction}>Open the build flow →</Link>
        </div>
      </header>

      <Section
        n={1}
        title="Company"
        what="What the product is, and the problem it solves."
        editStep="company"
        editLabel="Re-research"
        query={profile}
        isEmpty={(d: GtmProfile | undefined) => !d?.product_name}
        empty="Nothing captured yet. Point VaNi at your website to start."
      >
        {(d: GtmProfile) => (
          <>
            <Field label="Product" value={d.product_name} />
            <Field label="What it does" value={d.product_description} />
            <Field label="Core problem" value={d.core_problem} />
            <Chips items={d.key_differentiators ?? []} />
          </>
        )}
      </Section>

      <Section
        n={2}
        title="Market vocabulary"
        what="How your market words the problem — what every agent writes in."
        editStep="vocabulary"
        editLabel="Edit terms"
        query={vocab}
        isEmpty={(d: SemanticCluster[]) => !d?.length}
        empty="No vocabulary yet. It is drafted from your site once the company step completes."
      >
        {(d: SemanticCluster[]) => <Chips items={d.map((c) => c.primary_term)} />}
      </Section>

      <Section
        n={3}
        title="Competitors"
        what="Who you are measured against."
        editStep="competitors"
        editLabel="Edit list"
        query={competitors}
        isEmpty={(d: Competitor[]) => !d?.length}
        empty="No named competitors. VaNi positions on category instead — that is a valid answer, not a gap."
      >
        {(d: Competitor[]) => (
          <ul className={s.rows}>
            {d.map((c) => (
              <li key={c.id} className={s.row}>
                <span className={s.rowName}>{c.name}</span>
                {c.description && <span className={s.rowDetail}>{c.description}</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section
        n={4}
        title="Ideal customer"
        what="Who buys, and what hurts enough to make them act."
        editStep="icp"
        editLabel="Edit"
        query={profile}
        isEmpty={(d: GtmProfile | undefined) => !d?.icp_role}
        empty="No buyer defined yet."
      >
        {(d: GtmProfile) => (
          <>
            <Field label="Buyer" value={[d.icp_role, d.icp_company_type, d.icp_industry].filter(Boolean).join(' · ')} />
            <Chips items={d.primary_pain_points ?? []} />
          </>
        )}
      </Section>

      <Section
        n={5}
        title="Brand"
        what="How you sound, what you claim, what you never claim."
        editStep="brand"
        editLabel="Regenerate"
        query={brand}
        isEmpty={(d: TenantBrand | undefined) =>
          !d || (!d.voice_tone?.length && !d.always_say?.length && !d.proof?.length)}
        empty="No brand captured yet."
      >
        {(d: TenantBrand) => (
          <>
            <Chips items={d.voice_tone ?? []} />
            {!!d.always_say?.length && (
              <div className={s.list}>
                <span className={s.listLabel}>Always say</span>
                {d.always_say.map((v, i) => <p key={i} className={s.listItem}>{v}</p>)}
              </div>
            )}
            {!!d.never_say?.length && (
              <div className={s.list}>
                <span className={s.listLabel}>Never say</span>
                {d.never_say.map((v, i) => <p key={i} className={s.listItem}>{v}</p>)}
              </div>
            )}
            {!!d.proof?.length && (
              <div className={s.list}>
                <span className={s.listLabel}>Proof</span>
                {d.proof.map((v, i) => <p key={i} className={s.listItem}>{v}</p>)}
              </div>
            )}
            {!!(d.visual?.primary_color || d.visual?.secondary_color || d.visual?.accent_color) && (
              <div className={s.swatches}>
                {(['primary_color', 'secondary_color', 'accent_color'] as const).map((k) =>
                  d.visual?.[k] ? (
                    <span key={k} className={s.swatch}>
                      <span className={s.swatchDot} style={{ background: d.visual[k] }} />
                      {d.visual[k]}
                    </span>
                  ) : null,
                )}
              </div>
            )}
          </>
        )}
      </Section>

      <Section
        n={6}
        title="Domain"
        what="The domain your workspace runs on, so agents can address it."
        editStep="vani:domain"
        editHref="/onboarding/declare"
        editLabel="Edit"
        query={domains}
        isEmpty={(d: TenantDomain[]) => !d?.length}
        empty="No domain declared yet. Declare it once and every agent can address your workspace."
      >
        {(d: TenantDomain[]) => (
          <ul className={s.rows}>
            {d.map((row) => (
              <li key={row.domain} className={s.row}>
                <span className={s.rowName}>
                  {row.domain}
                  <span className={s.rowTag}>{row.purpose === 'candidate' ? 'candidates' : 'workspace'}</span>
                </span>
                {row.verified_at && <span className={s.rowDetail}>verified</span>}
              </li>
            ))}
          </ul>
        )}
      </Section>

      <PeopleSection n={7} />

      {/* Model. This section used to say BYOK was "coming" because
          vani_llm_provider.credentials_enc had no encryption path behind it.
          It does now (VaNiGTM agent-core/secret.crypto.ts + llm.provider.ts,
          2026-09-15), and BYOK is a MENU item rather than an onboarding step
          (user ruling, 2026-09-16).

          It is NOT linked from here, and that is deliberate rather than an
          oversight: this app's own Settings is status:'planned' (see
          src/skills/settings/index.ts, whose P2 summary names the model
          provider), so a link would be a dead route. Naming where the surface
          actually lives is the honest thing a reader can act on; inventing a
          link they cannot follow is not. When vani-app's Settings lands, this
          copy points at it. */}
      <section className={s.section}>
        <header className={s.sectionHead}>
          <span className={s.sectionNum}>8</span>
          <div className={s.sectionTitles}>
            <h2 className={s.sectionTitle}>Model</h2>
            <p className={s.sectionWhat}>Which model answers when an agent needs one.</p>
          </div>
          <span className={s.sectionSoon}>Default</span>
        </header>
        <div className={s.sectionBody}>
          <p className={s.modelNote}>
            A provider is configured for your workspace and in force for every
            agent. You can bring your own key instead — your endpoint, your
            model, your billing, and no daily token cap. It is set in the
            Vikuna GTM console under Settings → Model Provider, and applies to
            every agent here the moment it is saved. This screen gets its own
            control when Settings arrives.
          </p>
          <span className={s.modelTag}>Workspace default</span>
        </div>
      </section>
    </div>
  );
}
