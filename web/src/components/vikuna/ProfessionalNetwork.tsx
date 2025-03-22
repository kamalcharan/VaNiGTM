// src/components/vikuna/ProfessionalNetwork.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { CheckCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

// Styled components
const SectionContainer = styled.section`
  padding: 5rem 0;
  background-color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  color: white;
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
`;

const GridContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 3rem;
  align-items: center;
  
  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
    gap: 4rem;
  }
`;

const SectionTitle = styled.h2`
  font-size: 2.25rem;
  @media (min-width: 768px) {
    font-size: 2.5rem;
  }
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  margin-bottom: 1.5rem;
  color: white;
`;

const Description = styled.p`
  font-size: 1.125rem;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 2rem;
  line-height: 1.6;
`;

const FeaturesList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const FeatureItem = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 1rem;
`;

const IconContainer = styled.div`
  color: rgba(255, 255, 255, 0.8);
  margin-top: 0.25rem;
  flex-shrink: 0;
`;

const FeatureContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const FeatureTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 600};
  margin-bottom: 0.25rem;
  color: white;
`;

const FeatureDescription = styled.p`
  color: rgba(255, 255, 255, 0.8);
  line-height: 1.6;
`;

const ButtonContainer = styled.div`
  margin-top: 2.5rem;
`;

const RightColumnContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const TestimonialCard = styled.div`
  background-color: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(4px);
  border-radius: ${props => props.theme?.borderRadius?.large || '12px'};
  padding: 1.5rem;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
`;

const TestimonialText = styled.p`
  font-style: italic;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 1.5rem;
  line-height: 1.6;
`;

const TestimonialAuthor = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
`;

const AuthorAvatar = styled.div`
  width: 3rem;
  height: 3rem;
  background-color: rgba(255, 255, 255, 0.3);
  border-radius: 50%;
  overflow: hidden;
`;

const AuthorInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const AuthorName = styled.div`
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 600};
  color: white;
`;

const AuthorRole = styled.div`
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.7);
`;

const StatsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
`;

const StatCard = styled.div`
  background-color: rgba(255, 255, 255, 0.15);
  backdrop-filter: blur(4px);
  border-radius: ${props => props.theme?.borderRadius?.medium || '8px'};
  padding: 1rem;
  text-align: center;
`;

const StatNumber = styled.div`
  font-size: 1.875rem;
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  margin-bottom: 0.25rem;
  color: white;
`;

const StatLabel = styled.p`
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.7);
`;

const TagsContainer = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
`;

const Tag = styled.span`
  padding: 0.25rem 0.75rem;
  background-color: rgba(255, 255, 255, 0.15);
  border-radius: 9999px;
  font-size: 0.875rem;
  color: white;
`;

const ProfessionalNetwork: React.FC = () => {
  const { currentTheme } = useTheme();
  
  const features = [
    {
      title: "Access High-Value Projects",
      description: "Work with top-tier clients on meaningful transformation initiatives"
    },
    {
      title: "Flexible Engagement Options",
      description: "Choose projects that match your expertise and availability"
    },
    {
      title: "Grow Your Professional Network",
      description: "Connect with other experts and expand your professional community"
    }
  ];
  
  const expertiseTags = [
    "AI Strategy",
    "Digital Business Models",
    "Digital Strategy",
    "Process Automation",
    "Data Analytics",
    "UX Design",
    "AI Agents",
    "Digital Twins",
    "Platform Modernisation",
    "Data Strategy",
    "Tech Stack Assessment"
  ];

  return (
    <SectionContainer id="expert-network" theme={currentTheme}>
      <Container>
        <GridContainer>
          {/* Left Column - Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <SectionTitle theme={currentTheme}>Join Our Expert Network</SectionTitle>
            
            <Description>
              Are you a digital transformation specialist, AI expert, or technology 
              consultant? Partner with Vikuna to expand your reach and impact.
            </Description>
            
            <FeaturesList>
              {features.map((feature, index) => (
                <FeatureItem key={index}>
                  <IconContainer>
                    <CheckCircle size={24} />
                  </IconContainer>
                  <FeatureContent>
                    <FeatureTitle theme={currentTheme}>{feature.title}</FeatureTitle>
                    <FeatureDescription>{feature.description}</FeatureDescription>
                  </FeatureContent>
                </FeatureItem>
              ))}
            </FeaturesList>
            
            <ButtonContainer>
              <Button 
                backgroundColor="#FFFFFF"
                textColor={safeColor(currentTheme, 'colors.primary.main', '#2563EB')}
                style={{ fontWeight: 500 }}
                onClick={() => window.location.href = '/join-network'}
              >
                Apply To Join Our Network
              </Button>
            </ButtonContainer>
          </motion.div>
          
          {/* Right Column - Testimonial and Stats */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <RightColumnContainer>
              {/* Testimonial */}
              <TestimonialCard>
                <TestimonialText>
                  "Partnering with Vikuna has allowed me to leverage my AI expertise
                  while working with diverse clients across industries. The flexible
                  engagement model fits perfectly with my consulting practice."
                </TestimonialText>
                
                <TestimonialAuthor>
                  <AuthorAvatar />
                  <AuthorInfo>
                    <AuthorName>Amit Jain</AuthorName>
                    <AuthorRole>AI Strategy Consultant</AuthorRole>
                  </AuthorInfo>
                </TestimonialAuthor>
              </TestimonialCard>
              
              {/* Statistics */}
              <StatsGrid>
                <StatCard>
                  <StatNumber>15+</StatNumber>
                  <StatLabel>Active Experts</StatLabel>
                </StatCard>
                <StatCard>
                  <StatNumber>8+</StatNumber>
                  <StatLabel>Specializations</StatLabel>
                </StatCard>
              </StatsGrid>
              
              {/* Expertise Tags */}
              <TagsContainer>
                {expertiseTags.map((tag, index) => (
                  <Tag key={index}>{tag}</Tag>
                ))}
              </TagsContainer>
            </RightColumnContainer>
          </motion.div>
        </GridContainer>
      </Container>
    </SectionContainer>
  );
};

export default ProfessionalNetwork;