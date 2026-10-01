// src/components/vikuna/ProductsSection.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { FileText, Shield, ArrowRight, Check } from 'lucide-react';
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
  background: linear-gradient(to bottom, 
    ${props => safeColor(props.theme, 'colors.background.default', '#F9FAFB')}, 
    ${props => safeColor(props.theme, 'colors.primary.light', '#EFF6FF')}
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

const SubHeading = styled.span`
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 500};
  font-size: 0.875rem;
`;

const SectionTitle = styled.h2`
  font-size: 2.25rem;
  @media (min-width: 768px) {
    font-size: 2.5rem;
  }
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  margin: 0.5rem 0 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
`;

const SectionDescription = styled.p`
  font-size: 1.125rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  line-height: 1.6;
`;

const ProductsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  
  @media (min-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const ProductCard = styled.div`
  background-color: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border-radius: ${props => props.theme?.borderRadius?.large || '12px'};
  box-shadow: ${props => props.theme?.shadows?.medium || '0 4px 6px rgba(0,0,0,0.1)'};
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  
  &:hover {
    transform: translateY(-5px);
    box-shadow: ${props => props.theme?.shadows?.large || '0 10px 15px rgba(0,0,0,0.15)'};
  }
`;

const ProductImage = styled.div`
  background-color: ${props => safeColor(props.theme, 'colors.primary.light', '#EFF6FF')};
  padding: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 250px;
  position: relative;
  overflow: hidden;
  
  svg {
    max-width: 100%;
    max-height: 100%;
  }
`;

const ProductContent = styled.div`
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  flex-grow: 1;
`;

const ProductTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  margin-bottom: 0.75rem;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
  display: flex;
  align-items: center;
  
  svg {
    margin-right: 0.75rem;
    flex-shrink: 0;
  }
`;

const ProductDescription = styled.p`
  font-size: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  margin-bottom: 1.5rem;
  line-height: 1.6;
  flex-grow: 1;
`;

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 1.5rem 0;
`;

const FeatureItem = styled.li`
  display: flex;
  align-items: flex-start;
  margin-bottom: 0.5rem;
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  
  svg {
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
    margin-right: 0.5rem;
    flex-shrink: 0;
    margin-top: 0.25rem;
  }
`;

const ProductFooter = styled.div`
  margin-top: auto;
`;

const ComingSoon = styled.div`
  text-align: center;
  margin-top: 3rem;
`;

const ComingSoonText = styled.p`
  font-size: 1.125rem;
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 500};
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  
  span {
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
    border-bottom: 1px dashed ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
    padding-bottom: 0.125rem;
  }
`;

const ProductsSection: React.FC = () => {
  const { currentTheme } = useTheme();
  
  // SVG Illustrations for products
  const ContractNestIllustration = () => (
    <svg width="200" height="160" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Document Stack */}
      <rect x="40" y="30" width="120" height="100" rx="8" fill="#E0E7FF" stroke="#6366F1" strokeWidth="2"/>
      <rect x="50" y="20" width="120" height="100" rx="8" fill="#EDE9FE" stroke="#8B5CF6" strokeWidth="2"/>
      <rect x="60" y="10" width="120" height="100" rx="8" fill="white" stroke="#2563EB" strokeWidth="2"/>
      
      {/* Document Lines */}
      <rect x="75" y="30" width="80" height="4" rx="2" fill="#CBD5E1"/>
      <rect x="75" y="40" width="60" height="4" rx="2" fill="#CBD5E1"/>
      <rect x="75" y="50" width="70" height="4" rx="2" fill="#CBD5E1"/>
      
      {/* Signature Line */}
      <rect x="75" y="70" width="90" height="1" fill="#94A3B8"/>
      <path d="M80 85 Q90 75, 100 85 T120 85" stroke="#2563EB" strokeWidth="2" fill="none"/>
      
      {/* Check Mark */}
      <circle cx="160" cy="100" r="20" fill="#10B981"/>
      <path d="M150 100 L155 105 L170 90" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );

  const FamilyKnowsIllustration = () => (
    <svg width="200" height="160" viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Central Shield */}
      <path d="M100 20 L60 40 L60 80 C60 110 80 130 100 140 C120 130 140 110 140 80 L140 40 L100 20Z" 
            fill="#EDE9FE" stroke="#2563EB" strokeWidth="2"/>
      
      {/* House Icon in Shield */}
      <path d="M100 50 L85 65 L85 85 L95 85 L95 70 L105 70 L105 85 L115 85 L115 65 L100 50Z" 
            fill="#2563EB"/>
      <path d="M100 45 L120 65 L118 67 L100 49 L82 67 L80 65 L100 45Z" 
            fill="#2563EB"/>
      
      {/* Family Members */}
      <circle cx="40" cy="40" r="15" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2"/>
      <circle cx="40" cy="40" r="5" fill="#F59E0B"/>
      
      <circle cx="160" cy="40" r="15" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="2"/>
      <circle cx="160" cy="40" r="5" fill="#3B82F6"/>
      
      <circle cx="40" cy="120" r="15" fill="#D1FAE5" stroke="#10B981" strokeWidth="2"/>
      <circle cx="40" cy="120" r="5" fill="#10B981"/>
      
      <circle cx="160" cy="120" r="15" fill="#FCE7F3" stroke="#EC4899" strokeWidth="2"/>
      <circle cx="160" cy="120" r="5" fill="#EC4899"/>
      
      {/* Connection Lines */}
      <path d="M55 45 Q100 60, 145 45" stroke="#E5E7EB" strokeWidth="2" fill="none" strokeDasharray="4 4"/>
      <path d="M55 115 Q100 100, 145 115" stroke="#E5E7EB" strokeWidth="2" fill="none" strokeDasharray="4 4"/>
      
      {/* AI Sparkles */}
      <path d="M70 20 L72 15 L74 20 L79 22 L74 24 L72 29 L70 24 L65 22 L70 20Z" fill="#F59E0B"/>
      <path d="M130 25 L131 22 L132 25 L135 26 L132 27 L131 30 L130 27 L127 26 L130 25Z" fill="#F59E0B"/>
    </svg>
  );
  
  const products = [
    {
      name: "ContractNest",
      description: "A comprehensive contract lifecycle management platform that streamlines document creation, negotiation, execution, and management for businesses of all sizes.",
      features: [
        "AI-powered document generation",
        "Secure digital signatures",
        "Automated approval workflows",
        "Analytics and reporting dashboard"
      ],
      illustration: <ContractNestIllustration />,
      icon: <FileText size={24} />,
      url: "https://www.contractnest.com"
    },
    {
      name: "FamilyKnows",
      description: "Your AI-powered family intelligence platform that empowers families to intelligently manage, protect, and optimize their assets through AI-driven insights and trusted provider connections.",
      features: [
        "Smart asset tracking & management",
        "AI-powered warranty reminders",
        "Trusted service provider network",
        "Multilingual family collaboration"
      ],
      illustration: <FamilyKnowsIllustration />,
      icon: <Shield size={24} />,
      url: "https://familyknows.app"
    }
  ];

  return (
    <SectionContainer id="our-products" theme={currentTheme}>
      <Container>
        <SectionHeader>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <SubHeading theme={currentTheme}>OUR PRODUCTS</SubHeading>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <SectionTitle theme={currentTheme}>Innovative Digital Solutions</SectionTitle>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <SectionDescription theme={currentTheme}>
              We don't just consult — we build. Explore our digital products that showcase our 
              approach to solving real-world problems through technology and innovation.
            </SectionDescription>
          </motion.div>
        </SectionHeader>

        <ProductsGrid>
          {products.map((product, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: index * 0.2 }}
            >
              <ProductCard theme={currentTheme}>
                <ProductImage theme={currentTheme}>
                  {product.illustration}
                </ProductImage>
                <ProductContent>
                  <ProductTitle theme={currentTheme}>
                    {product.icon}
                    {product.name}
                  </ProductTitle>
                  <ProductDescription theme={currentTheme}>
                    {product.description}
                  </ProductDescription>
                  <FeatureList>
                    {product.features.map((feature, idx) => (
                      <FeatureItem key={idx} theme={currentTheme}>
                        <Check size={16} />
                        <span>{feature}</span>
                      </FeatureItem>
                    ))}
                  </FeatureList>
                  <ProductFooter>
                    <Button 
                      onClick={() => window.open(product.url, '_blank')}
                    >
                      Visit {product.name} <ArrowRight size={16} style={{ marginLeft: '0.5rem' }} />
                    </Button>
                  </ProductFooter>
                </ProductContent>
              </ProductCard>
            </motion.div>
          ))}
        </ProductsGrid>
        
        <ComingSoon>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
          >
            <ComingSoonText theme={currentTheme}>
              More innovative products <span>coming soon</span> — stay tuned!
            </ComingSoonText>
          </motion.div>
        </ComingSoon>
      </Container>
    </SectionContainer>
  );
};

export default ProductsSection;