'use client';

/**
 * Take the role families you hire for.
 *
 * The step the product was missing. A family tile used to be a SELECTOR — you
 * clicked it, its name rode to JD Studio in a URL, and nothing was written. So
 * the second JD in a family was identical work to the first, and "save it to
 * my space" meant nothing.
 *
 * Three things this screen owes the tenant, all learned the hard way:
 *
 *  1. SHOW WHAT IS INSIDE. A name and a one-line hint is not enough to decide
 *     on. Every family opens in place — the must-haves Vara would score with
 *     their weights and reasons, the knockouts, the handover bar, the titles
 *     it covers. Choosing blind is not choosing.
 *  2. SAY IT IS NOT FINAL. The catalogue stays; a family can be taken the day
 *     they first hire for it. A tenant who thinks this is their only chance
 *     takes everything, and eleven half-meant families are worse than two they
 *     mean.
 *  3. LEAVE A WAY OUT. "None of these" is a real answer, and it goes somewhere
 *     — JD Studio's unmatched lane builds a family from nothing.
 */

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';
import u from '@/platform/shell/ui.module.css';
import s from '../vara-onboarding.module.css';

const SKILL = 'domain-pack-skill';

interface MustHave { name: string; weight: number; years?: number; why?: string }
interface Knockout { label: string; rule: string }
interface Starter {
  role_summary_hint?: string; musthaves?: MustHave[];
  knockouts?: Knockout[]; threshold?: number; band_hint?: string;
}
interface Family {
  pack_code: string; pack_version: number; name: string; hint: string | null;
  suggested_titles: string[]; starter: Starter; mine: boolean;
  provenance: { researched: boolean; review_state: string | null; at: string | null };
}
interface Catalogue {
  industry: string | null; domain: string | null;
  families: Family[]; mine: number; reason?: string; detail: string;
}

/** Where a family came from, in three words the tenant can act on. */
function provenanceLabel(f: Family): { text: string; cls: string } {
  if (f.mine) return { text: 'yours', cls: s.provMine };
  if (!f.provenance.researched) return { text: 'Vikuna starter', cls: s.provGen };
  if (f.provenance.review_state === 'unreviewed') {
    // Usable, and not the same thing as checked. Rule 12: the degraded thing
    // is labelled, never quietly presented as the real one.
    return { text: 'researched · not yet reviewed', cls: s.provRes };
  }
  return { text: 'researched', cls: s.provRes };
}

export default function TakeFamilies() {
  const router = useRouter();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const q = useSkillQuery<Catalogue>(SKILL, 'catalogue', {});

  const take = useSkillMutation(SKILL, 'take_families', {
    successMessage: 'Those families are yours now.',
    errorMessage: 'Could not take those families.',
    onSuccess: () => { router.push('/agents/vara/jd-studio'); },
  });

  const toggle = (set: Set<string>, k: string) => {
    const n = new Set(set);
    n.has(k) ? n.delete(k) : n.add(k);
    return n;
  };

  return (
    <div className={s.wrap}>
      <div className={u.eyebrow}>// AGENTS · VARA · ROLE FAMILIES</div>
      <h1 className={u.h1}>Which of these do you actually hire for?</h1>

      <DataBoundary
        query={q}
        label="role families"
        skeleton={<SkeletonRows rows={5} />}
        isEmpty={(d: Catalogue) => !d?.families?.length}
        empty="Vara has not studied your industry yet. You can research it, or shape a role from scratch in JD Studio."
      >
        {(c: Catalogue) => (
          <>
            <p className={s.cardWhat} style={{ maxWidth: '62ch' }}>
              Open any one to read what is inside it — the must-haves Vara would
              score, the knockouts, the handover bar. Then decide. Taking one
              copies it into your workspace; from then on it is yours to change,
              and the industry version never changes underneath you.
            </p>

            <div className={s.familyList} style={{ marginTop: 18 }}>
              {c.families.map((f) => {
                const isOpen = open.has(f.pack_code);
                const isPicked = picked.has(f.pack_code);
                const prov = provenanceLabel(f);
                const total = (f.starter.musthaves ?? [])
                  .reduce((n, m) => n + m.weight, 0);
                return (
                  <div
                    key={f.pack_code}
                    className={isPicked ? s.familyItemActive : s.familyItem}
                    style={{ display: 'block', cursor: 'default' }}
                  >
                    <button
                      type="button"
                      className={s.familyHit}
                      aria-pressed={isPicked}
                      disabled={f.mine}
                      onClick={() => setPicked((p) => toggle(p, f.pack_code))}
                    >
                      <div className={s.familyRow}>
                        <div style={{ flex: 1 }}>
                          <div className={s.familyName}>{f.name}</div>
                          {f.hint && <div className={s.familyHint}>{f.hint}</div>}
                        </div>
                        <span className={`${s.prov} ${prov.cls}`}>{prov.text}</span>
                      </div>
                    </button>

                    <button
                      type="button"
                      className={s.viewBtn}
                      aria-expanded={isOpen}
                      onClick={() => setOpen((o) => toggle(o, f.pack_code))}
                    >
                      {isOpen ? 'Hide structure ▴' : 'View the JD structure ▾'}
                    </button>

                    {isOpen && (
                      <div className={s.peek}>
                        <div className={s.jdSectionH}>
                          Must-haves · Vara scores these · {total}%
                        </div>
                        {(f.starter.musthaves ?? []).map((m, i) => (
                          <div key={i} className={s.weightRow}>
                            <div>
                              <div className={s.weightName}>{m.name}</div>
                              {m.why && <div className={s.peekWhy}>{m.why}</div>}
                              <div className={s.weightBar}>
                                <div className={s.weightFill} style={{ width: `${m.weight}%` }} />
                              </div>
                            </div>
                            <div className={s.weightVal}>{m.weight}%</div>
                          </div>
                        ))}

                        <div className={s.jdSectionH}>
                          Knockouts · checked before any scoring
                        </div>
                        {(f.starter.knockouts ?? []).length === 0
                          ? <div className={s.jdEmpty}>None</div>
                          : (f.starter.knockouts ?? []).map((k, i) => (
                            <div key={i} className={s.knockRow}>
                              <span className={s.knockLabel}>{k.label}</span>
                              <span className={s.knockRule}>{k.rule}</span>
                            </div>
                          ))}

                        <div className={s.jdSectionH}>Handover threshold</div>
                        <div className={s.jdLine}>
                          At <b>{f.starter.threshold ?? 30}%</b> or above, a person on
                          your team meets the candidate. You can change this after
                          you take it.
                        </div>

                        <div className={s.jdSectionH}>Titles this covers</div>
                        <div className={s.peekTitles}>
                          {f.suggested_titles.join(' · ') || '—'}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Not a one-time choice, and saying so changes what they pick. */}
            <div className={s.laterNote}>
              <b>Nothing here is a one-time choice.</b> The full list stays in your
              workspace — take another family the day you start hiring for it, and it
              arrives already shaped. You are not deciding what you will ever hire
              for; you are deciding what you are hiring for now.
            </div>

            <div className={s.actions} style={{ marginTop: 20 }}>
              <button
                type="button"
                className={s.primary}
                disabled={picked.size === 0 || take.isPending}
                onClick={() => take.mutate({ codes: [...picked] })}
              >
                {take.isPending ? 'Taking…' : `Continue with ${picked.size || '—'}`}
              </button>
              <button
                type="button"
                className={s.ghost}
                onClick={() => router.push('/agents/vara/jd-studio')}
              >
                None of these — I&rsquo;ll build my own
              </button>
            </div>
            <p className={s.note} style={{ marginTop: 10 }}>
              {c.mine > 0
                ? `${c.mine} of ${c.families.length} already yours. The rest stay available.`
                : 'Take one to start from a shape Vara already knows, or build yours from scratch.'}
            </p>
          </>
        )}
      </DataBoundary>
    </div>
  );
}
