// src/components/vikuna/WhyWeExistSection.tsx
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
const INK_SOFT = '#2D3450';
const WHITE = '#FFFFFF';
const PAPER = '#F7F6F2';
const ACCENT = '#E8420A';
const BORDER = 'rgba(10,15,30,0.1)';

// ─── Styled Components ──────────────────────────────────────

const Section = styled.section`
  background: ${WHITE};
  position: relative;
  overflow: hidden;
  padding: 80px 60px;

  @media (max-width: 768px) {
    padding: 48px 24px;
  }
`;

const QuoteMark = styled.div`
  position: absolute;
  top: -20px;
  left: 40px;
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 280px;
  font-weight: 800;
  color: rgba(10, 15, 30, 0.03);
  line-height: 1;
  pointer-events: none;
  z-index: 0;
`;

const Inner = styled.div`
  position: relative;
  z-index: 1;
  max-width: 1200px;
  margin: 0 auto;
`;

const SectionLabel = styled.div`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: ${ACCENT};
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;

  &::after {
    content: '';
    display: block;
    width: 32px;
    height: 1px;
    background: ${ACCENT};
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1.4fr;
  gap: 80px;
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: 40px;
  }
`;

const LeftColumn = styled.div`
  position: sticky;
  top: 120px;

  @media (max-width: 900px) {
    position: static;
  }
`;

const Byline = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 28px;
`;

const Avatar = styled.div`
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: ${INK};
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 18px;
  font-weight: 800;
  color: ${WHITE};
  flex-shrink: 0;
`;

const FounderName = styled.div`
  font-size: 14px;
  font-weight: 600;
  color: ${INK};
`;

const FounderTitle = styled.div`
  font-size: 12px;
  color: ${INK_SOFT};
  margin-top: 2px;
`;

const Heading = styled.h2`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(26px, 2.8vw, 38px);
  font-weight: 800;
  letter-spacing: -1.2px;
  line-height: 1.15;
  margin-bottom: 20px;
  color: ${INK};

  em {
    font-style: normal;
    color: ${ACCENT};
  }
`;

const LeftNote = styled.p`
  font-size: 15px;
  color: ${INK_SOFT};
  line-height: 1.8;
  padding-left: 16px;
  border-left: 2px solid ${BORDER};
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

const RightColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const Para = styled.div`
  font-size: 16px;
  line-height: 1.85;
  color: ${INK_SOFT};
  padding: 24px 0;
  border-bottom: 1px solid ${BORDER};
  font-weight: 300;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};

  &:first-child {
    padding-top: 0;
  }

  strong {
    color: ${INK};
    font-weight: 600;
  }
`;

const SignsBlock = styled.div`
  padding: 32px 0;
  border-bottom: 1px solid ${BORDER};
`;

const SignsLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${ACCENT};
  margin-bottom: 20px;
`;

const SignsGrid = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Sign = styled(motion.div)`
  display: flex;
  gap: 16px;
  align-items: flex-start;
  padding: 16px 20px;
  background: ${PAPER};
  border-radius: 8px;
  border: 1px solid ${BORDER};
  transition: border-color 0.2s, transform 0.2s;
  cursor: default;

  &:hover {
    border-color: rgba(232, 66, 10, 0.3);
    transform: translateX(4px);
  }
`;

const SignNum = styled.div`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 20px;
  font-weight: 800;
  color: ${ACCENT};
  opacity: 0.4;
  flex-shrink: 0;
  line-height: 1.2;
`;

const SignText = styled.div`
  font-size: 14px;
  line-height: 1.6;
  color: ${INK_SOFT};
  font-family: ${props => safeFont(props.theme, 'fontFamily')};

  strong {
    color: ${INK};
    font-weight: 600;
  }
`;

const RealizationBlock = styled.div`
  padding: 32px 0;
  border-bottom: 1px solid ${BORDER};
`;

const RealizationBig = styled.div`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(18px, 2vw, 24px);
  font-weight: 800;
  letter-spacing: -0.5px;
  line-height: 1.3;
  margin-bottom: 16px;
  color: ${INK};

  span {
    color: ${ACCENT};
  }
`;

const RealizationText = styled.p`
  font-size: 15px;
  line-height: 1.8;
  color: ${INK_SOFT};
  font-family: ${props => safeFont(props.theme, 'fontFamily')};

  strong {
    color: ${INK};
    font-weight: 600;
  }
`;

const CTABlock = styled.div`
  padding: 32px 0 0;
`;

const CTAQuestion = styled.div`
  font-size: 17px;
  font-weight: 600;
  color: ${INK};
  margin-bottom: 20px;
  line-height: 1.5;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};

  em {
    font-style: normal;
    color: ${ACCENT};
  }
`;

const CTAButton = styled(motion.a)`
  background: ${INK};
  color: ${WHITE};
  padding: 14px 28px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-decoration: none;
  display: inline-block;
  cursor: pointer;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};

  &:hover {
    background: ${INK_SOFT};
  }
`;

// ─── Data ────────────────────────────────────────────────────

const signs = [
  {
    num: '01',
    text: <><strong>Employees have ChatGPT Plus</strong> but use it for spell check.</>,
  },
  {
    num: '02',
    text: <>The <strong>"AI initiative" lives in one department</strong> and nowhere else.</>,
  },
  {
    num: '03',
    text: <>Leadership talks transformation but <strong>can't name one workflow that changed.</strong></>,
  },
];

// ─── Component ───────────────────────────────────────────────

const WhyWeExistSection: React.FC = () => {
  const { theme } = useTheme();

  return (
    <Section>
      <QuoteMark theme={theme}>"</QuoteMark>
      <Inner>
        <SectionLabel theme={theme}>Why We Exist</SectionLabel>
        <Grid>
          {/* Left – sticky founder intro */}
          <LeftColumn>
            <Byline>
              <Avatar theme={theme}>CK</Avatar>
              <div>
                <FounderName>Charan Kamal</FounderName>
                <FounderTitle>Founder & CEO, Vikuna Technologies</FounderTitle>
              </div>
            </Byline>
            <Heading theme={theme}>
              I built AI systems that clients never fully used.
              <br />
              <em>That failure changed everything.</em>
            </Heading>
            <LeftNote theme={theme}>
              The most important lesson in 24 years wasn't from a success. It was from
              sitting quietly and watching a client's team work — and realising the gap
              between what we built and how people actually operated.
            </LeftNote>
          </LeftColumn>

          {/* Right – narrative + signs + realization + CTA */}
          <RightColumn>
            <Para theme={theme}>
              The tech was solid. The results were measurable. But adoption? Minimal.{' '}
              <strong>It bothered me for months.</strong>
            </Para>
            <Para theme={theme}>
              Until I sat with one client and just watched how his team actually worked
              day to day. I didn't consult. I didn't present. I just watched.
            </Para>

            <SignsBlock>
              <SignsLabel>3 signs a company's AI adoption is silently failing</SignsLabel>
              <SignsGrid>
                {signs.map((s, i) => (
                  <Sign
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: i * 0.1, duration: 0.4 }}
                  >
                    <SignNum theme={theme}>{s.num}</SignNum>
                    <SignText theme={theme}>{s.text}</SignText>
                  </Sign>
                ))}
              </SignsGrid>
            </SignsBlock>

            <RealizationBlock>
              <RealizationBig theme={theme}>
                None of it was a tools problem.
                <br />
                <span>It was a training problem.</span>
              </RealizationBig>
              <RealizationText theme={theme}>
                They were being taught <strong>what AI is</strong> — not{' '}
                <strong>how to use it in their actual job tomorrow morning.</strong> That
                one realisation completely changed how we build and deliver everything at
                Vikuna. We don't start with technology. We start with how your people
                actually work. Then we build AI into that — not on top of it.
              </RealizationText>
            </RealizationBlock>

            <CTABlock>
              <CTAQuestion theme={theme}>
                Is your company solving the <em>tools problem</em> or the{' '}
                <em>training problem</em> right now?
              </CTAQuestion>
              <CTAButton
                href="#contact"
                theme={theme}
                whileHover={{ y: -2 }}
                transition={{ duration: 0.15 }}
              >
                Let's find out — Free Assessment →
              </CTAButton>
            </CTABlock>
          </RightColumn>
        </Grid>
      </Inner>
    </Section>
  );
};

export default WhyWeExistSection;
