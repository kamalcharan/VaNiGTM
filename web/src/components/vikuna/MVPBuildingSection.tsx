// src/components/vikuna/MVPBuildingSection.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { Zap, Target, Rocket, CheckCircle, ArrowRight, Clock, Code, TrendingUp } from 'lucide-react';

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
  background: linear-gradient(135deg,
    ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')} 0%,
    ${props => safeColor(props.theme, 'colors.background.default', '#F2F4F7')} 50%,
    ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')} 100%
  );
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: radial-gradient(circle at 20% 50%,
      ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')}08,
      transparent 50%
    );
    pointer-events: none;
  }
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
  position: relative;
  z-index: 1;
`;

const SectionHeader = styled.div`
  text-align: center;
  max-width: 48rem;
  margin: 0 auto 4rem auto;
`;

const Badge = styled.span`
  display: inline-block;
  padding: 0.5rem 1rem;
  background: ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')}15;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  border-radius: 100px;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  margin-bottom: 1rem;
  border: 1px solid ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')}30;
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
    background: linear-gradient(135deg,
      ${props => safeColor(props.theme, 'colors.success.main', '#006688')},
      ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')}
    );
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
`;

const SectionDescription = styled.p`
  font-size: 1.25rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  line-height: 1.7;
`;

const ContentGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 4rem;
  align-items: center;

  @media (min-width: 968px) {
    grid-template-columns: 1.2fr 1fr;
    gap: 5rem;
  }
`;

const FeaturesContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const FeatureCard = styled.div`
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  padding: 1.5rem;
  border-radius: 12px;
  border-left: 4px solid ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')};
  box-shadow: 0 4px 12px rgba(0, 51, 102, 0.08);
  transition: all 0.3s ease;

  &:hover {
    transform: translateX(8px);
    box-shadow: 0 8px 24px rgba(0, 51, 102, 0.12);
    border-left-color: ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
  }
`;

const FeatureHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
`;

const FeatureIcon = styled.div`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')}15;
  color: ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
  flex-shrink: 0;
`;

const FeatureTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};
  margin: 0;
`;

const FeatureDescription = styled.p`
  font-size: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  line-height: 1.6;
  margin: 0;
`;

const TimelineContainer = styled.div`
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  padding: 2.5rem;
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 51, 102, 0.1);
  border: 1px solid ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')}20;
`;

const TimelineHeader = styled.div`
  text-align: center;
  margin-bottom: 2rem;
`;

const TimelineTitle = styled.h3`
  font-size: 1.75rem;
  font-weight: 700;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  margin-bottom: 0.5rem;

  span {
    color: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  }
`;

const TimelineSubtitle = styled.p`
  font-size: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
`;

const TimelineSteps = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
`;

const TimelineStep = styled.div`
  display: flex;
  gap: 1rem;
  align-items: flex-start;
`;

const StepNumber = styled.div`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 50%;
  background: ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')};
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 1rem;
  flex-shrink: 0;
`;

const StepContent = styled.div`
  flex: 1;
`;

const StepTitle = styled.h4`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};
  margin-bottom: 0.25rem;
`;

const StepDuration = styled.span`
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
  font-weight: 500;
`;

const StepDescription = styled.p`
  font-size: 0.9rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  line-height: 1.5;
  margin: 0.5rem 0 0 0;
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

const StatsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2rem;
  margin-top: 4rem;
  padding-top: 4rem;
  border-top: 1px solid ${props => safeColor(props.theme, 'colors.text.disabled', '#d1d5db')}30;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
`;

const StatCard = styled.div`
  text-align: center;
`;

const StatValue = styled.div`
  font-size: 2.5rem;
  font-weight: 700;
  background: linear-gradient(135deg,
    ${props => safeColor(props.theme, 'colors.primary.main', '#003366')},
    ${props => safeColor(props.theme, 'colors.success.main', '#006688')}
  );
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 0.5rem;
`;

const StatLabel = styled.div`
  font-size: 0.9rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  font-weight: 500;
`;

const MVPBuildingSection: React.FC = () => {
  const { currentTheme } = useTheme();

  const features = [
    {
      icon: <Zap size={20} />,
      title: "Rapid Prototyping",
      description: "From concept to working prototype in weeks, not months. Validate your ideas quickly with real users and real data."
    },
    {
      icon: <Target size={20} />,
      title: "Market Validation",
      description: "Built-in analytics and feedback mechanisms to test assumptions and iterate based on real user behavior."
    },
    {
      icon: <Code size={20} />,
      title: "Production-Ready Architecture",
      description: "Start with scalable foundations. Our MVPs are built to grow with your business, not to be thrown away."
    },
    {
      icon: <TrendingUp size={20} />,
      title: "MVP to Scale",
      description: "Clear roadmap from MVP to full product. We build with your long-term vision in mind."
    }
  ];

  const timeline = [
    {
      week: "Weeks 1-2",
      title: "Discovery & Design",
      description: "Define core features, user flows, and technical architecture. Rapid wireframing and validation."
    },
    {
      week: "Weeks 3-6",
      title: "Build & Iterate",
      description: "Agile development sprints with weekly demos. Core functionality built and tested."
    },
    {
      week: "Weeks 7-8",
      title: "Test & Launch",
      description: "User acceptance testing, refinement, and production deployment. You're live!"
    },
    {
      week: "Week 9+",
      title: "Measure & Evolve",
      description: "Monitor analytics, gather feedback, and plan next iterations based on real data."
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
    <SectionContainer id="mvp-building" theme={currentTheme}>
      <Container>
        <SectionHeader>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Badge theme={currentTheme}>
              <Clock size={14} style={{ display: 'inline', marginRight: '0.5rem', verticalAlign: 'middle' }} />
              60-DAY MVP DELIVERY
            </Badge>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <SectionTitle theme={currentTheme}>
              From Idea to Market in <span>60 Days</span>
            </SectionTitle>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <SectionDescription theme={currentTheme}>
              Launch your product, validate your business model, and start learning from real customers—fast.
              Our proven MVP process gets you to market in 8-10 weeks with production-ready foundations.
            </SectionDescription>
          </motion.div>
        </SectionHeader>

        <ContentGrid>
          {/* Features Column */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            <FeaturesContainer>
              {features.map((feature, index) => (
                <motion.div key={index} variants={itemVariants}>
                  <FeatureCard theme={currentTheme}>
                    <FeatureHeader>
                      <FeatureIcon theme={currentTheme}>
                        {feature.icon}
                      </FeatureIcon>
                      <FeatureTitle theme={currentTheme}>{feature.title}</FeatureTitle>
                    </FeatureHeader>
                    <FeatureDescription theme={currentTheme}>
                      {feature.description}
                    </FeatureDescription>
                  </FeatureCard>
                </motion.div>
              ))}
            </FeaturesContainer>
          </motion.div>

          {/* Timeline Column */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
          >
            <TimelineContainer theme={currentTheme}>
              <TimelineHeader>
                <TimelineTitle theme={currentTheme}>
                  Your <span>60-Day</span> Journey
                </TimelineTitle>
                <TimelineSubtitle theme={currentTheme}>
                  Structured sprints, continuous delivery
                </TimelineSubtitle>
              </TimelineHeader>

              <TimelineSteps>
                {timeline.map((step, index) => (
                  <TimelineStep key={index}>
                    <StepNumber theme={currentTheme}>{index + 1}</StepNumber>
                    <StepContent>
                      <StepTitle theme={currentTheme}>
                        {step.title}
                      </StepTitle>
                      <StepDuration theme={currentTheme}>{step.week}</StepDuration>
                      <StepDescription theme={currentTheme}>
                        {step.description}
                      </StepDescription>
                    </StepContent>
                  </TimelineStep>
                ))}
              </TimelineSteps>
            </TimelineContainer>
          </motion.div>
        </ContentGrid>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
        >
          <StatsRow theme={currentTheme}>
            <StatCard>
              <StatValue theme={currentTheme}>60</StatValue>
              <StatLabel theme={currentTheme}>Days to Launch</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue theme={currentTheme}>100%</StatValue>
              <StatLabel theme={currentTheme}>Production Ready</StatLabel>
            </StatCard>
            <StatCard>
              <StatValue theme={currentTheme}>∞</StatValue>
              <StatLabel theme={currentTheme}>Scalability Potential</StatLabel>
            </StatCard>
          </StatsRow>
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
              Start Your MVP Journey
              <Rocket size={20} />
            </PrimaryButton>
          </motion.div>
        </CTAContainer>
      </Container>
    </SectionContainer>
  );
};

export default MVPBuildingSection;
