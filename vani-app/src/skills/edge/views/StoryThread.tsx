'use client';
/** "Edge's guidance · connect this step to my goal" — reference `story()` markup. */
import { useMission } from '../mission/MissionProvider';
import { story } from '../mission/story';
import { Btn } from '../ui';
import { useReference, dataFor } from './useReference';

export function StoryThread() {
  const { m, stage, go } = useMission();
  const ref = useReference();
  const row = story(m, stage, dataFor(m.process, ref.data?.data)?.variants ?? []);
  if (!row) return null;
  return (
    <details className="chapter-story">
      <summary>Edge’s guidance · connect this step to my goal</summary>
      <section className="story-thread" aria-label="Edge connects the story">
        <div className="eyebrow">EDGE / {row.label}</div>
        <h2>{row.title}</h2>
        <p>{row.body}</p>
        <p className="story-next">{row.next}</p>
        {stage >= 4 && (
          <details>
            <summary>Our thread so far</summary>
            <dl>
              <dt>You told us</dt><dd>{row.pain || 'Pain still to clarify'}</dd>
              <dt>You want to gain</dt><dd>{row.goal || 'Outcome still to clarify'}</dd>
              <dt>What remains open</dt><dd>{row.open} contribution request(s). {row.sample ? 'Sample interpretation still needs customer validation.' : 'Customer event analysis is not connected.'}</dd>
            </dl>
            <Btn kind="text" onClick={() => go(3)}>Revisit our understanding</Btn>
          </details>
        )}
      </section>
    </details>
  );
}
