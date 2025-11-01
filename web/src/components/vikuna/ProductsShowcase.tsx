// src/components/vikuna/ProductsShowcase.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { ExternalLink, ArrowRight, CheckCircle, Users } from 'lucide-react';

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
  background: ${props => safeColor(props.theme, 'colors.background.default', '#f1f4f8')};
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
  background: ${props => safeColor(props.theme, 'colors.primary.light', '#dfe3e7')};
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
  padding: 8px 20px;
  border-radius: 50px;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 16px;
`;

const Headline = styled(motion.h2)`
  font-size: clamp(2rem, 4vw, 3rem);
  font-weight: 800;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1a1f24')};
  margin-bottom: 16px;
  line-height: 1.2;
`;

const Subheadline = styled(motion.p)`
  font-size: 1.25rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#656a85')};
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
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
  transition: all 0.3s ease;

  &:hover {
    transform: translateY(-8px);
    box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
  }
`;

const ProductImage = styled.div`
  height: 280px;
  background: linear-gradient(135deg,
    ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')} 0%,
    ${props => safeColor(props.theme, 'colors.primary.dark', '#1aaa99')} 100%
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

const ProductContent = styled.div`
  padding: 32px;
`;

const ProductHeader = styled.div`
  margin-bottom: 20px;
`;

const ProductTitle = styled.h3`
  font-size: 1.75rem;
  font-weight: 700;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1a1f24')};
  margin-bottom: 8px;
`;

const ProductTagline = styled.p`
  font-size: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#656a85')};
  margin-bottom: 20px;
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
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1a1f24')};

  svg {
    width: 20px;
    height: 20px;
    color: ${props => safeColor(props.theme, 'colors.success.main', '#165070')};
    flex-shrink: 0;
    margin-top: 2px;
  }
`;

const UsedBy = styled.div`
  padding: 16px 0;
  border-top: 1px solid ${props => safeColor(props.theme, 'colors.background.default', '#f1f4f8')};
  margin-bottom: 24px;

  .label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: ${props => safeColor(props.theme, 'colors.text.secondary', '#656a85')};
    margin-bottom: 8px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .stats {
    font-size: 1.125rem;
    font-weight: 700;
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
  }
`;

const ProductActions = styled.div`
  display: flex;
  gap: 12px;
`;

const PrimaryButton = styled.a`
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
  color: white;
  padding: 12px 24px;
  border-radius: 8px;
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  transition: all 0.3s ease;

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.primary.dark', '#1aaa99')};
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
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
  padding: 12px 24px;
  border-radius: 8px;
  border: 2px solid ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
  font-weight: 600;
  font-size: 0.95rem;
  text-decoration: none;
  transition: all 0.3s ease;

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.primary.light', '#dfe3e7')};
  }

  svg {
    width: 18px;
    height: 18px;
  }
`;

const BottomCTA = styled(motion.div)`
  text-align: center;
  padding: 60px 32px;
  background: white;
  border-radius: 16px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);

  h3 {
    font-size: 2rem;
    font-weight: 700;
    color: ${props => safeColor(props.theme, 'colors.text.primary', '#1a1f24')};
    margin-bottom: 16px;
  }

  p {
    font-size: 1.125rem;
    color: ${props => safeColor(props.theme, 'colors.text.secondary', '#656a85')};
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
  background: ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')};
  color: white;
  padding: 18px 36px;
  border-radius: 12px;
  font-weight: 600;
  font-size: 1.125rem;
  text-decoration: none;
  transition: all 0.3s ease;
  box-shadow: 0 6px 20px ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')}40;

  &:hover {
    background: ${props => safeColor(props.theme, 'colors.primary.dark', '#1aaa99')};
    transform: translateY(-3px);
    box-shadow: 0 8px 30px ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')}50;
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
            <ProductCard variants={itemVariants}>
              <ProductImage theme={currentTheme}>
                🤖
              </ProductImage>
              <ProductContent>
                <ProductHeader>
                  <ProductTitle theme={currentTheme}>ContractNest AI</ProductTitle>
                  <ProductTagline theme={currentTheme}>
                    AI-Powered Contract Intelligence Platform
                  </ProductTagline>
                </ProductHeader>

                <FeaturesList>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>Automated contract review and analysis</span>
                  </FeatureItem>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>Risk detection and compliance checking</span>
                  </FeatureItem>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>90% faster contract processing</span>
                  </FeatureItem>
                </FeaturesList>

                <UsedBy theme={currentTheme}>
                  <div className="label">
                    <Users size={14} />
                    USED BY
                  </div>
                  <div className="stats">50+ Legal Teams</div>
                </UsedBy>

                <ProductActions>
                  <PrimaryButton
                    href="https://contractnest.vercel.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    theme={currentTheme}
                  >
                    Try Live Demo
                    <ExternalLink />
                  </PrimaryButton>
                  <SecondaryButton
                    href="https://contractnest.vercel.app"
                    target="_blank"
                    rel="noopener noreferrer"
                    theme={currentTheme}
                  >
                    Learn More
                  </SecondaryButton>
                </ProductActions>
              </ProductContent>
            </ProductCard>

            <ProductCard variants={itemVariants}>
              <ProductImage theme={currentTheme}>
                📊
              </ProductImage>
              <ProductContent>
                <ProductHeader>
                  <ProductTitle theme={currentTheme}>AI Analytics Suite</ProductTitle>
                  <ProductTagline theme={currentTheme}>
                    Transform Data into Strategic Insights
                  </ProductTagline>
                </ProductHeader>

                <FeaturesList>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>Real-time business intelligence dashboards</span>
                  </FeatureItem>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>Predictive analytics and forecasting</span>
                  </FeatureItem>
                  <FeatureItem theme={currentTheme}>
                    <CheckCircle />
                    <span>Custom AI model deployment</span>
                  </FeatureItem>
                </FeaturesList>

                <UsedBy theme={currentTheme}>
                  <div className="label">
                    <Users size={14} />
                    TRUSTED BY
                  </div>
                  <div className="stats">Enterprise Clients</div>
                </UsedBy>

                <ProductActions>
                  <PrimaryButton
                    href="#contact"
                    theme={currentTheme}
                  >
                    Request Demo
                    <ArrowRight />
                  </PrimaryButton>
                  <SecondaryButton
                    href="#contact"
                    theme={currentTheme}
                  >
                    Get Pricing
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
