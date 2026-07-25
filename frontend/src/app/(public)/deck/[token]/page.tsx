'use client';

/**
 * Public deck viewer — /deck/:token
 *
 * Renders an approved pitch deck fetched by its unguessable share token.
 * No JWT, no tenant context — the backend scopes the lookup by
 * share_token + status='approved' and returns only { title, slides }.
 *
 * Stage machine: loading → ready | error (invalid/revoked token → 404).
 */

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { apiFetch, type ApiError } from '@/lib/api-client';
import { API } from '@/lib/serviceURLs';
import { VdfLoader, VdfErrorScreen, VdfButton } from '@/components/vdf';
import { BRAND } from '@/constants/brand';
import s from './deck-viewer.module.css';

interface Bullet {
  icon: string;
  head: string;
  body: string;
}

interface Slide {
  id: number;
  type: 'title' | 'problem' | 'solution' | 'icp' | 'differentiators' | 'traction' | 'cta';
  title: string;
  subtitle: string;
  bullets: Bullet[];
  narration: string;
}

interface SharedDeck {
  title: string | null;
  slides: Slide[];
}

const SLIDE_TYPE_LABELS: Record<Slide['type'], string> = {
  title: 'Introduction',
  problem: 'The Problem',
  solution: 'The Solution',
  icp: 'Who It’s For',
  differentiators: 'Why Us',
  traction: 'Traction',
  cta: 'Next Steps',
};

type Stage =
  | { name: 'loading' }
  | { name: 'error'; status: number; message: string }
  | { name: 'ready'; deck: SharedDeck };

export default function DeckViewerPage() {
  const params = useParams<{ token: string }>();
  const token = params?.token;

  const [stage, setStage] = useState<Stage>({ name: 'loading' });
  const [current, setCurrent] = useState(0);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;

    (async () => {
      try {
        const deck = await apiFetch<SharedDeck>(API.storyteller.share, {
          pathParams: { token },
        });
        if (cancelled) return;
        if (!Array.isArray(deck.slides) || deck.slides.length === 0) {
          setStage({ name: 'error', status: 404, message: 'This presentation has no slides.' });
          return;
        }
        setStage({ name: 'ready', deck });
      } catch (err) {
        if (cancelled) return;
        const apiErr = err as ApiError;
        setStage({
          name: 'error',
          status: apiErr.status || 500,
          message: apiErr.message || 'Failed to load the presentation',
        });
      }
    })();

    return () => { cancelled = true; };
  }, [token]);

  const total = stage.name === 'ready' ? stage.deck.slides.length : 0;

  const goTo = useCallback((index: number) => {
    setCurrent((prev) => {
      const next = Math.max(0, Math.min(total - 1, index));
      return Number.isNaN(next) ? prev : next;
    });
  }, [total]);

  // Keyboard navigation: ← → and space advance/rewind the deck.
  useEffect(() => {
    if (stage.name !== 'ready') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setCurrent((c) => Math.min(total - 1, c + 1));
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrent((c) => Math.max(0, c - 1));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [stage.name, total]);

  if (stage.name === 'loading') {
    return (
      <div className={s.stagePage}>
        <VdfLoader message="Opening presentation" overlay />
      </div>
    );
  }

  if (stage.name === 'error') {
    const notFound = stage.status === 404;
    return (
      <div className={s.stagePage}>
        <VdfErrorScreen
          code={stage.status}
          icon={notFound ? '🔍' : '⚠️'}
          title={notFound ? 'Presentation not found' : 'Something went wrong'}
          description={
            notFound
              ? 'This link is invalid, or the presentation is no longer shared.'
              : stage.message
          }
          action={
            <VdfButton variant="primary" onClick={() => (window.location.href = '/')}>
              Go to {BRAND.name}
            </VdfButton>
          }
        />
      </div>
    );
  }

  const { deck } = stage;
  const slide = deck.slides[current];
  const isFirst = current === 0;
  const isLast = current === total - 1;
  const isHero = slide.type === 'title' || slide.type === 'cta';

  return (
    <div className={s.page}>
      {/* ── Top bar ── */}
      <header className={s.topBar}>
        <span className={s.deckTitle}>{deck.title || 'Presentation'}</span>
        <span className={s.counter}>
          {current + 1} <span className={s.counterSep}>/</span> {total}
        </span>
      </header>

      {/* ── Slide stage ── */}
      <main className={s.stage}>
        <article key={slide.id} className={`${s.slide} ${isHero ? s.slideHero : ''}`}>
          <div className={s.eyebrow}>{SLIDE_TYPE_LABELS[slide.type]}</div>
          <h1 className={s.slideTitle}>{slide.title}</h1>
          {slide.subtitle && <p className={s.slideSubtitle}>{slide.subtitle}</p>}

          {slide.bullets.length > 0 && (
            <div className={`${s.bullets} ${isHero ? s.bulletsHero : ''}`}>
              {slide.bullets.map((b, i) => (
                <div key={i} className={s.bullet} style={{ animationDelay: `${0.15 + i * 0.08}s` }}>
                  <span className={s.bulletIcon} aria-hidden>{b.icon}</span>
                  <div className={s.bulletText}>
                    <span className={s.bulletHead}>{b.head}</span>
                    <span className={s.bulletBody}>{b.body}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>
      </main>

      {/* ── Navigation ── */}
      <footer className={s.navBar}>
        <button
          type="button"
          className={s.navBtn}
          onClick={() => goTo(current - 1)}
          disabled={isFirst}
          aria-label="Previous slide"
        >
          ←
        </button>

        <div className={s.dots} role="tablist" aria-label="Slides">
          {deck.slides.map((sl, i) => (
            <button
              key={sl.id}
              type="button"
              role="tab"
              aria-selected={i === current}
              aria-label={`Slide ${i + 1}: ${sl.title}`}
              className={`${s.dot} ${i === current ? s.dotActive : ''}`}
              onClick={() => goTo(i)}
            />
          ))}
        </div>

        <button
          type="button"
          className={s.navBtn}
          onClick={() => goTo(current + 1)}
          disabled={isLast}
          aria-label="Next slide"
        >
          →
        </button>
      </footer>

      <div className={s.poweredBy}>
        Powered by <a href="/" className={s.poweredByLink}>{BRAND.name}</a>
      </div>
    </div>
  );
}
