// src/components/vikuna/HowWeWorkSection.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';

const safeFont = (theme: any, key: 'fontFamily' | 'headingFontFamily'): string => {
  const val = theme?.typography?.[key];
  if (key === 'headingFontFamily') {
    return val || theme?.typography?.fontFamily || "'DM Sans', sans-serif";
  }
  return val || "'DM Sans', sans-serif";
};

// ─── Color tokens ────────────────────────────────────────────
const INK = '#0A0F1E';
const WHITE = '#FFFFFF';
const TEAL = '#12A090';

// ─── Styled Components ──────────────────────────────────────

const Section = styled.section`
  background: ${INK};
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

const Heading = styled.h2`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(32px, 3.5vw, 52px);
  font-weight: 800;
  letter-spacing: -1.5px;
  line-height: 1.1;
  color: ${WHITE};
  margin-bottom: 20px;
`;

const Subtitle = styled.p`
  font-size: 16px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 64px;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
  font-style: italic;
`;

// ─── Journey Steps ───────────────────────────────────────────

const JourneyContainer = styled.div`
  position: relative;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 64px;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 40px;
  }
`;

const HorizontalLine = styled.div`
  position: absolute;
  top: 24px;
  left: 24px;
  right: 24px;
  height: 1px;
  background: rgba(255, 255, 255, 0.15);

  @media (max-width: 768px) {
    display: none;
  }
`;

const Step = styled(motion.div)`
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  flex: 1;
  position: relative;
  z-index: 1;
`;

const StepCircle = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  border: 1.5px solid rgba(255, 255, 255, 0.25);
  background: ${INK};
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 16px;
  font-weight: 700;
  color: ${WHITE};
  margin-bottom: 14px;
`;

const StepTitle = styled.div`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 16px;
  font-weight: 700;
  color: ${WHITE};
  margin-bottom: 10px;
`;

const StepDesc = styled.p`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
  line-height: 1.6;
  max-width: 200px;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

const StepEmphasis = styled.em`
  color: ${TEAL};
  font-style: italic;
`;

// ─── Footer Quote ────────────────────────────────────────────

const FooterRow = styled.div`
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  padding-top: 32px;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;

  @media (max-width: 768px) {
    flex-direction: column;
    gap: 24px;
    align-items: flex-start;
  }
`;

const FooterQuote = styled.div`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 18px;
  font-weight: 700;
  color: ${WHITE};
  line-height: 1.5;
  font-style: italic;
`;

const FooterQuoteLight = styled.span`
  font-weight: 400;
  color: rgba(255, 255, 255, 0.5);
`;

const FooterIndustries = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.25);
  text-align: right;
  line-height: 1.8;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};

  @media (max-width: 768px) {
    text-align: left;
  }
`;

// ─── Data ────────────────────────────────────────────────────

const steps = [
  {
    num: '01',
    title: 'Discover',
    desc: 'Understand your business reality — people, processes, systems, culture.',
    emphasis: 'Not just your systems and tools.',
  },
  {
    num: '02',
    title: 'Design',
    desc: 'Co-create the roadmap with your team.',
    emphasis: 'No surprises. No assumptions.',
    suffix: ' Aligned to your business goals.',
  },
  {
    num: '03',
    title: 'Deliver',
    desc: 'Your team, your vendors, or ours —',
    emphasis: 'we orchestrate to get it done.',
    suffix: ' We govern. We unblock. We stay accountable.',
  },
  {
    num: '04',
    title: 'Operate',
    desc: 'We stay through go-live.',
    emphasis: 'Own the outcome together',
    suffix: ' — however it was built, whoever built it.',
  },
  {
    num: '05',
    title: 'Scale',
    desc: 'Build capability inside your org.',
    emphasis: 'You grow stronger.',
    suffix: ' We become optional. That\'s always the goal.',
  },
];

// ─── Component ───────────────────────────────────────────────

const HowWeWorkSection: React.FC = () => {
  const { theme } = useTheme();

  return (
    <Section id="how">
      <Inner>
        <SectionLabel>How We Work</SectionLabel>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Heading theme={theme}>
            We don't do projects.
            <br />
            We do journeys.
          </Heading>
        </motion.div>

        <Subtitle theme={theme}>
          Every engagement looks different. The accountability doesn't.
        </Subtitle>

        <JourneyContainer>
          <HorizontalLine />
          {steps.map((step, i) => (
            <Step
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
            >
              <StepCircle theme={theme}>{step.num}</StepCircle>
              <StepTitle theme={theme}>{step.title}</StepTitle>
              <StepDesc theme={theme}>
                {step.desc} <StepEmphasis>{step.emphasis}</StepEmphasis>
                {step.suffix || ''}
              </StepDesc>
            </Step>
          ))}
        </JourneyContainer>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          <FooterRow>
            <FooterQuote theme={theme}>
              "We're not attached to who builds it.
              <br />
              <FooterQuoteLight>We're attached to whether it works."</FooterQuoteLight>
            </FooterQuote>
            <FooterIndustries theme={theme}>
              Healthcare · Pharma · Manufacturing
              <br />
              Operations · Retail · Logistics
            </FooterIndustries>
          </FooterRow>
        </motion.div>
      </Inner>
    </Section>
  );
};

export default HowWeWorkSection;
