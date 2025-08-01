// src/components/vikuna/HeroSection.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { ArrowRight, CheckCircle, TrendingUp, Users, Brain } from 'lucide-react';

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

// Styled components for the HeroSection
const HeroContainer = styled.section`
  background: linear-gradient(135deg, 
    ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')} 0%, 
    ${props => safeColor(props.theme, 'colors.primary.light', '#EFF6FF')} 50%,
    ${props => safeColor(props.theme, 'colors.background.default', '#F9FAFB')} 100%
  );
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
  min-height: 100vh;
  position: relative;
  overflow: hidden;
  padding-top: 80px;
`;

// Floating background elements for subtle animation
const FloatingElements = styled.div`
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  
  &::before {
    content: '';
    position: absolute;
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')}20 0%, transparent 70%);
    top: -250px;
    right: -250px;
    animation: float 20s ease-in-out infinite;
  }
  
  &::after {
    content: '';
    position: absolute;
    width: 400px;
    height: 400px;
    background: radial-gradient(circle, ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')}15 0%, transparent 70%);
    bottom: -200px;
    left: -200px;
    animation: float 25s ease-in-out infinite reverse;
  }
  
  @keyframes float {
    0%, 100% { transform: translate(0, 0) scale(1); }
    50% { transform: translate(30px, -30px) scale(1.1); }
  }
`;

const HeroContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 3rem 1rem;
  position: relative;
  z-index: 1;
`;

const HeroBadge = styled(motion.div)`
  display: inline-block;
  background: ${props => safeColor(props.theme, 'colors.primary.light', '#EFF6FF')};
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  padding: 0.5rem 1.5rem;
  border-radius: 50px;
  font-size: 0.875rem;
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 500};
  margin-bottom: 2rem;
  border: 1px solid ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')}20;
`;

const Heading = styled(motion.h1)`
  font-size: clamp(2.5rem, 5vw, 4.5rem);
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  line-height: 1.1;
  margin-bottom: 1.5rem;
  
  .highlight {
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
    position: relative;
    
    &::after {
      content: '';
      position: absolute;
      bottom: -4px;
      left: 0;
      right: 0;
      height: 3px;
      background: linear-gradient(to right, #F59E0B, ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')});
      border-radius: 2px;
    }
  }
  
  .faith-text {
    background: linear-gradient(135deg, ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')}, #F59E0B);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    font-weight: 900;
  }
`;

const Description = styled(motion.p)`
  font-size: 1.375rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  margin-bottom: 2.5rem;
  max-width: 90%;
  line-height: 1.7;
`;

const ButtonContainer = styled(motion.div)`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 4rem;
`;

const PrimaryButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background-color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  color: ${props => safeColor(props.theme, 'colors.primary.contrastText', '#FFFFFF')};
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 500};
  padding: 1rem 2rem;
  border-radius: ${props => props.theme?.borderRadius?.medium || '8px'};
  border: none;
  cursor: pointer;
  font-size: 1.125rem;
  transition: all 0.3s ease;
  text-decoration: none;
  box-shadow: 0 4px 14px 0 ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')}40;
  
  &:hover {
    background-color: ${props => safeColor(props.theme, 'colors.primary.dark', '#1D4ED8')};
    transform: translateY(-2px);
    box-shadow: 0 6px 20px 0 ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')}50;
  }
`;

const SecondaryButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background-color: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 500};
  padding: 1rem 2rem;
  border-radius: ${props => props.theme?.borderRadius?.medium || '8px'};
  border: 2px solid ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  cursor: pointer;
  font-size: 1.125rem;
  transition: all 0.3s ease;
  text-decoration: none;
  
  &:hover {
    background-color: ${props => safeColor(props.theme, 'colors.primary.light', '#EFF6FF')};
    transform: translateY(-2px);
  }
`;

const TrustIndicators = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 2rem;
  padding: 2rem;
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border-radius: ${props => props.theme?.borderRadius?.large || '12px'};
  box-shadow: ${props => props.theme?.shadows?.medium || '0 4px 6px rgba(0,0,0,0.1)'};
  margin-bottom: 3rem;
`;

const TrustItem = styled.div`
  text-align: center;
  
  .trust-icon {
    width: 40px;
    height: 40px;
    margin: 0 auto 0.5rem;
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  }
  
  .trust-number {
    font-size: 2.5rem;
    font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
    display: block;
    margin-bottom: 0.25rem;
  }
  
  .trust-label {
    color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
    font-size: 0.875rem;
    font-weight: ${props => props.theme?.typography?.fontWeightMedium || 500};
  }
`;

const TestimonialCard = styled(motion.div)`
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border-radius: ${props => props.theme?.borderRadius?.large || '12px'};
  padding: 2rem;
  box-shadow: ${props => props.theme?.shadows?.small || '0 1px 3px rgba(0,0,0,0.1)'};
  max-width: 800px;
  margin: 0 auto;
  border: 1px solid ${props => safeColor(props.theme, 'colors.primary.light', '#EFF6FF')};
  
  .quote {
    font-size: 1.25rem;
    color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
    font-style: italic;
    margin-bottom: 1rem;
    line-height: 1.8;
    
    &::before {
      content: '"';
      font-size: 3rem;
      color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
      line-height: 0;
      vertical-align: -0.4em;
      margin-right: 0.25rem;
    }
  }
  
  .author {
    display: flex;
    align-items: center;
    gap: 1rem;
    
    .author-avatar {
      width: 48px;
      height: 48px;
      border-radius: 50%;
      background: ${props => safeColor(props.theme, 'colors.primary.light', '#EFF6FF')};
      display: flex;
      align-items: center;
      justify-content: center;
      color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
      font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
    }
    
    .author-info {
      .name {
        font-weight: ${props => props.theme?.typography?.fontWeightMedium || 500};
        color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
      }
      
      .role {
        font-size: 0.875rem;
        color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
      }
    }
  }
`;

const HeroSection: React.FC = () => {
  const { currentTheme } = useTheme();
  
  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1,
        delayChildren: 0.2
      }
    }
  };
  
  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
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
      
      <HeroContent>
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
        >
          <HeroBadge
            variants={itemVariants}
            theme={currentTheme}
          >
            🚀 Leadership-as-a-Service Platform
          </HeroBadge>
          
          <Heading variants={itemVariants} theme={currentTheme}>
            Take the Leap of <span className="faith-text">f.AI.th™</span>
            <br />
            <span className="highlight">Transform with Confidence</span>
          </Heading>
          
          <Description variants={itemVariants} theme={currentTheme}>
            From hesitation to AI transformation in 90 days. 
            Led by executives who've delivered success at Fortune 500 scale.
          </Description>

          <ButtonContainer variants={itemVariants}>
            <PrimaryButton 
              theme={currentTheme} 
             href="https://contractnest.vercel.app/leadforms/dtreadiness" >
            
              Get Your AI Readiness Score
              <ArrowRight size={20} />
            </PrimaryButton>
            <SecondaryButton 
              theme={currentTheme} 
              href="https://calendly.com/connect-vikuna/30min"
              target="_blank"
              rel="noopener noreferrer"
            >
              Book CDO Strategy Call
              <ArrowRight size={20} />
            </SecondaryButton>
          </ButtonContainer>

          <TrustIndicators variants={itemVariants} theme={currentTheme}>
            <TrustItem theme={currentTheme}>
              <Users className="trust-icon" />
              <span className="trust-number">200+</span>
              <span className="trust-label">Years Combined Experience</span>
            </TrustItem>
            
            <TrustItem theme={currentTheme}>
              <TrendingUp className="trust-icon" />
              <span className="trust-number">70%</span>
              <span className="trust-label">Success Rate vs 30% Industry</span>
            </TrustItem>
            
            <TrustItem theme={currentTheme}>
              <Brain className="trust-icon" />
              <span className="trust-number">C-Suite</span>
              <span className="trust-label">Leadership On-Demand</span>
            </TrustItem>
            
            <TrustItem theme={currentTheme}>
              <CheckCircle className="trust-icon" />
              <span className="trust-number">Risk-Free</span>
              <span className="trust-label">Strategy Session</span>
            </TrustItem>
          </TrustIndicators>
          
          <TestimonialCard
            variants={itemVariants}
            theme={currentTheme}
          >
            <p className="quote">
              Vikuna's CAiO service gave us C-suite AI expertise without the 
              7-figure salary. We achieved in 3 months what would have taken 
              us a year to figure out alone.
            </p>
            <div className="author">
              <div className="author-avatar">SC</div>
              <div className="author-info">
                <div className="name">Vishnu Pillai</div>
                <div className="role">COO, Chemical manufacturing</div>
              </div>
            </div>
          </TestimonialCard>
        </motion.div>
      </HeroContent>
    </HeroContainer>
  );
};

export default HeroSection;