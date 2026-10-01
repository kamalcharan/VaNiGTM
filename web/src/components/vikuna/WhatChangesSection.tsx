// src/components/vikuna/WhatChangesSection.tsx
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
const INK = '#0A0F1E';
const WHITE = '#FFFFFF';
const TEAL = '#12A090';
const GOLD = '#C9973A';

// ─── Styled Components ──────────────────────────────────────

const Section = styled.section`
  background: ${INK};
  padding: 80px 60px;

  @media (max-width: 768px) {
    padding: 48px 24px;
  }
`;

const Inner = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

const SectionLabel = styled.div`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
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
  font-size: clamp(32px, 3.5vw, 52px);
  font-weight: 800;
  letter-spacing: -1.5px;
  line-height: 1.1;
  color: ${WHITE};
  margin-bottom: 20px;
`;

const Subtitle = styled.p`
  font-size: 16px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.5);
  max-width: 520px;
  margin-bottom: 48px;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

const CardsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: 20px;
  }
`;

const Card = styled(motion.div)<{ $borderColor: string }>`
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-top: 3px solid ${props => props.$borderColor};
  border-radius: 8px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  gap: 0;
`;

const CardLabel = styled.div<{ $color: string }>`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${props => props.$color};
  margin-bottom: 20px;
`;

const StatNumber = styled.div`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(48px, 5vw, 72px);
  font-weight: 800;
  color: ${WHITE};
  letter-spacing: -2px;
  line-height: 1;
  margin-bottom: 8px;
`;

const StatDesc = styled.div`
  font-size: 14px;
  color: rgba(255, 255, 255, 0.4);
  line-height: 1.4;
  margin-bottom: 24px;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

const CardBody = styled.p`
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.5);
  flex: 1;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

const Quote = styled.div`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(16px, 1.6vw, 20px);
  font-weight: 700;
  font-style: italic;
  color: ${WHITE};
  line-height: 1.4;
  margin-bottom: 24px;
  padding-left: 16px;
  border-left: 3px solid ${GOLD};
`;

const CardTags = styled.div`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.25);
  margin-top: 24px;
  padding-top: 20px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

// ─── Data ────────────────────────────────────────────────────

const cards = [
  {
    label: 'Healthcare · Hospital Operations',
    labelColor: TEAL,
    borderColor: TEAL,
    type: 'stat' as const,
    stat: '85%',
    statDesc: 'reduction in manual patient\ndata handling',
    body: "A mid-size hospital group was running parallel systems — digital and paper — because staff didn't trust the new platform. We stayed through the transition, rebuilt the workflows around how the clinical teams actually worked, and trained every department before go-live. Twelve months later, the paper register is gone.",
    tags: 'Operations · Change Management · Training',
  },
  {
    label: 'Manufacturing · Industrial IoT',
    labelColor: TEAL,
    borderColor: TEAL,
    type: 'stat' as const,
    stat: '73%',
    statDesc: 'drop in unplanned downtime\nwithin 6 months',
    body: "Three plants. IoT sensors already installed. Zero adoption — maintenance teams had no visibility into the data and no reason to change their process. We redesigned the operational workflow first, then built the dashboards around it. The technology didn't change. How people used it did.",
    tags: 'IoT · Process Redesign · Capability Building',
  },
  {
    label: 'Pharma · Data & Reporting',
    labelColor: GOLD,
    borderColor: GOLD,
    type: 'quote' as const,
    quote: '"For the first time, our leadership team was making decisions from the same data — not three different versions of a report nobody fully trusted."',
    body: "A pharma company had invested significantly in a data platform their leadership had requested. Two years in, business units were still maintaining their own spreadsheets. The platform had the right data. It just wasn't built into how decisions were actually made. We changed that.",
    tags: 'Data Strategy · Leadership Alignment · Adoption',
  },
];

// ─── Component ───────────────────────────────────────────────

const WhatChangesSection: React.FC = () => {
  const { theme } = useTheme();

  return (
    <Section>
      <Inner>
        <SectionLabel theme={theme}>What Changes</SectionLabel>
        <Heading theme={theme}>
          Transformation that held
          <br />
          after we left the room.
        </Heading>
        <Subtitle theme={theme}>
          Not pilots. Not proofs of concept. Engagements where the organisation operates
          differently today than it did before we started.
        </Subtitle>

        <CardsGrid>
          {cards.map((card, i) => (
            <Card
              key={i}
              $borderColor={card.borderColor}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.12, duration: 0.5 }}
            >
              <CardLabel $color={card.labelColor}>{card.label}</CardLabel>

              {card.type === 'stat' ? (
                <>
                  <StatNumber theme={theme}>{card.stat}</StatNumber>
                  <StatDesc theme={theme}>{card.statDesc}</StatDesc>
                </>
              ) : (
                <Quote theme={theme}>{card.quote}</Quote>
              )}

              <CardBody theme={theme}>{card.body}</CardBody>
              <CardTags theme={theme}>{card.tags}</CardTags>
            </Card>
          ))}
        </CardsGrid>
      </Inner>
    </Section>
  );
};

export default WhatChangesSection;
