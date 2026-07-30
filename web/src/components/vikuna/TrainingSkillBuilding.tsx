// src/components/vikuna/TrainingSkillBuilding.tsx
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
const INK_SOFT = '#2D3450';
const PAPER_WARM = '#EEEAE0';
const GOLD = '#C9973A';
const WHITE = '#FFFFFF';
const BORDER = 'rgba(10,15,30,0.1)';
const TEAL = '#12A090';

// ─── Styled Components ──────────────────────────────────────

const Section = styled.section`
  background: ${PAPER_WARM};
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
  font-size: clamp(28px, 3vw, 44px);
  font-weight: 800;
  letter-spacing: -1.2px;
  line-height: 1.15;
  color: ${INK};
  margin-bottom: 12px;
`;

const Intro = styled.p`
  font-size: 16px;
  color: ${INK_SOFT};
  max-width: 580px;
  line-height: 1.8;
  margin-bottom: 48px;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

// ─── Training Cards ──────────────────────────────────────────

const TrainingGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 24px;
  margin-bottom: 32px;

  @media (max-width: 768px) {
    grid-template-columns: 1fr;
  }
`;

const TrainingCard = styled(motion.div)`
  background: ${WHITE};
  border: 1px solid ${BORDER};
  border-radius: 10px;
  padding: 32px;
  position: relative;
  overflow: hidden;
  transition: box-shadow 0.2s, transform 0.2s;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: ${GOLD};
  }

  &:hover {
    box-shadow: 0 12px 40px rgba(10, 15, 30, 0.1);
    transform: translateY(-2px);
  }
`;

const CardIcon = styled.div`
  font-size: 28px;
  margin-bottom: 16px;
`;

const CardTitle = styled.h3`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: ${INK};
  margin-bottom: 8px;
`;

const CardDesc = styled.p`
  font-size: 14px;
  color: ${INK_SOFT};
  line-height: 1.7;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

// ─── Note Bar ────────────────────────────────────────────────

const NoteBar = styled(motion.div)`
  background: ${INK};
  border-radius: 8px;
  padding: 28px 36px;
  display: flex;
  align-items: center;
  gap: 20px;

  @media (max-width: 768px) {
    flex-direction: column;
    text-align: center;
    padding: 24px;
  }
`;

const NoteIcon = styled.div`
  font-size: 24px;
  flex-shrink: 0;
`;

const NoteText = styled.p`
  font-size: 15px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.7;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};

  strong {
    color: ${WHITE};
  }
`;

// ─── Data ────────────────────────────────────────────────────

const programmes = [
  {
    icon: '🎯',
    title: 'Executive AI Leadership',
    desc: 'Strategic AI understanding for C-suite and senior leaders. Designed to move leadership from AI-curious to AI-confident — with governance frameworks and decision-making models they can use immediately.',
  },
  {
    icon: '📊',
    title: 'Data Literacy for Teams',
    desc: "Build a data-driven culture with practical analytics and decision-making skills across your organisation. Not data science — data fluency for the people who run the business.",
  },
  {
    icon: '⚙️',
    title: 'Digital Transformation Bootcamp',
    desc: 'Hands-on training for transformation leaders covering strategy, technology, and change management. Built for people who need to make transformation happen — not just understand it.',
  },
  {
    icon: '🤖',
    title: 'AI/ML Implementation Workshop',
    desc: 'Technical deep-dive for product and engineering teams implementing AI solutions. From architecture decisions to deployment patterns — practical, production-focused, and regulation-aware.',
  },
];

// ─── Component ───────────────────────────────────────────────

const TrainingSkillBuilding: React.FC = () => {
  const { theme } = useTheme();

  return (
    <Section id="training">
      <Inner>
        <SectionLabel>Service 03 — Training & Skill Building</SectionLabel>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Heading theme={theme}>
            Build the capability.
            <br />
            Not just the system.
          </Heading>
        </motion.div>

        <Intro theme={theme}>
          Adoption without training is just expensive shelf-ware. Our training programmes are
          built around how your people actually work — not generic AI theory. Practical,
          role-specific, and designed to create lasting change.
        </Intro>

        <TrainingGrid>
          {programmes.map((prog, i) => (
            <TrainingCard
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
            >
              <CardIcon>{prog.icon}</CardIcon>
              <CardTitle theme={theme}>{prog.title}</CardTitle>
              <CardDesc theme={theme}>{prog.desc}</CardDesc>
            </TrainingCard>
          ))}
        </TrainingGrid>

        <NoteBar
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <NoteIcon>💡</NoteIcon>
          <NoteText theme={theme}>
            <strong>
              Every training programme is designed around your workflows, your tools, and your
              team's actual daily work.
            </strong>{' '}
            We don't deliver generic AI courses. We embed capability into how your organisation
            already operates.
          </NoteText>
        </NoteBar>
      </Inner>
    </Section>
  );
};

export default TrainingSkillBuilding;
