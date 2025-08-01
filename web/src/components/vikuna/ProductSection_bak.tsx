// src/components/vikuna/ProductsSection.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { FileText, Globe, ArrowRight, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Styled components
const SectionContainer = styled.section`
  padding: 5rem 0;
  background: linear-gradient(to bottom, ${props => props.theme.colors.background.default}, ${props => props.theme.colors.primary.light});
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

const ProductsGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  
  @media (min-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const ProductCard = styled.div`
  background-color: ${props => props.theme.colors.background.paper};
  border-radius: ${props => props.theme.borderRadius.large};
  box-shadow: ${props => props.theme.shadows.medium};
  overflow: hidden;
  height: 100%;
  display: flex;
  flex-direction: column;
  transition: transform 0.3s ease, box-shadow 0.3s ease;
  
  &:hover {
    transform: translateY(-5px);
    box-shadow: ${props => props.theme.shadows.large};
  }
`;

const ProductImage = styled.div`
  background-color: ${props => props.theme.colors.primary.light};
  padding: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 250px;
  
  img {
    max-width: 100%;
    max-height: 100%;
    border-radius: ${props => props.theme.borderRadius.medium};
    object-fit: contain;
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
  font-weight: ${props => props.theme.typography.fontWeightBold};
  margin-bottom: 0.75rem;
  color: ${props => props.theme.colors.text.primary};
  display: flex;
  align-items: center;
  
  svg {
    margin-right: 0.75rem;
    flex-shrink: 0;
  }
`;

const ProductDescription = styled.p`
  font-size: 1rem;
  color: ${props => props.theme.colors.text.secondary};
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
  
  svg {
    color: ${props => props.theme.colors.primary.main};
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
  font-weight: ${props => props.theme.typography.fontWeightMedium};
  color: ${props => props.theme.colors.text.secondary};
  
  span {
    color: ${props => props.theme.colors.primary.main};
    border-bottom: 1px dashed ${props => props.theme.colors.primary.main};
    padding-bottom: 0.125rem;
  }
`;

const ProductsSection: React.FC = () => {
  const { currentTheme } = useTheme();
  
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
      imageUrl: "/contractnest-mockup.svg", // SVG mockup
      icon: <FileText size={24} />,
      url: "https://www.contractnest.com"
    },
    {
      name: "BharathVarsha",
      description: "A cultural digital platform celebrating India's rich heritage, traditions, and contemporary expressions through curated content and community engagement.",
      features: [
        "Curated cultural experiences",
        "Interactive historical timelines",
        "Regional art and craft showcases",
        "Community forums and discussions"
      ],
      imageUrl: "/bharathavarsha-mockup.svg", // SVG mockup
      icon: <Globe size={24} />,
      url: "https://bharathavarsha.com"
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
                  <img 
                    src={product.imageUrl} 
                    alt={product.name} 
                    onError={(e) => {
                      // Fallback to a placeholder if image fails to load
                      e.currentTarget.src = `/api/placeholder/480/320`;
                    }}
                  />
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