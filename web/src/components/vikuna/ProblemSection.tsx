// src/components/vikuna/ProblemSection.tsx
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';

const safeColor = (theme: any, path: string, fallback: string = '#000000'): string => {
  const parts = path.split('.');
  let current = theme;
  for (const part of parts) {
    if (current === undefined || current === null) return fallback;
    current = current[part];
  }
  return current || fallback;
};

const safeFont = (theme: any, key: 'fontFamily' | 'headingFontFamily'): string => {
  const val = theme?.typography?.[key];
  if (key === 'headingFontFamily') {
    return val || theme?.typography?.fontFamily || "'DM Sans', sans-serif";
  }
  return val || "'DM Sans', sans-serif";
};

// Light-background ink colors (from mockup CSS variables)
const INK = '#0A0F1E';
const INK_SOFT = '#2D3450';
const PAPER_WARM = '#EEEAE0';

// ─── Styled Components ─────────────────────────────────────────

const Section = styled.section`
  padding: 100px 60px;
  background: ${PAPER_WARM};

  @media (max-width: 768px) {
    padding: 60px 24px;
  }
`;

const SectionLabel = styled.div<{ theme: any }>`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: ${props => safeColor(props.theme, 'colors.secondary.main', '#E8420A')};
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;

  &::after {
    content: '';
    display: block;
    width: 32px;
    height: 1px;
    background: ${props => safeColor(props.theme, 'colors.secondary.main', '#E8420A')};
  }
`;

const Headline = styled(motion.h2)<{ theme: any }>`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(32px, 3.5vw, 48px);
  font-weight: 800;
  letter-spacing: -1.5px;
  line-height: 1.1;
  max-width: 600px;
  margin-bottom: 60px;
  color: ${INK};
`;

const ProblemGrid = styled(motion.div)`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  margin-bottom: 52px;
  border: 2px solid ${INK};
  border-radius: 8px;
  overflow: hidden;

  @media (max-width: 968px) {
    grid-template-columns: 1fr;
  }
`;

const ProblemCol = styled.div<{ theme: any; $isFirst?: boolean }>`
  background: ${props => (props.$isFirst ? INK : '#FFFFFF')};
  padding: 36px 32px;
  position: relative;
`;

const ColLabel = styled.div<{ theme: any; $isFirst?: boolean }>`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  margin-bottom: 16px;
  color: ${props =>
    props.$isFirst
      ? safeColor(props.theme, 'colors.secondary.light', '#FF5A22')
      : INK_SOFT};
`;

const ColHeading = styled.h3<{ theme: any; $isFirst?: boolean }>`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 18px;
  font-weight: 700;
  margin-bottom: 16px;
  line-height: 1.3;
  color: ${props => (props.$isFirst ? '#FFFFFF' : INK)};
`;

const ColText = styled.p<{ $isFirst?: boolean }>`
  font-family: ${props => "'DM Sans', sans-serif"};
  font-size: 14px;
  line-height: 1.7;
  color: ${props => (props.$isFirst ? 'rgba(255,255,255,0.55)' : INK_SOFT)};
`;

const OutcomeBar = styled(motion.div)<{ theme: any }>`
  background: ${props => safeColor(props.theme, 'colors.primary.main', INK)};
  border-radius: 8px;
  padding: 36px 40px;
  display: flex;
  align-items: center;
  gap: 20px;

  @media (max-width: 768px) {
    flex-direction: column;
    text-align: center;
    padding: 28px 24px;
  }
`;

const OutcomeIcon = styled.span`
  font-size: 28px;
  flex-shrink: 0;
`;

const OutcomeText = styled.p`
  font-family: 'DM Sans', sans-serif;
  font-size: 17px;
  font-weight: 400;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.75);

  strong {
    color: #FFFFFF;
    font-weight: 600;
  }
`;

// ─── Animation ──────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.15, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 24 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, ease: 'easeOut' },
  },
};

// ─── Data ───────────────────────────────────────────────────────

const problems = [
  {
    label: 'Big Consultants',
    heading: <>Deliver the deck.<br />Bill the hours.<br />Then disappear.</>,
    text: "Strategy documents don't transform businesses. The gap between the roadmap and the result is where most transformations die — and where big firms stop showing up.",
    isFirst: true,
  },
  {
    label: 'Full-Time Exec Hire',
    heading: <>₹1.2Cr–₹2Cr+ per year.<br />12 months before they're effective.<br />High risk, slow start.</>,
    text: "Six months to hire. Six more to ramp. By the time your new CDO or CAiO is fully effective, the window for quick wins has closed — and the board is already asking questions.",
  },
  {
    label: 'Tech Vendors',
    heading: <>Sell the tool.<br />Leave the mess.<br />Call it done.</>,
    text: "Tools alone don't create transformation. Vendors are incentivised to close deals — not to ensure the platform actually gets used, adopted, and delivers outcomes.",
  },
];

// ─── Component ──────────────────────────────────────────────────

const ProblemSection: React.FC = () => {
  const { currentTheme } = useTheme();

  return (
    <Section id="why">
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
      >
        <SectionLabel theme={currentTheme}>The Problem</SectionLabel>

        <Headline variants={itemVariants} theme={currentTheme}>
          Strategy without execution
          <br />
          is just expensive fiction.
        </Headline>

        <ProblemGrid variants={itemVariants}>
          {problems.map((p) => (
            <ProblemCol key={p.label} theme={currentTheme} $isFirst={p.isFirst}>
              <ColLabel theme={currentTheme} $isFirst={p.isFirst}>{p.label}</ColLabel>
              <ColHeading theme={currentTheme} $isFirst={p.isFirst}>{p.heading}</ColHeading>
              <ColText $isFirst={p.isFirst}>{p.text}</ColText>
            </ProblemCol>
          ))}
        </ProblemGrid>

        <OutcomeBar variants={itemVariants} theme={currentTheme}>
          <OutcomeIcon>⚡</OutcomeIcon>
          <OutcomeText>
            <strong>Vikuna sits exactly in that gap</strong> — with the expertise of a C-suite
            executive, the hands-on accountability of an implementation partner, and the commitment
            of someone who stays until it actually works.
          </OutcomeText>
        </OutcomeBar>
      </motion.div>
    </Section>
  );
};

export default ProblemSection;
