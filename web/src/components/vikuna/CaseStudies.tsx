// src/components/vikuna/CaseStudies.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';

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
  background-color: ${props => safeColor(props.theme, 'colors.background.default', '#F9FAFB')};
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

const SectionTitle = styled.h2`
  font-size: 2.25rem;
  @media (min-width: 768px) {
    font-size: 2.5rem;
  }
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  margin-bottom: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
`;

const SectionDescription = styled.p`
  font-size: 1.125rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  line-height: 1.6;
`;

const CaseStudiesGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  
  @media (min-width: 768px) {
    grid-template-columns: repeat(2, 1fr);
  }
  
  @media (min-width: 1024px) {
    grid-template-columns: repeat(3, 1fr);
  }
`;

interface CaseStudyCardProps {
  $bgColor: string;
}

const CaseStudyCard = styled.div<CaseStudyCardProps>`
  height: 100%;
  border-radius: ${props => props.theme?.borderRadius?.large || '12px'};
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  border: 1px solid rgba(0, 0, 0, 0.05);
  background-color: ${props => {
    switch(props.$bgColor) {
      case 'bg-blue-50': return '#EFF6FF';
      case 'bg-purple-50': return '#F5F3FF';
      case 'bg-green-50': return '#ECFDF5';
      default: return '#EFF6FF';
    }
  }};
  transition: all 0.3s ease;
  
  &:hover {
    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
    transform: translateY(-4px);
  }
`;

const CardHeader = styled.div`
  height: 3rem;
  background-color: ${props => safeColor(props.theme, 'colors.background.paper', '#FFFFFF')};
  position: relative;
`;

const IndustryBadge = styled.div`
  position: absolute;
  top: 1rem;
  left: 1rem;
  font-size: 0.75rem;
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 600};
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  background-color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  color: ${props => safeColor(props.theme, 'colors.primary.contrastText', '#FFFFFF')};
`;

const CardContent = styled.div`
  padding: 1.5rem;
`;

const CardTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
  margin-bottom: 0.75rem;
`;

const CardDescription = styled.p`
  font-size: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  margin-bottom: 1rem;
  line-height: 1.6;
`;

const ClientInfo = styled.div`
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  margin-bottom: 1.5rem;
`;

const MetricsContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-bottom: 1.5rem;
`;

const MetricItem = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
`;

const MetricHeader = styled.div`
  display: flex;
  justify-content: space-between;
  font-size: 0.875rem;
  margin-bottom: 0.25rem;
`;

const MetricLabel = styled.span`
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
`;

const MetricValue = styled.span`
  font-weight: ${props => props.theme?.typography?.fontWeightMedium || 600};
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
`;

const CenterButtonContainer = styled.div`
  text-align: center;
  margin-top: 3rem;
`;

const CaseStudies: React.FC = () => {
  const { currentTheme } = useTheme();
  
  const caseStudies = [
    {
      title: "MES Regulatory Compliance",
      description: "Developed an integrated Manufacturing Execution System that streamlined production workflow while ensuring FDA & CFR part-11 regulatory compliance. The solution bridged IT and pharma operations, creating a unified platform for quality assurance and process management.",
      client: "Leading Pharma CMO",
      industry: "Pharma",
      metrics: [
        { label: "Development Time", value: "-65%", progress: 68, color: "bg-blue-600" },
        { label: "System Performance", value: "+42%", progress: 75, color: "bg-green-600" }
      ],
      bgColor: "bg-blue-50"
    },
    {
      title: "AI-Powered Healthcare Platform",
      description: "Redesigned a healthcare provider's data architecture to support real-time analytics, AI/ML capabilities, and secure data sharing across the organization.",
      client: "Regional Healthcare Network",
      industry: "Healthcare",
      metrics: [
        { label: "Data Access Time", value: "-85%", progress: 85, color: "bg-blue-600" },
        { label: "Analytics Adoption", value: "+210%", progress: 80, color: "bg-green-600" }
      ],
      bgColor: "bg-purple-50"
    },
    {
      title: "Industry 4.0 Digital Factory",
      description: "Transformed operations for a manufacturing OEM through an integrated digital platform connecting IoT devices, mobile solutions, and cloud services. Orchestrated end-to-end digitization across production, maintenance, and supply chain systems.",
      client: "OEM for Water Generation Equipments",
      industry: "Manufacturing",
      metrics: [
        { label: "Downtime Reduction", value: "-73%", progress: 73, color: "bg-blue-600" },
        { label: "Maintenance Cost", value: "-45%", progress: 45, color: "bg-green-600" }
      ],
      bgColor: "bg-green-50"
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
    <SectionContainer id="case-studies" theme={currentTheme}>
      <Container>
        <SectionHeader>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <SectionTitle theme={currentTheme}>Transformation Success Stories</SectionTitle>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <SectionDescription theme={currentTheme}>
              Real-world results from our holistic transformation approach
            </SectionDescription>
          </motion.div>
        </SectionHeader>
        
        <motion.div
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          <CaseStudiesGrid>
            {caseStudies.map((study, index) => (
              <motion.div key={index} variants={item}>
                <CaseStudyCard $bgColor={study.bgColor}>
                  <CardHeader theme={currentTheme}>
                    <IndustryBadge theme={currentTheme}>
                      {study.industry}
                    </IndustryBadge>
                  </CardHeader>
                  <CardContent>
                    <CardTitle theme={currentTheme}>{study.title}</CardTitle>
                    <CardDescription theme={currentTheme}>{study.description}</CardDescription>
                    
                    <ClientInfo theme={currentTheme}>{study.client}</ClientInfo>
                    
                    <MetricsContainer>
                      {study.metrics.map((metric, idx) => (
                        <MetricItem key={idx}>
                          <MetricHeader>
                            <MetricLabel theme={currentTheme}>{metric.label}</MetricLabel>
                            <MetricValue theme={currentTheme}>{metric.value}</MetricValue>
                          </MetricHeader>
                          <Progress value={metric.progress} indicatorClassName={metric.color} />
                        </MetricItem>
                      ))}
                    </MetricsContainer>
                    
                    <Button 
                      variant="ghost"
                      textColor={safeColor(currentTheme, 'colors.primary.main', '#2563EB')}
                    >
                      View Case Study <ArrowRight size={16} style={{ marginLeft: '0.5rem' }} />
                    </Button>
                  </CardContent>
                </CaseStudyCard>
              </motion.div>
            ))}
          </CaseStudiesGrid>
        </motion.div>
        
        <CenterButtonContainer>
          <Button 
            variant="outline"
            style={{ 
              borderColor: 'rgba(0, 0, 0, 0.2)',
              color: safeColor(currentTheme, 'colors.text.primary', '#1F2937')
            }}
          >
            View All Case Studies <ArrowRight size={16} style={{ marginLeft: '0.5rem' }} />
          </Button>
        </CenterButtonContainer>
      </Container>
    </SectionContainer>
  );
};

export default CaseStudies;