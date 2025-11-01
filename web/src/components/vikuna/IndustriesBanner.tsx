// src/components/vikuna/IndustriesBanner.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { Building2, Package, Pill, Heart, Factory, Cpu, GraduationCap, ShoppingCart } from 'lucide-react';

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
const BannerContainer = styled.section`
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border-top: 1px solid ${props => safeColor(props.theme, 'colors.text.disabled', '#d1d5db')}20;
  border-bottom: 1px solid ${props => safeColor(props.theme, 'colors.text.disabled', '#d1d5db')}20;
  padding: 2rem 0;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: linear-gradient(90deg,
      ${props => safeColor(props.theme, 'colors.primary.light', '#a0c1d6')}05,
      transparent 50%,
      ${props => safeColor(props.theme, 'colors.info.main', '#36f2fa')}05
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

const BannerContent = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.5rem;

  @media (min-width: 768px) {
    flex-direction: row;
    gap: 3rem;
  }
`;

const BannerLabel = styled.div`
  font-size: 0.875rem;
  font-weight: 600;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  text-transform: uppercase;
  letter-spacing: 0.5px;
  white-space: nowrap;
  flex-shrink: 0;
`;

const IndustriesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1.5rem;
  flex: 1;
  width: 100%;

  @media (min-width: 768px) {
    grid-template-columns: repeat(8, 1fr);
    gap: 2rem;
  }
`;

const IndustryItem = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  transition: all 0.3s ease;
  cursor: default;

  &:hover {
    transform: translateY(-4px);
  }
`;

const IconContainer = styled.div`
  width: 2.5rem;
  height: 2.5rem;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')}15;
  color: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  transition: all 0.3s ease;

  ${IndustryItem}:hover & {
    background: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
    color: white;
  }

  @media (min-width: 768px) {
    width: 3rem;
    height: 3rem;
  }
`;

const IndustryName = styled.span`
  font-size: 0.75rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6b7280')};
  text-align: center;
  font-weight: 500;
  line-height: 1.2;

  @media (min-width: 768px) {
    font-size: 0.8rem;
  }
`;

const IndustriesBanner: React.FC = () => {
  const { currentTheme } = useTheme();

  const industries = [
    { name: 'Healthcare', icon: <Heart size={20} /> },
    { name: 'Pharma', icon: <Pill size={20} /> },
    { name: 'Manufacturing', icon: <Factory size={20} /> },
    { name: 'Technology', icon: <Cpu size={20} /> },
    { name: 'Retail', icon: <ShoppingCart size={20} /> },
    { name: 'Education', icon: <GraduationCap size={20} /> },
    { name: 'Logistics', icon: <Package size={20} /> },
    { name: 'Enterprise', icon: <Building2 size={20} /> }
  ];

  const containerVariants = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.08
      }
    }
  };

  const itemVariants = {
    hidden: { opacity: 0, y: 10 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <BannerContainer theme={currentTheme}>
      <Container>
        <BannerContent>
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
          >
            <BannerLabel theme={currentTheme}>
              Industries We Serve
            </BannerLabel>
          </motion.div>

          <motion.div
            variants={containerVariants}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
            style={{ flex: 1, width: '100%' }}
          >
            <IndustriesGrid>
              {industries.map((industry, index) => (
                <motion.div key={index} variants={itemVariants}>
                  <IndustryItem>
                    <IconContainer theme={currentTheme}>
                      {industry.icon}
                    </IconContainer>
                    <IndustryName theme={currentTheme}>
                      {industry.name}
                    </IndustryName>
                  </IndustryItem>
                </motion.div>
              ))}
            </IndustriesGrid>
          </motion.div>
        </BannerContent>
      </Container>
    </BannerContainer>
  );
};

export default IndustriesBanner;
