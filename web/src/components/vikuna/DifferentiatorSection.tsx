// src/components/vikuna/DifferentiatorSection.tsx
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

// ─── Color tokens (dark-on-dark section) ────────────────────────

const INK = '#0A0F1E';
const GOLD = '#C9973A';
const TEAL = '#12A090';

// ─── Styled Components ─────────────────────────────────────────

const Section = styled.section`
  padding: 100px 60px;
  background: ${INK};

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
  color: ${GOLD};
  margin-bottom: 20px;
  display: flex;
  align-items: center;
  gap: 12px;

  &::after {
    content: '';
    display: block;
    width: 32px;
    height: 1px;
    background: ${GOLD};
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
  font-size: clamp(26px, 2.8vw, 40px);
  font-weight: 800;
  letter-spacing: -1.2px;
  line-height: 1.15;
  color: #FFFFFF;
  margin-bottom: 20px;

  em {
    font-style: italic;
    color: ${GOLD};
  }
`;

const DiffBody = styled.p`
  font-size: 15px;
  line-height: 1.85;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 20px;

  strong {
    color: rgba(255, 255, 255, 0.85);
    font-weight: 500;
  }
`;

const DiffNote = styled.div`
  padding: 18px 22px;
  border-left: 3px solid ${GOLD};
  background: rgba(201, 151, 58, 0.07);
  border-radius: 0 8px 8px 0;
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.55);
  font-style: italic;
  margin-top: 8px;
`;

// ─── Iceberg Visual ─────────────────────────────────────────────

const IcebergWrap = styled(motion.div)`
  position: relative;
  width: 100%;
  min-height: 480px;
  overflow: visible;

  @media (max-width: 968px) {
    min-height: 400px;
  }
`;

const IcebergLabels = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
`;

const LabelSurface = styled.div`
  position: absolute;
  top: 2%;
  width: 60%;
  left: 20%;
  text-align: center;
`;

const SurfaceTag = styled.div`
  display: inline-block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 100px;
  padding: 4px 12px;
  margin-bottom: 8px;
`;

const SurfaceMain = styled.div<{ theme: any }>`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(14px, 1.8vw, 20px);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.2;
`;

const SurfaceSub = styled.div`
  font-size: 11px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 4px;
`;

const LabelWaterline = styled.div`
  position: absolute;
  top: calc(38% - 10px);
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 12px;
`;

const WaterlineLine = styled.div`
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(18, 160, 144, 0.6), transparent);
`;

const WaterlineText = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: rgba(18, 160, 144, 0.7);
  white-space: nowrap;
`;

const LabelDeep = styled.div`
  position: absolute;
  top: 43%;
  left: 8%;
  right: 10%;
`;

const DeepHeader = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${GOLD};
  margin-bottom: 12px;
`;

const DeepItem = styled(motion.div)`
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 10px;
`;

const DeepDot = styled.div`
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
  background: ${TEAL};
`;

const DeepName = styled.div<{ theme: any }>`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(13px, 1.4vw, 16px);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.9);
  line-height: 1.2;

  span {
    display: block;
    font-family: 'DM Sans', sans-serif;
    font-size: 11px;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.35);
    margin-top: 2px;
  }
`;

const PctAnnotation = styled.div<{ $top: string; $color: string }>`
  position: absolute;
  right: -8px;
  top: ${props => props.$top};
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;

  @media (max-width: 968px) {
    right: 0;
  }
`;

const PctNum = styled.div<{ theme: any; $color: string }>`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(24px, 2.5vw, 32px);
  font-weight: 800;
  line-height: 1;
  color: ${props => props.$color};
`;

const PctLabel = styled.div<{ $color: string }>`
  font-size: 11px;
  font-weight: 500;
  line-height: 1.3;
  text-align: right;
  max-width: 120px;
  color: ${props => props.$color};
`;

// ─── SVG Iceberg Component ──────────────────────────────────────

const IcebergSVG: React.FC = () => (
  <svg
    style={{ width: '100%', height: '100%', display: 'block' }}
    viewBox="0 0 440 520"
    preserveAspectRatio="xMidYMid meet"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
  >
    <defs>
      <linearGradient id="waterGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0B2A35" stopOpacity={0.9} />
        <stop offset="100%" stopColor="#050D18" stopOpacity={1} />
      </linearGradient>
      <linearGradient id="aboveGrad" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor="#1a2a3a" />
        <stop offset="100%" stopColor="#2a3d52" />
      </linearGradient>
      <linearGradient id="belowGrad" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#0B3D4A" />
        <stop offset="100%" stopColor="#05181F" />
      </linearGradient>
      <filter id="tealGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
      <filter id="goldGlow" x="-30%" y="-30%" width="160%" height="160%">
        <feGaussianBlur stdDeviation="8" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>

    {/* Water background */}
    <rect x="0" y="195" width="440" height="325" fill="url(#waterGrad)" />

    {/* Water shimmer lines */}
    <line x1="0" y1="220" x2="440" y2="220" stroke="rgba(18,160,144,0.07)" strokeWidth="1" />
    <line x1="0" y1="250" x2="440" y2="250" stroke="rgba(18,160,144,0.05)" strokeWidth="1" />
    <line x1="0" y1="285" x2="440" y2="285" stroke="rgba(18,160,144,0.04)" strokeWidth="1" />
    <line x1="0" y1="330" x2="440" y2="330" stroke="rgba(18,160,144,0.03)" strokeWidth="1" />

    {/* Iceberg — below water (large mass) */}
    <path
      d="M 110 198 L 60 280 L 30 370 L 20 460 L 50 510 L 390 510 L 420 460 L 415 370 L 390 280 L 330 198 Z"
      fill="url(#belowGrad)"
      stroke="rgba(18,160,144,0.25)"
      strokeWidth="1.5"
    />
    {/* Submerged inner highlight */}
    <path
      d="M 130 198 L 95 270 L 75 350 L 80 430 L 110 490 L 330 490 L 360 430 L 365 350 L 345 270 L 310 198 Z"
      fill="rgba(18,160,144,0.06)"
    />
    {/* Teal glow along submerged edges */}
    <path
      d="M 110 198 L 60 280 L 30 370 L 20 460 L 50 510"
      stroke="rgba(18,160,144,0.35)"
      strokeWidth="2"
      fill="none"
      filter="url(#tealGlow)"
    />
    <path
      d="M 330 198 L 390 280 L 415 370 L 420 460 L 390 510"
      stroke="rgba(18,160,144,0.25)"
      strokeWidth="2"
      fill="none"
    />

    {/* Waterline */}
    <rect x="0" y="192" width="440" height="8" fill="rgba(18,160,144,0.08)" />
    <line
      x1="0" y1="196" x2="440" y2="196"
      stroke="rgba(18,160,144,0.6)"
      strokeWidth="1.5"
      strokeDasharray="4 6"
    />

    {/* Iceberg — above water (small tip) */}
    <path
      d="M 165 10 L 130 60 L 110 100 L 108 198 L 332 198 L 330 100 L 310 60 L 275 10 Z"
      fill="url(#aboveGrad)"
      stroke="rgba(255,255,255,0.12)"
      strokeWidth="1.5"
    />
    {/* Above-water inner glint */}
    <path
      d="M 185 20 L 160 65 L 150 110 L 152 190 L 290 190 L 288 110 L 270 65 L 245 20 Z"
      fill="rgba(255,255,255,0.04)"
    />
    {/* Apex highlight */}
    <path d="M 200 18 L 185 45 L 220 40 Z" fill="rgba(255,255,255,0.15)" />
    {/* Gold accent — surface top edge glow */}
    <path
      d="M 165 10 L 275 10"
      stroke="rgba(201,151,58,0.6)"
      strokeWidth="2"
      filter="url(#goldGlow)"
    />

    {/* 20% bracket (above water) */}
    <line x1="336" y1="10" x2="356" y2="10" stroke="rgba(201,151,58,0.4)" strokeWidth="1" />
    <line x1="356" y1="10" x2="356" y2="196" stroke="rgba(201,151,58,0.4)" strokeWidth="1" strokeDasharray="3 4" />
    <line x1="336" y1="196" x2="356" y2="196" stroke="rgba(201,151,58,0.4)" strokeWidth="1" />
    <circle cx="356" cy="103" r="3" fill="rgba(201,151,58,0.5)" />

    {/* 80% bracket (below water) */}
    <line x1="425" y1="196" x2="436" y2="196" stroke="rgba(18,160,144,0.5)" strokeWidth="1" />
    <line x1="436" y1="196" x2="436" y2="510" stroke="rgba(18,160,144,0.5)" strokeWidth="1" strokeDasharray="3 4" />
    <line x1="425" y1="510" x2="436" y2="510" stroke="rgba(18,160,144,0.5)" strokeWidth="1" />
    <circle cx="436" cy="353" r="3" fill="rgba(18,160,144,0.6)" />
  </svg>
);

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

const deepItemVariants = {
  hidden: { opacity: 0, x: -8 },
  visible: (i: number) => ({
    opacity: 1,
    x: 0,
    transition: { duration: 0.4, delay: 0.3 + i * 0.15, ease: 'easeOut' },
  }),
};

// ─── Data ───────────────────────────────────────────────────────

const deepItems = [
  { name: 'Operations Transformation', sub: 'How work actually gets done' },
  { name: 'Skills & Capability', sub: 'Building teams that can sustain it' },
  { name: 'Mindset & Culture', sub: 'The reason most AI fails at scale' },
  { name: 'Leadership Alignment', sub: 'Strategy that survives Monday morning' },
  { name: 'Process Intelligence', sub: 'Automation that actually sticks' },
];

// ─── Component ──────────────────────────────────────────────────

const DifferentiatorSection: React.FC = () => {
  const { currentTheme } = useTheme();

  return (
    <Section>
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
              Most consultants work
              <br />
              on the <em>surface.</em>
              <br />
              We work on what
              <br />
              actually moves.
            </DiffHeadline>
            <DiffBody>
              Technology is <strong>20% of transformation.</strong>{' '}
              The other 80% — culture, mindset, operations, capability — is where most
              initiatives succeed or fail. That's where we focus.
            </DiffBody>
            <DiffNote>
              We're not attached to who builds it. We're attached to whether it works —
              whether it's your team, your vendors, or ours.
            </DiffNote>
          </DiffContent>

          {/* Right — Iceberg SVG Visual */}
          <IcebergWrap
            variants={itemVariants}
          >
            <IcebergSVG />

            <IcebergLabels>
              {/* Surface label (above water) */}
              <LabelSurface>
                <SurfaceTag>What most consultants deliver</SurfaceTag>
                <SurfaceMain theme={currentTheme}>
                  Technology
                  <br />
                  &amp; Tools
                </SurfaceMain>
                <SurfaceSub>Visible · Deliverable · Easy to invoice</SurfaceSub>
              </LabelSurface>

              {/* Waterline */}
              <LabelWaterline>
                <WaterlineLine />
                <WaterlineText>Surface Level</WaterlineText>
                <WaterlineLine />
              </LabelWaterline>

              {/* Deep items */}
              <LabelDeep>
                <DeepHeader>Where Vikuna works</DeepHeader>
                {deepItems.map((item, i) => (
                  <DeepItem
                    key={item.name}
                    custom={i}
                    variants={deepItemVariants}
                    initial="hidden"
                    whileInView="visible"
                    viewport={{ once: true }}
                  >
                    <DeepDot />
                    <DeepName theme={currentTheme}>
                      {item.name}
                      <span>{item.sub}</span>
                    </DeepName>
                  </DeepItem>
                ))}
              </LabelDeep>

              {/* 20% annotation */}
              <PctAnnotation $top="10%" $color={GOLD}>
                <PctNum theme={currentTheme} $color="rgba(201,151,58,0.9)">20%</PctNum>
                <PctLabel $color="rgba(201,151,58,0.55)">
                  Where most
                  <br />
                  engagements stop
                </PctLabel>
              </PctAnnotation>

              {/* 80% annotation */}
              <PctAnnotation $top="55%" $color={TEAL}>
                <PctNum theme={currentTheme} $color="rgba(18,160,144,0.9)">80%</PctNum>
                <PctLabel $color="rgba(18,160,144,0.55)">
                  Where transformation
                  <br />
                  actually happens
                </PctLabel>
              </PctAnnotation>
            </IcebergLabels>
          </IcebergWrap>
        </DiffGrid>
      </motion.div>
    </Section>
  );
};

export default DifferentiatorSection;
