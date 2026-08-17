// src/components/vikuna/HeroCarousel.tsx
// Rotating hero: slide 1 is the untouched conversion hero (HeroSectionNew);
// slides 2–4 tease the gated playbooks (ContractNest / VaNi / Why AI Fails).
import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import HeroSectionNew from './HeroSectionNew';

const INK = '#0A0F1E';
const GOLD = '#C9973A';
const ACCENT = '#E8420A';
const TEAL = '#12A090';

const AUTO_ADVANCE_MS = 9000;

// ─── Carousel scaffolding ────────────────────────────────────

const CarouselShell = styled.div`
  position: relative;
  display: grid;

  & > .hero-slide {
    grid-area: 1 / 1;
    transition: opacity 0.6s ease;
  }
`;

const SlideLayer = styled.div<{ $active: boolean }>`
  opacity: ${(p) => (p.$active ? 1 : 0)};
  pointer-events: ${(p) => (p.$active ? 'auto' : 'none')};
  z-index: ${(p) => (p.$active ? 2 : 1)};
`;

const Controls = styled.div`
  position: absolute;
  bottom: 28px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 10;
  display: flex;
  align-items: center;
  gap: 18px;
`;

const ArrowBtn = styled.button`
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: rgba(255, 255, 255, 0.7);
  width: 34px;
  height: 34px;
  border-radius: 50%;
  cursor: pointer;
  font-size: 14px;
  line-height: 1;
  transition: background 0.2s, color 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.15);
    color: #fff;
  }
`;

const Dots = styled.div`
  display: flex;
  gap: 10px;
`;

const Dot = styled.button<{ $active: boolean }>`
  width: ${(p) => (p.$active ? '24px' : '8px')};
  height: 8px;
  border-radius: 100px;
  border: none;
  cursor: pointer;
  background: ${(p) => (p.$active ? GOLD : 'rgba(255,255,255,0.25)')};
  transition: all 0.3s ease;
`;

// ─── Teaser slide layout ─────────────────────────────────────

const Teaser = styled.section`
  min-height: 100vh;
  display: flex;
  align-items: center;
  padding: 120px 60px 100px;
  position: relative;
  overflow: hidden;
  background: ${INK};

  @media (max-width: 968px) {
    padding: 100px 24px 80px;
    min-height: auto;
  }
`;

const TeaserBg = styled.div<{ $tint: string }>`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 55% at 70% 35%, ${(p) => p.$tint} 0%, transparent 60%),
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: auto, 60px 60px, 60px 60px;
  pointer-events: none;
`;

const TeaserInner = styled.div`
  position: relative;
  z-index: 2;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
`;

const TeaserEyebrow = styled.div<{ $color: string }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid ${(p) => p.$color}55;
  background: ${(p) => p.$color}14;
  padding: 6px 16px;
  border-radius: 100px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${(p) => p.$color};
  margin-bottom: 28px;
`;

const TeaserH = styled.h2`
  font-family: 'Fraunces', serif;
  font-size: clamp(32px, 4.6vw, 60px);
  font-weight: 800;
  letter-spacing: -2px;
  line-height: 1.08;
  color: #fff;
  max-width: 780px;
  margin-bottom: 22px;

  em {
    font-style: italic;
    color: ${GOLD};
  }
`;

const TeaserP = styled.p`
  font-size: 17px;
  font-weight: 300;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.6);
  max-width: 560px;
  margin-bottom: 36px;

  strong {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
  }
`;

const TeaserCtas = styled.div`
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
`;

const TeaserPrimary = styled.a`
  background: ${ACCENT};
  color: #fff;
  padding: 15px 32px;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(232, 66, 10, 0.35);
  }
`;

const TeaserGhost = styled.a`
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: rgba(255, 255, 255, 0.8);
  padding: 15px 32px;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: border-color 0.2s, color 0.2s;

  &:hover {
    border-color: rgba(255, 255, 255, 0.45);
    color: #fff;
  }
`;

// ─── Teaser slide data ───────────────────────────────────────

interface TeaserDef {
  eyebrow: string;
  eyebrowColor: string;
  tint: string;
  heading: React.ReactNode;
  body: React.ReactNode;
  primary: { label: string; href: string };
  secondary?: { label: string; href: string; newTab?: boolean };
}

const teasers: TeaserDef[] = [
  {
    eyebrow: 'From Our Own Products · ContractNest',
    eyebrowColor: TEAL,
    tint: 'rgba(18,160,144,0.12)',
    heading: (
      <>
        Compliance isn't a feature.
        <br />
        It's the <em>foundation.</em>
      </>
    ),
    body: (
      <>
        ContractNest is our own AI product — contract &amp; AMC management with SLA
        tracking and <strong>regulatory compliance built in</strong>, derived from
        decades inside regulated industries. We don't just advise on AI. We ship it.
      </>
    ),
    primary: { label: 'Get the Compliance Playbook', href: '#playbooks' },
    secondary: {
      label: 'Book a Demo',
      href: 'https://calendly.com/connect-vikuna/30min',
      newTab: true,
    },
  },
  {
    eyebrow: 'Our AI Approach · VaNi',
    eyebrowColor: GOLD,
    tint: 'rgba(201,151,58,0.12)',
    heading: (
      <>
        One proven approach runs
        <br />
        everything we <em>build.</em>
      </>
    ),
    body: (
      <>
        VaNi — Vikuna AI — is how we build AI that survives production: event-driven,
        ROI-first, human-in-the-loop. <strong>70–80% automated, the rest routed to
        your people.</strong> Proven in our own products before it touches your
        business.
      </>
    ),
    primary: { label: 'Get the VaNi Playbook', href: '#playbooks' },
    secondary: { label: 'How VaNi Works', href: '/vani' },
  },
  {
    eyebrow: 'The Uncomfortable Truth',
    eyebrowColor: ACCENT,
    tint: 'rgba(232,66,10,0.10)',
    heading: (
      <>
        Most AI initiatives die after
        <br />
        the demo. Yours <em>doesn't have to.</em>
      </>
    ),
    body: (
      <>
        Technology is 20% of transformation. The other 80% — culture, process,
        capability — is where AI quietly fails. <strong>We wrote down everything
        we've watched go wrong in 24 years,</strong> and what actually fixes it.
      </>
    ),
    primary: { label: "Get the 'Why AI Fails' Playbook", href: '#playbooks' },
    secondary: { label: 'Take the Readiness Assessment', href: '/assessment' },
  },
];

// ─── Component ───────────────────────────────────────────────

const SLIDE_COUNT = teasers.length + 1;

const HeroCarousel: React.FC = () => {
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const interacted = useRef(false);

  useEffect(() => {
    if (paused || interacted.current) return;
    const timer = setInterval(() => {
      setActive((prev) => (prev + 1) % SLIDE_COUNT);
    }, AUTO_ADVANCE_MS);
    return () => clearInterval(timer);
  }, [paused]);

  function goTo(idx: number) {
    interacted.current = true;
    setActive((idx + SLIDE_COUNT) % SLIDE_COUNT);
  }

  return (
    <CarouselShell
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <SlideLayer className="hero-slide" $active={active === 0} aria-hidden={active !== 0}>
        <HeroSectionNew />
      </SlideLayer>

      {teasers.map((t, i) => (
        <SlideLayer
          key={i}
          className="hero-slide"
          $active={active === i + 1}
          aria-hidden={active !== i + 1}
        >
          <Teaser>
            <TeaserBg $tint={t.tint} />
            <TeaserInner>
              <TeaserEyebrow $color={t.eyebrowColor}>{t.eyebrow}</TeaserEyebrow>
              <TeaserH>{t.heading}</TeaserH>
              <TeaserP>{t.body}</TeaserP>
              <TeaserCtas>
                <TeaserPrimary href={t.primary.href}>{t.primary.label}</TeaserPrimary>
                {t.secondary && (
                  <TeaserGhost
                    href={t.secondary.href}
                    {...(t.secondary.newTab
                      ? { target: '_blank', rel: 'noopener noreferrer' }
                      : {})}
                  >
                    {t.secondary.label}
                  </TeaserGhost>
                )}
              </TeaserCtas>
            </TeaserInner>
          </Teaser>
        </SlideLayer>
      ))}

      <Controls>
        <ArrowBtn onClick={() => goTo(active - 1)} aria-label="Previous slide">←</ArrowBtn>
        <Dots>
          {Array.from({ length: SLIDE_COUNT }, (_, i) => (
            <Dot
              key={i}
              $active={active === i}
              onClick={() => goTo(i)}
              aria-label={`Go to slide ${i + 1}`}
            />
          ))}
        </Dots>
        <ArrowBtn onClick={() => goTo(active + 1)} aria-label="Next slide">→</ArrowBtn>
      </Controls>
    </CarouselShell>
  );
};

export default HeroCarousel;
