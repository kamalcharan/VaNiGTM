// src/components/vikuna/Industries.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { CheckCircle, Shield, BarChart3, Users } from 'lucide-react';

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
  padding: 4rem 0;
  background-color: ${props => safeColor(props.theme, 'colors.background.default', '#F9FAFB')};
`;

const Container = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
`;

const FlexContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2rem;
  
  @media (min-width: 1024px) {
    flex-direction: row;
    gap: 4rem;
  }
`;

const SectionBox = styled.div`
  background-color: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  border-radius: ${props => props.theme?.borderRadius?.large || '12px'};
  padding: 2rem;
  box-shadow: ${props => props.theme?.shadows?.small || '0 1px 3px rgba(0,0,0,0.1)'};
  flex: 1;
  height: 100%;
`;

const SectionTitle = styled.h2`
  font-size: 1.5rem;
  @media (min-width: 768px) {
    font-size: 1.875rem;
  }
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  margin-bottom: 2rem;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
`;

const IndustriesGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  
  @media (min-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
    row-gap: 1.5rem;
    column-gap: 2rem;
  }
`;

const IndustryItem = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
`;

const CheckIcon = styled(CheckCircle)`
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#3B82F6')};
  flex-shrink: 0;
`;

const IndustryName = styled.span`
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
  font-size: 1rem;
`;

const DifferentiatorsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 3.5rem;
`;

const DifferentiatorItem = styled.div`
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
`;

const IconContainer = styled.div<{ $iconColor: string }>`
  color: ${props => props.$iconColor};
  flex-shrink: 0;
`;

const DifferentiatorContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
`;

const DifferentiatorTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 600};
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
  margin: 0;
`;

const DifferentiatorDescription = styled.p`
  font-size: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  line-height: 1.6;
  margin: 0;
`;

const Industries: React.FC = () => {
  const { currentTheme } = useTheme();
  
  const industries = [
    { name: "Healthcare", gridArea: "1 / 1 / 2 / 2" },
    { name: "Pharma", gridArea: "1 / 2 / 2 / 3" },
    { name: "Financial Services", gridArea: "2 / 1 / 3 / 2" },
    { name: "Manufacturing", gridArea: "2 / 2 / 3 / 3" },
    { name: "Technology", gridArea: "3 / 1 / 4 / 2" },
    { name: "Retail & E-commerce", gridArea: "3 / 2 / 4 / 3" },
    { name: "Education", gridArea: "4 / 1 / 5 / 2" },
    { name: "Government", gridArea: "4 / 2 / 5 / 3" }
  ];

  const differentiators = [
    {
      title: "Vendor-Agnostic Recommendations",
      description: "We provide unbiased advice focused solely on your business needs, not on selling specific technologies.",
      icon: <Shield size={24} />,
      color: "#6366F1" // indigo color
    },
    {
      title: "Measurable ROI Focus",
      description: "Every recommendation and strategy we deliver is designed with clear, measurable business outcomes in mind.",
      icon: <BarChart3 size={24} />,
      color: "#10B981" // green color
    },
    {
      title: "Executive-Level Expertise",
      description: "Access C-suite level digital leadership without the overhead of a full-time executive hire.",
      icon: <Users size={24} />,
      color: "#8B5CF6" // purple color
    }
  ];

  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0 }
  };

  const stagger = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  return (
    <SectionContainer id="industries" theme={currentTheme}>
      <Container>
        <FlexContainer>
          {/* Industries We Serve */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeIn}
            style={{ flex: '1' }}
          >
            <SectionBox theme={currentTheme}>
              <SectionTitle theme={currentTheme}>Industries We Serve</SectionTitle>
              
              <motion.div 
                variants={stagger}
                initial="hidden"
                whileInView="visible"
                viewport={{ once: true }}
              >
                <IndustriesGrid>
                  {industries.map((industry, index) => (
                    <motion.div 
                      key={index}
                      variants={fadeIn}
                      style={{ gridArea: industry.gridArea }}
                    >
                      <IndustryItem>
                        <CheckIcon size={20} theme={currentTheme} />
                        <IndustryName theme={currentTheme}>{industry.name}</IndustryName>
                      </IndustryItem>
                    </motion.div>
                  ))}
                </IndustriesGrid>
              </motion.div>
            </SectionBox>
          </motion.div>

          {/* What Sets Us Apart */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeIn}
            style={{ flex: '1' }}
          >
            <SectionBox theme={currentTheme}>
              <SectionTitle theme={currentTheme}>What Sets Us Apart</SectionTitle>
              
              <DifferentiatorsContainer>
                {differentiators.map((item, index) => (
                  <motion.div 
                    key={index}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.1 }}
                  >
                    <DifferentiatorItem>
                      <IconContainer $iconColor={item.color}>
                        {item.icon}
                      </IconContainer>
                      <DifferentiatorContent>
                        <DifferentiatorTitle theme={currentTheme}>{item.title}</DifferentiatorTitle>
                        <DifferentiatorDescription theme={currentTheme}>{item.description}</DifferentiatorDescription>
                      </DifferentiatorContent>
                    </DifferentiatorItem>
                  </motion.div>
                ))}
              </DifferentiatorsContainer>
            </SectionBox>
          </motion.div>
        </FlexContainer>
      </Container>
    </SectionContainer>
  );
};

export default Industries;