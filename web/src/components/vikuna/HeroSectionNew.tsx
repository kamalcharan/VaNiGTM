// src/components/vikuna/HeroSectionNew.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { ArrowRight, Award, TrendingUp, CheckCircle, Shield, Cpu, Settings, Users, Brain, Target, Building2 } from 'lucide-react';

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

const HeroContainer = styled.section`
  background: linear-gradient(135deg,
    ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')} 0%,
    ${props => safeColor(props.theme, 'colors.primary.light', '#a0c1d6')} 100%
  );
  min-height: 100vh;
  display: flex;
  align-items: center;
  padding: 120px 0 80px;
  position: relative;
  overflow: hidden;

  @media (max-width: 768px) {
    min-height: auto;
    padding: 100px 0 60px;
  }
`;

const FloatingElements = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  opacity: 0.05;

  &::before {
    content: '';
    position: absolute;
    width: 600px;
    height: 600px;
    background: radial-gradient(circle, ${props => safeColor(props.theme, 'colors.primary.main', '#003366')} 0%, transparent 70%);
    top: -300px;
    right: -300px;
    animation: float 20s ease-in-out infinite;
  }

  @keyframes float {
    0%, 100% { transform: translate(0, 0); }
    50% { transform: translate(30px, -30px); }
  }
`;

const Container = styled.div`
  max-width: 1400px;
  margin: 0 auto;
  padding: 0 24px;
  position: relative;
  z-index: 1;
`;

const HeroGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  align-items: center;

  @media (max-width: 968px) {
    grid-template-columns: 1fr;
    gap: 60px;
  }
`;

const HeroContent = styled.div`
  max-width: 650px;
`;

const TrustBadge = styled(motion.div)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  padding: 8px 20px;
  border-radius: 50px;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 24px;
  border: 2px solid ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  box-shadow: 0 4px 12px ${props => safeColor(props.theme, 'colors.primary.main', '#003366')}20;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const Headline = styled(motion.h1)`
  font-size: clamp(2.5rem, 5vw, 3.75rem);
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 24px;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};

  .highlight {
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
    position: relative;
  }

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const Subheadline = styled(motion.p)`
  font-size: 1.25rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  margin-bottom: 32px;
  line-height: 1.6;

  @media (max-width: 768px) {
    font-size: 1.125rem;
  }
`;

const TrustIndicators = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 24px;
  margin-bottom: 40px;
  flex-wrap: wrap;

  @media (max-width: 768px) {
    gap: 16px;
  }
`;

const TrustItem = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.95rem;
  font-weight: 600;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};

  svg {
    width: 20px;
    height: 20px;
    color: ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
  }
`;

const CTAContainer = styled(motion.div)`
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
  flex-wrap: wrap;
`;

const PrimaryButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  color: white;
  font-weight: 600;
  font-size: 1.125rem;
  padding: 18px 32px;
  border-radius: 12px;
  text-decoration: none;
  transition: all 0.3s ease;
  box-shadow: 0 6px 20px ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')}40;

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.secondary.dark', '#e55a4a')};
    transform: translateY(-3px);
    box-shadow: 0 8px 30px ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')}50;
  }

  svg {
    width: 20px;
    height: 20px;
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const SecondaryButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: white;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  font-weight: 600;
  font-size: 1.125rem;
  padding: 18px 32px;
  border-radius: 12px;
  border: 2px solid ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  text-decoration: none;
  transition: all 0.3s ease;

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.primary.light', '#a0c1d6')};
    transform: translateY(-3px);
  }

  svg {
    width: 20px;
    height: 20px;
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const SubCTA = styled(motion.p)`
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};

  svg {
    display: inline;
    width: 14px;
    height: 14px;
    margin-right: 4px;
    vertical-align: middle;
  }
`;

// Iceberg Visual Components
const IcebergContainer = styled(motion.div)`
  position: relative;
  width: 100%;
  max-width: 500px;
  margin: 0 auto;

  @media (max-width: 968px) {
    max-width: 400px;
  }
`;

const IcebergVisual = styled.div`
  position: relative;
  height: 600px;
  display: flex;
  flex-direction: column;
  align-items: center;

  @media (max-width: 968px) {
    height: 500px;
  }
`;

const WaterLine = styled.div`
  position: absolute;
  top: 20%;
  left: 0;
  right: 0;
  height: 3px;
  background: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  z-index: 2;
  box-shadow: 0 2px 8px rgba(0, 51, 102, 0.3);

  &::after {
    content: '';
    position: absolute;
    top: -1px;
    left: 0;
    right: 0;
    height: 1px;
    background: ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')};
  }

  &::before {
    content: 'SURFACE LEVEL';
    position: absolute;
    right: 10px;
    top: -30px;
    font-size: 0.75rem;
    font-weight: 700;
    color: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
    background: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
    padding: 4px 12px;
    border-radius: 4px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    box-shadow: 0 2px 8px rgba(0, 51, 102, 0.3);
  }
`;

const AboveWater = styled.div`
  position: absolute;
  top: 0;
  width: 100%;
  height: 20%;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 1;
`;

const AboveWaterLabel = styled.div`
  text-align: center;
  margin-bottom: 8px;
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const AboveWaterContent = styled.div`
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border: 2px solid ${props => safeColor(props.theme, 'colors.primary.light', '#a0c1d6')};
  border-radius: 12px;
  padding: 16px 24px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);

  svg {
    width: 24px;
    height: 24px;
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  }

  .label {
    font-size: 1rem;
    font-weight: 600;
    color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};
  }
`;

const BelowWater = styled.div`
  position: absolute;
  top: 22%;
  width: 100%;
  height: 78%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 20px 0;
  background: linear-gradient(180deg,
    rgba(54, 242, 250, 0.05) 0%,
    rgba(0, 102, 136, 0.1) 100%
  );
  border-radius: 0 0 200px 200px;
`;

const BelowWaterLabel = styled.div`
  text-align: center;
  margin-bottom: 8px;
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
`;

const TransformationItem = styled(motion.div)`
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border: 2px solid ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
  border-radius: 10px;
  padding: 12px 20px;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 0 20px;
  box-shadow: 0 2px 8px rgba(0, 102, 136, 0.15);
  transition: all 0.3s ease;

  &:hover {
    transform: translateX(8px);
    box-shadow: 0 4px 16px rgba(0, 102, 136, 0.25);
  }

  svg {
    width: 20px;
    height: 20px;
    color: ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
    flex-shrink: 0;
  }

  .label {
    font-size: 0.95rem;
    font-weight: 600;
    color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};
  }
`;

const IcebergMessage = styled(motion.div)`
  margin-top: 24px;
  text-align: center;
  padding: 20px;
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border-radius: 12px;
  border: 2px solid ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  box-shadow: 0 4px 12px ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')}20;

  .top-text {
    font-size: 0.875rem;
    color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
    margin-bottom: 8px;
  }

  .main-text {
    font-size: 1.125rem;
    font-weight: 700;
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
    line-height: 1.4;

    .highlight {
      color: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
    }
  }
`;

const HeroSectionNew: React.FC = () => {
  const { currentTheme } = useTheme();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15,
        delayChildren: 0.3
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut"
      }
    }
  };

  const icebergItemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: (custom: number) => ({
      opacity: 1,
      x: 0,
      transition: {
        duration: 0.5,
        delay: custom * 0.1,
        ease: "easeOut"
      }
    })
  };

  return (
    <HeroContainer theme={currentTheme}>
      <FloatingElements theme={currentTheme} />

      <Container>
        <HeroGrid>
          {/* Left Column - Content */}
          <HeroContent>
            <motion.div
              variants={containerVariants}
              initial="hidden"
              animate="visible"
            >
              <TrustBadge variants={itemVariants} theme={currentTheme}>
                <Award />
                200+ Years Combined Experience
              </TrustBadge>

              <Headline variants={itemVariants} theme={currentTheme}>
                Get <span className="highlight">C-Suite AI Leadership</span>
                <br />
                Without the $500K+ Salary
              </Headline>

              <Subheadline variants={itemVariants} theme={currentTheme}>
                True AI transformation isn't just technology—it's operations, skills, mindset, and leadership working together. Start your journey with a risk-free strategy session.
              </Subheadline>

              <TrustIndicators variants={itemVariants}>
                <TrustItem theme={currentTheme}>
                  <CheckCircle />
                  Holistic Approach
                </TrustItem>
                <TrustItem theme={currentTheme}>
                  <CheckCircle />
                  Custom Strategy
                </TrustItem>
                <TrustItem theme={currentTheme}>
                  <CheckCircle />
                  No Obligation
                </TrustItem>
              </TrustIndicators>

              <CTAContainer variants={itemVariants}>
                <PrimaryButton
                  href="https://calendly.com/connect-vikuna/30min"
                  target="_blank"
                  rel="noopener noreferrer"
                  theme={currentTheme}
                >
                  Book Free Strategy Call
                  <ArrowRight />
                </PrimaryButton>

                <SecondaryButton
                  href="https://contractnest.vercel.app/leadforms/dtreadiness"
                  target="_blank"
                  rel="noopener noreferrer"
                  theme={currentTheme}
                >
                  Get AI Readiness Score
                  <TrendingUp />
                </SecondaryButton>
              </CTAContainer>

              <SubCTA variants={itemVariants} theme={currentTheme}>
                <Shield /> 100% Confidential • No Sales Pitch • Expert Guidance Only
              </SubCTA>
            </motion.div>
          </HeroContent>

          {/* Right Column - Iceberg Visual */}
          <IcebergContainer
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.5 }}
          >
            <IcebergVisual>
              {/* Water Line */}
              <WaterLine theme={currentTheme} />

              {/* Above Water - What Most Focus On */}
              <AboveWater>
                <AboveWaterLabel theme={currentTheme}>
                  What Most Consultants Focus On ↓
                </AboveWaterLabel>
                <AboveWaterContent theme={currentTheme}>
                  <Cpu />
                  <span className="label">Technology & Tools</span>
                </AboveWaterContent>
              </AboveWater>

              {/* Below Water - Real Transformation */}
              <BelowWater theme={currentTheme}>
                <BelowWaterLabel theme={currentTheme}>
                  Where Real Transformation Happens ↓
                </BelowWaterLabel>

                <TransformationItem
                  custom={0}
                  variants={icebergItemVariants}
                  initial="hidden"
                  animate="visible"
                  theme={currentTheme}
                >
                  <Settings />
                  <span className="label">Operations Transformation</span>
                </TransformationItem>

                <TransformationItem
                  custom={1}
                  variants={icebergItemVariants}
                  initial="hidden"
                  animate="visible"
                  theme={currentTheme}
                >
                  <Target />
                  <span className="label">Skills Development</span>
                </TransformationItem>

                <TransformationItem
                  custom={2}
                  variants={icebergItemVariants}
                  initial="hidden"
                  animate="visible"
                  theme={currentTheme}
                >
                  <Brain />
                  <span className="label">Mindset Shifts</span>
                </TransformationItem>

                <TransformationItem
                  custom={3}
                  variants={icebergItemVariants}
                  initial="hidden"
                  animate="visible"
                  theme={currentTheme}
                >
                  <Users />
                  <span className="label">Leadership Evolution</span>
                </TransformationItem>

                <TransformationItem
                  custom={4}
                  variants={icebergItemVariants}
                  initial="hidden"
                  animate="visible"
                  theme={currentTheme}
                >
                  <Building2 />
                  <span className="label">Cultural Adaptation</span>
                </TransformationItem>
              </BelowWater>
            </IcebergVisual>

            {/* Message Below Iceberg */}
            <IcebergMessage
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 1.2 }}
              theme={currentTheme}
            >
              <div className="top-text">Every organization is unique.</div>
              <div className="main-text">
                We design <span className="highlight">YOUR</span> transformation strategy.
              </div>
            </IcebergMessage>
          </IcebergContainer>
        </HeroGrid>
      </Container>
    </HeroContainer>
  );
};

export default HeroSectionNew;
