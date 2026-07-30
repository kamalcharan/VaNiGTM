// src/components/vikuna/MVPPage.tsx
// Dedicated lander for MVP-as-a-service — marketed separately from the
// SME-transformation homepage (different buyer: founders / product owners).
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import Footer from './Footer';

// ─── Color tokens (dark editorial, matches Hero) ─────────────
const INK = '#0A0F1E';
const INK_SOFT = '#2D3450';
const PAPER = '#F7F6F2';
const WHITE = '#FFFFFF';
const ACCENT = '#E8420A';
const TEAL = '#12A090';
const GOLD = '#C9973A';
const BORDER_DARK = 'rgba(255,255,255,0.1)';
const BORDER_LIGHT = 'rgba(10,15,30,0.1)';

const CALENDLY = 'https://calendly.com/connect-vikuna/30min';

// ─── Hero ────────────────────────────────────────────────────

const Hero = styled.section`
  background: ${INK};
  min-height: 88vh;
  display: flex;
  align-items: center;
  padding: 140px 60px 80px;
  position: relative;
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 120px 24px 60px;
  }
`;

const HeroBg = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 70% 60% at 70% 30%, rgba(232, 66, 10, 0.08) 0%, transparent 60%),
    radial-gradient(ellipse 50% 50% at 20% 80%, rgba(18, 160, 144, 0.08) 0%, transparent 60%);
`;

const HeroInner = styled.div`
  position: relative;
  z-index: 2;
  max-width: 1200px;
  margin: 0 auto;
  width: 100%;
`;

const Eyebrow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(232, 66, 10, 0.35);
  background: rgba(232, 66, 10, 0.08);
  padding: 6px 16px;
  border-radius: 100px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${ACCENT};
  margin-bottom: 28px;
`;

const H1 = styled.h1`
  font-family: 'Fraunces', serif;
  font-size: clamp(36px, 5vw, 68px);
  font-weight: 800;
  letter-spacing: -2px;
  line-height: 1.05;
  color: ${WHITE};
  margin-bottom: 24px;
  max-width: 800px;

  em {
    font-style: italic;
    color: ${GOLD};
  }
`;

const HeroP = styled.p`
  font-size: 18px;
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

const HeroCtas = styled.div`
  display: flex;
  gap: 16px;
  flex-wrap: wrap;
  margin-bottom: 48px;
`;

const BtnPrimary = styled.a`
  background: ${ACCENT};
  color: ${WHITE};
  padding: 16px 36px;
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

const BtnGhost = styled.a`
  border: 1px solid ${BORDER_DARK};
  color: rgba(255, 255, 255, 0.8);
  padding: 16px 36px;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: border-color 0.2s, color 0.2s;

  &:hover {
    border-color: rgba(255, 255, 255, 0.4);
    color: ${WHITE};
  }
`;

const TrustRow = styled.div`
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);

  span {
    display: inline-flex;
    align-items: center;
    gap: 8px;

    &::before {
      content: '✓';
      color: ${TEAL};
      font-weight: 700;
    }
  }
`;

// ─── Shared section scaffolding ──────────────────────────────

const Section = styled.section<{ $bg?: string }>`
  background: ${(p) => p.$bg || WHITE};
  padding: 80px 60px;

  @media (max-width: 768px) {
    padding: 48px 24px;
  }
`;

const Inner = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const SectionLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: ${TEAL};
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;

  &::after {
    content: '';
    display: block;
    width: 32px;
    height: 1px;
    background: ${TEAL};
  }
`;

const H2 = styled.h2`
  font-family: 'Fraunces', serif;
  font-size: clamp(28px, 3vw, 44px);
  font-weight: 800;
  letter-spacing: -1.2px;
  line-height: 1.15;
  color: ${INK};
  margin-bottom: 12px;
`;

const SectionIntro = styled.p`
  font-size: 16px;
  color: ${INK_SOFT};
  max-width: 620px;
  line-height: 1.8;
  margin-bottom: 48px;

  strong {
    color: ${INK};
  }
`;

// ─── Clarity callout ─────────────────────────────────────────

const ClarityCallout = styled(motion.div)`
  background: rgba(201, 151, 58, 0.08);
  border: 1px solid rgba(201, 151, 58, 0.3);
  border-left: 4px solid ${GOLD};
  border-radius: 8px;
  padding: 28px 32px;
  margin-bottom: 48px;
  max-width: 760px;

  h3 {
    font-family: 'Fraunces', serif;
    font-size: 18px;
    font-weight: 700;
    color: ${INK};
    margin-bottom: 8px;
  }

  p {
    font-size: 14px;
    line-height: 1.75;
    color: ${INK_SOFT};

    strong {
      color: ${INK};
    }
  }
`;

// ─── Process steps ───────────────────────────────────────────

const StepsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;

  @media (max-width: 1000px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const StepCard = styled(motion.div)`
  background: ${PAPER};
  border: 1px solid ${BORDER_LIGHT};
  border-radius: 10px;
  padding: 28px;
`;

const StepNum = styled.div`
  font-family: 'Fraunces', serif;
  font-size: 28px;
  font-weight: 800;
  color: ${ACCENT};
  margin-bottom: 12px;
`;

const StepTitle = styled.h3`
  font-family: 'Fraunces', serif;
  font-size: 17px;
  font-weight: 700;
  color: ${INK};
  margin-bottom: 8px;
  letter-spacing: -0.3px;
`;

const StepDuration = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${TEAL};
  margin-bottom: 10px;
`;

const StepDesc = styled.p`
  font-size: 14px;
  color: ${INK_SOFT};
  line-height: 1.7;
`;

// ─── Proof strip ─────────────────────────────────────────────

const ProofStrip = styled(motion.div)`
  background: ${INK};
  border-radius: 8px;
  padding: 32px 40px;
  margin-top: 48px;
  display: flex;
  align-items: center;
  gap: 24px;

  @media (max-width: 768px) {
    flex-direction: column;
    text-align: center;
    padding: 28px 24px;
  }

  p {
    font-size: 15px;
    line-height: 1.75;
    color: rgba(255, 255, 255, 0.7);

    strong {
      color: ${WHITE};
    }
  }
`;

const ProofIcon = styled.div`
  font-size: 26px;
  flex-shrink: 0;
`;

// ─── Final CTA ───────────────────────────────────────────────

const FinalCta = styled.section`
  background: ${INK};
  padding: 90px 60px;
  text-align: center;

  @media (max-width: 768px) {
    padding: 60px 24px;
  }
`;

const FinalH2 = styled.h2`
  font-family: 'Fraunces', serif;
  font-size: clamp(28px, 4vw, 48px);
  font-weight: 800;
  letter-spacing: -1.5px;
  line-height: 1.1;
  color: ${WHITE};
  margin-bottom: 16px;

  em {
    font-style: italic;
    color: ${GOLD};
  }
`;

const FinalP = styled.p`
  font-size: 16px;
  color: rgba(255, 255, 255, 0.55);
  line-height: 1.75;
  max-width: 520px;
  margin: 0 auto 36px;
`;

// ─── Data ────────────────────────────────────────────────────

const steps = [
  {
    num: '01',
    title: 'Product Clarity',
    duration: '1–2 weeks · if needed',
    desc: "Requirements fuzzy? We run a structured product-management phase first — user flows, scope, priorities — so the build clock starts with certainty, not hope. Skip it if your spec is already sharp.",
  },
  {
    num: '02',
    title: 'Scope Lock & Quote',
    duration: 'Fixed before we build',
    desc: 'A written scope, a fixed INR quote, and a launch date. Changes go through a change process — no silent scope creep, in either direction.',
  },
  {
    num: '03',
    title: 'Build in the Open',
    duration: '60–90 days',
    desc: 'Weekly working demos from week two — running software, not status decks. AI-native architecture on the same VaNi approach that powers our own products.',
  },
  {
    num: '04',
    title: 'Launch & Handover',
    duration: '30-day support included',
    desc: 'Production deployment, documentation, and a handover your own team — or any team — can build on. No lock-in to us, our stack, or our hosting.',
  },
];

// ─── Component ───────────────────────────────────────────────

const MVPPage: React.FC = () => {
  return (
    <>
      <Hero>
        <HeroBg />
        <HeroInner>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Eyebrow>MVP as a Service · 60–90 Days</Eyebrow>
            <H1>
              A working product in 60–90 days.
              <br />
              Not a deck. Not a <em>prototype.</em>
            </H1>
            <HeroP>
              For founders and businesses who need to put a real product in front of real
              users. <strong>Fixed scope, fixed price, weekly working demos</strong> — built
              by the team that ships its own AI products.
            </HeroP>
            <HeroCtas>
              <BtnPrimary href={CALENDLY} target="_blank" rel="noopener noreferrer">
                Book a Scoping Call
              </BtnPrimary>
              <BtnGhost href="#mvp-process">How it works →</BtnGhost>
            </HeroCtas>
            <TrustRow>
              <span>Fixed INR quote before we build</span>
              <span>Weekly working demos</span>
              <span>No lock-in — your code, your stack</span>
            </TrustRow>
          </motion.div>
        </HeroInner>
      </Hero>

      <Section id="mvp-process">
        <Inner>
          <SectionLabel>How It Works</SectionLabel>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <H2>
              60–90 days works when
              <br />
              the scope is honest.
            </H2>
          </motion.div>
          <SectionIntro>
            Most MVP timelines die for one reason: <strong>nobody agreed what "done" means
            before the build started.</strong> Our process exists to kill that risk first —
            then build fast.
          </SectionIntro>

          <ClarityCallout
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h3>Not sure what to build yet? That's normal — and covered.</h3>
            <p>
              If your requirements aren't clear, we don't guess and bill you for the
              rework. We offer <strong>product management as a service</strong> — a short,
              structured clarity phase that turns your idea into a scoped, buildable spec.
              The 60–90 day promise starts only when both sides know exactly what's being
              built.
            </p>
          </ClarityCallout>

          <StepsGrid>
            {steps.map((step, i) => (
              <StepCard
                key={step.num}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1, duration: 0.4 }}
              >
                <StepNum>{step.num}</StepNum>
                <StepDuration>{step.duration}</StepDuration>
                <StepTitle>{step.title}</StepTitle>
                <StepDesc>{step.desc}</StepDesc>
              </StepCard>
            ))}
          </StepsGrid>

          <ProofStrip
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <ProofIcon>🛠</ProofIcon>
            <p>
              <strong>We eat our own cooking.</strong> ContractNest and FamilyKnows — our own
              AI products — are built on the same VaNi approach and the same delivery
              discipline we'll use on yours. Ask us to show you, live, on the scoping call.
            </p>
          </ProofStrip>
        </Inner>
      </Section>

      <FinalCta>
        <FinalH2>
          Ninety days from now, you could
          <br />
          have <em>users.</em>
        </FinalH2>
        <FinalP>
          One scoping call. We'll tell you honestly whether 60–90 days is realistic for
          your idea — and if it isn't, what is.
        </FinalP>
        <BtnPrimary href={CALENDLY} target="_blank" rel="noopener noreferrer">
          Book a Scoping Call
        </BtnPrimary>
      </FinalCta>

      <Footer />
    </>
  );
};

export default MVPPage;
