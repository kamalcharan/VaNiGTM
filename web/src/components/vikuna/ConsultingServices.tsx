// src/components/vikuna/ConsultingServices.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';

const safeFont = (theme: any, key: 'fontFamily' | 'headingFontFamily'): string => {
  const val = theme?.typography?.[key];
  if (key === 'headingFontFamily') {
    return val || theme?.typography?.fontFamily || "'DM Sans', sans-serif";
  }
  return val || "'DM Sans', sans-serif";
};

// ─── Color tokens ────────────────────────────────────────────
const CREAM = '#FAF8F5';
const TEXT_DARK = '#1A1A2E';
const TEXT_MUTED = '#5A5A6E';
const TEAL = '#12A090';
const CORAL = '#E8420A';

// ─── Styled Components ──────────────────────────────────────

const Section = styled.section`
  background: ${CREAM};
  padding: 80px 60px 0;

  @media (max-width: 768px) {
    padding: 48px 24px 0;
  }
`;

const Inner = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const SectionLabel = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: ${TEAL};
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;

  &::after {
    content: '';
    display: block;
    width: 32px;
    height: 1px;
    background: ${TEAL};
  }
`;

const Heading = styled.h2`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(32px, 3.5vw, 48px);
  font-weight: 800;
  letter-spacing: -1.5px;
  line-height: 1.15;
  color: ${TEXT_DARK};
  margin-bottom: 24px;
`;

const Subtitle = styled.p`
  font-size: 15px;
  line-height: 1.8;
  color: ${TEXT_MUTED};
  max-width: 420px;
  margin-bottom: 48px;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

const BoldSpan = styled.span`
  font-weight: 700;
  color: ${TEXT_DARK};
`;

// ─── Service Cards ───────────────────────────────────────────

const CardsRow = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  margin-bottom: 48px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const ServiceCard = styled(motion.div)<{ $accentColor: string }>`
  background: #FFFFFF;
  border: 1px solid rgba(0, 0, 0, 0.06);
  border-top: 3px solid ${props => props.$accentColor};
  border-radius: 8px;
  padding: 32px;
  display: flex;
  flex-direction: column;
`;

const CardLabel = styled.div<{ $color: string }>`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${props => props.$color};
  margin-bottom: 12px;
`;

const CardTitle = styled.h3`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 22px;
  font-weight: 800;
  color: ${TEXT_DARK};
  margin-bottom: 6px;
`;

const CardSubtitle = styled.p`
  font-size: 13px;
  color: ${TEXT_MUTED};
  margin-bottom: 20px;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

const FeatureList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 24px 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
`;

const FeatureItem = styled.li<{ $color: string }>`
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 13px;
  color: ${TEAL};
  font-family: ${props => safeFont(props.theme, 'fontFamily')};

  &::before {
    content: '→';
    color: ${props => props.$color};
    font-weight: 700;
    flex-shrink: 0;
  }
`;

const IdealWhen = styled.div`
  font-size: 12px;
  color: ${TEXT_MUTED};
  line-height: 1.6;
  padding-top: 16px;
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  font-style: italic;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

const IdealLabel = styled.span`
  font-style: italic;
  font-weight: 600;
  color: ${TEXT_DARK};
`;

// ─── Engagement Timeline (hidden, kept for future use) ───────

// ─── Data ────────────────────────────────────────────────────

const services = [
  {
    label: 'CDO as a Service',
    accentColor: TEAL,
    labelColor: TEAL,
    title: 'Chief Digital Officer',
    subtitle: 'Strategic digital leadership & transformation guidance',
    features: [
      'Digital Strategy & Vision Development',
      'Digital Transformation Roadmap & Architecture',
      'Digital Culture & Change Management',
      'Stakeholder Alignment & Communication',
      'Performance Metrics & ROI Tracking',
    ],
    ideal:
      'Your business needs unified digital direction — whether your team builds it or your vendors do, we ensure the strategy holds.',
  },
  {
    label: 'CAiO as a Service',
    accentColor: CORAL,
    labelColor: CORAL,
    title: 'Chief AI Officer',
    subtitle: 'Executive AI leadership with measurable outcomes',
    features: [
      'AI Strategy & Implementation Roadmap',
      'Process Automation & Optimization',
      'Data-Driven Decision Frameworks',
      'AI Governance & Ethics Framework',
      'Machine Learning Operations Setup',
    ],
    ideal:
      "You're being asked about AI but have no framework. We define governance, select the right tools, and ensure outcomes — not just demos.",
  },
];

// ─── Component ───────────────────────────────────────────────

const ConsultingServices: React.FC = () => {
  const { theme } = useTheme();

  return (
    <Section id="consulting-services">
      <Inner>
        <SectionLabel>Service 01 — Fractional Leadership</SectionLabel>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Heading theme={theme}>
            The expertise your business needs.
            <br />
            Calibrated to what you can use.
          </Heading>
        </motion.div>

        <Subtitle theme={theme}>
          Fractional doesn't mean part-time commitment. It means you get a senior leader —
          fully engaged, fully accountable — who works with your team, your vendors, and your
          partners to drive transformation. We don't replace your people.{' '}
          <BoldSpan>We make them more effective.</BoldSpan>
        </Subtitle>

        {/* CDO + CAiO Cards */}
        <CardsRow>
          {services.map((svc, i) => (
            <ServiceCard
              key={i}
              $accentColor={svc.accentColor}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, duration: 0.5 }}
            >
              <CardLabel $color={svc.labelColor}>{svc.label}</CardLabel>
              <CardTitle theme={theme}>{svc.title}</CardTitle>
              <CardSubtitle theme={theme}>{svc.subtitle}</CardSubtitle>

              <FeatureList>
                {svc.features.map((f, idx) => (
                  <FeatureItem key={idx} $color={svc.accentColor} theme={theme}>
                    {f}
                  </FeatureItem>
                ))}
              </FeatureList>

              <IdealWhen theme={theme}>
                <IdealLabel>Ideal when: </IdealLabel>
                {svc.ideal}
              </IdealWhen>
            </ServiceCard>
          ))}
        </CardsRow>

        {/* Engagement Timeline - hidden, not deleted */}
        {/* <TimelineBox
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          <TimelineHeading theme={theme}>How an Engagement Typically Works</TimelineHeading>

          {timeline.map((row, i) => (
            <TimelineRow key={i}>
              <TimeLabel $color={row.color} theme={theme}>
                {row.label}
              </TimeLabel>
              <TimeDash>—</TimeDash>
              <TimeDesc theme={theme}>
                {row.text} <TimeBold>{row.bold}</TimeBold>
              </TimeDesc>
            </TimelineRow>
          ))}
        </TimelineBox> */}
      </Inner>
    </Section>
  );
};

export default ConsultingServices;
