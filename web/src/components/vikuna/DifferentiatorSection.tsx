// src/components/vikuna/DifferentiatorSection.tsx
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

// ─── Styled Components ─────────────────────────────────────────

const Section = styled.section<{ theme: any }>`
  padding: 100px 60px;
  background: ${props => safeColor(props.theme, 'colors.common.white', '#FFFFFF')};

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

const DiffGrid = styled.div`
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 80px;
  align-items: center;

  @media (max-width: 968px) {
    grid-template-columns: 1fr;
    gap: 48px;
  }
`;

const DiffContent = styled(motion.div)``;

const DiffHeadline = styled.h2<{ theme: any }>`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(28px, 3vw, 42px);
  font-weight: 800;
  letter-spacing: -1.2px;
  line-height: 1.15;
  margin-bottom: 20px;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#0A0F1E')};
`;

const DiffBody = styled.p<{ theme: any }>`
  font-size: 16px;
  line-height: 1.8;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#2D3450')};
  margin-bottom: 36px;
`;

const DiffNote = styled.div<{ theme: any }>`
  margin-top: 16px;
  padding: 16px 20px;
  background: ${props => safeColor(props.theme, 'colors.secondary.main', '#E8420A')}0F;
  border-left: 3px solid ${props => safeColor(props.theme, 'colors.secondary.main', '#E8420A')};
  border-radius: 0 6px 6px 0;
  font-size: 14px;
  line-height: 1.6;
  color: ${props => safeColor(props.theme, 'colors.text.secondary', '#2D3450')};
`;

// ─── Iceberg Visual ─────────────────────────────────────────────

const IcebergWrapper = styled(motion.div)`
  display: flex;
  flex-direction: column;
  gap: 3px;
`;

const IcebergSurface = styled.div<{ theme: any }>`
  background: ${props => safeColor(props.theme, 'colors.info.main', '#0B7B6B')};
  border-radius: 8px 8px 0 0;
  padding: 20px 24px;
  text-align: center;
`;

const SurfaceLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
`;

const SurfaceTitle = styled.h4<{ theme: any }>`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 16px;
  font-weight: 700;
  color: ${props => safeColor(props.theme, 'colors.common.white', '#FFFFFF')};
`;

const IcebergDivider = styled.div<{ theme: any }>`
  text-align: center;
  padding: 10px 0;
  font-size: 11px;
  letter-spacing: 2px;
  font-weight: 700;
  text-transform: uppercase;
  color: ${props => safeColor(props.theme, 'colors.secondary.main', '#E8420A')};
  background: ${props => safeColor(props.theme, 'colors.background.paper', '#F7F6F2')};
  border-top: 2px dashed ${props => safeColor(props.theme, 'colors.secondary.main', '#E8420A')};
  border-bottom: 2px dashed ${props => safeColor(props.theme, 'colors.secondary.main', '#E8420A')};
`;

const IcebergDeep = styled.div<{ theme: any }>`
  background: ${props => safeColor(props.theme, 'colors.primary.main', '#0A0F1E')};
  border-radius: 0 0 12px 12px;
  padding: 28px 24px;
`;

const DeepLabel = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 16px;
`;

const IcebergItem = styled(motion.div)`
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  font-size: 14px;
  color: rgba(255, 255, 255, 0.8);
  font-weight: 400;

  &:last-child {
    border-bottom: none;
  }
`;

const IcebergDot = styled.div<{ theme: any }>`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: ${props => safeColor(props.theme, 'colors.info.light', '#0D9B87')};
  flex-shrink: 0;
`;

// ─── Animation ──────────────────────────────────────────────────

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12, delayChildren: 0.1 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: 'easeOut' },
  },
};

const icebergItemVariants = {
  hidden: { opacity: 0, x: -12 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, delay: i * 0.08, ease: 'easeOut' },
  }),
};

// ─── Data ───────────────────────────────────────────────────────

const deepItems = [
  'Operations Transformation',
  'Skills & Capability Development',
  'Mindset & Cultural Shifts',
  'Leadership Evolution',
  'Process Intelligence & Automation',
];

// ─── Component ──────────────────────────────────────────────────

const DifferentiatorSection: React.FC = () => {
  const { currentTheme } = useTheme();

  return (
    <Section theme={currentTheme}>
      <motion.div
        variants={containerVariants}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
      >
        <SectionLabel theme={currentTheme}>Our Approach</SectionLabel>

        <DiffGrid>
          {/* Left — Copy */}
          <DiffContent variants={itemVariants}>
            <DiffHeadline theme={currentTheme}>
              Most consultants work on the surface.
              <br />
              We work on what actually moves the needle.
            </DiffHeadline>
            <DiffBody theme={currentTheme}>
              Technology is 20% of transformation. The other 80% — culture, mindset, operations,
              capability — is where most initiatives succeed or fail. That's where we focus.
            </DiffBody>
            <DiffNote theme={currentTheme}>
              We're not attached to who builds it. We're attached to whether it works — whether
              it's your team, your vendors, or ours.
            </DiffNote>
          </DiffContent>

          {/* Right — Iceberg */}
          <IcebergWrapper variants={itemVariants}>
            <IcebergSurface theme={currentTheme}>
              <SurfaceLabel>What Most Consultants Focus On</SurfaceLabel>
              <SurfaceTitle theme={currentTheme}>Technology &amp; Tools</SurfaceTitle>
            </IcebergSurface>

            <IcebergDivider theme={currentTheme}>── Surface Level ──</IcebergDivider>

            <IcebergDeep theme={currentTheme}>
              <DeepLabel>Where Vikuna Works — Where Real Transformation Happens</DeepLabel>
              {deepItems.map((item, i) => (
                <IcebergItem
                  key={item}
                  custom={i}
                  variants={icebergItemVariants}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true }}
                >
                  <IcebergDot theme={currentTheme} />
                  {item}
                </IcebergItem>
              ))}
            </IcebergDeep>
          </IcebergWrapper>
        </DiffGrid>
      </motion.div>
    </Section>
  );
};

export default DifferentiatorSection;
