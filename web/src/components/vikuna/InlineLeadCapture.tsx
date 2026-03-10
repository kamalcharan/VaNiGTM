// src/components/vikuna/InlineLeadCapture.tsx
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
const ACCENT_SOFT = '#E8420A';
const TEAL_LIGHT = '#12A090';

// ─── Styled Components ──────────────────────────────────────

const Section = styled.section`
  background: ${INK};
  text-align: center;
  padding: 120px 60px;

  @media (max-width: 768px) {
    padding: 80px 24px;
  }
`;

const Heading = styled.h2`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: clamp(32px, 4vw, 56px);
  font-weight: 800;
  letter-spacing: -2px;
  color: ${WHITE};
  margin-bottom: 16px;
  line-height: 1.05;
`;

const AccentText = styled.em`
  font-style: normal;
  color: ${ACCENT_SOFT};
`;

const Subtitle = styled.p`
  font-size: 17px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 44px;
  max-width: 480px;
  margin-left: auto;
  margin-right: auto;
  line-height: 1.7;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

const CTAButton = styled.a`
  display: inline-block;
  font-size: 15px;
  font-weight: 700;
  padding: 16px 36px;
  background: ${ACCENT_SOFT};
  color: ${WHITE};
  border: none;
  border-radius: 6px;
  text-decoration: none;
  cursor: pointer;
  transition: all 0.2s;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};

  &:hover {
    background: #FF5A22;
    transform: translateY(-2px);
    box-shadow: 0 8px 24px rgba(232, 66, 10, 0.3);
  }
`;

const TrustBadges = styled.div`
  display: flex;
  justify-content: center;
  gap: 32px;
  flex-wrap: wrap;
  margin-top: 28px;
`;

const TrustItem = styled.span`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
  letter-spacing: 0.5px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};

  &::before {
    content: '·';
    color: ${TEAL_LIGHT};
  }
`;

// ─── Component ───────────────────────────────────────────────

const InlineLeadCapture: React.FC = () => {
  const { theme } = useTheme();

  return (
    <Section id="contact">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
      >
        <Heading theme={theme}>
          Ready to stop planning
          <br />
          and start <AccentText>transforming?</AccentText>
        </Heading>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.15, duration: 0.4 }}
      >
        <Subtitle theme={theme}>
          One conversation. No obligation. We'll tell you honestly if we're the right fit —
          and if we're not, we'll point you in the right direction.
        </Subtitle>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ delay: 0.25, duration: 0.4 }}
      >
        <CTAButton href="https://calendly.com/connect-vikuna/30min" target="_blank" rel="noopener noreferrer" theme={theme}>
          Book Your Free Strategy Call
        </CTAButton>

        <TrustBadges>
          <TrustItem theme={theme}>100% Confidential</TrustItem>
          <TrustItem theme={theme}>No Sales Pitch</TrustItem>
          <TrustItem theme={theme}>Senior Transformation Expert on Every Call</TrustItem>
          <TrustItem theme={theme}>No Obligation</TrustItem>
        </TrustBadges>
      </motion.div>
    </Section>
  );
};

export default InlineLeadCapture;
