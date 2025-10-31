// src/components/vikuna/LeadershipServices.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { Brain, BarChart3, ArrowRight, Users, Target, Zap } from 'lucide-react';
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
  max-width: 80rem;
  margin: 0 auto 4rem auto;
  
  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const CapabilitiesGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  margin-top: 3rem;
  
  @media (min-width: 768px) {
    grid-template-columns: repeat(3, 1fr);
  }
`;

const IconContainer = styled.div<{ $color: string }>`
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 0.75rem;
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
  font-weight: ${props => props.theme.typography.fontWeightMedium};
`;

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const FeatureItem = styled.li<{ $color: string }>`
  display: flex;
  align-items: flex-start;
  font-size: 0.9rem;
  color: ${props => props.theme.colors.text.secondary};
  
  &::before {
    content: "→";
    margin-right: 0.75rem;
    margin-top: 0.125rem;
    color: ${props => props.$color === 'blue' ? props.theme.colors.primary.main : '#8b5cf6'};
    font-weight: bold;
  }
`;

const ValueProposition = styled.div`
  background: linear-gradient(135deg, ${props => props.theme.colors.primary.light}, rgba(139, 92, 246, 0.1));
  padding: 2rem;
  border-radius: ${props => props.theme.borderRadius.large};
  margin: 3rem 0;
  text-align: center;
`;

const ValueTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: ${props => props.theme.typography.fontWeightBold};
  color: ${props => props.theme.colors.text.primary};
  margin-bottom: 1rem;
`;

const ValueDescription = styled.p`
  font-size: 1.125rem;
  color: ${props => props.theme.colors.text.secondary};
  line-height: 1.6;
  max-width: 48rem;
  margin: 0 auto;
`;

const CapabilityCard = styled.div`
  background-color: ${props => props.theme.colors.background.paper};
  border-radius: ${props => props.theme.borderRadius.medium};
  padding: 1.5rem;
  border: 1px solid rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
  
  &:hover {
    transform: translateY(-2px);
    box-shadow: ${props => props.theme.shadows.medium};
  }
`;

const CapabilityIcon = styled.div<{ $color: string }>`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  background-color: ${props => {
    switch(props.$color) {
      case 'blue': return 'rgba(59, 130, 246, 0.1)';
      case 'purple': return 'rgba(139, 92, 246, 0.1)';
      case 'orange': return 'rgba(249, 115, 22, 0.1)';
      default: return 'rgba(59, 130, 246, 0.1)';
    }
  }};
  color: ${props => {
    switch(props.$color) {
      case 'blue': return '#3b82f6';
      case 'purple': return '#8b5cf6';
      case 'orange': return '#f97316';
      default: return '#3b82f6';
    }
  }};
`;

const CapabilityTitle = styled.h4`
  font-size: 1.125rem;
  font-weight: ${props => props.theme.typography.fontWeightMedium};
  color: ${props => props.theme.colors.text.primary};
  margin-bottom: 0.5rem;
`;

const CapabilityDescription = styled.p`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text.secondary};
  line-height: 1.5;
`;

const LeadershipServices: React.FC = () => {
  const { currentTheme } = useTheme();
  
  const executiveServices = [
    {
      title: "CDO as a Service",
      fullTitle: "Chief Digital Officer",
      description: "Strategic digital leadership and transformation guidance for organizations requiring C-suite digital expertise without full-time executive overhead.",
      icon: <BarChart3 size={32} />,
      features: [
        "Digital Strategy & Vision Development",
        "Technology Roadmap & Architecture",
        "Digital Culture & Change Management",
        "Stakeholder Alignment & Communication",
        "Performance Metrics & ROI Tracking"
      ],
      color: "blue"
    },
    {
      title: "CAiO as a Service",
      fullTitle: "Chief AI Officer",
      description: "Executive AI leadership to drive innovation and transformation with measurable business outcomes through strategic AI implementation and governance.",
      icon: <Brain size={32} />,
      features: [
        "AI Strategy & Implementation Roadmap",
        "Process Automation & Optimization",
        "Data-Driven Decision Frameworks",
        "AI Governance & Ethics Framework",
        "Machine Learning Operations Setup"
      ],
      color: "purple"
    }
  ];

  const transformationCapabilities = [
    {
      title: "Process Intelligence",
      description: "Advanced process mining and optimization using data-driven methodologies",
      icon: <Target size={20} />,
      color: "blue"
    },
    {
      title: "Data Storytelling",
      description: "Transform complex data into compelling business narratives and actionable insights",
      icon: <BarChart3 size={20} />,
      color: "purple"
    },
    {
      title: "Change Leadership",
      description: "Guide organizational transformation with proven change management frameworks",
      icon: <Users size={20} />,
      color: "orange"
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
    <SectionContainer id="executive-leadership" theme={currentTheme}>
      <Container>
        <SectionHeader>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <SubHeading theme={currentTheme}>EXECUTIVE LEADERSHIP</SubHeading>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <SectionTitle theme={currentTheme}>C-Suite Expertise On-Demand</SectionTitle>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <SectionDescription theme={currentTheme}>
              Access C-level digital and AI leadership expertise without the overhead of full-time executives. 
              Our fractional leadership model provides strategic direction and hands-on implementation 
              to accelerate your transformation journey.
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
            {executiveServices.map((service, index) => (
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

        <ValueProposition theme={currentTheme}>
          <ValueTitle theme={currentTheme}>
            How We Deliver Transformation Success
          </ValueTitle>
          <ValueDescription theme={currentTheme}>
            Our approach combines strategic thinking with hands-on implementation expertise. 
            We provide executive-level guidance (including fractional CDO/CAiO services) to ensure 
            your transformation initiatives deliver measurable results within 90 days.
          </ValueDescription>
        </ValueProposition>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          id="transformation-capabilities"
        >
          <SectionHeader style={{ marginBottom: '2rem' }}>
            <SectionTitle theme={currentTheme} style={{ fontSize: '2rem', marginBottom: '1rem' }}>
              Transformation Capabilities
            </SectionTitle>
            <SectionDescription theme={currentTheme}>
              Our executive leaders leverage specialized methodologies to drive transformation success
            </SectionDescription>
          </SectionHeader>

          <CapabilitiesGrid>
            {transformationCapabilities.map((capability, index) => (
              <motion.div
                key={index}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
              >
                <CapabilityCard theme={currentTheme}>
                  <CapabilityIcon $color={capability.color}>
                    {capability.icon}
                  </CapabilityIcon>
                  <CapabilityTitle theme={currentTheme}>{capability.title}</CapabilityTitle>
                  <CapabilityDescription theme={currentTheme}>{capability.description}</CapabilityDescription>
                </CapabilityCard>
              </motion.div>
            ))}
          </CapabilitiesGrid>
        </motion.div>
      </Container>
    </SectionContainer>
  );
};

export default LeadershipServices;