// src/components/vikuna/ProductDevelopmentServices.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { Zap, Target, Rocket, Code, TrendingUp, Clock, Calendar, ExternalLink, ArrowRight } from 'lucide-react';
import ContractNestIcon from './icons/ContractNestIcon';
import FamilyKnowsIcon from './icons/FamilyKnowsIcon';

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
    background: radial-gradient(circle at 80% 50%,
      ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')}08,
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
  background: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')}15;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  border-radius: 100px;
  font-size: 0.875rem;
  font-weight: 600;
  letter-spacing: 0.5px;
  margin-bottom: 1rem;
  border: 1px solid ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')}30;
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
    color: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  }
`;

const SectionDescription = styled.p`
  font-size: 1.25rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  line-height: 1.7;
`;

const Divider = styled.div`
  height: 1px;
  background: linear-gradient(
    to right,
    transparent,
    ${props => safeColor(props.theme, 'colors.text.disabled', '#d1d5db')}40,
    transparent
  );
  margin: 4rem 0;
`;

// MVP Section Styles
const MVPGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 4rem;
  align-items: center;
  margin-bottom: 4rem;

  @media (min-width: 968px) {
    grid-template-columns: 1.2fr 1fr;
    gap: 5rem;
  }
`;

const MVPFeaturesContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
`;

const MVPFeatureCard = styled.div`
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  padding: 1.5rem;
  border-radius: 12px;
  border-left: 4px solid ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  box-shadow: 0 4px 12px rgba(0, 51, 102, 0.08);
  transition: all 0.3s ease;

  &:hover {
    transform: translateX(8px);
    box-shadow: 0 8px 24px rgba(0, 51, 102, 0.12);
  }
`;

const MVPFeatureHeader = styled.div`
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-bottom: 0.75rem;
`;

const MVPFeatureIcon = styled.div`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')}15;
  color: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  flex-shrink: 0;
`;

const MVPFeatureTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: 600;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};
  margin: 0;
`;

const MVPFeatureDescription = styled.p`
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
  border: 1px solid ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')}20;
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
  background: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  color: white;
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
  color: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  font-weight: 500;
`;

const StepDescription = styled.p`
  font-size: 0.9rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  line-height: 1.5;
  margin: 0.5rem 0 0 0;
`;

// Products Showcase Styles
const ProductsSection = styled.div`
  margin-top: 4rem;
`;

const ProductsHeader = styled.div`
  text-align: center;
  margin-bottom: 3rem;
`;

const ProductsTitle = styled.h3`
  font-size: 2rem;
  font-weight: 700;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  margin-bottom: 0.75rem;
`;

const ProductsSubtitle = styled.p`
  font-size: 1.125rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
`;

const ProductsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 3rem;

  @media (min-width: 968px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const ProductCard = styled.div`
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 8px 24px rgba(0, 51, 102, 0.1);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-8px);
    box-shadow: 0 12px 32px rgba(0, 51, 102, 0.15);
  }
`;

const ProductImage = styled.div`
  background: linear-gradient(135deg,
    ${props => safeColor(props.theme, 'colors.primary.main', '#003366')},
    ${props => safeColor(props.theme, 'colors.success.main', '#006688')}
  );
  padding: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  position: relative;
`;

const LaunchBadge = styled.div<{ status: string }>`
  position: absolute;
  top: 1rem;
  right: 1rem;
  padding: 0.5rem 1rem;
  background: ${props => props.status === 'launching'
    ? safeColor(props.theme, 'colors.secondary.main', '#FF6F61')
    : safeColor(props.theme, 'colors.info.main', '#36f2fa')};
  color: white;
  border-radius: 100px;
  font-size: 0.75rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.5rem;
`;

const ProductContent = styled.div`
  padding: 2rem;
`;

const ProductTitle = styled.h4`
  font-size: 1.75rem;
  font-weight: 700;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  margin-bottom: 0.5rem;
`;

const ProductTagline = styled.p`
  font-size: 1.125rem;
  font-weight: 600;
  color: ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
  margin-bottom: 1rem;
`;

const ProductDescription = styled.p`
  font-size: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  line-height: 1.6;
  margin-bottom: 1.5rem;
`;

const ProblemStats = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding: 1rem;
  background: ${props => safeColor(props.theme, 'colors.background.default', '#F2F4F7')};
  border-radius: 8px;
`;

const StatItem = styled.div`
  display: flex;
  flex-direction: column;

  .stat-number {
    font-size: 1.5rem;
    font-weight: 700;
    color: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  }

  .stat-label {
    font-size: 0.875rem;
    color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  }
`;

const FeaturesList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 1.5rem 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const FeatureItem = styled.li`
  display: flex;
  align-items: center;
  font-size: 0.9rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};

  &::before {
    content: "✓";
    margin-right: 0.75rem;
    color: ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
    font-weight: bold;
  }
`;

const PrimaryButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.75rem;
  background: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  color: white;
  font-weight: 600;
  border-radius: 8px;
  text-decoration: none;
  transition: all 0.3s ease;
  width: 100%;
  justify-content: center;

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.secondary.dark', '#e55a4a')};
    transform: translateY(-2px);
  }
`;

const SecondaryButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1.75rem;
  background: transparent;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  font-weight: 600;
  border-radius: 8px;
  border: 2px solid ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  text-decoration: none;
  transition: all 0.3s ease;
  width: 100%;
  justify-content: center;

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
    color: white;
  }
`;

const CTAContainer = styled.div`
  text-align: center;
  margin-top: 4rem;
`;

const MainCTAButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 1rem 2.5rem;
  background: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  color: white;
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

const ProductDevelopmentServices: React.FC = () => {
  const { currentTheme } = useTheme();

  const mvpFeatures = [
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
    <SectionContainer id="product-development" theme={currentTheme}>
      <Container>
        <SectionHeader>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <Badge theme={currentTheme}>SERVICE #2</Badge>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <SectionTitle theme={currentTheme}>
              <span>Product Development</span> Services
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
              Our proven MVP process gets you to market in 60 days with production-ready foundations.
            </SectionDescription>
          </motion.div>
        </SectionHeader>

        {/* MVP Building Section */}
        <MVPGrid>
          {/* Features Column */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            <MVPFeaturesContainer>
              {mvpFeatures.map((feature, index) => (
                <motion.div key={index} variants={itemVariants}>
                  <MVPFeatureCard theme={currentTheme}>
                    <MVPFeatureHeader>
                      <MVPFeatureIcon theme={currentTheme}>
                        {feature.icon}
                      </MVPFeatureIcon>
                      <MVPFeatureTitle theme={currentTheme}>{feature.title}</MVPFeatureTitle>
                    </MVPFeatureHeader>
                    <MVPFeatureDescription theme={currentTheme}>
                      {feature.description}
                    </MVPFeatureDescription>
                  </MVPFeatureCard>
                </motion.div>
              ))}
            </MVPFeaturesContainer>
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
        </MVPGrid>

        <Divider theme={currentTheme} />

        {/* Products We've Developed */}
        <ProductsSection>
          <ProductsHeader>
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <ProductsTitle theme={currentTheme}>
                Products We've Developed
              </ProductsTitle>
              <ProductsSubtitle theme={currentTheme}>
                Real products, real impact. Here's what we've built using this same proven process.
              </ProductsSubtitle>
            </motion.div>
          </ProductsHeader>

          <ProductsGrid>
            {/* ContractNest */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <ProductCard theme={currentTheme}>
                <ProductImage theme={currentTheme}>
                  <LaunchBadge status="launching" theme={currentTheme}>
                    <Calendar size={14} />
                    Nov 22 Launch
                  </LaunchBadge>
                  <ContractNestIcon style={{ width: '120px', height: '120px' }} />
                </ProductImage>
                <ProductContent>
                  <ProductTitle theme={currentTheme}>ContractNest</ProductTitle>
                  <ProductTagline theme={currentTheme}>
                    Turn Service Commitments Into Profitable Relationships
                  </ProductTagline>
                  <ProductDescription theme={currentTheme}>
                    Transform scattered service agreements into an automated, collaborative exchange.
                    From healthcare equipment maintenance to manufacturing service contracts—digitize,
                    automate, and scale your service relationships.
                  </ProductDescription>

                  <ProblemStats theme={currentTheme}>
                    <StatItem theme={currentTheme}>
                      <span className="stat-number">65%</span>
                      <span className="stat-label">Service contracts not digitized</span>
                    </StatItem>
                    <StatItem theme={currentTheme}>
                      <span className="stat-number">50%</span>
                      <span className="stat-label">SLA breaches due to poor tracking</span>
                    </StatItem>
                    <StatItem theme={currentTheme}>
                      <span className="stat-number">2.5h</span>
                      <span className="stat-label">Daily on manual contract admin</span>
                    </StatItem>
                  </ProblemStats>

                  <PrimaryButton href="https://www.contractnest.com" target="_blank" theme={currentTheme}>
                    Visit ContractNest
                    <ExternalLink size={16} />
                  </PrimaryButton>
                </ProductContent>
              </ProductCard>
            </motion.div>

            {/* Family Knows */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.1 }}
            >
              <ProductCard theme={currentTheme}>
                <ProductImage theme={currentTheme}>
                  <LaunchBadge status="coming-soon" theme={currentTheme}>
                    <Calendar size={14} />
                    2026 Launch
                  </LaunchBadge>
                  <FamilyKnowsIcon style={{ width: '120px', height: '120px' }} />
                </ProductImage>
                <ProductContent>
                  <ProductTitle theme={currentTheme}>Family Knows</ProductTitle>
                  <ProductTagline theme={currentTheme}>
                    Your Family's Digital Vault & Asset Manager
                  </ProductTagline>
                  <ProductDescription theme={currentTheme}>
                    Empowers families to organize, access, and manage critical asset information,
                    documentation, and service history—anytime, anywhere. Smart AI minimizes manual
                    entry while family collaboration keeps everyone connected to what matters most.
                  </ProductDescription>

                  <FeaturesList>
                    <FeatureItem theme={currentTheme}>Secure digital vault for family documents</FeatureItem>
                    <FeatureItem theme={currentTheme}>AI-powered asset organization</FeatureItem>
                    <FeatureItem theme={currentTheme}>Family collaboration & access control</FeatureItem>
                    <FeatureItem theme={currentTheme}>Service history tracking</FeatureItem>
                    <FeatureItem theme={currentTheme}>Mobile-first design</FeatureItem>
                  </FeaturesList>

                  <SecondaryButton href="#contact" theme={currentTheme}>
                    Join Waitlist
                    <ArrowRight size={16} />
                  </SecondaryButton>
                </ProductContent>
              </ProductCard>
            </motion.div>
          </ProductsGrid>
        </ProductsSection>

        {/* CTA */}
        <CTAContainer>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.5 }}
          >
            <MainCTAButton href="#contact" theme={currentTheme}>
              Start Your Product Journey
              <Rocket size={20} />
            </MainCTAButton>
          </motion.div>
        </CTAContainer>
      </Container>
    </SectionContainer>
  );
};

export default ProductDevelopmentServices;
