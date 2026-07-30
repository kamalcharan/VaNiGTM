// src/components/vikuna/BentoOffers.tsx
// Bento card grid on warm paper, overlapping the wound hero above.
// Row 1: Assessment (tall, dark) | C-Suite offer (large anchor card)
// Row 2: MVP | Automation Sprint | Playbooks
// Cards are doorways; only the C-Suite anchor card carries fuller content.
import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import styled, { keyframes } from 'styled-components';

const INK = '#0A0F1E';
const INK_SOFT = '#2D3450';
const PAPER_WARM = '#EEEAE0';
const WHITE = '#FFFFFF';
const ACCENT = '#E8420A';
const TEAL = '#12A090';
const GOLD = '#C9973A';
const BORDER = 'rgba(10,15,30,0.1)';

const CALENDLY = 'https://calendly.com/connect-vikuna/30min';

// ─── Section ─────────────────────────────────────────────────

const Section = styled.section`
  background: ${PAPER_WARM};
  padding: 24px 60px 72px;
  position: relative;

  @media (max-width: 768px) {
    padding: 32px 24px 48px;
  }
`;

// Gap between hero and grid, holding the hand-drawn guide arrow that
// points from the hero down toward the fractional (C-Suite) card.
const ArrowRow = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  height: 84px;
  position: relative;

  @media (max-width: 968px) {
    display: none;
  }
`;

const ArrowSvg = styled.svg`
  position: absolute;
  left: 38%;
  top: 6px;
  width: 180px;
  height: 76px;
  overflow: visible;
`;

const Grid = styled.div`
  max-width: 1200px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 0.9fr 1.1fr 1.1fr;
  grid-template-areas:
    'assess csuite csuite'
    'mvp sprint playbooks';
  gap: 20px;

  @media (max-width: 968px) {
    grid-template-columns: 1fr;
    grid-template-areas:
      'assess'
      'csuite'
      'sprint'
      'playbooks'
      'mvp';
  }
`;

const floatBounce = keyframes`
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-9px); }
`;

// Wrapper owns the grid cell + bounce so it never fights framer-motion's
// entrance transform on the Card inside.
const FloatCell = styled.div`
  grid-area: csuite;
  animation: ${floatBounce} 3.4s ease-in-out infinite;

  & > div {
    height: 100%;
  }
`;

// ─── Card primitives ─────────────────────────────────────────

const Card = styled(motion.div)<{ $area?: string; $dark?: boolean }>`
  grid-area: ${(p) => p.$area || 'auto'};
  background: ${(p) => (p.$dark ? INK : WHITE)};
  border: 1px solid ${(p) => (p.$dark ? 'rgba(255,255,255,0.08)' : BORDER)};
  border-radius: 14px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  box-shadow: 0 10px 40px rgba(10, 15, 30, 0.1);
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 16px 56px rgba(10, 15, 30, 0.16);
  }
`;

const Tag = styled.div<{ $color: string }>`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${(p) => p.$color};
  margin-bottom: 14px;
`;

const CardH = styled.h3<{ $dark?: boolean; $size?: number }>`
  font-family: 'Fraunces', serif;
  font-size: ${(p) => p.$size || 22}px;
  font-weight: 800;
  letter-spacing: -0.6px;
  line-height: 1.15;
  color: ${(p) => (p.$dark ? WHITE : INK)};
  margin-bottom: 12px;

  em {
    font-style: italic;
    color: ${(p) => (p.$dark ? GOLD : ACCENT)};
  }
`;

const CardP = styled.p<{ $dark?: boolean }>`
  font-size: 14px;
  line-height: 1.7;
  color: ${(p) => (p.$dark ? 'rgba(255,255,255,0.6)' : INK_SOFT)};
  margin-bottom: 20px;

  strong {
    color: ${(p) => (p.$dark ? 'rgba(255,255,255,0.9)' : INK)};
  }
`;

const Spacer = styled.div`
  flex: 1;
`;

const BtnSolid = styled.a`
  display: inline-block;
  background: ${ACCENT};
  color: ${WHITE};
  padding: 13px 26px;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 700;
  text-decoration: none;
  text-align: center;
  cursor: pointer;
  border: none;
  font-family: 'DM Sans', sans-serif;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 24px rgba(232, 66, 10, 0.35);
  }
`;

const LinkArrow = styled.a<{ $dark?: boolean }>`
  font-size: 13px;
  font-weight: 700;
  color: ${(p) => (p.$dark ? GOLD : ACCENT)};
  text-decoration: none;
  cursor: pointer;

  &:hover {
    text-decoration: underline;
  }
`;

// ─── C-Suite anchor card extras ──────────────────────────────

const StatChips = styled.div`
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 24px;
`;

const Chip = styled.div`
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 100px;
  padding: 6px 14px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.75);

  strong {
    color: ${GOLD};
    font-weight: 700;
  }
`;

const CtaRow = styled.div`
  display: flex;
  gap: 12px;
  align-items: center;
  flex-wrap: wrap;
`;

// ─── Component ───────────────────────────────────────────────

const cardMotion = (delay: number) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { delay, duration: 0.45 },
});

const BentoOffers: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Section id="offers">
      <ArrowRow>
        <ArrowSvg viewBox="0 0 180 76" aria-hidden="true">
          <defs>
            <marker
              id="bento-arrowhead"
              markerWidth="8"
              markerHeight="8"
              refX="6"
              refY="4"
              orient="auto"
            >
              <path d="M0,0 L8,4 L0,8 Z" fill={INK} fillOpacity="0.6" />
            </marker>
          </defs>
          <path
            d="M12 6 C 26 54, 108 70, 164 40"
            fill="none"
            stroke={INK}
            strokeOpacity="0.55"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeDasharray="6 7"
            markerEnd="url(#bento-arrowhead)"
          />
        </ArrowSvg>
      </ArrowRow>
      <Grid>
        {/* Row 1 — Assessment (tall, dark) */}
        <Card $area="assess" $dark {...cardMotion(0)}>
          <Tag $color={GOLD}>Start Here · Free</Tag>
          <CardH $dark>
            Get your AI assessment <em>done.</em>
          </CardH>
          <CardP $dark>
            12 questions, 5 dimensions, honest commentary. Know where your
            organisation actually stands before spending a rupee.
          </CardP>
          <Spacer />
          <BtnSolid onClick={() => navigate('/assessment')}>Start the Assessment</BtnSolid>
          <div style={{ marginTop: 16 }}>
            <LinkArrow $dark href="/#why">Our approach →</LinkArrow>
          </div>
        </Card>

        {/* Row 1 — C-Suite offer (large anchor, gentle bounce) */}
        <FloatCell>
        <Card $dark {...cardMotion(0.08)}>
          <Tag $color={ACCENT}>Fractional CDO · CAiO</Tag>
          <CardH $dark $size={34}>
            Get C-Suite AI &amp; Digital Leadership
            <br />
            Without the <em>₹1.5Cr+ Salary</em>
          </CardH>
          <CardP $dark>
            We don't hand you a roadmap and disappear.{' '}
            <strong>We stay. We build. We walk the entire transformation journey
            with you.</strong>
            <br />
            No junior consultants. No disappearing acts. No billing for decks.
          </CardP>
          <Spacer />
          <StatChips>
            <Chip><strong>60%</strong> cost saved vs full-time hire</Chip>
            <Chip>first results in <strong>30 days</strong></Chip>
            <Chip><strong>85%</strong> transformation success</Chip>
          </StatChips>
          <CtaRow>
            <BtnSolid href={CALENDLY} target="_blank" rel="noopener noreferrer">
              Book Free Strategy Call
            </BtnSolid>
            <LinkArrow $dark href="/#consulting-services">Explore the service →</LinkArrow>
          </CtaRow>
        </Card>
        </FloatCell>

        {/* Row 2 — MVP */}
        <Card $area="mvp" {...cardMotion(0.16)}>
          <Tag $color={ACCENT}>Build</Tag>
          <CardH $size={20}>MVP in 60–90 days</CardH>
          <CardP>A working product in front of real users — not a deck, not a prototype.</CardP>
          <Spacer />
          <LinkArrow onClick={() => navigate('/mvp')}>How we ship that fast →</LinkArrow>
        </Card>

        {/* Row 2 — Automation Sprint */}
        <Card $area="sprint" {...cardMotion(0.24)}>
          <Tag $color={TEAL}>Quick Win</Tag>
          <CardH $size={20}>AI Automation Sprint</CardH>
          <CardP>
            One workflow automated end-to-end in 2–4 weeks.{' '}
            <strong>Fixed scope, from ₹1.5L.</strong> The lowest-risk first step.
          </CardP>
          <Spacer />
          <LinkArrow href="/#automation-sprint">See how a sprint works →</LinkArrow>
        </Card>

        {/* Row 2 — Playbooks */}
        <Card $area="playbooks" {...cardMotion(0.32)}>
          <Tag $color={GOLD}>Free Downloads</Tag>
          <CardH $size={20}>The Playbooks</CardH>
          <CardP>
            Why AI Fails · The VaNi Approach · Compliance-Ready Contracts. 24 years
            of lessons, yours free.
          </CardP>
          <Spacer />
          <LinkArrow href="/#playbooks">Pick your playbook →</LinkArrow>
        </Card>
      </Grid>
    </Section>
  );
};

export default BentoOffers;
