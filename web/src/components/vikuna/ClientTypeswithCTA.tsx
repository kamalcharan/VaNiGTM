// src/components/vikuna/ClientTypesWithCTA.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { Rocket, Network, Star } from 'lucide-react';

// Helper function to safely access theme colors
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
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
`;

const SectionTitle = styled.h2`
  font-size: 2.5rem;
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
  text-align: center;
  margin-bottom: 4rem;
`;

const ClientTypesGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  margin-bottom: 6rem;
  
  @media (min-width: 768px) {
    grid-template-columns: repeat(3, 1fr);
  }
`;

const ClientTypeCard = styled.div`
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-radius: ${props => props.theme?.borderRadius?.medium || '8px'};
  padding: 2rem;
  height: 100%;
`;

const IconContainer = styled.div`
  margin-bottom: 1.5rem;
  
  svg {
    color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
  }
`;

const CardTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
  margin-bottom: 1rem;
`;

const CardDescription = styled.p`
  font-size: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  line-height: 1.6;
`;

const CTAContainer = styled.div`
  background-color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  border-radius: ${props => props.theme?.borderRadius?.large || '12px'};
  overflow: hidden;
`;

const CTAContent = styled.div`
  padding: 4rem 2rem;
  text-align: center;
`;

const CTATitle = styled.h2`
  font-size: 2.25rem;
  @media (min-width: 768px) {
    font-size: 2.5rem;
  }
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  color: ${props => safeColor(props.theme, 'colors.primary.contrastText', '#FFFFFF')};
  margin-bottom: 1.5rem;
`;

const CTADescription = styled.p`
  font-size: 1.125rem;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 2.5rem;
  max-width: 48rem;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.6;
`;

const CTAButton = styled.a`
  display: inline-block;
  padding: 0.75rem 2rem;
  background-color: ${props => safeColor(props.theme, 'colors.common.white', '#FFFFFF')};
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 500};
  border-radius: ${props => props.theme?.borderRadius?.medium || '8px'};
  text-decoration: none;
  transition: background-color 0.3s ease;
  
  &:hover {
    background-color: ${props => safeColor(props.theme, 'colors.background.default', '#F9FAFB')};
  }
`;

const ClientTypesWithCTA: React.FC = () => {
  const { currentTheme } = useTheme();
  
  const clientTypes = [
    {
      title: "STARTUPS",
      description: "We're a perfect fit for those startups that want to optimize their delivery process by saving time on recruitment and cutting administrative expenses. We're Fast & Flexible.",
      icon: <Rocket size={48} />
    },
    {
      title: "SMBs",
      description: "Our overall expertise lies in business process automation in complex software environments. We join enterprise core teams to enhance digital transformation backed by solid business analysis.",
      icon: <Network size={48} />
    },
    {
      title: "INDUSTRIAL EXPERTS",
      description: "Whether you're an industry-focused consultant or niched product owner, we're here to help translate your business ideas into software solutions.",
      icon: <Star size={48} />
    }
  ];

  return (
    <SectionContainer id="client-types">
      <Container>
        {/* Client Types Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <SectionTitle theme={currentTheme}>
            We're On The Same Page With
          </SectionTitle>
          
          <ClientTypesGrid>
            {clientTypes.map((client, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <ClientTypeCard theme={currentTheme}>
                  <IconContainer theme={currentTheme}>
                    {client.icon}
                  </IconContainer>
                  <CardTitle theme={currentTheme}>{client.title}</CardTitle>
                  <CardDescription theme={currentTheme}>{client.description}</CardDescription>
                </ClientTypeCard>
              </motion.div>
            ))}
          </ClientTypesGrid>
        </motion.div>
        
        {/* Call to Action Section */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
        >
          <CTAContainer theme={currentTheme}>
            <CTAContent>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
              >
                <CTATitle theme={currentTheme}>
                  Ready to Transform Your Business?
                </CTATitle>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 }}
              >
                <CTADescription theme={currentTheme}>
                  Schedule a free consultation to discuss your digital transformation needs and learn how we 
                  can help you navigate your journey successfully.
                </CTADescription>
              </motion.div>
              
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.2 }}
              >
                <CTAButton 
                  href="https://calendly.com/connect-vikuna/30min"
                  theme={currentTheme}
                >
                  Book a Strategy Call
                </CTAButton>
              </motion.div>
            </CTAContent>
          </CTAContainer>
        </motion.div>
      </Container>
    </SectionContainer>
  );
};

export default ClientTypesWithCTA;