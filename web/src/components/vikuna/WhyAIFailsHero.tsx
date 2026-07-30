// src/components/vikuna/WhyAIFailsHero.tsx
// Primary hero: problem-led hook. The C-suite offer (HeroSectionNew) follows
// directly below as the payoff block.
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';

const INK = '#0A0F1E';
const GOLD = '#C9973A';
const ACCENT = '#E8420A';

const Hero = styled.section`
  min-height: 92vh;
  display: flex;
  align-items: center;
  padding: 130px 60px 90px;
  position: relative;
  overflow: hidden;
  background: ${INK};

  @media (max-width: 968px) {
    padding: 110px 24px 70px;
    min-height: auto;
  }
`;

const Bg = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 55% at 70% 35%, rgba(232, 66, 10, 0.1) 0%, transparent 60%),
    linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
  background-size: auto, 60px 60px, 60px 60px;
  pointer-events: none;
`;

const Inner = styled.div`
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
  border: 1px solid rgba(232, 66, 10, 0.4);
  background: rgba(232, 66, 10, 0.09);
  padding: 6px 16px;
  border-radius: 100px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${ACCENT};
  margin-bottom: 30px;
`;

const H1 = styled.h1`
  font-family: 'Fraunces', serif;
  font-size: clamp(36px, 5.2vw, 68px);
  font-weight: 800;
  letter-spacing: -2px;
  line-height: 1.08;
  color: #fff;
  max-width: 820px;
  margin-bottom: 24px;

  em {
    font-style: italic;
    color: ${GOLD};
  }
`;

const P = styled.p`
  font-size: 17px;
  font-weight: 300;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.6);
  max-width: 560px;
  margin-bottom: 38px;

  strong {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
  }
`;

const Ctas = styled.div`
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  align-items: center;
  margin-bottom: 30px;
`;

const BtnPrimary = styled.a`
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

const BtnGhost = styled.a`
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: rgba(255, 255, 255, 0.85);
  padding: 16px 34px;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 600;
  text-decoration: none;
  transition: border-color 0.2s, color 0.2s;

  &:hover {
    border-color: rgba(255, 255, 255, 0.5);
    color: #fff;
  }
`;

const ScrollHint = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.35);
  text-decoration: none;
  transition: color 0.2s;

  &:hover {
    color: rgba(255, 255, 255, 0.7);
  }
`;

const WhyAIFailsHero: React.FC = () => {
  return (
    <Hero>
      <Bg />
      <Inner>
        <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
          <Eyebrow>The Uncomfortable Truth</Eyebrow>
          <H1>
            Most AI initiatives die after
            <br />
            the demo. Yours <em>doesn't have to.</em>
          </H1>
          <P>
            Technology is 20% of transformation. The other 80% — culture, process,
            capability — is where AI quietly fails. <strong>We wrote down everything
            we've watched go wrong in 24 years,</strong> and what actually fixes it.
          </P>
          <Ctas>
            <BtnPrimary href="#playbooks">Get the 'Why AI Fails' Playbook</BtnPrimary>
            <BtnGhost href="/assessment">Take the Readiness Assessment</BtnGhost>
          </Ctas>
          <ScrollHint href="#leadership-offer">Our approach to making it survive ↓</ScrollHint>
        </motion.div>
      </Inner>
    </Hero>
  );
};

export default WhyAIFailsHero;
