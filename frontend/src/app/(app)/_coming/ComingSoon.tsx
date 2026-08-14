'use client';

/**
 * A pathway that has a route and a nav entry but no surface yet.
 *
 * Nova and /brain/knowledge are deliberately visible while empty: an empty
 * group that shows what is coming beats a surprise reorganisation later, and
 * it forces the hierarchy to be right from the start. Showing a named,
 * routable placeholder is the honest version of that — a nav item that 404s
 * would be worse than not listing it.
 */

import { VdfPageHeader } from '@/components/vdf';
import s from './coming.module.css';

export function ComingSoon({
  eyebrow, title, description, steps,
}: {
  eyebrow: string;
  title: string;
  description: string;
  /** What this pathway will walk through, once it exists. */
  steps?: string[];
}) {
  return (
    <div className={s.wrap}>
      <VdfPageHeader eyebrow={eyebrow} title={title} />
      <div className={s.card}>
        <span className={s.tag}>Coming</span>
        <p className={s.body}>{description}</p>
        {steps && steps.length > 0 && (
          <>
            <span className={s.stepsLabel}>The pathway will be</span>
            <ol className={s.steps}>
              {steps.map((step, i) => (
                <li key={step} className={s.step}>
                  <span className={s.stepNum}>{i + 1}</span>
                  <span>{step}</span>
                </li>
              ))}
            </ol>
          </>
        )}
      </div>
    </div>
  );
}
