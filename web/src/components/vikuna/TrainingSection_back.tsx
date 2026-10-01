// src/components/vikuna/TrainingSection.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { GraduationCap, ArrowRight } from 'lucide-react';
import Card, { CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

// Styled components
const SectionContainer = styled.section`
  padding: 5rem 0;
  background-color: ${props => props.theme.colors.background.default};
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

const TrainingGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1.5rem;
  
  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
  
  @media (min-width: 1024px) {
    grid-template-columns: repeat(4, 1fr);
  }
`;

const IconContainer = styled.div<{ $color: string }>`
  width: 3rem;
  height: 3rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  background-color: ${props => {
    switch(props.$color) {
      case 'blue': return 'rgba(59, 130, 246, 0.1)';
      case 'purple': return 'rgba(139, 92, 246, 0.1)';
      case 'green': return 'rgba(16, 185, 129, 0.1)';
      case 'orange': return 'rgba(249, 115, 22, 0.1)';
      default: return 'rgba(59, 130, 246, 0.1)';
    }
  }};
  color: ${props => {
    switch(props.$color) {
      case 'blue': return '#3b82f6';
      case 'purple': return '#8b5cf6';
      case 'green': return '#10b981';
      case 'orange': return '#f97316';
      default: return '#3b82f6';
    }
  }};
`;

const StyledButton = styled(Button)<{ $color: string }>`
  padding: 0;
  color: ${props => {
    switch(props.$color) {
      case 'blue': return '#3b82f6';
      case 'purple': return '#8b5cf6';
      case 'green': return '#10b981';
      case 'orange': return '#f97316';
      default: return '#3b82f6';
    }
  }};
  
  &:hover {
    color: ${props => {
      switch(props.$color) {
        case 'blue': return '#2563eb';
        case 'purple': return '#7c3aed';
        case 'green': return '#059669';
        case 'orange': return '#ea580c';
        default: return '#2563eb';
      }
    }};
  }
`;

const CenteredButtonContainer = styled.div`
  display: flex;
  justify-content: center;
  margin-top: 2.5rem;
`;

const TrainingSection: React.FC = () => {
  const { currentTheme } = useTheme();
  
  const trainingPrograms = [
    {
      title: "Digital Transformation for Business Leaders",
      description: "Comprehensive training on digital transformation principles, strategy, and implementation for executives and leaders.",
      icon: <GraduationCap size={24} />,
      color: "blue"
    },
    {
      title: "AI for Business Leaders",
      description: "Practical knowledge on AI concepts, applications, and implementation strategies for business decision-makers.",
      icon: <GraduationCap size={24} />,
      color: "purple"
    },
    {
      title: "Customer Journey Analytics",
      description: "Learn to map, analyze and optimize customer journeys using data-driven approaches and digital tools.",
      icon: <GraduationCap size={24} />,
      color: "green"
    },
    {
      title: "Process Mining",
      description: "Skills to discover, monitor and improve real processes using process mining techniques and tools.",
      icon: <GraduationCap size={24} />,
      color: "orange"
    }
  ];

  const container = {
    hidden: { opacity: 0 },
    show: {
      opacity: 1,
      transition: {
        staggerChildren: 0.1
      }
    }
  };

  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
  };

  return (
    <SectionContainer id="digital-training" theme={currentTheme}>
      <Container>
        <SectionHeader>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <SubHeading theme={currentTheme}>CAPABILITY BUILDING</SubHeading>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
          >
            <SectionTitle theme={currentTheme}>Digital Training as a Service</SectionTitle>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <SectionDescription theme={currentTheme}>
              Equip your leaders and teams with the knowledge and skills needed to thrive 
              in the digital economy. Our specialized training programs are designed for 
              business leaders and decision-makers.
            </SectionDescription>
          </motion.div>
        </SectionHeader>

        <motion.div 
          variants={container}
          initial="hidden"
          whileInView="show"
          viewport={{ once: true }}
        >
          <TrainingGrid>
            {trainingPrograms.map((program, index) => (
              <motion.div key={index} variants={item}>
                <Card>
                  <CardHeader>
                    <IconContainer $color={program.color} theme={currentTheme}>
                      {program.icon}
                    </IconContainer>
                    <CardTitle>{program.title}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p>{program.description}</p>
                  </CardContent>
                  <CardFooter>
                    <StyledButton 
                      $color={program.color} 
                      theme={currentTheme} 
                      variant="ghost"
                    >
                      Learn More <ArrowRight size={16} style={{ marginLeft: '0.5rem' }} />
                    </StyledButton>
                  </CardFooter>
                </Card>
              </motion.div>
            ))}
          </TrainingGrid>
        </motion.div>

        <CenteredButtonContainer>
          <Button
            variant="outline"
            textColor={currentTheme.colors.primary.main}
            backgroundColor="transparent"
            style={{ borderColor: currentTheme.colors.primary.main }}
          >
            View All Training Programs
          </Button>
        </CenteredButtonContainer>
      </Container>
    </SectionContainer>
  );
};

export default TrainingSection;