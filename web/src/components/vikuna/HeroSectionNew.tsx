// src/components/vikuna/HeroSectionNew.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';

// Helper function to safely access theme properties
const safeColor = (theme: any, path: string, fallback: string = '#000000'): string => {
  const parts = path.split('.');
  let current = theme;
  for (const part of parts) {
    if (current === undefined || current === null) return fallback;
    current = current[part];
  }
  return current || fallback;
};

const safeFont = (theme: any, key: 'fontFamily' | 'headingFontFamily'): string => {
  const val = theme?.typography?.[key];
  if (key === 'headingFontFamily') {
    return val || theme?.typography?.fontFamily || "'DM Sans', sans-serif";
  }
  return val || "'DM Sans', sans-serif";
};

// ─── Styled Components ─────────────────────────────────────────

const HeroContainer = styled.section<{ theme: any }>`
  min-height: 100vh;
  display: flex;
  align-items: center;
  padding: 120px 60px 80px;
  position: relative;
  overflow: hidden;
  background: ${props => safeColor(props.theme, 'colors.primary.main', '#0A0F1E')};

  @media (max-width: 968px) {
    padding: 100px 24px 60px;
    min-height: auto;
  }
`;

const BgGrid = styled.div<{ theme: any }>`
  position: absolute;
  inset: 0;
  background-image:
    linear-gradient(${props => safeColor(props.theme, 'colors.secondary.main', '#E8420A')}0A 1px, transparent 1px),
    linear-gradient(90deg, ${props => safeColor(props.theme, 'colors.secondary.main', '#E8420A')}0A 1px, transparent 1px);
  background-size: 60px 60px;
  pointer-events: none;
`;

const BgGlow = styled.div<{ theme: any }>`
  position: absolute;
  top: -200px;
  right: -200px;
  width: 700px;
  height: 700px;
  border-radius: 50%;
  background: radial-gradient(circle, ${props => safeColor(props.theme, 'colors.info.main', '#0B7B6B')}26 0%, transparent 70%);
  pointer-events: none;
`;

const BgGlow2 = styled.div<{ theme: any }>`
  position: absolute;
  bottom: -100px;
  left: 200px;
  width: 400px;
  height: 400px;
  border-radius: 50%;
  background: radial-gradient(circle, ${props => safeColor(props.theme, 'colors.secondary.main', '#E8420A')}14 0%, transparent 70%);
  pointer-events: none;
`;

const HeroInner = styled.div`
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  max-width: 1400px;
  margin: 0 auto;
  gap: 60px;

  @media (max-width: 968px) {
    flex-direction: column;
    gap: 48px;
  }
`;

const HeroContent = styled.div`
  max-width: 760px;
  flex: 1;
`;

const Eyebrow = styled(motion.div)<{ theme: any }>`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  padding: 6px 14px;
  border-radius: 100px;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.5px;
  margin-bottom: 32px;
`;

const EyebrowDot = styled.span<{ theme: any }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${props => safeColor(props.theme, 'colors.info.light', '#0D9B87')};
  animation: pulse 2s infinite;
  flex-shrink: 0;

  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(1.3); }
  }
`;

const Headline = styled(motion.h1)<{ theme: any }>`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(42px, 5.5vw, 72px);
  font-weight: 800;
  line-height: 1.05;
  letter-spacing: -2px;
  color: ${props => safeColor(props.theme, 'colors.common.white', '#FFFFFF')};
  margin-bottom: 28px;

  em {
    font-style: normal;
    color: ${props => safeColor(props.theme, 'colors.secondary.light', '#FF5A22')};
  }

  @media (max-width: 768px) {
    font-size: clamp(32px, 8vw, 42px);
    letter-spacing: -1px;
  }
`;

const SubText = styled(motion.p)<{ theme: any }>`
  font-size: 18px;
  font-weight: 300;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.65);
  max-width: 560px;
  margin-bottom: 16px;

  strong {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
  }

  @media (max-width: 768px) {
    font-size: 16px;
  }
`;

const SubText2 = styled(motion.p)`
  font-size: 14px;
  font-weight: 400;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.45);
  max-width: 520px;
  margin-bottom: 44px;

  @media (max-width: 768px) {
    margin-bottom: 32px;
  }
`;

const CTAContainer = styled(motion.div)`
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 56px;

  @media (max-width: 768px) {
    margin-bottom: 40px;
  }
`;

const PrimaryButton = styled.a<{ theme: any }>`
  background: ${props => safeColor(props.theme, 'colors.secondary.main', '#E8420A')};
  color: ${props => safeColor(props.theme, 'colors.common.white', '#FFFFFF')};
  padding: 14px 28px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 600;
  letter-spacing: 0.3px;
  text-decoration: none;
  border: none;
  cursor: pointer;
  transition: all 0.2s;
  display: inline-block;

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.secondary.light', '#FF5A22')};
    transform: translateY(-2px);
  }

  @media (max-width: 768px) {
    width: 100%;
    text-align: center;
  }
`;

const SecondaryButton = styled.a`
  background: transparent;
  color: rgba(255, 255, 255, 0.8);
  padding: 14px 28px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  letter-spacing: 0.3px;
  text-decoration: none;
  border: 1px solid rgba(255, 255, 255, 0.2);
  cursor: pointer;
  transition: all 0.2s;
  display: inline-block;

  &:hover {
    border-color: rgba(255, 255, 255, 0.5);
    color: #FFFFFF;
  }

  @media (max-width: 768px) {
    width: 100%;
    text-align: center;
  }
`;

const TrustRow = styled(motion.div)`
  display: flex;
  gap: 28px;
  flex-wrap: wrap;
  align-items: center;

  @media (max-width: 768px) {
    gap: 16px;
  }
`;

const TrustItem = styled.div<{ theme: any }>`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  letter-spacing: 0.5px;
  font-weight: 500;
  display: flex;
  align-items: center;
  gap: 6px;

  &::before {
    content: '✓';
    color: ${props => safeColor(props.theme, 'colors.info.light', '#0D9B87')};
    font-size: 11px;
  }
`;

// ─── Right Card ─────────────────────────────────────────────────

const HeroRight = styled(motion.div)`
  width: 380px;
  flex-shrink: 0;

  @media (max-width: 968px) {
    width: 100%;
    max-width: 420px;
  }
`;

const HeroCard = styled.div`
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 12px;
  padding: 28px;
  backdrop-filter: blur(8px);
`;

const CardTitle = styled.div`
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 20px;
`;

const StatRow = styled.div`
  display: flex;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  padding: 14px 0;

  &:last-child {
    border-bottom: none;
  }
`;

const StatLabel = styled.span`
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  font-weight: 400;
`;

const StatVal = styled.span<{ theme: any; variant?: 'green' | 'orange' | 'default' }>`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 14px;
  font-weight: 700;
  color: ${props => {
    if (props.variant === 'green') return safeColor(props.theme, 'colors.info.light', '#0D9B87');
    if (props.variant === 'orange') return safeColor(props.theme, 'colors.secondary.light', '#FF5A22');
    return safeColor(props.theme, 'colors.common.white', '#FFFFFF');
  }};
`;

// ─── Animation Variants ─────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.2 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' },
  },
};

// ─── Component ──────────────────────────────────────────────────

const HeroSectionNew: React.FC = () => {
  const { currentTheme } = useTheme();

  return (
    <HeroContainer theme={currentTheme}>
      <BgGrid theme={currentTheme} />
      <BgGlow theme={currentTheme} />
      <BgGlow2 theme={currentTheme} />

      <HeroInner>
        {/* Left — Content */}
        <HeroContent>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <Eyebrow variants={itemVariants} theme={currentTheme}>
              <EyebrowDot theme={currentTheme} />
              Transformation Leadership · Fractional CDO · CAiO
            </Eyebrow>

            <Headline variants={itemVariants} theme={currentTheme}>
              Get C-Suite AI &amp; Digital Leadership
              <br />
              Without the <em>₹1.5Cr+ Salary</em>
            </Headline>

            <SubText variants={itemVariants} theme={currentTheme}>
              We don't hand you a roadmap and disappear.
              <br />
              <strong>We stay. We build. We walk the entire transformation journey with you.</strong>
            </SubText>

            <SubText2 variants={itemVariants}>
              No junior consultants. No disappearing acts. No billing for decks.
              <br />
              Just senior transformation expertise — precisely when and how your business needs it.
            </SubText2>

            <CTAContainer variants={itemVariants}>
              <PrimaryButton
                href="https://calendly.com/connect-vikuna/30min"
                target="_blank"
                rel="noopener noreferrer"
                theme={currentTheme}
              >
                Book Free Strategy Call
              </PrimaryButton>
              <SecondaryButton
                href="/assessment"
              >
                Get Your Transformation Readiness Score →
              </SecondaryButton>
            </CTAContainer>

            <TrustRow variants={itemVariants}>
              <TrustItem theme={currentTheme}>200+ Years Combined Experience</TrustItem>
              <TrustItem theme={currentTheme}>Healthcare &amp; Pharma</TrustItem>
              <TrustItem theme={currentTheme}>Manufacturing &amp; Operations</TrustItem>
              <TrustItem theme={currentTheme}>100% Confidential</TrustItem>
            </TrustRow>
          </motion.div>
        </HeroContent>

        {/* Right — Engagement Outcomes Card */}
        <HeroRight
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, delay: 0.6 }}
        >
          <HeroCard>
            <CardTitle>Typical Engagement Outcomes</CardTitle>
            <StatRow>
              <StatLabel>vs Full-time C-Suite hire</StatLabel>
              <StatVal theme={currentTheme} variant="green">60% Cost Saved</StatVal>
            </StatRow>
            <StatRow>
              <StatLabel>Time to first results</StatLabel>
              <StatVal theme={currentTheme} variant="green">30 Days</StatVal>
            </StatRow>
            <StatRow>
              <StatLabel>Implementation speed</StatLabel>
              <StatVal theme={currentTheme} variant="green">3× Faster</StatVal>
            </StatRow>
            <StatRow>
              <StatLabel>Transformation success rate</StatLabel>
              <StatVal theme={currentTheme} variant="orange">85%</StatVal>
            </StatRow>
            <StatRow>
              <StatLabel>Industries served</StatLabel>
              <StatVal theme={currentTheme}>8+</StatVal>
            </StatRow>
          </HeroCard>
        </HeroRight>
      </HeroInner>
    </HeroContainer>
  );
};

export default HeroSectionNew;
