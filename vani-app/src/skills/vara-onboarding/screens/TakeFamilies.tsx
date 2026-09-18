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

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import { useSkillQuery } from '@/lib/useSkill';
import { useSkillMutation } from '@/lib/useSkillMutation';
import u from '@/platform/shell/ui.module.css';
import s from '../vara-onboarding.module.css';
import { bump as bumpW, drop as dropW, balance, total as sumW, TOTAL } from '../weights';

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
interface MyFamily {
  family_id: string; name: string; version: number;
  musthaves: MustHave[]; knockouts: Knockout[]; threshold: number;
  from_pack: { code: string; version: number } | null; edited: boolean;
}
interface MyFamilies { families: MyFamily[]; detail: string }

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
  // One family at a time now. The structure used to expand INLINE inside the
  // list item, which is ~560px of column — the weight bars and the `why` lines
  // wrapped into a mess, and a long family pushed the rest of the list off
  // screen. It is a document, so it gets a document's width.
  const [reading, setReading] = useState<Family | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());

  const qc = useQueryClient();
  const q = useSkillQuery<Catalogue>(SKILL, 'catalogue', {});
  // A taken family's live shape, which is NOT the pack's once it has been
  // edited. Opening the catalogue copy for a family the tenant already
  // changed would show them the industry's version and call it theirs.
  const mineQ = useSkillQuery<MyFamilies>(SKILL, 'my_families', {});

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
                const isPicked = picked.has(f.pack_code);
                const prov = provenanceLabel(f);
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
                      onClick={() => setReading(f)}
                    >
                      View the JD structure
                    </button>
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

            <StructureDialog
              family={reading}
              mine={reading
                ? (mineQ.data?.data?.families ?? []).find((m) => m.name === reading.name) ?? null
                : null}
              onClose={() => setReading(null)}
              // match_title too, not just the two lists on this screen. JD
              // Studio caches a match per title, and a cached one carries the
              // shape as it was BEFORE this edit — so without this the tenant
              // changes their bar, types the role, and is handed the old one
              // back. That is exactly the "your edits are invisible" failure
              // this whole step exists to remove.
              onSaved={() => {
                void q.refetch();
                void mineQ.refetch();
                void qc.invalidateQueries({ queryKey: ['skill', SKILL, 'match_title'] });
              }}
            />

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


/**
 * The family's shape, at a width it can actually be read at — and editable
 * once it is theirs.
 *
 * ONE SURFACE, TWO MODES. A family in the catalogue is a document you read
 * before deciding; a family in your workspace is the same document, and the
 * only difference is that you can change it. Two separate screens for "look at
 * a shape" and "edit a shape" would drift, and a tenant would have to learn
 * which one they were on.
 *
 * Native <dialog> with showModal(): top layer, focus trap, Esc-to-close and an
 * inert page behind, none of which a hand-rolled overlay gets right for free.
 */
function StructureDialog(
  { family, mine, onClose, onSaved }: {
    family: Family | null;
    mine: MyFamily | null;
    onClose: () => void;
    onSaved: () => void;
  },
) {
  const ref = useRef<HTMLDialogElement>(null);
  const panel = useRef<HTMLDivElement>(null);

  // The working copy. Seeded from the LIVE shape when the family is theirs,
  // from the pack when it is not yet.
  const [draft, setDraft] = useState<{ musthaves: MustHave[]; knockouts: Knockout[]; threshold: number } | null>(null);
  const [dirty, setDirty] = useState(false);

  const save = useSkillMutation(SKILL, 'update_family_shape', {
    successMessage: 'Saved. Earlier versions stay readable.',
    errorMessage: 'Could not save the change.',
    onSuccess: () => { setDirty(false); onSaved(); onClose(); },
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (family && !el.open) el.showModal();
    if (!family && el.open) el.close();
    if (family) {
      const src = mine ?? family.starter;
      setDraft({
        musthaves: [...(src.musthaves ?? [])],
        knockouts: [...(src.knockouts ?? [])],
        threshold: (mine ? mine.threshold : family.starter.threshold) ?? 30,
      });
      setDirty(false);
    }
  }, [family, mine]);

  if (!family) return <dialog ref={ref} className={s.dialog} onClose={onClose} />;

  const editable = Boolean(mine);
  const shape = draft ?? { musthaves: [], knockouts: [], threshold: 30 };
  const total = sumW(shape.musthaves);
  const edit = (next: Partial<typeof shape>) => {
    setDraft({ ...shape, ...next });
    setDirty(true);
  };
  // Weights are a split of 100 and every edit conserves it (weights.ts). This
  // dialog is where a family reached 110%: ± created weight rather than moving
  // it, so pressing + twice quietly devalued every other must-have.
  const bump = (i: number, by: number) => edit({ musthaves: bumpW(shape.musthaves, i, by) });

  return (
    <dialog
      ref={ref}
      className={s.dialog}
      onClose={onClose}
      onClick={(e) => {
        // Outside-click by CONTAINMENT, not by comparing the target to the
        // dialog — the usual trick relies on a backdrop click retargeting to
        // the element and it did not fire here. An unsaved change is not
        // thrown away by a stray click.
        if (panel.current?.contains(e.target as Node)) return;
        if (dirty) return;
        onClose();
      }}
      aria-label={`${family.name} — JD structure`}
    >
      <div className={s.dialogPanel} ref={panel}>
        <div className={s.dialogHead}>
          <div>
            <div className={s.dialogTitle}>{family.name}</div>
            <div className={s.familyHint}>
              {editable
                ? `Yours · v${mine!.version}${mine!.edited ? ' · edited' : ''} — change anything`
                : family.hint ?? "Vara's version. Take it to make it yours."}
            </div>
          </div>
          <button type="button" className={s.dialogClose} onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>

        <div className={s.dialogBody}>
          <div className={s.jdSectionH}>
            Must-haves · Vara scores these · {total}%
            {editable && shape.musthaves.length > 0 && total !== TOTAL && (
              <>
                {' '}
                <button
                  type="button"
                  className={s.viewBtn}
                  onClick={() => edit({ musthaves: balance(shape.musthaves) })}
                >
                  balance to {TOTAL}%
                </button>
              </>
            )}
          </div>
          {shape.musthaves.map((m, i) => (
            <div key={i} className={s.weightRow}>
              <div>
                <div className={s.weightName}>{m.name}</div>
                {m.why && <div className={s.peekWhy}>{m.why}</div>}
                <div className={s.weightBar}>
                  <div className={s.weightFill} style={{ width: `${m.weight}%` }} />
                </div>
              </div>
              {editable ? (
                <div className={s.wt}>
                  <button type="button" onClick={() => bump(i, -5)} aria-label={`Lower ${m.name}`}>−</button>
                  <span className={s.weightVal}>{m.weight}%</span>
                  <button type="button" onClick={() => bump(i, 5)} aria-label={`Raise ${m.name}`}>+</button>
                  <button
                    type="button"
                    className={s.dropBtn}
                    aria-label={`Remove ${m.name}`}
                    // One must-have is the floor: a family that scores nothing
                    // gives every candidate the same number, which reads as a
                    // judgement rather than an absence.
                    disabled={shape.musthaves.length < 2}
                    onClick={() => edit({ musthaves: dropW(shape.musthaves, i) })}
                  >×</button>
                </div>
              ) : (
                <div className={s.weightVal}>{m.weight}%</div>
              )}
            </div>
          ))}

          <div className={s.jdSectionH}>Knockouts · checked before any scoring</div>
          {shape.knockouts.length === 0
            ? <div className={s.jdEmpty}>None</div>
            : shape.knockouts.map((k, i) => (
              <div key={i} className={s.knockRow}>
                <span className={s.knockLabel}>{k.label}</span>
                <span className={s.knockRule}>{k.rule}</span>
                {editable && (
                  <button
                    type="button"
                    className={s.dropBtn}
                    aria-label={`Remove ${k.label}`}
                    onClick={() => edit({ knockouts: shape.knockouts.filter((_, j) => j !== i) })}
                  >×</button>
                )}
              </div>
            ))}

          <div className={s.jdSectionH}>Handover threshold</div>
          {editable ? (
            <>
              <div className={s.thrRow}>
                <input
                  type="range" min={10} max={60} step={5}
                  value={shape.threshold}
                  onChange={(e) => edit({ threshold: Number(e.target.value) })}
                  aria-label="Handover threshold"
                />
                <span className={s.weightVal}>{shape.threshold}%</span>
              </div>
              <p className={s.jdLine}>
                This is the number that decides who a human on your team meets.
              </p>
            </>
          ) : (
            <div className={s.jdLine}>
              At <b>{shape.threshold}%</b> or above, a person on your team meets the
              candidate. You can change this after you take it.
            </div>
          )}

          <div className={s.jdSectionH}>Titles this covers</div>
          <div className={s.peekTitles}>{family.suggested_titles.join(' · ') || '—'}</div>

          {editable && (
            <div className={s.actions} style={{ marginTop: 20 }}>
              <button
                type="button"
                className={s.primary}
                disabled={!dirty || save.isPending}
                onClick={() => save.mutate({
                  family_id: mine!.family_id,
                  musthaves: shape.musthaves,
                  knockouts: shape.knockouts,
                  threshold: shape.threshold,
                })}
              >
                {save.isPending ? 'Saving…' : `Save as v${mine!.version + 1}`}
              </button>
              <span className={s.note}>
                {dirty
                  ? `v${mine!.version} stays readable — a JD published against it is still explainable.`
                  : 'Nothing changed yet.'}
              </span>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
