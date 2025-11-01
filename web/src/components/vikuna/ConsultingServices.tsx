// src/components/vikuna/ConsultingServices.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { Brain, BarChart3, Users, Target, GraduationCap, Lightbulb, ArrowRight } from 'lucide-react';

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
  background-color: ${props => safeColor(props.theme, 'colors.background.default', '#F2F4F7')};
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

const Badge = styled.span`
  display: inline-block;
  padding: 0.5rem 1rem;
  background: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')}15;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  border-radius: 100px;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  margin-bottom: 1rem;
  border: 1px solid ${props => safeColor(props.theme, 'colors.primary.main', '#003366')}30;
`;

const SectionTitle = styled.h2`
  font-size: 2.5rem;
  @media (min-width: 768px) {
    font-size: 3rem;
  }
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  margin-bottom: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};

  span {
    color: ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
  }
`;

const SectionDescription = styled.p`
  font-size: 1.25rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  line-height: 1.7;
`;

const ServicesGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  margin-bottom: 4rem;

  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const ServiceCard = styled.div`
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border-radius: 16px;
  padding: 2.5rem;
  box-shadow: 0 4px 12px rgba(0, 51, 102, 0.08);
  border-left: 4px solid ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 8px 24px rgba(0, 51, 102, 0.12);
  }
`;

const IconContainer = styled.div`
  width: 3.5rem;
  height: 3.5rem;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1.5rem;
  background: ${props => safeColor(props.theme, 'colors.success.main', '#006688')}15;
  color: ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
`;

const ServiceTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: 600;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};
  margin-bottom: 0.5rem;
`;

const ServiceSubtitle = styled.div`
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  margin-bottom: 1rem;
  font-weight: 500;
`;

const ServiceDescription = styled.p`
  font-size: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  line-height: 1.6;
  margin-bottom: 1.5rem;
`;

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
`;

const FeatureItem = styled.li`
  display: flex;
  align-items: flex-start;
  font-size: 0.9rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};

  &::before {
    content: "→";
    margin-right: 0.75rem;
    margin-top: 0.125rem;
    color: ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
    font-weight: bold;
  }
`;

const CapabilitiesSection = styled.div`
  background: linear-gradient(135deg,
    ${props => safeColor(props.theme, 'colors.primary.light', '#a0c1d6')}30,
    ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')}
  );
  border-radius: 16px;
  padding: 3rem 2.5rem;
  margin-top: 3rem;
`;

const CapabilitiesHeader = styled.div`
  text-align: center;
  margin-bottom: 2.5rem;
`;

const CapabilitiesTitle = styled.h3`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  margin-bottom: 0.75rem;
`;

const CapabilitiesSubtitle = styled.p`
  font-size: 1.125rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
`;

const CapabilitiesGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;

  @media (min-width: 768px) {
    grid-template-columns: repeat(3, 1fr);
  }
`;

const CapabilityCard = styled.div`
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border-radius: 12px;
  padding: 1.5rem;
  border: 1px solid ${props => safeColor(props.theme, 'colors.primary.light', '#a0c1d6')}40;
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 51, 102, 0.1);
  }
`;

const CapabilityIcon = styled.div`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  background: ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')}15;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
`;

const CapabilityTitle = styled.h4`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};
  margin-bottom: 0.5rem;
`;

const CapabilityDescription = styled.p`
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  line-height: 1.5;
`;

const TrainingSection = styled.div`
  margin-top: 4rem;
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border-radius: 16px;
  padding: 3rem 2.5rem;
  border: 2px solid ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')}30;
`;

const TrainingHeader = styled.div`
  text-align: center;
  margin-bottom: 2.5rem;
`;

const TrainingTitle = styled.h3`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  margin-bottom: 0.75rem;

  span {
    color: ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')};
  }
`;

const TrainingDescription = styled.p`
  font-size: 1.125rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
`;

const TrainingGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;

  @media (min-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const TrainingCard = styled.div`
  padding: 1.5rem;
  border-radius: 12px;
  background: ${props => safeColor(props.theme, 'colors.background.default', '#F2F4F7')};
  border-left: 3px solid ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')};
`;

const TrainingCardTitle = styled.h4`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};
  margin-bottom: 0.5rem;
`;

const TrainingCardDescription = styled.p`
  font-size: 0.9rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  line-height: 1.6;
`;

const CTAContainer = styled.div`
  text-align: center;
  margin-top: 4rem;
`;

const PrimaryButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 2.5rem;
  background: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  color: ${props => safeColor(props.theme, 'colors.secondary.contrastText', '#FFFFFF')};
  font-weight: 600;
  font-size: 1.125rem;
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.3s ease;
  box-shadow: 0 4px 16px ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')}40;

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.secondary.dark', '#e55a4a')};
    transform: translateY(-2px);
    box-shadow: 0 8px 24px ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')}60;
  }
`;

const ConsultingServices: React.FC = () => {
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
      ]
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
      ]
    }
  ];

  const transformationCapabilities = [
    {
      title: "Process Intelligence",
      description: "Advanced process mining and optimization using data-driven methodologies",
      icon: <Target size={20} />
    },
    {
      title: "Data Storytelling",
      description: "Transform complex data into compelling business narratives and actionable insights",
      icon: <BarChart3 size={20} />
    },
    {
      title: "Change Leadership",
      description: "Guide organizational transformation with proven change management frameworks",
      icon: <Users size={20} />
    }
  ];

  const trainingPrograms = [
    {
      title: "Executive AI Leadership",
      description: "Strategic AI understanding for C-suite and senior leaders to drive organizational AI adoption"
    },
    {
      title: "Data Literacy for Teams",
      description: "Build data-driven culture with practical analytics and decision-making skills across your organization"
    },
    {
      title: "Digital Transformation Bootcamp",
      description: "Hands-on training for transformation leaders covering strategy, technology, and change management"
    },
    {
      title: "AI/ML Implementation Workshop",
      description: "Technical deep-dive for product and engineering teams implementing AI solutions"
    }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.15
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <SectionContainer id="consulting-services" theme={currentTheme}>
      <Container>
        <SectionHeader>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Badge theme={currentTheme}>SERVICE #1</Badge>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <SectionTitle theme={currentTheme}>
              <span>Consulting</span> Services
            </SectionTitle>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <SectionDescription theme={currentTheme}>
              Access C-level digital and AI leadership expertise without the overhead of full-time executives.
              Our fractional leadership model provides strategic direction, hands-on implementation, and skill building
              to accelerate your transformation journey.
            </SectionDescription>
          </motion.div>
        </SectionHeader>

        {/* Executive Leadership Services */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          <ServicesGrid>
            {executiveServices.map((service, index) => (
              <motion.div key={index} variants={itemVariants}>
                <ServiceCard theme={currentTheme}>
                  <IconContainer theme={currentTheme}>
                    {service.icon}
                  </IconContainer>
                  <ServiceTitle theme={currentTheme}>{service.title}</ServiceTitle>
                  <ServiceSubtitle theme={currentTheme}>{service.fullTitle}</ServiceSubtitle>
                  <ServiceDescription theme={currentTheme}>
                    {service.description}
                  </ServiceDescription>
                  <FeatureList>
                    {service.features.map((feature, idx) => (
                      <FeatureItem key={idx} theme={currentTheme}>
                        {feature}
                      </FeatureItem>
                    ))}
                  </FeatureList>
                </ServiceCard>
              </motion.div>
            ))}
          </ServicesGrid>
        </motion.div>

        {/* Transformation Capabilities */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
        >
          <CapabilitiesSection theme={currentTheme}>
            <CapabilitiesHeader>
              <CapabilitiesTitle theme={currentTheme}>
                How We Deliver Transformation Success
              </CapabilitiesTitle>
              <CapabilitiesSubtitle theme={currentTheme}>
                Our executive leaders leverage specialized methodologies to drive measurable results
              </CapabilitiesSubtitle>
            </CapabilitiesHeader>

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
                    <CapabilityIcon theme={currentTheme}>
                      {capability.icon}
                    </CapabilityIcon>
                    <CapabilityTitle theme={currentTheme}>{capability.title}</CapabilityTitle>
                    <CapabilityDescription theme={currentTheme}>
                      {capability.description}
                    </CapabilityDescription>
                  </CapabilityCard>
                </motion.div>
              ))}
            </CapabilitiesGrid>
          </CapabilitiesSection>
        </motion.div>

        {/* Training & Skill Building */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          <TrainingSection theme={currentTheme}>
            <TrainingHeader>
              <TrainingTitle theme={currentTheme}>
                Training & <span>Skill Building</span>
              </TrainingTitle>
              <TrainingDescription theme={currentTheme}>
                Build lasting capability in your organization through practical, results-oriented training programs
              </TrainingDescription>
            </TrainingHeader>

            <TrainingGrid>
              {trainingPrograms.map((program, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: index * 0.1 }}
                >
                  <TrainingCard theme={currentTheme}>
                    <TrainingCardTitle theme={currentTheme}>{program.title}</TrainingCardTitle>
                    <TrainingCardDescription theme={currentTheme}>
                      {program.description}
                    </TrainingCardDescription>
                  </TrainingCard>
                </motion.div>
              ))}
            </TrainingGrid>
          </TrainingSection>
        </motion.div>

        {/* CTA */}
        <CTAContainer>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            <PrimaryButton href="#contact" theme={currentTheme}>
              Discuss Your Transformation Needs
              <ArrowRight size={20} />
            </PrimaryButton>
          </motion.div>
        </CTAContainer>
      </Container>
    </SectionContainer>
  );
};

export default ConsultingServices;
