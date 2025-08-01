// src/components/vikuna/TrainingSection.tsx
import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';
import { ArrowRight, Clock } from 'lucide-react';
import Card, { CardHeader, CardContent, CardFooter } from '@/components/ui/card';
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
  background-color: ${props => safeColor(props.theme, 'colors.background.default', '#F9FAFB')};
  position: relative;
  overflow: hidden;
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

const CarouselContainer = styled.div`
  position: relative;
  max-width: 800px;
  margin: 0 auto;
`;

const CarouselTrack = styled.div`
  display: flex;
  transition: transform 0.5s ease;
`;

const ProgramCard = styled(motion.div)`
  flex: 0 0 100%;
  padding: 0 1rem;
`;

const StyledCard = styled(Card)<{ $isSpecial?: boolean }>`
  height: 100%;
  min-height: 480px;
  border: 2px solid ${props => props.$isSpecial 
    ? safeColor(props.theme, 'colors.primary.main', '#2563EB')
    : 'transparent'};
  transition: all 0.3s ease;
  position: relative;
  overflow: hidden;
  
  &:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 30px rgba(0,0,0,0.1);
  }
`;

const SpecialBadge = styled.div`
  position: absolute;
  top: -1px;
  right: 20px;
  background: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  color: white;
  padding: 0.5rem 1rem;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 0 0 8px 8px;
  z-index: 1;
`;

const ProgramType = styled.div<{ $type: string }>`
  display: inline-block;
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.75rem;
  font-weight: 600;
  margin-bottom: 1rem;
  background: ${props => {
    switch(props.$type) {
      case 'flagship': return '#FEF3C7';
      case 'new': return '#DBEAFE';
      case 'corporate': return '#E9D5FF';
      default: return '#E5E7EB';
    }
  }};
  color: ${props => {
    switch(props.$type) {
      case 'flagship': return '#92400E';
      case 'new': return '#1E40AF';
      case 'corporate': return '#6B21A8';
      default: return '#374151';
    }
  }};
`;

const IllustrationContainer = styled.div`
  width: 100%;
  height: 160px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 1rem;
  background: ${props => safeColor(props.theme, 'colors.background.default', '#F9FAFB')};
  border-radius: 12px;
  overflow: hidden;
`;

const ProgramTitle = styled.h3`
  font-size: 1.5rem;
  font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
  margin-bottom: 0.75rem;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
`;

const ProgramSubtitle = styled.p`
  font-size: 1rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  margin-bottom: 1.5rem;
  line-height: 1.6;
`;

const HighlightList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 1.5rem 0;
`;

const HighlightItem = styled.li`
  display: flex;
  align-items: flex-start;
  margin-bottom: 0.75rem;
  font-size: 0.875rem;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  
  svg {
    color: ${props => safeColor(props.theme, 'colors.success.main', '#10B981')};
    margin-right: 0.5rem;
    flex-shrink: 0;
    margin-top: 0.125rem;
  }
`;

const MetricsRow = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin: 1.5rem 0;
  padding: 1rem 0;
  border-top: 1px solid ${props => safeColor(props.theme, 'colors.border.light', '#E5E7EB')};
  border-bottom: 1px solid ${props => safeColor(props.theme, 'colors.border.light', '#E5E7EB')};
`;

const MetricItem = styled.div`
  text-align: center;
  
  .metric-value {
    font-size: 1.25rem;
    font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
    color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
    display: block;
  }
  
  .metric-label {
    font-size: 0.75rem;
    color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
  }
`;

const PriceTag = styled.div`
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
  
  .original-price {
    font-size: 1rem;
    color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
    text-decoration: line-through;
  }
  
  .current-price {
    font-size: 1.5rem;
    font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
    color: ${props => safeColor(props.theme, 'colors.success.main', '#10B981')};
  }
  
  .discount-badge {
    background: ${props => safeColor(props.theme, 'colors.error.main', '#EF4444')};
    color: white;
    padding: 0.25rem 0.5rem;
    border-radius: 12px;
    font-size: 0.75rem;
    font-weight: 600;
  }
`;

const StartDateBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  background: ${props => safeColor(props.theme, 'colors.primary.light', '#EFF6FF')};
  color: ${props => safeColor(props.theme, 'colors.primary.main', '#2563EB')};
  padding: 0.5rem 1rem;
  border-radius: 20px;
  font-size: 0.875rem;
  font-weight: 600;
  margin-bottom: 1rem;
  
  svg {
    width: 16px;
    height: 16px;
  }
`;

const CarouselDots = styled.div`
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 2rem;
`;

const Dot = styled.button<{ $active: boolean }>`
  width: ${props => props.$active ? '24px' : '8px'};
  height: 8px;
  border-radius: 4px;
  border: none;
  background: ${props => props.$active 
    ? safeColor(props.theme, 'colors.primary.main', '#2563EB')
    : safeColor(props.theme, 'colors.border.light', '#E5E7EB')};
  cursor: pointer;
  transition: all 0.3s ease;
  
  &:hover {
    background: ${props => safeColor(props.theme, 'colors.primary.dark', '#1D4ED8')};
  }
`;

const CorporateNote = styled.div`
  text-align: center;
  margin-top: 3rem;
  padding: 2rem;
  background: ${props => safeColor(props.theme, 'colors.primary.light', '#EFF6FF')};
  border-radius: 12px;
  
  h4 {
    font-size: 1.25rem;
    font-weight: ${props => props.theme?.typography?.fontWeightBold || 700};
    color: ${props => safeColor(props.theme, 'colors.text.primary', '#1F2937')};
    margin-bottom: 0.5rem;
  }
  
  p {
    color: ${props => safeColor(props.theme, 'colors.text.secondary', '#6B7280')};
    margin-bottom: 1rem;
  }
`;

const TrainingSection: React.FC = () => {
  const { currentTheme } = useTheme();
  const [currentIndex, setCurrentIndex] = useState(0);
  
  // SVG Illustrations for each program
  const ProcessMiningIllustration = () => (
    <svg width="280" height="150" viewBox="0 0 280 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Process Flow Background */}
      <rect x="20" y="35" width="55" height="35" rx="6" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2"/>
      <rect x="110" y="35" width="55" height="35" rx="6" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="2"/>
      <rect x="200" y="35" width="55" height="35" rx="6" fill="#D1FAE5" stroke="#10B981" strokeWidth="2"/>
      
      {/* Connecting Lines */}
      <path d="M75 52 L110 52" stroke="#E5E7EB" strokeWidth="2" strokeDasharray="4 4"/>
      <path d="M165 52 L200 52" stroke="#E5E7EB" strokeWidth="2" strokeDasharray="4 4"/>
      
      {/* Process Icons */}
      <text x="47" y="57" textAnchor="middle" fontSize="18">📊</text>
      <text x="137" y="57" textAnchor="middle" fontSize="18">⚙️</text>
      <text x="227" y="57" textAnchor="middle" fontSize="18">🎯</text>
      
      {/* Magnifying Glass Analyzing */}
      <circle cx="140" cy="100" r="25" fill="none" stroke="#2563EB" strokeWidth="3"/>
      <line x1="158" y1="118" x2="170" y2="130" stroke="#2563EB" strokeWidth="3" strokeLinecap="round"/>
      
      {/* Data Points */}
      <circle cx="132" cy="92" r="3" fill="#F59E0B"/>
      <circle cx="140" cy="97" r="3" fill="#3B82F6"/>
      <circle cx="148" cy="90" r="3" fill="#10B981"/>
      <circle cx="135" cy="105" r="3" fill="#8B5CF6"/>
      
      {/* Money Symbol */}
      <text x="220" y="105" fontSize="20" fill="#10B981" fontWeight="bold">₹</text>
      <text x="235" y="105" fontSize="14" fill="#10B981">2-5Cr</text>
      
      {/* AI Sparkles */}
      <path d="M30 15 L32 10 L34 15 L39 17 L34 19 L32 24 L30 19 L25 17 L30 15Z" fill="#F59E0B"/>
      <path d="M250 25 L251 22 L252 25 L255 26 L252 27 L251 30 L250 27 L247 26 L250 25Z" fill="#F59E0B"/>
    </svg>
  );

  const VibecodeIllustration = () => (
    <svg width="280" height="150" viewBox="0 0 280 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Code Editor Background */}
      <rect x="25" y="15" width="230" height="120" rx="6" fill="#1F2937" stroke="#374151" strokeWidth="2"/>
      
      {/* Code Editor Header */}
      <rect x="25" y="15" width="230" height="22" rx="6 6 0 0" fill="#111827"/>
      <circle cx="38" cy="26" r="3" fill="#EF4444"/>
      <circle cx="50" cy="26" r="3" fill="#F59E0B"/>
      <circle cx="62" cy="26" r="3" fill="#10B981"/>
      
      {/* Code Lines */}
      <rect x="38" y="50" width="70" height="3" rx="1.5" fill="#3B82F6"/>
      <rect x="38" y="58" width="50" height="3" rx="1.5" fill="#8B5CF6"/>
      <rect x="38" y="66" width="85" height="3" rx="1.5" fill="#10B981"/>
      <rect x="38" y="74" width="35" height="3" rx="1.5" fill="#F59E0B"/>
      <rect x="38" y="82" width="75" height="3" rx="1.5" fill="#EC4899"/>
      
      {/* AI Assistant */}
      <rect x="165" y="50" width="70" height="70" rx="6" fill="#E0E7FF" stroke="#6366F1" strokeWidth="2"/>
      <text x="200" y="72" textAnchor="middle" fontSize="20">🤖</text>
      <text x="200" y="92" textAnchor="middle" fontSize="9" fill="#6366F1" fontWeight="bold">AI Assist</text>
      
      {/* Speed Indicators */}
      <path d="M80 100 L95 100" stroke="#10B981" strokeWidth="3" strokeLinecap="round"/>
      <path d="M85 108 L100 108" stroke="#10B981" strokeWidth="3" strokeLinecap="round" opacity="0.7"/>
      <path d="M90 116 L105 116" stroke="#10B981" strokeWidth="3" strokeLinecap="round" opacity="0.4"/>
      
      {/* 5X Badge */}
      <circle cx="235" cy="115" r="18" fill="#10B981"/>
      <text x="235" y="120" textAnchor="middle" fontSize="12" fill="white" fontWeight="bold">5X</text>
    </svg>
  );

  const LeadershipIllustration = () => (
    <svg width="280" height="150" viewBox="0 0 280 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Central Leader */}
      <circle cx="140" cy="50" r="22" fill="#EDE9FE" stroke="#8B5CF6" strokeWidth="2"/>
      <text x="140" y="55" textAnchor="middle" fontSize="18">👔</text>
      
      {/* Team Members */}
      <circle cx="75" cy="100" r="18" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="2"/>
      <circle cx="140" cy="100" r="18" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="2"/>
      <circle cx="205" cy="100" r="18" fill="#D1FAE5" stroke="#10B981" strokeWidth="2"/>
      
      <text x="75" y="105" textAnchor="middle" fontSize="14">👥</text>
      <text x="140" y="105" textAnchor="middle" fontSize="14">💡</text>
      <text x="205" y="105" textAnchor="middle" fontSize="14">📊</text>
      
      {/* Connection Lines */}
      <path d="M140 72 L75 82" stroke="#E5E7EB" strokeWidth="2"/>
      <path d="M140 72 L140 82" stroke="#E5E7EB" strokeWidth="2"/>
      <path d="M140 72 L205 82" stroke="#E5E7EB" strokeWidth="2"/>
      
      {/* Digital Transformation Arrow */}
      <path d="M30 130 L250 130" stroke="#2563EB" strokeWidth="3" markerEnd="url(#arrowhead)"/>
      <defs>
        <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="10" refY="3.5" orient="auto">
          <polygon points="0 0, 10 3.5, 0 7" fill="#2563EB"/>
        </marker>
      </defs>
      
      {/* Transformation Text */}
      <text x="140" y="145" textAnchor="middle" fontSize="10" fill="#2563EB" fontWeight="bold">DIGITAL TRANSFORMATION</text>
    </svg>
  );

  const AILeadershipIllustration = () => (
    <svg width="280" height="150" viewBox="0 0 280 150" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Brain Circuit */}
      <circle cx="140" cy="75" r="45" fill="#F3E8FF" stroke="#8B5CF6" strokeWidth="2"/>
      
      {/* Neural Network Nodes */}
      <circle cx="122" cy="58" r="7" fill="#6366F1"/>
      <circle cx="158" cy="58" r="7" fill="#6366F1"/>
      <circle cx="105" cy="75" r="7" fill="#3B82F6"/>
      <circle cx="140" cy="75" r="7" fill="#8B5CF6"/>
      <circle cx="175" cy="75" r="7" fill="#3B82F6"/>
      <circle cx="122" cy="92" r="7" fill="#6366F1"/>
      <circle cx="158" cy="92" r="7" fill="#6366F1"/>
      
      {/* Connections */}
      <path d="M122 58 L140 75 M158 58 L140 75 M105 75 L140 75 M175 75 L140 75 M122 92 L140 75 M158 92 L140 75" 
            stroke="#E9D5FF" strokeWidth="2"/>
      
      {/* Business Icons Around */}
      <rect x="25" y="25" width="35" height="25" rx="5" fill="#DBEAFE" stroke="#3B82F6" strokeWidth="1"/>
      <text x="42" y="42" textAnchor="middle" fontSize="12">📈</text>
      
      <rect x="220" y="25" width="35" height="25" rx="5" fill="#D1FAE5" stroke="#10B981" strokeWidth="1"/>
      <text x="237" y="42" textAnchor="middle" fontSize="12">💰</text>
      
      <rect x="25" y="100" width="35" height="25" rx="5" fill="#FEF3C7" stroke="#F59E0B" strokeWidth="1"/>
      <text x="42" y="117" textAnchor="middle" fontSize="12">🎯</text>
      
      <rect x="220" y="100" width="35" height="25" rx="5" fill="#FCE7F3" stroke="#EC4899" strokeWidth="1"/>
      <text x="237" y="117" textAnchor="middle" fontSize="12">🚀</text>
      
      {/* AI Label */}
      <text x="140" y="80" textAnchor="middle" fontSize="14" fill="#8B5CF6" fontWeight="bold">AI</text>
    </svg>
  );
  
  const trainingPrograms = [
    {
      title: "Process Mining Mastery",
      subtitle: "Discover hidden inefficiencies worth crores in enterprise processes",
      type: "flagship",
      typeLabel: "#2 Skill - NASSCOM 2024",
      description: "India's first Claude AI + Process Mining program",
      illustration: <ProcessMiningIllustration />,
      color: "orange",
      highlights: [
        "Analyze 1M+ transactions in minutes",
        "Find ₹2-5 Cr savings opportunities",
        "Real enterprise case studies",
        "300-500% ROI in first year"
      ],
      metrics: {
        duration: "8 Weeks",
        mode: "Live Online",
        projects: "3 Live"
      },
      pricing: {
        original: "₹49,999",
        current: "₹24,999",
        discount: "50% OFF"
      },
      startDate: "28th January 2025",
      isSpecial: true,
      cta: "Join Next Batch"
    },
    {
      title: "VIBECODE",
      subtitle: "AI-Accelerated Development • Build 5X Faster",
      type: "new",
      typeLabel: "NEW LAUNCH",
      description: "Master AI tools to code like a 10-person team",
      illustration: <VibecodeIllustration />,
      color: "purple",
      highlights: [
        "Ship production apps in weeks",
        "Master Claude, GPT-4, Cursor",
        "Build SaaS, Mobile & AI apps",
        "Land ₹12-18 LPA jobs"
      ],
      metrics: {
        duration: "12 Weeks",
        mode: "Hybrid",
        projects: "5 Apps"
      },
      pricing: {
        original: "₹34,999",
        current: "₹21,999",
        discount: "37% OFF"
      },
      startDate: "15th February 2025",
      isSpecial: true,
      cta: "Start Building"
    },
    {
      title: "Digital Transformation for Leaders",
      subtitle: "Strategic leadership for the digital age",
      type: "corporate",
      typeLabel: "CORPORATE",
      description: "Transform your organization with confidence",
      illustration: <LeadershipIllustration />,
      color: "blue",
      highlights: [
        "C-suite digital strategy",
        "Change management frameworks",
        "ROI-focused transformation",
        "Industry-specific modules"
      ],
      metrics: {
        duration: "Custom",
        mode: "On-demand",
        format: "1:1 / Group"
      },
      pricing: {
        custom: true,
        text: "Customized Pricing"
      },
      cta: "Request Proposal"
    },
    {
      title: "AI for Business Leaders",
      subtitle: "Practical AI implementation for business impact",
      type: "corporate",
      typeLabel: "CORPORATE",
      description: "Demystify AI and drive real business value",
      illustration: <AILeadershipIllustration />,
      color: "green",
      highlights: [
        "AI strategy development",
        "Use case identification",
        "Implementation roadmap",
        "Risk & governance"
      ],
      metrics: {
        duration: "Custom",
        mode: "On-demand",
        format: "Executive"
      },
      pricing: {
        custom: true,
        text: "Customized Pricing"
      },
      cta: "Get Syllabus"
    }
  ];

  // Auto-scroll effect
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev === trainingPrograms.length - 1 ? 0 : prev + 1));
    }, 5000); // Change slide every 5 seconds

    return () => clearInterval(timer);
  }, [trainingPrograms.length]);

  const handleDotClick = (index: number) => {
    setCurrentIndex(index);
  };

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
            <SectionTitle theme={currentTheme}>Digital Academy</SectionTitle>
          </motion.div>
          
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
          >
            <SectionDescription theme={currentTheme}>
              Master the skills that matter. From cutting-edge technical programs to 
              executive leadership training, we prepare you for the digital future.
            </SectionDescription>
          </motion.div>
        </SectionHeader>

        <CarouselContainer>
          <motion.div 
            variants={container}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true }}
          >
            <CarouselTrack style={{ transform: `translateX(-${currentIndex * 100}%)` }}>
              {trainingPrograms.map((program, index) => (
                <ProgramCard key={index} variants={item}>
                  <StyledCard $isSpecial={program.isSpecial}>
                    {program.isSpecial && (
                      <SpecialBadge theme={currentTheme}>
                        LIMITED SEATS
                      </SpecialBadge>
                    )}
                    
                    <CardHeader>
                      <ProgramType $type={program.type}>
                        {program.typeLabel}
                      </ProgramType>
                      
                      <IllustrationContainer theme={currentTheme}>
                        {program.illustration}
                      </IllustrationContainer>
                      
                      <ProgramTitle theme={currentTheme}>{program.title}</ProgramTitle>
                      <ProgramSubtitle theme={currentTheme}>{program.subtitle}</ProgramSubtitle>
                    </CardHeader>
                    
                    <CardContent>
                      <p style={{ marginBottom: '1rem', fontSize: '0.875rem', fontStyle: 'italic' }}>
                        {program.description}
                      </p>
                      
                      <HighlightList>
                        {program.highlights.map((highlight, idx) => (
                          <HighlightItem key={idx} theme={currentTheme}>
                            <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                              <path d="M13.485 1.929a1 1 0 011.414 1.414l-8 8a1 1 0 01-1.414 0l-3-3a1 1 0 011.414-1.414L6.5 9.525l7.485-7.596z"/>
                            </svg>
                            <span>{highlight}</span>
                          </HighlightItem>
                        ))}
                      </HighlightList>
                      
                      <MetricsRow theme={currentTheme}>
                        <MetricItem theme={currentTheme}>
                          <span className="metric-value">{program.metrics.duration}</span>
                          <span className="metric-label">Duration</span>
                        </MetricItem>
                        <MetricItem theme={currentTheme}>
                          <span className="metric-value">{program.metrics.mode}</span>
                          <span className="metric-label">Mode</span>
                        </MetricItem>
                        <MetricItem theme={currentTheme}>
                          <span className="metric-value">{program.metrics.projects || program.metrics.format}</span>
                          <span className="metric-label">{program.metrics.projects ? 'Projects' : 'Format'}</span>
                        </MetricItem>
                      </MetricsRow>
                      
                      {program.startDate && (
                        <StartDateBadge theme={currentTheme}>
                          <Clock size={16} />
                          <span>Starts: {program.startDate}</span>
                        </StartDateBadge>
                      )}
                      
                      {program.pricing.custom ? (
                        <div style={{ 
                          textAlign: 'center', 
                          padding: '1rem', 
                          background: safeColor(currentTheme, 'colors.background.default', '#F9FAFB'),
                          borderRadius: '8px',
                          marginBottom: '1rem'
                        }}>
                          <p style={{ 
                            fontSize: '1.125rem', 
                            fontWeight: 600,
                            color: safeColor(currentTheme, 'colors.text.primary', '#1F2937')
                          }}>
                            {program.pricing.text}
                          </p>
                          <p style={{ 
                            fontSize: '0.875rem',
                            color: safeColor(currentTheme, 'colors.text.secondary', '#6B7280')
                          }}>
                            Tailored to your needs
                          </p>
                        </div>
                      ) : (
                        <PriceTag theme={currentTheme}>
                          <span className="original-price">{program.pricing.original}</span>
                          <span className="current-price">{program.pricing.current}</span>
                          <span className="discount-badge">{program.pricing.discount}</span>
                        </PriceTag>
                      )}
                    </CardContent>
                    
                    <CardFooter>
                      <Button
                        style={{ width: '100%' }}
                        onClick={() => window.location.href = '#contact'}
                      >
                        {program.cta}
                        <ArrowRight size={16} style={{ marginLeft: '0.5rem' }} />
                      </Button>
                    </CardFooter>
                  </StyledCard>
                </ProgramCard>
              ))}
            </CarouselTrack>
          </motion.div>
          
          <CarouselDots>
            {trainingPrograms.map((_, index) => (
              <Dot 
                key={index}
                $active={currentIndex === index}
                onClick={() => handleDotClick(index)}
                theme={currentTheme}
              />
            ))}
          </CarouselDots>
        </CarouselContainer>

        <CorporateNote theme={currentTheme}>
          <h4>🏢 Enterprise Training Solutions</h4>
          <p>
            Looking for customized training for your team? Our corporate programs are tailored 
            to your industry, challenges, and objectives.
          </p>
          <Button
            variant="outline"
            onClick={() => window.location.href = '#contact'}
          >
            Discuss Your Requirements
            <ArrowRight size={16} style={{ marginLeft: '0.5rem' }} />
          </Button>
        </CorporateNote>
      </Container>
    </SectionContainer>
  );
};

export default TrainingSection;