// src/components/vikuna/CaseStudies.tsx
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
const PAPER = '#F7F6F2';
const WHITE = '#FFFFFF';
const TEAL = '#12A090';
const ACCENT = '#E8420A';
const GOLD = '#C9973A';
const BORDER = 'rgba(10,15,30,0.1)';

// ─── Styled Components ──────────────────────────────────────

const Section = styled.section`
  background: ${WHITE};
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
  margin-bottom: 48px;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

// ─── Case Cards ──────────────────────────────────────────────

const CasesGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const CaseCard = styled(motion.div)`
  border: 1px solid ${BORDER};
  border-radius: 10px;
  padding: 32px;
  background: ${PAPER};
  position: relative;
  overflow: hidden;
  transition: box-shadow 0.2s, transform 0.2s;

  &:hover {
    box-shadow: 0 8px 32px rgba(10, 15, 30, 0.08);
    transform: translateY(-2px);
  }
`;

const IndustryBadge = styled.span<{ $bg: string; $color: string }>`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  padding: 4px 10px;
  border-radius: 100px;
  display: inline-block;
  margin-bottom: 20px;
  background: ${props => props.$bg};
  color: ${props => props.$color};
`;

const CaseTitle = styled.h3`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.3px;
  line-height: 1.3;
  color: ${INK};
  margin-bottom: 10px;
`;

const CaseDesc = styled.p`
  font-size: 14px;
  color: ${INK_SOFT};
  line-height: 1.7;
  margin-bottom: 24px;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

const StatsRow = styled.div`
  display: flex;
  gap: 20px;
  margin-bottom: 24px;
`;

const Stat = styled.div``;

const StatNum = styled.div<{ $color: string }>`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
  margin-bottom: 4px;
  color: ${props => props.$color};
`;

const StatLabel = styled.div`
  font-size: 11px;
  color: ${INK_SOFT};
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

const CaseLink = styled.a`
  font-size: 13px;
  font-weight: 600;
  color: ${INK_SOFT};
  text-decoration: none;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  transition: color 0.2s, gap 0.2s;

  &:hover {
    color: ${INK};
    gap: 10px;
  }
`;

// ─── Data ────────────────────────────────────────────────────

const cases = [
  {
    industry: 'Pharma',
    badgeBg: 'rgba(11,123,107,0.1)',
    badgeColor: TEAL,
    title: 'MES Regulatory Compliance',
    desc: 'Integrated Manufacturing Execution System bridging IT and pharma operations — FDA & CFR Part-11 compliant, unified quality assurance platform.',
    stats: [
      { num: '−65%', label: 'Development Time', color: ACCENT },
      { num: '+42%', label: 'System Performance', color: TEAL },
    ],
  },
  {
    industry: 'Healthcare',
    badgeBg: 'rgba(232,66,10,0.08)',
    badgeColor: ACCENT,
    title: 'AI-Powered Healthcare Platform',
    desc: 'Redesigned data architecture for real-time analytics, AI/ML capabilities, and secure data sharing across a regional healthcare network.',
    stats: [
      { num: '−85%', label: 'Data Access Time', color: ACCENT },
      { num: '+210%', label: 'Analytics Adoption', color: TEAL },
    ],
  },
  {
    industry: 'Manufacturing',
    badgeBg: 'rgba(201,151,58,0.1)',
    badgeColor: GOLD,
    title: 'Industry 4.0 Digital Factory',
    desc: 'End-to-end digitisation connecting IoT devices, mobile solutions, and cloud services across production, maintenance, and supply chain.',
    stats: [
      { num: '−73%', label: 'Downtime Reduction', color: ACCENT },
      { num: '−45%', label: 'Maintenance Cost', color: ACCENT },
    ],
  },
];

// ─── Component ───────────────────────────────────────────────

const CaseStudies: React.FC = () => {
  const { theme } = useTheme();

  return (
    <Section id="cases">
      <Inner>
        <SectionLabel>Success Stories</SectionLabel>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Heading theme={theme}>
            Real outcomes. Real clients.
            <br />
            Real numbers.
          </Heading>
        </motion.div>

        <Intro theme={theme}>
          Not projections. Not averages. Actual results from actual engagements.
        </Intro>

        <CasesGrid>
          {cases.map((c, i) => (
            <CaseCard
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
            >
              <IndustryBadge $bg={c.badgeBg} $color={c.badgeColor}>
                {c.industry}
              </IndustryBadge>
              <CaseTitle theme={theme}>{c.title}</CaseTitle>
              <CaseDesc theme={theme}>{c.desc}</CaseDesc>

              <StatsRow>
                {c.stats.map((s, idx) => (
                  <Stat key={idx}>
                    <StatNum $color={s.color} theme={theme}>
                      {s.num}
                    </StatNum>
                    <StatLabel theme={theme}>{s.label}</StatLabel>
                  </Stat>
                ))}
              </StatsRow>

              <CaseLink href="#">View Case Study →</CaseLink>
            </CaseCard>
          ))}
        </CasesGrid>
      </Inner>
    </Section>
  );
};

export default CaseStudies;
