// src/components/vikuna/AutomationSprint.tsx
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
const WHITE = '#FFFFFF';
const ACCENT = '#E8420A';
const TEAL = '#12A090';
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
  max-width: 580px;
  line-height: 1.8;
  margin-bottom: 48px;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};

  strong {
    color: ${INK};
  }
`;

const StepsGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;
  margin-bottom: 32px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const StepCard = styled(motion.div)`
  background: #F7F6F2;
  border: 1px solid ${BORDER};
  border-radius: 10px;
  padding: 32px;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: ${ACCENT};
  }
`;

const StepWeek = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${ACCENT};
  margin-bottom: 12px;
`;

const StepTitle = styled.h3`
  font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.3px;
  color: ${INK};
  margin-bottom: 8px;
`;

const StepDesc = styled.p`
  font-size: 14px;
  color: ${INK_SOFT};
  line-height: 1.7;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};
`;

// ─── Price + CTA bar ─────────────────────────────────────────

const PriceBar = styled(motion.div)`
  background: ${INK};
  border-radius: 8px;
  padding: 32px 40px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 28px;

  @media (max-width: 900px) {
    flex-direction: column;
    text-align: center;
    padding: 28px 24px;
  }
`;

const PriceText = styled.div`
  h3 {
    font-family: ${props => safeFont(props.theme, 'headingFontFamily')};
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.4px;
    color: ${WHITE};
    margin-bottom: 6px;

    span {
      color: ${GOLD};
    }
  }

  p {
    font-size: 14px;
    color: rgba(255, 255, 255, 0.6);
    line-height: 1.7;
    max-width: 560px;
    font-family: ${props => safeFont(props.theme, 'fontFamily')};
  }
`;

const PriceCta = styled.a`
  background: ${ACCENT};
  color: ${WHITE};
  padding: 14px 32px;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 700;
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
  transition: transform 0.2s, box-shadow 0.2s;
  font-family: ${props => safeFont(props.theme, 'fontFamily')};

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(232, 66, 10, 0.35);
  }
`;

// ─── Data ────────────────────────────────────────────────────

const steps = [
  {
    week: 'Week 0 — Pick the Workflow',
    title: 'ROI first, tools later',
    desc: 'We map your operations and pick one high-friction workflow — quotations, follow-ups, reporting, scheduling — where automation pays for itself fastest. Scope is fixed before we start.',
  },
  {
    week: 'Weeks 1–3 — Build',
    title: 'Built on VaNi, proven in our products',
    desc: 'The same event-driven AI approach that runs ContractNest. Target 70–80% of the workflow automated, with the rest routed to your people — human-in-the-loop by design.',
  },
  {
    week: 'Week 4 — Go Live',
    title: 'Live in your business, run by your team',
    desc: 'We deploy, train your team, and hand over. You see the workflow running — and measured — before deciding whether to automate the next one or go deeper with us.',
  },
];

// ─── Component ───────────────────────────────────────────────

const AutomationSprint: React.FC = () => {
  const { theme } = useTheme();

  return (
    <Section id="automation-sprint">
      <Inner>
        <SectionLabel>Service 02 — AI Automation Sprint</SectionLabel>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Heading theme={theme}>
            Your first AI win.
            <br />
            Shipped in 2–4 weeks.
          </Heading>
        </motion.div>

        <Intro theme={theme}>
          Not a strategy. Not a pilot that never leaves the lab. <strong>One workflow in
          your business, automated end-to-end, live in production</strong> — fixed scope,
          fixed price, measurable before/after. The lowest-risk way to find out what
          working with us is actually like.
        </Intro>

        <StepsGrid>
          {steps.map((step, i) => (
            <StepCard
              key={i}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
            >
              <StepWeek>{step.week}</StepWeek>
              <StepTitle theme={theme}>{step.title}</StepTitle>
              <StepDesc theme={theme}>{step.desc}</StepDesc>
            </StepCard>
          ))}
        </StepsGrid>

        <PriceBar
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.4 }}
        >
          <PriceText theme={theme}>
            <h3>
              Sprints start at <span>₹1.5L</span> — fixed scope, fixed price.
            </h3>
            <p>
              Final quote depends on workflow complexity, agreed before we begin. No
              retainers, no lock-in — if the sprint doesn't earn the next engagement,
              that's on us.
            </p>
          </PriceText>
          <PriceCta
            href="https://calendly.com/connect-vikuna/30min"
            target="_blank"
            rel="noopener noreferrer"
            theme={theme}
          >
            Book a Sprint Scoping Call
          </PriceCta>
        </PriceBar>
      </Inner>
    </Section>
  );
};

export default AutomationSprint;
