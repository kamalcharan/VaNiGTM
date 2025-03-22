// src/components/vikuna/LeadershipServices.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { Brain, BarChart3, ArrowRight } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Styled components
const SectionContainer = styled.section`
  padding: 5rem 0;
  background-color: ${props => props.theme.colors.background.default};
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

const SubHeading = styled.span`
  color: ${props => props.theme.colors.primary.main};
  font-weight: ${props => props.theme.typography.fontWeightMedium};
  font-size: 0.875rem;
`;

const SectionTitle = styled.h2`
  font-size: 2.25rem;
  @media (min-width: 768px) {
    font-size: 2.5rem;
  }
  font-weight: ${props => props.theme.typography.fontWeightBold};
  margin: 0.5rem 0 1rem;
  color: ${props => props.theme.colors.text.primary};
`;

const SectionDescription = styled.p`
  font-size: 1.125rem;
  color: ${props => props.theme.colors.text.secondary};
  line-height: 1.6;
`;

const ServicesGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  max-width: 64rem;
  margin: 0 auto;
  
  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const IconContainer = styled.div<{ $color: string }>`
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  background-color: ${props => props.$color === 'blue' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(139, 92, 246, 0.1)'};
  color: ${props => props.$color === 'blue' ? props.theme.colors.primary.main : '#8b5cf6'};
`;

const ServiceSubtitle = styled.div`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text.secondary};
  margin-bottom: 0.5rem;
`;

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const FeatureItem = styled.li<{ $color: string }>`
  display: flex;
  align-items: flex-start;
  
  &::before {
    content: "→";
    margin-right: 0.5rem;
    margin-top: 0.125rem;
    color: ${props => props.$color === 'blue' ? props.theme.colors.primary.main : '#8b5cf6'};
  }
`;

const LeadershipServices: React.FC = () => {
  const { currentTheme } = useTheme();
  
  const leadershipServices = [
    {
      title: "CDO as a Service",
      fullTitle: "Chief Digital Officer",
      description: "Strategic digital leadership and transformation guidance for organizations lacking in-house Chief Digital Officer (CDO) capabilities.",
      icon: <BarChart3 size={32} />,
      features: [
        "Digital Strategy Development",
        "Technology Roadmap",
        "Change Management",
        "Digital Leadership Coaching"
      ],
      color: "blue"
    },
    {
      title: "CAiO as a Service",
      fullTitle: "Chief AI Officer",
      description: "Expert AI leadership to drive innovation and transformation with measurable business outcomes through Chief AI Officer (CAiO) expertise without the overhead.",
      icon: <Brain size={32} />,
      features: [
        "AI Strategy & Implementation",
        "Process Automation",
        "Data-Driven Decision Making",
        "AI Governance & Ethics"
      ],
      color: "purple"
    }
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <SectionContainer id="leadership-services" theme={currentTheme}>
      <Container>
        <SectionHeader>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <SubHeading theme={currentTheme}>OUR SERVICES</SubHeading>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <SectionTitle theme={currentTheme}>Leadership as a Service</SectionTitle>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <SectionDescription theme={currentTheme}>
              Drive your digital transformation with executive-level expertise without 
              the full-time costs. Our leadership services provide strategic direction and 
              hands-on implementation to accelerate your digital journey.
            </SectionDescription>
          </motion.div>
        </SectionHeader>

        <motion.div 
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          <ServicesGrid>
            {leadershipServices.map((service, index) => (
              <motion.div key={index} variants={item}>
                <Card 
                  borderTopColor={service.color === 'blue' ? currentTheme.colors.primary.main : '#8b5cf6'}
                >
                  <CardHeader>
                    <IconContainer $color={service.color} theme={currentTheme}>
                      {service.icon}
                    </IconContainer>
                    <CardTitle>{service.title}</CardTitle>
                    <ServiceSubtitle theme={currentTheme}>{service.fullTitle}</ServiceSubtitle>
                    <CardDescription>{service.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <FeatureList>
                      {service.features.map((feature, idx) => (
                        <FeatureItem key={idx} $color={service.color} theme={currentTheme}>
                          {feature}
                        </FeatureItem>
                      ))}
                    </FeatureList>
                  </CardContent>
                  <CardFooter>
                    <Button 
                      variant="ghost"
                      textColor={service.color === 'blue' ? currentTheme.colors.primary.main : '#8b5cf6'}
                      hoverColor={service.color === 'blue' ? currentTheme.colors.primary.dark : '#7c3aed'}
                    >
                      Learn More <ArrowRight size={16} style={{ marginLeft: '0.5rem' }} />
                    </Button>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </ServicesGrid>
        </motion.div>
      </Container>
    </SectionContainer>
  );
};

export default LeadershipServices;