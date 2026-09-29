'use client';
/**
 * Station 8 — the story (ASSET, about you, reused across the segment) and the
 * move (MOVE, about them, never reused). Same agent, two grains — the line
 * between nurture and personalised spam, already in gt_content_kinds.scope.
 * Every story says what it was built from and what it did not read.
 */
import { DataBoundary, SkeletonRows } from '@/platform/feedback';
import u from '@/platform/shell/ui.module.css';
import a from '@/skills/gtm-audience/audience.module.css';
import s from '../motion.module.css';
import { useMotionWrites, useSegments, useStories } from '../useMotion';
import type { Story } from '../mock';

export function StoryStep() {
  const q = useStories();
  const segs = useSegments();
  const w = useMotionWrites();
  return (
    <DataBoundary query={q} label="stories" skeleton={<SkeletonRows rows={3} lines={3} />} isEmpty={(d: { stories: Story[] } | undefined) => !d?.stories?.length} empty="No stories drafted — confirm the segments first, one step back.">
      {(d: { stories: Story[] }) => {
        const assets = d.stories.filter((x) => x.scope === 'asset');
        const approvedAssets = assets.filter((x) => x.status === 'approved').length;
        return (
          <div className={a.card}>
            <div className={a.eyebrow}>// PUT THEM IN MOTION · 2 OF 4</div>
            <h1 className={a.h}>The story, and the move</h1>
            <p className={a.sub}>The story is about you and is reused across the segment — an <b>asset</b>. The move is about <em>them</em> and is never reused. Approve the assets to go on; moves can be approved one by one.</p>
            {(segs.data?.data?.segments ?? []).map((sg) => (
              <div key={sg.id}>
                <div className={a.subh}>{sg.name}</div>
                {d.stories.filter((x) => x.segment_id === sg.id).map((st) => (
                  <div key={st.story_id} className={s.story}>
                    <div className={s.storyHead}>
                      <div className={s.storyTitle}>{st.title}</div>
                      <div className={a.chips} style={{ margin: 0 }}>
                        <span className={`${a.chip} ${st.scope === 'asset' ? a.chipPool : a.chipMine}`}>{st.scope} · {st.kind_key}</span>
                        <span className={`${u.tag} ${st.status === 'approved' ? u.tagOk : u.tagWarn}`}>{st.status === 'approved' ? 'approved' : 'draft · unapproved'}</span>
                        {st.status !== 'approved' && <button type="button" className={a.quiet} style={{ padding: '4px 10px', fontSize: 'var(--fs-md)' }} disabled={w.busy} onClick={() => void w.approve(st.story_id)}>Approve</button>}
                      </div>
                    </div>
                    {st.body.map((p, i) => <p key={i}>{p}</p>)}
                    <div className={s.trace}>
                      <b>built from</b> · {st.trace.read.join(' · ')}<br />
                      <b>voice</b> · {st.trace.voice.join(' · ')}<br />
                      {st.trace.not_read.length ? <><b>not read</b> · {st.trace.not_read.join(' · ')} — they did not shape this<br /></> : null}
                      {st.scope === 'move' && <><b>never reused</b> · one person, one message</>}
                    </div>
                  </div>
                ))}
              </div>
            ))}
            <div className={a.actions}>
              <button type="button" className={a.primary} disabled={w.busy || approvedAssets < assets.length} onClick={() => void w.advance('cadence')}>
                {approvedAssets < assets.length ? `Approve ${assets.length - approvedAssets} more ${assets.length - approvedAssets === 1 ? 'story' : 'stories'} to go on` : 'Check the window →'}
              </button>
              <span className={a.hint}>Editing in your voice opens the rich-text editor at integration; provenance is kept either way.</span>
            </div>
          </div>
        );
      }}
    </DataBoundary>
  );
}
