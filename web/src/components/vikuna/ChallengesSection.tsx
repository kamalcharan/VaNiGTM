// src/components/vikuna/ChallengesSection.tsx
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, 
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  Legend, Tooltip 
} from 'recharts';
import { Clock, Compass, Users, Layers, Activity, Target, AlertTriangle, FileQuestion } from 'lucide-react';

// Styled components
const SectionContainer = styled.section`
  padding: 6rem 0;
  background-color: ${props => props.theme.colors.background.paper};
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
  font-weight: ${props => props.theme.typography.fontWeightBold};
  margin-bottom: 1rem;
  color: ${props => props.theme.colors.text.primary};
`;

const SectionDescription = styled.p`
  font-size: 1.25rem;
  color: ${props => props.theme.colors.text.secondary};
  
  span {
    font-weight: 600;
    color: ${props => props.theme.colors.primary.main};
  }
`;

const GridContainer = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 2rem;
  align-items: start;
  
  @media (min-width: 768px) {
    grid-template-columns: 5fr 7fr;
  }
`;

const ChartColumn = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2.5rem;
`;

const ChartBox = styled.div`
  background-color: ${props => props.theme.colors.primary.light};
  padding: 1.5rem;
  border-radius: 0.75rem;
`;

const ChartTitle = styled.h3`
  font-size: 1.25rem;
  font-weight: ${props => props.theme.typography.fontWeightBold};
  text-align: center;
  margin-bottom: 1rem;
  color: ${props => props.theme.colors.text.primary};
`;

const ChartSource = styled.p`
  color: ${props => props.theme.colors.text.secondary};
  font-size: 0.75rem;
  font-style: italic;
  text-align: center;
`;

const AssessmentLink = styled.a`
  color: ${props => props.theme.colors.primary.main};
  font-size: 0.875rem;
  font-weight: ${props => props.theme.typography.fontWeightMedium};
  text-decoration: none;
  display: block;
  text-align: center;
  margin-top: 0.5rem;
  
  &:hover {
    text-decoration: underline;
  }
`;

const ChallengesGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  
  @media (min-width: 768px) {
    grid-template-columns: 1fr 1fr;
  }
`;

const ChallengeCard = styled.div`
  display: flex;
  align-items: flex-start;
  background-color: ${props => props.theme.colors.primary.light};
  padding: 1rem;
  border-radius: 0.5rem;
  transition: box-shadow 0.2s ease;
  
  &:hover {
    box-shadow: ${props => props.theme.shadows.medium};
  }
`;

const IconContainer = styled.div`
  padding: 0.5rem;
  background-color: rgba(37, 99, 235, 0.2);
  border-radius: 0.5rem;
  color: ${props => props.theme.colors.primary.main};
  margin-right: 1rem;
  flex-shrink: 0;
`;

const ChallengeContent = styled.div`
  flex: 1;
`;

const ChallengeTitle = styled.h3`
  font-weight: ${props => props.theme.typography.fontWeightMedium};
  color: ${props => props.theme.colors.text.primary};
  margin-bottom: 0.25rem;
`;

const ChallengeDescription = styled.p`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text.secondary};
`;

const CtaContainer = styled.div`
  margin-top: 2rem;
  text-align: center;
`;

const CtaText = styled.p`
  color: ${props => props.theme.colors.text.secondary};
  margin-bottom: 0.75rem;
`;

const CtaButton = styled.a`
  display: inline-block;
  background-color: ${props => props.theme.colors.primary.main};
  color: ${props => props.theme.colors.primary.contrastText};
  padding: 0.75rem 1.5rem;
  border-radius: 0.5rem;
  font-weight: ${props => props.theme.typography.fontWeightMedium};
  text-decoration: none;
  transition: background-color 0.2s ease;
  
  &:hover {
    background-color: ${props => props.theme.colors.primary.dark};
  }
`;

const ChallengesSection: React.FC = () => {
  const { currentTheme } = useTheme();
  
  // Data for the pie chart
  const pieData = [
    { name: 'Failed', value: 70, color: '#ef4444' },
    { name: 'Successful', value: 30, color: '#22c55e' },
  ];
  
  const COLORS = ['#ef4444', '#22c55e'];
  
  // Data for the radar chart
  const radarData = [
    { dimension: 'Technology', A: 65, fullMark: 100 },
    { dimension: 'Process', A: 59, fullMark: 100 },
    { dimension: 'Data', A: 40, fullMark: 100 },
    { dimension: 'Change', A: 45, fullMark: 100 },
    { dimension: 'Capability', A: 52, fullMark: 100 },
  ];
  
  // Challenges data
  const challenges = [
    {
      title: "Too much time spent on wrong things",
      description: "Focusing on initiatives that don't drive meaningful transformation or ROI",
      icon: <Clock size={20} />
    },
    {
      title: "Complexity / too many priorities",
      description: "Overwhelming number of initiatives without clear focus or alignment",
      icon: <Layers size={20} />
    },
    {
      title: "Lack of Leadership expertise",
      description: "Missing strategic guidance and technical knowledge to drive digital initiatives",
      icon: <Users size={20} />
    },
    {
      title: "Can't afford a fulltime CDO / CAiO",
      description: "Need for executive-level digital leadership without the overhead",
      icon: <AlertTriangle size={20} />
    },
    {
      title: "Lack of actionable Digital transformation plan",
      description: "Strategy without practical implementation steps and milestones",
      icon: <FileQuestion size={20} />
    },
    {
      title: "Inconsistent execution",
      description: "Difficulty maintaining momentum and quality across digital initiatives",
      icon: <Activity size={20} />
    },
    {
      title: "Vague Strategy",
      description: "Unclear objectives and metrics for digital initiatives",
      icon: <Compass size={20} />
    },
    {
      title: "Scattered focus & Disorganization",
      description: "Lack of coordinated approach to digital transformation efforts",
      icon: <Target size={20} />
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
    <SectionContainer theme={currentTheme}>
      <Container>
        <SectionHeader>
          <SectionTitle theme={currentTheme}>Challenges We Help Businesses & Leaders Overcome</SectionTitle>
          <SectionDescription theme={currentTheme}>
            <span>70%</span> of digital transformations fail or hit roadblocks. 
            Are these points familiar to you?
          </SectionDescription>
        </SectionHeader>

        <GridContainer>
          {/* Left Column: Charts */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <ChartColumn>
              {/* Pie Chart */}
              <ChartBox theme={currentTheme}>
                <ChartTitle theme={currentTheme}>Digital Transformation Success Rate</ChartTitle>
                <div>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                        label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}
                      >
                        {pieData.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => `${value}%`} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                  <ChartSource theme={currentTheme}>
                    Source: McKinsey & Company Digital Transformation Report
                  </ChartSource>
                </div>
              </ChartBox>
              
              {/* Radar Chart */}
              <ChartBox theme={currentTheme}>
                <ChartTitle theme={currentTheme}>5 Dimensions of Digital Readiness</ChartTitle>
                <div>
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart outerRadius={90} data={radarData}>
                      <PolarGrid />
                      <PolarAngleAxis dataKey="dimension" />
                      <Radar
                        name="Average Organization"
                        dataKey="A"
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.4}
                      />
                      <Tooltip />
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                  <AssessmentLink 
                    href="https://contractnest.vercel.app/leadforms/dtreadiness" 
                    target="_blank" 
                    rel="noopener noreferrer"
                    theme={currentTheme}
                  >
                    Assess Your Digital Readiness →
                  </AssessmentLink>
                </div>
              </ChartBox>
            </ChartColumn>
          </motion.div>

          {/* Right Column: Challenges */}
          <motion.div
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            <ChallengesGrid>
              {challenges.map((challenge, index) => (
                <motion.div key={index} variants={item}>
                  <ChallengeCard theme={currentTheme}>
                    <IconContainer theme={currentTheme}>
                      {challenge.icon}
                    </IconContainer>
                    <ChallengeContent>
                      <ChallengeTitle theme={currentTheme}>{challenge.title}</ChallengeTitle>
                      <ChallengeDescription theme={currentTheme}>{challenge.description}</ChallengeDescription>
                    </ChallengeContent>
                  </ChallengeCard>
                </motion.div>
              ))}
            </ChallengesGrid>
            
            {/* CTA at the bottom of the challenges */}
            <motion.div variants={item}>
              <CtaContainer>
                <CtaText theme={currentTheme}>
                  Do these challenges sound familiar? Our leadership services can help you navigate these obstacles.
                </CtaText>
                <CtaButton 
                  href="#leadership-services" 
                  theme={currentTheme}
                >
                  Explore Our Solutions
                </CtaButton>
              </CtaContainer>
            </motion.div>
          </motion.div>
        </GridContainer>
      </Container>
    </SectionContainer>
  );
};

export default ChallengesSection;