// src/components/vikuna/HeroSectionNew.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { ArrowRight, CheckCircle, Award, TrendingUp, Users, Shield } from 'lucide-react';

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
    ${props => safeColor(props.theme, 'colors.primary.light', '#dfe3e7')} 100%
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
    background: radial-gradient(circle, ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')} 0%, transparent 70%);
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
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
  position: relative;
  z-index: 1;
`;

const HeroContent = styled.div`
  max-width: 800px;
`;

const TrustBadge = styled(motion.div)`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
  padding: 8px 20px;
  border-radius: 50px;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 24px;
  border: 2px solid ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
  box-shadow: 0 4px 12px ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')}20;

  svg {
    width: 16px;
    height: 16px;
  }
`;

const Headline = styled(motion.h1)`
  font-size: clamp(2.5rem, 5vw, 4rem);
  font-weight: 800;
  line-height: 1.1;
  margin-bottom: 24px;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1a1f24')};

  .highlight {
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
    position: relative;
  }

  @media (max-width: 768px) {
    font-size: 2rem;
  }
`;

const Subheadline = styled(motion.p)`
  font-size: 1.25rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#656a85')};
  margin-bottom: 32px;
  line-height: 1.6;
  max-width: 700px;

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
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1a1f24')};

  svg {
    width: 20px;
    height: 20px;
    color: ${props => safeColor(props.theme, 'colors.success.main', '#165070')};
  }
`;

const CTAContainer = styled(motion.div)`
  display: flex;
  gap: 16px;
  margin-bottom: 48px;
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
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
  font-weight: 600;
  font-size: 1.125rem;
  padding: 18px 32px;
  border-radius: 12px;
  border: 2px solid ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
  text-decoration: none;
  transition: all 0.3s ease;

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.primary.light', '#dfe3e7')};
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

const StatsBar = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 32px;
  background: white;
  padding: 32px;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  border: 1px solid ${props => safeColor(props.theme, 'colors.background.default', '#f1f4f8')};

  @media (max-width: 768px) {
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    padding: 24px;
  }
`;

const StatItem = styled.div`
  text-align: center;

  .stat-icon {
    width: 40px;
    height: 40px;
    margin: 0 auto 12px;
    padding: 8px;
    background: ${props => safeColor(props.theme, 'colors.primary.light', '#dfe3e7')};
    border-radius: 12px;
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
  }

  .stat-number {
    font-size: 2rem;
    font-weight: 800;
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
    display: block;
    margin-bottom: 4px;
  }

  .stat-label {
    font-size: 0.875rem;
    color: ${props => safeColor(props.theme, 'colors.text.secondary', '#656a85')};
    font-weight: 500;
  }
`;

const SubCTA = styled(motion.p)`
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#656a85')};
  margin-top: -24px;
  margin-bottom: 48px;

  svg {
    display: inline;
    width: 14px;
    height: 14px;
    margin-right: 4px;
    vertical-align: middle;
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

  return (
    <HeroContainer theme={currentTheme}>
      <FloatingElements theme={currentTheme} />

      <Container>
        <HeroContent>
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
          >
            <TrustBadge variants={itemVariants} theme={currentTheme}>
              <Award />
              Trusted by Fortune 500 Leaders
            </TrustBadge>

            <Headline variants={itemVariants} theme={currentTheme}>
              Get <span className="highlight">C-Suite AI Leadership</span>
              <br />
              Without the $500K+ Salary
            </Headline>

            <Subheadline variants={itemVariants} theme={currentTheme}>
              200+ years combined experience delivering AI transformations.
              Start your journey with a risk-free strategy session.
            </Subheadline>

            <TrustIndicators variants={itemVariants}>
              <TrustItem theme={currentTheme}>
                <CheckCircle />
                70% Success Rate
              </TrustItem>
              <TrustItem theme={currentTheme}>
                <CheckCircle />
                90-Day Results
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

            <StatsBar variants={itemVariants} theme={currentTheme}>
              <StatItem theme={currentTheme}>
                <Users className="stat-icon" />
                <span className="stat-number">200+</span>
                <span className="stat-label">Years Combined Experience</span>
              </StatItem>

              <StatItem theme={currentTheme}>
                <TrendingUp className="stat-icon" />
                <span className="stat-number">70%</span>
                <span className="stat-label">Success Rate vs 30% Industry</span>
              </StatItem>

              <StatItem theme={currentTheme}>
                <Award className="stat-icon" />
                <span className="stat-number">50+</span>
                <span className="stat-label">Transformations Delivered</span>
              </StatItem>

              <StatItem theme={currentTheme}>
                <CheckCircle className="stat-icon" />
                <span className="stat-number">90 Days</span>
                <span className="stat-label">To Measurable Results</span>
              </StatItem>
            </StatsBar>
          </motion.div>
        </HeroContent>
      </Container>
    </HeroContainer>
  );
};

export default HeroSectionNew;
