// src/components/vikuna/VaNiPage.tsx
// Landing page for VaNi — Vikuna's internal AI framework.
//
// VaNi is deliberately NOT positioned as a licensable product; the framework's
// own fourth pillar says so. This page exists to explain what the framework is,
// show where it already runs, and give invited users a way in. Access is by
// invitation only — there is no registration path anywhere on this page.
//
// Destined for vani.vikuna.io; lives at /vani until that subdomain is stood up.
import React, { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import styled, { keyframes, css } from 'styled-components';
import Footer from './Footer';

// ─── Tokens ──────────────────────────────────────────────────
const INK = '#0A0F1E';
const INK_DEEP = '#070B16';
const WHITE = '#FFFFFF';
const ACCENT = '#E8420A';
const ACCENT_LIGHT = '#FF8A3D';
const TEAL = '#12A090';
const GOLD = '#C9973A';
const GOLD_LIGHT = '#E0B65C';
const BORDER = 'rgba(255,255,255,0.12)';
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const CALENDLY = 'https://calendly.com/connect-vikuna/30min';

// ─── Scaffolding ─────────────────────────────────────────────

const Page = styled.div`
  background: ${INK};
`;

const Section = styled.section<{ $bg?: string }>`
  background: ${(p) => p.$bg || INK};
  padding: 76px 60px;

  @media (max-width: 768px) {
    padding: 48px 22px;
  }
`;

const Inner = styled.div`
  max-width: 1180px;
  margin: 0 auto;
`;

const Rule = styled.div`
  max-width: 1180px;
  margin: 0 auto 40px;
  display: flex;
  align-items: center;
  gap: 16px;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: rgba(201, 151, 58, 0.22);
  }

  span {
    font-family: ${MONO};
    font-size: 11px;
    letter-spacing: 0.14em;
    color: rgba(201, 151, 58, 0.75);
    white-space: nowrap;
  }

  @media (max-width: 760px) {
    gap: 10px;

    span {
      white-space: normal;
      text-align: center;
      font-size: 10px;
    }
  }
`;

const Eyebrow = styled.div`
  font-family: ${MONO};
  font-size: 11px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: ${TEAL};
  margin-bottom: 16px;
`;

const H2 = styled.h2`
  font-family: 'Fraunces', serif;
  font-size: clamp(27px, 3vw, 42px);
  font-weight: 800;
  letter-spacing: -1.2px;
  line-height: 1.15;
  color: ${WHITE};
  margin-bottom: 14px;

  em {
    font-style: italic;
    color: ${GOLD};
  }
`;

const Lede = styled.p`
  font-size: 16px;
  line-height: 1.85;
  color: rgba(255, 255, 255, 0.62);
  max-width: 660px;
  margin-bottom: 44px;

  strong {
    color: ${WHITE};
    font-weight: 500;
  }
`;

// ─── Hero ────────────────────────────────────────────────────

const Hero = styled.section`
  background: ${INK_DEEP};
  padding: 140px 60px 84px;
  position: relative;
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 116px 22px 56px;
  }
`;

const HeroGlow = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 55% 60% at 74% 34%, rgba(201, 151, 58, 0.16) 0%, transparent 62%),
    radial-gradient(ellipse 45% 50% at 8% 88%, rgba(18, 160, 144, 0.08) 0%, transparent 62%);
  pointer-events: none;
`;

// Faint engineering grid, masked to fade at the edges. Static CSS rather than a
// canvas, so it costs nothing at runtime.
const HeroMesh = styled.div`
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(201, 151, 58, 0.055) 1px, transparent 1px),
    linear-gradient(90deg, rgba(201, 151, 58, 0.055) 1px, transparent 1px);
  background-size: 52px 52px;
  -webkit-mask-image: radial-gradient(ellipse 78% 70% at 50% 42%, #000 0%, transparent 76%);
  mask-image: radial-gradient(ellipse 78% 70% at 50% 42%, #000 0%, transparent 76%);
`;

const HeroGrid = styled.div`
  position: relative;
  z-index: 1;
  max-width: 1180px;
  margin: 0 auto;
  display: grid;
  grid-template-columns: 1.08fr 0.92fr;
  gap: 56px;
  align-items: center;

  @media (max-width: 940px) {
    grid-template-columns: 1fr;
    gap: 40px;
  }
`;

const HeroBadge = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 9px;
  font-family: ${MONO};
  font-size: 10.5px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: ${GOLD};
  border: 1px solid rgba(201, 151, 58, 0.38);
  background: rgba(201, 151, 58, 0.1);
  padding: 7px 15px;
  border-radius: 4px;
  margin-bottom: 26px;

  &::before {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${GOLD};
  }
`;

const H1 = styled.h1`
  font-family: 'Fraunces', serif;
  font-size: clamp(58px, 10vw, 116px);
  font-weight: 800;
  letter-spacing: -4px;
  line-height: 0.9;
  color: ${WHITE};
  margin-bottom: 10px;
`;

const HeroSub = styled.div`
  font-family: 'Fraunces', serif;
  font-size: clamp(19px, 2.4vw, 27px);
  font-style: italic;
  font-weight: 600;
  letter-spacing: -0.5px;
  color: ${GOLD};
  margin-bottom: 22px;
`;

const HeroBody = styled.p`
  font-size: 16px;
  line-height: 1.85;
  color: rgba(255, 255, 255, 0.6);
  max-width: 520px;
  margin-bottom: 32px;

  strong {
    color: rgba(255, 255, 255, 0.92);
    font-weight: 500;
  }
`;

const Ctas = styled.div`
  display: flex;
  gap: 14px;
  flex-wrap: wrap;
  margin-bottom: 30px;
`;

// One rule across every Vikuna surface: ACCENT is the action, GOLD identifies
// VaNi. This page previously used gold mono buttons, which made the journey
// from the homepage into /vani read as two different design systems even though
// the tokens matched. Matches MVPPage's BtnPrimary exactly.
//
// An anchor rather than a router Link: it crosses origins to the console.
const BtnPrimary = styled.a`
  background: ${ACCENT};
  color: ${WHITE};
  padding: 16px 36px;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 700;
  text-decoration: none;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(232, 66, 10, 0.35);
  }
`;

const BtnGhost = styled.a`
  border: 1px solid ${BORDER};
  color: rgba(255, 255, 255, 0.8);
  font-size: 15px;
  font-weight: 600;
  padding: 16px 36px;
  border-radius: 4px;
  text-decoration: none;
  transition: border-color 0.2s, color 0.2s;

  &:hover {
    border-color: rgba(255, 255, 255, 0.4);
    color: ${WHITE};
  }
`;

const MetaRow = styled.div`
  display: flex;
  gap: 22px;
  flex-wrap: wrap;
  font-family: ${MONO};
  font-size: 10.5px;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.42);

  span {
    display: inline-flex;
    align-items: center;
    gap: 7px;

    &::before {
      content: '';
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: ${TEAL};
    }
  }
`;

// ─── Orbit diagram ───────────────────────────────────────────
// Static SVG rather than an animated canvas: it makes the same point (one core,
// many products) without a permanent requestAnimationFrame loop or a
// reduced-motion problem.

const OrbitWrap = styled.div`
  display: flex;
  justify-content: center;

  svg {
    width: 100%;
    max-width: 440px;
    height: auto;
  }
`;

const orbitNodes = [
  { label: 'ContractNest', angle: -90 },
  { label: 'DristiQ', angle: -18 },
  { label: 'ProKey', angle: 54 },
  { label: 'VaNi App', angle: 126 },
  { label: '…more', angle: 198 },
];

const Orbit: React.FC = () => {
  const cx = 220;
  const cy = 220;
  const r = 148;
  return (
    <OrbitWrap>
      <svg viewBox="0 0 440 440" role="img" aria-label="VaNi at the core, with the products built on it around it">
        <circle cx={cx} cy={cy} r={r + 40} fill="none" stroke="rgba(201,151,58,0.08)" strokeWidth="1" />
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="rgba(201,151,58,0.22)" strokeWidth="1" strokeDasharray="3 5" />
        <circle cx={cx} cy={cy} r={r - 46} fill="none" stroke="rgba(201,151,58,0.1)" strokeWidth="1" />

        {orbitNodes.map((n) => {
          const rad = (n.angle * Math.PI) / 180;
          const x = cx + r * Math.cos(rad);
          const y = cy + r * Math.sin(rad);
          const isMore = n.label === '…more';
          const col = isMore ? 'rgba(255,255,255,0.32)' : GOLD_LIGHT;
          return (
            <g key={n.label}>
              <line x1={cx} y1={cy} x2={x} y2={y} stroke="rgba(201,151,58,0.2)" strokeWidth="1" />
              <circle cx={x} cy={y} r="7" fill={INK_DEEP} stroke={col} strokeWidth="1.5" />
              <circle cx={x} cy={y} r="2.6" fill={col} />
              <text
                x={x}
                y={y + (Math.sin(rad) < -0.3 ? -18 : 24)}
                textAnchor="middle"
                fill={isMore ? 'rgba(255,255,255,0.36)' : 'rgba(255,255,255,0.72)'}
                fontFamily={MONO}
                fontSize="11.5"
                letterSpacing="0.5"
              >
                {n.label}
              </text>
            </g>
          );
        })}

        <circle cx={cx} cy={cy} r="46" fill="rgba(201,151,58,0.1)" stroke="rgba(201,151,58,0.5)" strokeWidth="1.5" />
        <text
          x={cx}
          y={cy + 9}
          textAnchor="middle"
          fill={GOLD}
          fontFamily="'Fraunces', serif"
          fontSize="27"
          fontWeight="800"
          letterSpacing="-1"
        >
          VaNi
        </text>
      </svg>
    </OrbitWrap>
  );
};

// ─── Pillars ─────────────────────────────────────────────────

const PillarList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 2px;
  border: 1px solid ${BORDER};
  border-radius: 12px;
  overflow: hidden;
`;

const PillarRow = styled(motion.div)`
  display: grid;
  grid-template-columns: 74px 1fr 1.25fr;
  gap: 26px;
  align-items: start;
  background: rgba(255, 255, 255, 0.035);
  padding: 26px 28px;
  transition: background 0.25s;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  @media (max-width: 860px) {
    grid-template-columns: 48px 1fr;
    gap: 16px;
    padding: 22px 18px;
  }
`;

const PillarNum = styled.div`
  font-family: ${MONO};
  font-size: 12px;
  letter-spacing: 0.1em;
  color: ${GOLD};
  border: 1px solid rgba(201, 151, 58, 0.35);
  background: rgba(201, 151, 58, 0.09);
  border-radius: 6px;
  padding: 8px 0;
  text-align: center;
`;

const PillarMain = styled.div`
  .tag {
    font-family: ${MONO};
    font-size: 10px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${TEAL};
    margin-bottom: 7px;
  }

  h3 {
    font-family: 'Fraunces', serif;
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.4px;
    line-height: 1.25;
    color: ${WHITE};
  }
`;

const PillarDetail = styled.p`
  font-size: 14px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.58);

  strong {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
  }

  @media (max-width: 860px) {
    grid-column: 2;
    margin-top: 10px;
  }
`;

const pillars = [
  {
    num: '01',
    tag: 'Discovery',
    title: 'Use case discovery & ROI mapping',
    detail: (
      <>
        No use case moves forward without a business case. Every opportunity is mapped to a
        measurable outcome — cost saved, time freed, errors eliminated.{' '}
        <strong>If the ROI isn't clear, we don't build it.</strong>
      </>
    ),
  },
  {
    num: '02',
    tag: 'Architecture',
    title: 'UNS + event-driven architecture',
    detail: (
      <>
        VaNi is built on a Unified Namespace — a single data layer connecting systems,
        devices and services. <strong>Agents don't poll; they respond to events</strong> as
        they happen, which is what makes automation real-time and contextual.
      </>
    ),
  },
  {
    num: '03',
    tag: 'Design',
    title: 'Human-in-the-loop by design',
    detail: (
      <>
        Agents handle the routine, humans handle the judgement. Every deployment has clear
        escalation paths, so when an agent reaches a decision boundary{' '}
        <strong>the right person gets the right context</strong>. No black boxes.
      </>
    ),
  },
  {
    num: '04',
    tag: 'Delivery',
    title: 'Custom-built. No off-the-shelf.',
    detail: (
      <>
        <strong>VaNi is not a product you licence.</strong> Every agent, workflow and
        integration is built for a specific environment — its data structures, its business
        rules, its edge cases.
      </>
    ),
  },
  {
    num: '05',
    tag: 'Outcomes',
    title: 'Measurable outcomes before scale',
    detail: (
      <>
        Nothing scales before it is proven. Deployments start with a controlled rollout — one
        process, one team, one workflow. <strong>Measure, prove, then expand.</strong>
      </>
    ),
  },
];

// ─── Deployments ─────────────────────────────────────────────

const DeployGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 18px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const DeployCard = styled(motion.div)<{ $accent: string }>`
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid ${BORDER};
  border-left: 3px solid ${(p) => p.$accent};
  border-radius: 12px;
  padding: 26px 28px;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  .top {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    margin-bottom: 14px;
  }

  h3 {
    font-family: 'Fraunces', serif;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: -0.6px;
    color: ${WHITE};
  }

  .kind {
    font-family: ${MONO};
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${(p) => p.$accent};
    border: 1px solid ${(p) => p.$accent}55;
    background: ${(p) => p.$accent}18;
    padding: 4px 10px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .role {
    font-family: ${MONO};
    font-size: 11.5px;
    letter-spacing: 0.05em;
    color: ${(p) => p.$accent};
    margin-bottom: 10px;
  }

  p {
    font-size: 14px;
    line-height: 1.8;
    color: rgba(255, 255, 255, 0.6);
  }
`;

const deployments = [
  {
    name: 'ContractNest',
    kind: 'Our product',
    accent: ACCENT_LIGHT,
    role: 'Virtual ops agent',
    body: 'Runs service contracts end to end — scheduling, invoicing and notifications — escalating to a human the moment a decision needs judgement rather than a rule.',
  },
  {
    name: 'DristiQ',
    kind: 'Our product',
    accent: GOLD_LIGHT,
    role: 'Quant data analytics',
    body: 'Reads market and time-cycle data across many independent lenses and surfaces where they converge, as research rather than recommendation.',
  },
  {
    name: 'VaNi App',
    kind: 'Our product',
    accent: TEAL,
    role: 'Assessments',
    body: 'Generates and scores NEET assessments for students preparing across three languages, adapting to where each student actually loses marks.',
  },
  {
    name: 'ProKey',
    kind: 'Built for a customer',
    accent: '#8B93FF',
    role: 'Intake · Lead management · FP&A',
    body: 'Captures intake, manages leads through the pipeline, and runs financial planning analysis — a customer platform built on the same framework as our own.',
  },
];

// ─── Skills ──────────────────────────────────────────────────

const SkillGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 2px;
  border: 1px solid ${BORDER};
  border-radius: 12px;
  overflow: hidden;

  @media (max-width: 900px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 560px) {
    grid-template-columns: 1fr;
  }
`;

const Skill = styled.div<{ $upcoming?: boolean }>`
  background: rgba(255, 255, 255, ${(p) => (p.$upcoming ? 0.02 : 0.04)});
  padding: 24px 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;

  .name {
    font-family: 'Fraunces', serif;
    font-size: 17px;
    font-weight: 700;
    letter-spacing: -0.3px;
    color: ${(p) => (p.$upcoming ? 'rgba(255,255,255,0.5)' : WHITE)};
  }

  .state {
    font-family: ${MONO};
    font-size: 9.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${(p) => (p.$upcoming ? 'rgba(255,255,255,0.35)' : TEAL)};
  }

  .where {
    font-size: 13px;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.5);
  }
`;

const skills = [
  { name: 'Virtual Ops Agent', where: 'Service contracts, invoicing, notifications, human handover — live in ContractNest.' },
  { name: 'Quant Data Analytics', where: 'Multi-lens market and time-cycle analysis — live in DristiQ.' },
  { name: 'Assessments', where: 'NEET assessment generation and scoring — live in the VaNi App.' },
  { name: 'Intake & Lead Management', where: 'Capture through pipeline — live in ProKey.' },
  { name: 'Financial Planning Analysis', where: 'FP&A workflows — live in ProKey.' },
  { name: 'GTM', where: 'Go-to-market prospecting and account intelligence.', upcoming: true },
];

// ─── Agent trace ─────────────────────────────────────────────
// One real event walked end to end, because the two hardest pillars to explain
// in prose — event-driven and human-in-the-loop — are obvious the moment you
// watch an event arrive, get acted on, and hit a decision boundary.

const blink = keyframes`
  0%, 49%  { opacity: 1; }
  50%, 100% { opacity: 0; }
`;

const pulse = keyframes`
  0%, 100% { box-shadow: 0 0 0 0 rgba(18,160,144,0.55); }
  50%      { box-shadow: 0 0 0 7px rgba(18,160,144,0); }
`;

const Terminal = styled.div`
  background: #05080F;
  border: 1px solid rgba(201, 151, 58, 0.2);
  border-radius: 12px;
  overflow: hidden;
  font-family: ${MONO};
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.45);
`;

const TermHead = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  padding: 12px 18px;
  background: rgba(255, 255, 255, 0.035);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 11.5px;
  color: rgba(255, 255, 255, 0.72);

  .live {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${TEAL};
  }
`;

const LiveDot = styled.span<{ $still?: boolean }>`
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: ${TEAL};
  ${(p) =>
    !p.$still &&
    css`
      animation: ${pulse} 2.4s ease-in-out infinite;
    `}
`;

const TermBody = styled.div`
  padding: 16px 18px 20px;
  overflow-x: auto;
`;

const TraceLine = styled.div<{ $dim?: boolean }>`
  display: grid;
  grid-template-columns: 74px 92px 1fr;
  gap: 14px;
  align-items: baseline;
  padding: 6px 0;
  font-size: 12px;
  line-height: 1.6;
  min-width: 520px;

  .ts {
    color: rgba(255, 255, 255, 0.3);
  }

  .msg {
    color: ${(p) => (p.$dim ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.82)')};

    b {
      color: ${WHITE};
      font-weight: 500;
    }
  }
`;

const Kind = styled.span<{ $color: string }>`
  font-size: 9.5px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${(p) => p.$color};
  border: 1px solid ${(p) => p.$color}55;
  background: ${(p) => p.$color}16;
  border-radius: 3px;
  padding: 3px 0;
  text-align: center;
`;

const Cursor = styled.span`
  display: inline-block;
  width: 8px;
  height: 14px;
  background: ${GOLD};
  vertical-align: -2px;
  margin-left: 4px;
  animation: ${blink} 1.1s step-end infinite;
`;

const TermFoot = styled.div`
  padding: 11px 18px;
  background: rgba(255, 255, 255, 0.035);
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.42);
  display: flex;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

type TraceStep = { ts: string; kind: string; color: string; msg: React.ReactNode; dim?: boolean };

const trace: TraceStep[] = [
  {
    ts: '09:14:02',
    kind: 'Event',
    color: GOLD_LIGHT,
    msg: (
      <>
        <b>sla.timer.breached</b> — contract CN-2847, response window elapsed
      </>
    ),
  },
  {
    ts: '09:14:02',
    kind: 'Context',
    color: '#8B93FF',
    msg: <>Unified namespace resolved 4 linked obligations, 1 asset, 2 parties</>,
    dim: true,
  },
  {
    ts: '09:14:03',
    kind: 'Agent',
    color: TEAL,
    msg: (
      <>
        Ops agent evaluating escalation policy — <b>confidence 0.91</b>
      </>
    ),
  },
  {
    ts: '09:14:03',
    kind: 'Action',
    color: TEAL,
    msg: <>Vendor notified over WhatsApp with evidence checklist attached</>,
  },
  {
    ts: '09:14:04',
    kind: 'Action',
    color: TEAL,
    msg: (
      <>
        Invoice <b>held</b> — no proof of work on file for visit 10 of 12
      </>
    ),
  },
  {
    ts: '09:14:06',
    kind: 'Handover',
    color: ACCENT_LIGHT,
    msg: (
      <>
        Decision boundary reached — routed to <b>facility manager</b> with full context
      </>
    ),
  },
];

const AgentTrace: React.FC = () => {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? trace.length : 0);

  useEffect(() => {
    if (reduced) {
      setShown(trace.length);
      return;
    }
    if (shown >= trace.length) {
      const hold = window.setTimeout(() => setShown(0), 4200);
      return () => window.clearTimeout(hold);
    }
    const next = window.setTimeout(() => setShown((s) => s + 1), shown === 0 ? 400 : 780);
    return () => window.clearTimeout(next);
  }, [shown, reduced]);

  return (
    <Terminal>
      <TermHead>
        <span>vani://runtime/ops-agent — contractnest</span>
        <span className="live">
          <LiveDot $still={!!reduced} />
          Event stream
        </span>
      </TermHead>
      <TermBody>
        {trace.slice(0, shown).map((s, i) => (
          <TraceLine key={`${s.ts}-${i}`} $dim={s.dim}>
            <span className="ts">{s.ts}</span>
            <Kind $color={s.color}>{s.kind}</Kind>
            <span className="msg">
              {s.msg}
              {!reduced && i === shown - 1 && shown < trace.length && <Cursor />}
            </span>
          </TraceLine>
        ))}
        {shown === 0 && (
          <TraceLine $dim>
            <span className="ts">—</span>
            <Kind $color="rgba(255,255,255,0.3)">Idle</Kind>
            <span className="msg">
              Waiting for events
              <Cursor />
            </span>
          </TraceLine>
        )}
      </TermBody>
      <TermFoot>
        <span>6 steps · 4 seconds · 1 human decision</span>
        <span>Illustrative trace</span>
      </TermFoot>
    </Terminal>
  );
};

// ─── Final CTA ───────────────────────────────────────────────

const Final = styled.section`
  background: ${INK_DEEP};
  padding: 88px 60px;
  text-align: center;
  position: relative;
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 60px 22px;
  }
`;

const FinalGlow = styled.div`
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 55% 45% at 50% 50%, rgba(201, 151, 58, 0.12) 0%, transparent 70%);
  pointer-events: none;
`;

const FinalInner = styled.div`
  position: relative;
  z-index: 1;
`;

const FinalH2 = styled.h2`
  font-family: 'Fraunces', serif;
  font-size: clamp(27px, 4vw, 46px);
  font-weight: 800;
  letter-spacing: -1.5px;
  line-height: 1.1;
  color: ${WHITE};
  margin-bottom: 16px;

  em {
    font-style: italic;
    color: ${GOLD};
  }
`;

const FinalP = styled.p`
  font-size: 16px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.58);
  max-width: 540px;
  margin: 0 auto 34px;
`;

const FinalCtas = styled.div`
  display: flex;
  gap: 14px;
  justify-content: center;
  flex-wrap: wrap;
`;

// ─── Component ───────────────────────────────────────────────

const VaNiPage: React.FC = () => {
  return (
    <Page>
      <Hero>
        <HeroGlow />
        <HeroMesh />
        <HeroGrid>
          <motion.div initial={{ opacity: 0, y: 22 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <HeroBadge>Vikuna&rsquo;s AI Framework</HeroBadge>
            <H1>VaNi</H1>
            <HeroSub>Not a product. A way of working.</HeroSub>
            <HeroBody>
              VaNi is the framework every Vikuna product is built on — event-driven, ROI-first,
              human-in-the-loop. <strong>It is internal by design.</strong> You don&rsquo;t
              licence VaNi; you see it working in the products it runs.
            </HeroBody>
            <Ctas>
              <BtnPrimary href="https://vani.vikuna.io/login">Sign in to VaNi →</BtnPrimary>
              <BtnGhost href="#where">See where it runs ↓</BtnGhost>
            </Ctas>
            <MetaRow>
              <span>Internal framework</span>
              <span>Invitation only</span>
              <span>No public registration</span>
            </MetaRow>
          </motion.div>

          <motion.div initial={{ opacity: 0, scale: 0.94 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.7, delay: 0.15 }}>
            <Orbit />
          </motion.div>
        </HeroGrid>
      </Hero>

      <Section>
        <Rule>
          <span>// WHAT VANI IS</span>
        </Rule>
        <Inner>
          <Eyebrow>The short version</Eyebrow>
          <H2>
            Most AI fails in production.
            <br />
            VaNi is <em>what we did about it.</em>
          </H2>
          <Lede>
            VaNi began as a name and became a way of working — a set of hard rules about what
            gets built, how it is architected, and when a human has to be in the loop. It is
            not a platform we sell and not a model we trained.{' '}
            <strong>It is the discipline that decides whether an AI system survives contact
            with a real business</strong>, and it is the reason our products behave the same
            way in three unrelated industries.
          </Lede>
        </Inner>
      </Section>

      <Section>
        <Rule>
          <span>// CORE PILLARS</span>
        </Rule>
        <Inner>
          <Eyebrow>Five principles</Eyebrow>
          <H2>How VaNi is different.</H2>
          <Lede>
            Five principles that hold on every engagement, regardless of industry, company
            size or use case.
          </Lede>

          <PillarList>
            {pillars.map((p, i) => (
              <PillarRow
                key={p.num}
                initial={{ opacity: 0, y: 14 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i, 4) * 0.05 }}
              >
                <PillarNum>{p.num}</PillarNum>
                <PillarMain>
                  <div className="tag">{p.tag}</div>
                  <h3>{p.title}</h3>
                </PillarMain>
                <PillarDetail>{p.detail}</PillarDetail>
              </PillarRow>
            ))}
          </PillarList>
        </Inner>
      </Section>

      <Section id="trace">
        <Rule>
          <span>// AGENT TRACE</span>
        </Rule>
        <Inner>
          <Eyebrow>One event, end to end</Eyebrow>
          <H2>
            What &ldquo;event-driven&rdquo;
            <br />
            <em>actually looks like.</em>
          </H2>
          <Lede>
            An SLA timer expires on a live contract. No one polled for it and no one filed a
            ticket — the event arrives, the agent resolves its context, acts where the rules
            are clear, and{' '}
            <strong>stops at the boundary where a human should decide.</strong>
          </Lede>
          <AgentTrace />
        </Inner>
      </Section>

      <Section id="where">
        <Rule>
          <span>// WHERE VANI RUNS</span>
        </Rule>
        <Inner>
          <Eyebrow>In production today</Eyebrow>
          <H2>
            One framework,
            <br />
            <em>four very different jobs.</em>
          </H2>
          <Lede>
            The clearest way to understand VaNi is to look at what it is already doing. These
            businesses have nothing in common — contracts, markets, exams, financial planning
            — and <strong>the same framework sits under all of them.</strong>
          </Lede>

          <DeployGrid>
            {deployments.map((d, i) => (
              <DeployCard
                key={d.name}
                $accent={d.accent}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 2) * 0.07 }}
              >
                <div className="top">
                  <h3>{d.name}</h3>
                  <span className="kind">{d.kind}</span>
                </div>
                <div className="role">{d.role}</div>
                <p>{d.body}</p>
              </DeployCard>
            ))}
          </DeployGrid>
        </Inner>
      </Section>

      <Section>
        <Rule>
          <span>// SKILLS</span>
        </Rule>
        <Inner>
          <Eyebrow>The capability library</Eyebrow>
          <H2>
            VaNi grows by <em>skills.</em>
          </H2>
          <Lede>
            A skill is a capability the framework can carry into any deployment. Each one was
            built for a real product first and then generalised —{' '}
            <strong>never the other way round.</strong>
          </Lede>

          <SkillGrid>
            {skills.map((s) => (
              <Skill key={s.name} $upcoming={s.upcoming}>
                <div className="state">{s.upcoming ? 'Releasing later' : 'Live'}</div>
                <div className="name">{s.name}</div>
                <div className="where">{s.where}</div>
              </Skill>
            ))}
          </SkillGrid>
        </Inner>
      </Section>

      <Final>
        <FinalGlow />
        <FinalInner>
          <FinalH2>
            Already have <em>access?</em>
          </FinalH2>
          <FinalP>
            VaNi is an internal platform. Accounts are issued to the Vikuna team and to
            partners on active engagements — there is no public sign-up.
          </FinalP>
          <FinalCtas>
            <BtnPrimary href="https://vani.vikuna.io/login">Sign in to VaNi →</BtnPrimary>
            <BtnGhost href={CALENDLY} target="_blank" rel="noopener noreferrer">
              Talk to us about an engagement
            </BtnGhost>
          </FinalCtas>
        </FinalInner>
      </Final>

      <Footer />
    </Page>
  );
};

export default VaNiPage;
