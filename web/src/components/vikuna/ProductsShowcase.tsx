// src/components/vikuna/ProductsShowcase.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { ExternalLink, ArrowRight, CheckCircle, Users, Calendar } from 'lucide-react';
import ContractNestIcon from './icons/ContractNestIcon';
import FamilyKnowsIcon from './icons/FamilyKnowsIcon';

const safeColor = (theme: any, path: string, fallback: string = '#000000'): string => {
  const parts = path.split('.');
  let current = theme;
  for (const part of parts) {
    if (current === undefined || current === null) return fallback;
    current = current[part];
  }
  return current || fallback;
};

const SectionContainer = styled.section`
  padding: 100px 0;
  background: ${props => safeColor(props.theme, 'colors.background.default', '#F2F4F7')};
  position: relative;
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 24px;
`;

const SectionHeader = styled.div`
  text-align: center;
  max-width: 800px;
  margin: 0 auto 60px;
`;

const Badge = styled(motion.div)`
  display: inline-block;
  background: ${props => safeColor(props.theme, 'colors.primary.light', '#a0c1d6')};
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  padding: 8px 20px;
  border-radius: 50px;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 16px;
`;

const Headline = styled(motion.h2)`
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 800;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};
  margin-bottom: 16px;
  line-height: 1.2;
`;

const Subheadline = styled(motion.p)`
  font-size: 1.25rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  line-height: 1.6;
`;

const ProductsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(500px, 1fr));
  gap: 40px;
  margin-bottom: 60px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ProductCard = styled(motion.div)`
  background: white;
  border-radius: 16px;
  overflow: hidden;
  box-shadow: 0 4px 20px rgba(0, 51, 102, 0.1);
  transition: all 0.3s ease;
  border: 2px solid ${props => safeColor(props.theme, 'colors.primary.light', '#a0c1d6')};

  &:hover {
    transform: translateY(-8px);
    box-shadow: 0 12px 40px rgba(0, 51, 102, 0.15);
    border-color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  }
`;

const ProductImage = styled.div`
  height: 280px;
  background: linear-gradient(135deg,
    ${props => safeColor(props.theme, 'colors.primary.main', '#003366')} 0%,
    ${props => safeColor(props.theme, 'colors.success.main', '#006688')} 100%
  );
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 4rem;
  padding: 40px;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: -50%;
    right: -50%;
    width: 200%;
    height: 200%;
    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
  }
`;

const LaunchBadge = styled.div<{ status: 'launching' | 'coming-soon' }>`
  position: absolute;
  top: 20px;
  right: 20px;
  background: ${props => props.status === 'launching'
    ? safeColor(props.theme, 'colors.secondary.main', '#FF6F61')
    : safeColor(props.theme, 'colors.info.main', '#36f2fa')};
  color: white;
  padding: 8px 16px;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 6px;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const ProductContent = styled.div`
  padding: 32px;
`;

const ProductHeader = styled.div`
  margin-bottom: 20px;
`;

const ProductTitle = styled.h3`
  font-size: 1.75rem;
  font-weight: 700;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};
  margin-bottom: 8px;
`;

const ProductTagline = styled.p`
  font-size: 1.05rem;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  font-weight: 600;
  margin-bottom: 16px;
`;

const ProductDescription = styled.p`
  font-size: 0.95rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  line-height: 1.6;
  margin-bottom: 20px;
`;

const ProblemStats = styled.div`
  background: ${props => safeColor(props.theme, 'colors.background.default', '#F2F4F7')};
  border-radius: 12px;
  padding: 20px;
  margin-bottom: 24px;
`;

const StatItem = styled.div`
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 8px 0;

  .stat-number {
    font-size: 1.5rem;
    font-weight: 800;
    color: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
    min-width: 70px;
  }

  .stat-label {
    font-size: 0.875rem;
    color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};
    font-weight: 500;
  }
`;

const FeaturesList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
`;

const FeatureItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  font-size: 0.95rem;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#4d4d4d')};

  svg {
    width: 20px;
    height: 20px;
    color: ${props => safeColor(props.theme, 'colors.success.main', '#006688')};
    flex-shrink: 0;
    margin-top: 2px;
  }
`;

const ProductActions = styled.div`
  display: flex;
  gap: 12px;
  margin-top: 24px;
`;

const PrimaryButton = styled.a`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  transition: all 0.3s ease;

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.secondary.dark', '#e55a4a')};
    transform: translateX(4px);
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const SecondaryButton = styled.a`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: transparent;
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  padding: 12px 24px;
  border-radius: 8px;
  border: 2px solid ${props => safeColor(props.theme, 'colors.primary.main', '#003366')};
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  transition: all 0.3s ease;

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.primary.light', '#a0c1d6')};
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const BottomCTA = styled(motion.div)`
  text-align: center;
  padding: 60px 32px;
  background: linear-gradient(135deg,
    ${props => safeColor(props.theme, 'colors.primary.main', '#003366')} 0%,
    ${props => safeColor(props.theme, 'colors.success.main', '#006688')} 100%
  );
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 51, 102, 0.2);

  h3 {
    font-size: 2rem;
    font-weight: 700;
    color: white;
    margin-bottom: 16px;
  }

  p {
    font-size: 1.125rem;
    color: rgba(255, 255, 255, 0.9);
    margin-bottom: 32px;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
  }
`;

const CTAButton = styled.a`
  display: inline-flex;
  align-items: center;
  gap: 12px;
  background: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  color: white;
  padding: 18px 36px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 1.125rem;
  text-decoration: none;
  transition: all 0.3s ease;
  box-shadow: 0 6px 20px rgba(255, 111, 97, 0.4);

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.secondary.dark', '#e55a4a')};
    transform: translateY(-3px);
    box-shadow: 0 8px 30px rgba(255, 111, 97, 0.5);
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const ProductsShowcase: React.FC = () => {
  const { currentTheme } = useTheme();

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: { staggerChildren: 0.2 }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: { duration: 0.6, ease: "easeOut" }
    }
  };

  return (
    <SectionContainer theme={currentTheme}>
      <Container>
        <SectionHeader>
          <Badge
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            theme={currentTheme}
          >
            OUR PRODUCTS IN ACTION
          </Badge>

          <Headline
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            theme={currentTheme}
          >
            We Don't Just Advise. <br />We Build.
          </Headline>

          <Subheadline
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            theme={currentTheme}
          >
            These products run in production. Your transformation gets the same expertise.
          </Subheadline>
        </SectionHeader>

        <motion.div
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <ProductsGrid>
            {/* ContractNest */}
            <ProductCard variants={itemVariants}>
              <ProductImage theme={currentTheme}>
                <LaunchBadge status="launching" theme={currentTheme}>
                  <Calendar />
                  Nov 22 Launch
                </LaunchBadge>
                <ContractNestIcon style={{ width: '120px', height: '120px' }} />
              </ProductImage>
              <ProductContent>
                <ProductHeader>
                  <ProductTitle theme={currentTheme}>ContractNest</ProductTitle>
                  <ProductTagline theme={currentTheme}>
                    Turn Service Commitments Into Profitable Relationships
                  </ProductTagline>
                  <ProductDescription theme={currentTheme}>
                    Transform scattered service agreements into an automated, collaborative exchange. From healthcare equipment maintenance to manufacturing service contracts—digitize, automate, and scale your service relationships.
                  </ProductDescription>
                </ProductHeader>

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

                <FeaturesList>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>Automated SLA tracking & alerts</span>
                  </FeatureItem>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>Healthcare & manufacturing workflows</span>
                  </FeatureItem>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>Collaborative vendor portal</span>
                  </FeatureItem>
                </FeaturesList>

                <ProductActions>
                  <PrimaryButton
                    href="https://www.contractnest.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    theme={currentTheme}
                  >
                    Visit ContractNest
                    <ExternalLink />
                  </PrimaryButton>
                </ProductActions>
              </ProductContent>
            </ProductCard>

            {/* Family Knows */}
            <ProductCard variants={itemVariants}>
              <ProductImage theme={currentTheme}>
                <LaunchBadge status="coming-soon" theme={currentTheme}>
                  <Calendar />
                  2026 Launch
                </LaunchBadge>
                <FamilyKnowsIcon style={{ width: '120px', height: '120px' }} />
              </ProductImage>
              <ProductContent>
                <ProductHeader>
                  <ProductTitle theme={currentTheme}>Family Knows</ProductTitle>
                  <ProductTagline theme={currentTheme}>
                    Your Family's Digital Vault & Asset Manager
                  </ProductTagline>
                  <ProductDescription theme={currentTheme}>
                    Empowers families to organize, access, and manage critical asset information, documentation, and service history—anytime, anywhere. Smart AI minimizes manual entry while family collaboration keeps everyone connected to what matters most.
                  </ProductDescription>
                </ProductHeader>

                <FeaturesList>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>Secure digital vault for family documents</span>
                  </FeatureItem>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>AI-powered asset organization</span>
                  </FeatureItem>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>Family collaboration & access control</span>
                  </FeatureItem>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>Service history tracking</span>
                  </FeatureItem>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>Mobile-first design</span>
                  </FeatureItem>
                </FeaturesList>

                <ProductActions>
                  <SecondaryButton
                    href="#contact"
                    theme={currentTheme}
                  >
                    Join Waitlist
                    <ArrowRight />
                  </SecondaryButton>
                </ProductActions>
              </ProductContent>
            </ProductCard>
          </ProductsGrid>

          <BottomCTA variants={itemVariants} theme={currentTheme}>
            <h3>Want This Level of Execution for YOUR Business?</h3>
            <p>
              The same team that built these products can transform your organization.
              Let's discuss your AI transformation strategy.
            </p>
            <CTAButton
              href="https://calendly.com/connect-vikuna/30min"
              target="_blank"
              rel="noopener noreferrer"
              theme={currentTheme}
            >
              Book Strategy Session
              <ArrowRight />
            </CTAButton>
          </BottomCTA>
        </motion.div>
      </Container>
    </SectionContainer>
  );
};

export default ProductsShowcase;
