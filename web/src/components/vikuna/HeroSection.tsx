// src/components/vikuna/HeroSection.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { ChevronDown } from 'lucide-react';

// Styled components for the HeroSection
const HeroContainer = styled.section`
  background-color: ${props => props.theme.colors.primary.light}; 
  color: ${props => props.theme.colors.text.primary};
  min-height: 80vh;
  position: relative;
  overflow: hidden;
  padding-top: 80px; // To account for the navbar height
`;

const HeroContent = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 4rem 1rem;
  display: grid;
  grid-template-columns: 1fr;
  gap: 3rem;
  position: relative;
  z-index: 1;
  
  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
    align-items: center;
  }
`;

const Heading = styled.h1`
  font-size: 3.5rem;
  font-weight: ${props => props.theme.typography.fontWeightBold};
  line-height: 1.2;
  margin-bottom: 1.5rem;
  
  .highlight {
    color: ${props => props.theme.colors.primary.main};
  }
`;

const Description = styled.p`
  font-size: 1.25rem;
  color: ${props => props.theme.colors.text.secondary};
  margin-bottom: 2rem;
  max-width: 90%;
`;

const ButtonContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 2rem;
`;

const PrimaryButton = styled.a`
  display: inline-block;
  background-color: ${props => props.theme.colors.primary.main};
  color: ${props => props.theme.colors.primary.contrastText};
  font-weight: ${props => props.theme.typography.fontWeightMedium};
  padding: 0.75rem 1.5rem;
  border-radius: ${props => props.theme.borderRadius.medium};
  border: none;
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.2s;
  text-decoration: none;
  
  &:hover {
    background-color: ${props => props.theme.colors.primary.dark};
  }
`;

const SecondaryButton = styled.a`
  display: inline-block;
  background-color: transparent;
  color: ${props => props.theme.colors.primary.main};
  font-weight: ${props => props.theme.typography.fontWeightMedium};
  padding: 0.75rem 1.5rem;
  border-radius: ${props => props.theme.borderRadius.medium};
  border: 1px solid ${props => props.theme.colors.primary.main};
  cursor: pointer;
  font-size: 1rem;
  transition: background-color 0.2s;
  text-decoration: none;
  
  &:hover {
    background-color: rgba(37, 99, 235, 0.05);
  }
`;

const StatsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 3rem;
  margin-top: 2.5rem;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;
`;

const StatNumber = styled.span`
  font-size: 2rem;
  font-weight: ${props => props.theme.typography.fontWeightBold};
  color: ${props => props.theme.colors.primary.main};
`;

const StatTitle = styled.div`
  font-weight: ${props => props.theme.typography.fontWeightMedium};
  margin-top: 0.25rem;
`;

const StatSubtitle = styled.div`
  color: ${props => props.theme.colors.text.secondary};
  font-size: 0.875rem;
`;

const ExpertiseCard = styled.div`
  background-color: ${props => props.theme.colors.background.paper};
  border-radius: ${props => props.theme.borderRadius.large};
  box-shadow: ${props => props.theme.shadows.medium};
  padding: 2rem;
`;

const ExpertiseTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: ${props => props.theme.typography.fontWeightBold};
  color: ${props => props.theme.colors.text.primary};
  margin-bottom: 1.5rem;
`;

const ExpertiseList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const ExpertiseItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 1rem;
`;

const IconCircle = styled.div`
  width: 2.5rem;
  height: 2.5rem;
  background-color: ${props => props.theme.colors.primary.light};
  border-radius: ${props => props.theme.borderRadius.round};
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${props => props.theme.colors.primary.main};
`;

const ExpertiseItemContent = styled.div`
  h4 {
    font-weight: ${props => props.theme.typography.fontWeightMedium};
    color: ${props => props.theme.colors.text.primary};
    margin: 0 0 0.25rem 0;
  }
  
  p {
    font-size: 0.875rem;
    color: ${props => props.theme.colors.text.secondary};
    margin: 0;
  }
`;

const Testimonial = styled.div`
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid ${props => props.theme.colors.background.default};
  
  p {
    color: ${props => props.theme.colors.text.secondary};
    font-style: italic;
    margin: 0;
  }
`;

const ScrollIndicator = styled.div`
  position: absolute;
  bottom: 2rem;
  left: 50%;
  transform: translateX(-50%);
  color: ${props => props.theme.colors.primary.main};
  animation: bounce 2s infinite;
  
  @keyframes bounce {
    0%, 20%, 50%, 80%, 100% {
      transform: translateY(0) translateX(-50%);
    }
    40% {
      transform: translateY(-10px) translateX(-50%);
    }
    60% {
      transform: translateY(-5px) translateX(-50%);
    }
  }
`;

const HeroSection: React.FC = () => {
  const { currentTheme } = useTheme();
  
  const handleScrollToServices = () => {
    const servicesSection = document.getElementById('leadership-services');
    if (servicesSection) {
      servicesSection.scrollIntoView({ behavior: 'smooth' });
    }
  };

  return (
    <HeroContainer theme={currentTheme}>
      <HeroContent theme={currentTheme}>
        {/* Left Column: Content */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7 }}
        >
          <Heading theme={currentTheme}>
            Driving <span className="highlight">digital evolution</span> with expertise & vision
          </Heading>
          
          <Description theme={currentTheme}>
            Vikuna Technologies is redefining digital consulting with expert-led transformation services, 
            AI strategy, and modern solutions for forward-thinking businesses.
          </Description>

          <ButtonContainer>
            <PrimaryButton 
              theme={currentTheme} 
              href="https://calendly.com/connect-vikuna/30min"
            >
              Book Consultation
            </PrimaryButton>
            <SecondaryButton 
              theme={currentTheme} 
              href="https://contractnest.vercel.app/leadforms/dtreadiness"
            >
              Digital Readiness Survey
            </SecondaryButton>
          </ButtonContainer>

          {/* Stats Section */}
          <StatsContainer>
            <StatItem>
              <StatNumber theme={currentTheme}>200+</StatNumber>
              <StatTitle theme={currentTheme}>Years Experience</StatTitle>
              <StatSubtitle theme={currentTheme}>Industry Expertise</StatSubtitle>
            </StatItem>
            
            <StatItem>
              <StatNumber theme={currentTheme}>30+</StatNumber>
              <StatTitle theme={currentTheme}>Projects Delivered</StatTitle>
              <StatSubtitle theme={currentTheme}>Across Industries</StatSubtitle>
            </StatItem>
          </StatsContainer>
        </motion.div>

        {/* Right Column: Leadership Expertise Box */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <ExpertiseCard theme={currentTheme}>
            <ExpertiseTitle theme={currentTheme}>Leadership Expertise</ExpertiseTitle>
            
            <ExpertiseList>
              <ExpertiseItem>
                <IconCircle theme={currentTheme}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path>
                    <circle cx="9" cy="7" r="4"></circle>
                    <path d="M22 21v-2a4 4 0 0 0-3-3.87"></path>
                    <path d="M16 3.13a4 4 0 0 1 0 7.74"></path>
                  </svg>
                </IconCircle>
                <ExpertiseItemContent theme={currentTheme}>
                  <h4>Strategic Leadership</h4>
                  <p>Former C-suite executives from Fortune 500 companies</p>
                </ExpertiseItemContent>
              </ExpertiseItem>
              
              <ExpertiseItem>
                <IconCircle theme={currentTheme}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                    <polyline points="22 4 12 14.01 9 11.01"></polyline>
                  </svg>
                </IconCircle>
                <ExpertiseItemContent theme={currentTheme}>
                  <h4>Industry Recognition</h4>
                  <p>Award-winning transformation specialists</p>
                </ExpertiseItemContent>
              </ExpertiseItem>
              
              <ExpertiseItem>
                <IconCircle theme={currentTheme}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10"></circle>
                    <line x1="2" y1="12" x2="22" y2="12"></line>
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
                  </svg>
                </IconCircle>
                <ExpertiseItemContent theme={currentTheme}>
                  <h4>Global Experience</h4>
                  <p>Serving clients across continents and industries</p>
                </ExpertiseItemContent>
              </ExpertiseItem>
            </ExpertiseList>
            
            <Testimonial theme={currentTheme}>
              <p>
                "Vikuna's integrated approach and veteran leadership can transform your business completely, delivering exceptional results across all dimensions."
              </p>
            </Testimonial>
          </ExpertiseCard>
        </motion.div>
      </HeroContent>

      {/* Scroll Indicator */}
      <ScrollIndicator theme={currentTheme} onClick={handleScrollToServices}>
        <ChevronDown size={24} />
      </ScrollIndicator>
    </HeroContainer>
  );
};

export default HeroSection;