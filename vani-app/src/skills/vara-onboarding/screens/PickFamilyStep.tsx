'use client';

/**
 * Onboarding step 1 — pick the role family the tenant is hiring for.
 *
 * UX-only. Real version reads role families from vani_domain_pack payloads
 * scoped to the tenant's industry (per design doc §3), and includes an
 * "Other" that falls through to the manual skeleton.
 */

import { MOCK_ROLE_FAMILIES, MOCK_TENANT_INDUSTRY } from '../mock-data';
import s from '../vara-onboarding.module.css';

export function PickFamilyStep({
  selected,
  onSelect,
  onNext,
}: {
  selected: string | null;
  onSelect: (family: string) => void;
  onNext: () => void;
}) {
  return (
    <>
      <div className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>What Vara already knows</h2>
          <span className={s.cardMeta}>inherited from Smart Profile</span>
        </div>
        <p className={s.cardWhat}>
          Vara does not ask you again for what you have already declared.
          You can correct any of this by going back to the Smart Profile.
        </p>
        <div className={s.inheritGrid}>
          <span className={s.inheritLabel}>Industry</span>
          <span className={s.inheritValue}>{MOCK_TENANT_INDUSTRY}</span>
          <span className={s.inheritLabel}>Domain</span>
          <span className={s.inheritValue}>vikuna.io · workspace</span>
          <span className={s.inheritLabel}>Brand voice</span>
          <span className={s.inheritValue}>Precise, honest, no theatre</span>
          <span className={s.inheritLabel}>People on the team</span>
          <span className={s.inheritValue}>1 owner (you)</span>
        </div>
      </div>

      <div className={s.card}>
        <div className={s.cardHead}>
          <h2 className={s.cardTitle}>What role family are you hiring for?</h2>
          <span className={s.cardMeta}>Vara has playbooks for these under your industry</span>
        </div>
        <p className={s.cardWhat}>
          Pick the family closest to your first role. Vara proposes a starting
          playbook for it — you tune, then approve. You can add more families
          later.
        </p>
        <div className={s.familyList}>
          {MOCK_ROLE_FAMILIES.map((f) => (
            <button
              key={f}
              type="button"
              className={
                selected === f
                  ? `${s.familyItem} ${s.familyItemActive}`
                  : s.familyItem
              }
              onClick={() => onSelect(f)}
            >
              <div className={s.familyName}>{f}</div>
              <div className={s.familyHint}>Verified playbook available</div>
            </button>
          ))}
        </div>
      </div>

      <div className={s.actions}>
        <button
          type="button"
          className={s.primary}
          onClick={onNext}
          disabled={!selected}
        >
          See Vara&rsquo;s recommendation →
        </button>
        <span className={s.note}>
          Not on this list? Choose the closest — you can adjust every field on
          the next screen.
        </span>
      </div>
    </>
  );
}
