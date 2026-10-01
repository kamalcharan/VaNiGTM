// src/components/vikuna/KeyAreas.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { RefreshCw, Rocket, Layers, Users, Brain, Search } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardContent, CardDescription } from '@/components/ui/card';

// Styled components
const SectionContainer = styled.section`
  padding: 5rem 0;
  background: linear-gradient(to bottom right, 
    ${props => props.theme.colors.background.paper}, 
    ${props => props.theme.colors.primary.light}
  );
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
`;

const SectionHeader = styled.div`
  text-align: center;
  max-width: 48rem;
  margin: 0 auto 4rem auto;
`;

const SectionTitle = styled.h2`
  font-size: 2.25rem;
  @media (min-width: 768px) {
    font-size: 2.5rem;
  }
  font-weight: ${props => props.theme.typography.fontWeightBold};
  margin-bottom: 1rem;
  color: ${props => props.theme.colors.text.primary};
`;

const SectionDescription = styled.p`
  font-size: 1.125rem;
  color: ${props => props.theme.colors.text.secondary};
  line-height: 1.6;
`;

const ServiceGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  
  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
  
  @media (min-width: 1024px) {
    grid-template-columns: 1fr 1fr 1fr;
  }
`;

const StyledCard = styled(Card)`
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(4px);
  border: none;
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-4px);
  }
`;

const IconContainer = styled.div<{ $color: string }>`
  width: 3rem;
  height: 3rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  background-color: ${props => {
    switch(props.$color) {
      case 'blue': return 'rgba(59, 130, 246, 0.1)';
      case 'purple': return 'rgba(139, 92, 246, 0.1)';
      case 'pink': return 'rgba(236, 72, 153, 0.1)';
      case 'amber': return 'rgba(245, 158, 11, 0.1)';
      case 'indigo': return 'rgba(99, 102, 241, 0.1)';
      case 'green': return 'rgba(16, 185, 129, 0.1)';
      default: return 'rgba(59, 130, 246, 0.1)';
    }
  }};
  color: ${props => {
    switch(props.$color) {
      case 'blue': return '#3b82f6';
      case 'purple': return '#8b5cf6';
      case 'pink': return '#ec4899';
      case 'amber': return '#f59e0b';
      case 'indigo': return '#6366f1';
      case 'green': return '#10b981';
      default: return '#3b82f6';
    }
  }};
`;

const DividerContainer = styled.div`
  position: relative;
  margin-top: 4rem;
`;

const Divider = styled.div`
  position: absolute;
  top: 50%;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    ${props => props.theme.colors.text.secondary}20,
    transparent
  );
`;

const DividerText = styled.div`
  position: relative;
  text-align: center;
  
  span {
    display: inline-block;
    background: linear-gradient(to bottom right, 
      ${props => props.theme.colors.background.paper}, 
      ${props => props.theme.colors.primary.light}
    );
    padding: 0.5rem 1.5rem;
    color: ${props => props.theme.colors.primary.main};
    font-weight: ${props => props.theme.typography.fontWeightMedium};
    font-size: 0.875rem;
  }
`;

const KeyAreas: React.FC = () => {
  const { currentTheme } = useTheme();
  
  const areas = [
    {
      title: "Digital Transformation",
      description: "Implement comprehensive digital strategies to evolve your business models, processes, and customer interactions.",
      icon: <Rocket size={24} />,
      color: "blue"
    },
    {
      title: "AI Transformation",
      description: "Leverage artificial intelligence to optimize operations, create intelligent products, and deliver data-driven insights.",
      icon: <Brain size={24} />,
      color: "purple"
    },
    {
      title: "Technology Consulting",
      description: "Expert guidance on technology strategy, architecture, and implementation to drive business value and innovation.",
      icon: <RefreshCw size={24} />,
      color: "pink"
    },
    {
      title: "Solution Discovery",
      description: "Collaborative exploration of business challenges to identify the most effective technology solutions.",
      icon: <Search size={24} />,
      color: "amber"
    },
    {
      title: "Digital Platforms",
      description: "Build robust, scalable digital platforms that create new revenue streams and improve operational efficiency.",
      icon: <Layers size={24} />,
      color: "indigo"
    },
    {
      title: "Customer Experience",
      description: "Design and implement customer-centric digital experiences that drive engagement, loyalty, and business growth.",
      icon: <Users size={24} />,
      color: "green"
    }
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
      <SectionContainer id="key-areas" theme={currentTheme}>
      <Container>
        <SectionHeader>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <SectionTitle theme={currentTheme}>Key Service Areas</SectionTitle>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <SectionDescription theme={currentTheme}>
              Our leadership services drive transformation across these critical business dimensions
            </SectionDescription>
          </motion.div>
        </SectionHeader>
        
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          <ServiceGrid>
            {areas.map((area, index) => (
              <motion.div key={index} variants={item}>
                <StyledCard>
                  <CardHeader>
                    <IconContainer $color={area.color}>
                      {area.icon}
                    </IconContainer>
                    <CardTitle>{area.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{area.description}</CardDescription>
                  </CardContent>
                </StyledCard>
              </motion.div>
            ))}
          </ServiceGrid>
        </motion.div>

        {/* Divider Element */}
        <DividerContainer>
          <Divider theme={currentTheme} />
          <DividerText theme={currentTheme}>
            <span style={{ fontSize: '24px', fontWeight: 'bold' }}>Where Technology Meets Strategy</span>
          </DividerText>
        </DividerContainer>
      </Container>
    </SectionContainer>
  );
};

export default KeyAreas;