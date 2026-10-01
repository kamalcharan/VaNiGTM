// src/components/vikuna/TrainingPage.tsx
// Dedicated /training page: hero + existing programme grid + CTA.
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import TrainingSkillBuilding from './TrainingSkillBuilding';
import Footer from './Footer';

const INK = '#0A0F1E';
const GOLD = '#C9973A';
const ACCENT = '#E8420A';
const TEAL = '#12A090';

const CALENDLY = 'https://calendly.com/connect-vikuna/30min';

const Hero = styled.section`
  background: ${INK};
  padding: 150px 60px 90px;
  position: relative;
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 120px 24px 60px;
  }
`;

const HeroBg = styled.div`
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 60% 55% at 65% 35%, rgba(201, 151, 58, 0.1) 0%, transparent 60%);
  pointer-events: none;
`;

const HeroInner = styled.div`
  position: relative;
  z-index: 2;
  max-width: 1200px;
  margin: 0 auto;
`;

const Eyebrow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(201, 151, 58, 0.4);
  background: rgba(201, 151, 58, 0.08);
  padding: 6px 16px;
  border-radius: 100px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${GOLD};
  margin-bottom: 28px;
`;

const H1 = styled.h1`
  font-family: 'Fraunces', serif;
  font-size: clamp(34px, 4.8vw, 62px);
  font-weight: 800;
  letter-spacing: -2px;
  line-height: 1.08;
  color: #fff;
  max-width: 760px;
  margin-bottom: 22px;

  em {
    font-style: italic;
    color: ${GOLD};
  }
`;

const HeroP = styled.p`
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

const BtnPrimary = styled.a`
  display: inline-block;
  background: ${ACCENT};
  color: #fff;
  padding: 16px 34px;
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

const TrustRow = styled.div`
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
  margin-top: 40px;
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

const FinalCta = styled.section`
  background: ${INK};
  padding: 80px 60px;
  text-align: center;

  h2 {
    font-family: 'Fraunces', serif;
    font-size: clamp(26px, 3.6vw, 44px);
    font-weight: 800;
    letter-spacing: -1.2px;
    line-height: 1.15;
    color: #fff;
    margin-bottom: 14px;

    em {
      font-style: italic;
      color: ${GOLD};
    }
  }

  p {
    font-size: 15px;
    color: rgba(255, 255, 255, 0.55);
    line-height: 1.7;
    max-width: 520px;
    margin: 0 auto 32px;
  }

  @media (max-width: 768px) {
    padding: 56px 24px;
  }
`;

const TrainingPage: React.FC = () => {
  return (
    <>
      <Hero>
        <HeroBg />
        <HeroInner>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Eyebrow>Training &amp; Skill Building</Eyebrow>
            <H1>
              Your people <em>are</em>
              <br />
              the transformation.
            </H1>
            <HeroP>
              Strategy without capability is just a plan that waits. Our programmes are
              built around <strong>your workflows, your tools, and your team's actual
              daily work</strong> — training as the path to making ourselves optional.
            </HeroP>
            <BtnPrimary href={CALENDLY} target="_blank" rel="noopener noreferrer">
              Book a Training Assessment
            </BtnPrimary>
            <TrustRow>
              <span>In-person, virtual, or hybrid</span>
              <span>Role-specific, not generic theory</span>
              <span>Designed around your daily work</span>
            </TrustRow>
          </motion.div>
        </HeroInner>
      </Hero>

      <TrainingSkillBuilding />

      <FinalCta>
        <h2>
          Capability is the part of transformation
          <br />
          that <em>stays.</em>
        </h2>
        <p>
          A 30-minute conversation to map which capability gaps are actually blocking
          your growth — and which programme closes them.
        </p>
        <BtnPrimary href={CALENDLY} target="_blank" rel="noopener noreferrer">
          Book a Training Assessment
        </BtnPrimary>
      </FinalCta>

      <Footer />
    </>
  );
};

export default TrainingPage;
