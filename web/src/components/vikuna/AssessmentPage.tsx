// src/components/vikuna/AssessmentPage.tsx

import { useState, useEffect, useRef, useCallback } from 'react';
import styled, { keyframes, css } from 'styled-components';

// ── DATA ──────────────────────────────────────────────────────────────
const DIMENSIONS = [
  { id: 'leadership', label: 'Leadership & Governance', color: '#12A090' },
  { id: 'data', label: 'Data Readiness', color: '#E8420A' },
  { id: 'process', label: 'Process Maturity', color: '#C9973A' },
  { id: 'people', label: 'People & Culture', color: '#7B5EA7' },
  { id: 'technology', label: 'Technology Landscape', color: '#2980B9' },
];

interface QuestionOption {
  text: string;
  score: number;
}

interface Question {
  dim: number;
  text: string;
  sub: string;
  options: QuestionOption[];
}

const QUESTIONS: Question[] = [
  // LEADERSHIP & GOVERNANCE (0,1,2)
  {
    dim: 0,
    text: 'When was the last time AI was on the board or leadership agenda?',
    sub: 'Not as a buzzword — as a strategic item with ownership and accountability.',
    options: [
      { text: "It's on every agenda — we have an owner and a roadmap.", score: 4 },
      { text: 'It came up in the last quarter, but no clear owner.', score: 2 },
      { text: "It's been discussed, but no real follow-through.", score: 1 },
      { text: "Honestly? Not meaningfully. It's background noise.", score: 0 },
    ],
  },
  {
    dim: 0,
    text: 'If your most senior AI or Digital leader left tomorrow — what survives?',
    sub: 'Strategy, momentum, institutional knowledge.',
    options: [
      { text: 'The strategy is documented, owned by multiple people, and would continue.', score: 4 },
      { text: 'Some things would slow down but the direction is clear.', score: 2 },
      { text: 'It would set us back significantly.', score: 1 },
      { text: "There is no such leader. That's part of the problem.", score: 0 },
    ],
  },
  {
    dim: 0,
    text: 'Does your organisation have a clear AI governance framework?',
    sub: "Who decides what AI gets built, bought, or banned. Who's accountable when something goes wrong.",
    options: [
      { text: 'Yes — documented, communicated, actively used.', score: 4 },
      { text: 'We have something informal but not formalised.', score: 2 },
      { text: "We've talked about needing one.", score: 1 },
      { text: "No — it's the wild west.", score: 0 },
    ],
  },
  // DATA READINESS (3,4)
  {
    dim: 1,
    text: 'Your team gets a monthly performance report. Who actually reads it — and changes something because of it?',
    sub: "Not 'who opens it'. Who acts on it.",
    options: [
      { text: 'Multiple people across the business use it to make decisions routinely.', score: 4 },
      { text: "A few people do, but it's not systemic.", score: 2 },
      { text: 'It gets read, but rarely changes anything.', score: 1 },
      { text: 'Most people skim it or ignore it entirely.', score: 0 },
    ],
  },
  {
    dim: 1,
    text: 'If an AI agent needed to access your operational data today — how ready is it?',
    sub: 'Think: accessibility, quality, consistency, governance.',
    options: [
      { text: 'Clean, accessible, well-governed. Ready to use.', score: 4 },
      { text: 'Mostly good but siloed across systems.', score: 2 },
      { text: "Inconsistent. You'd need significant cleanup first.", score: 1 },
      { text: "It's scattered, manual, or in people's heads.", score: 0 },
    ],
  },
  // PROCESS MATURITY (5,6)
  {
    dim: 2,
    text: 'Name one workflow AI has meaningfully changed in your organisation in the last 6 months.',
    sub: 'Not a pilot. Not a demo. An actual workflow that runs differently now.',
    options: [
      { text: 'I can name several — with measurable before/after results.', score: 4 },
      { text: 'One or two, though the impact is still being measured.', score: 2 },
      { text: 'We tried some things but nothing stuck at scale.', score: 1 },
      { text: "I can't name one. That's an honest answer.", score: 0 },
    ],
  },
  {
    dim: 2,
    text: 'Before your organisation automates a process — how is it assessed?',
    sub: 'Do you map ROI first, or build first and hope?',
    options: [
      { text: 'We map the ROI and feasibility before any build starts.', score: 4 },
      { text: "Informally — it depends on who's driving it.", score: 2 },
      { text: 'We mostly build based on gut feel and vendor pitches.', score: 1 },
      { text: "We don't have a process for evaluating this.", score: 0 },
    ],
  },
  // PEOPLE & CULTURE (7,8)
  {
    dim: 3,
    text: 'Your employees have access to AI tools. What do they actually use them for?',
    sub: 'Think about the majority, not the enthusiasts.',
    options: [
      { text: 'Role-specific tasks — drafting, analysis, automation in their daily workflow.', score: 4 },
      { text: 'Some useful things, but mostly writing assistance.', score: 2 },
      { text: 'Spell check, summaries, occasional help. Mostly novelty.', score: 1 },
      { text: "Most don't really use them, or use them once and stopped.", score: 0 },
    ],
  },
  {
    dim: 3,
    text: 'When a new AI tool or process is introduced — how does the organisation respond?',
    sub: 'Be honest about the typical reaction, not the aspiration.',
    options: [
      { text: 'Adoption is relatively smooth — people are curious and engaged.', score: 4 },
      { text: 'Mixed. Some embrace it, many wait and see.', score: 2 },
      { text: 'Significant resistance. Change management is a constant battle.', score: 1 },
      { text: 'Initiatives tend to die in adoption. The tools get shelfed.', score: 0 },
    ],
  },
  // TECHNOLOGY LANDSCAPE (9,10,11)
  {
    dim: 4,
    text: 'How would you describe your current technology architecture?',
    sub: 'Integrated and connected vs. siloed and fragmented.',
    options: [
      { text: 'Modern, well-integrated — systems talk to each other.', score: 4 },
      { text: 'Mix of old and new — some integration, some silos.', score: 2 },
      { text: 'Mostly legacy. Integration is painful.', score: 1 },
      { text: 'Fragmented. Every team does their own thing.', score: 0 },
    ],
  },
  {
    dim: 4,
    text: 'How many AI tools or platforms is your organisation currently paying for?',
    sub: 'Including subscriptions your teams bought independently.',
    options: [
      { text: 'A few, well-governed, with clear ownership and ROI.', score: 4 },
      { text: 'Several — some have clear value, others are hard to track.', score: 2 },
      { text: "Many — it's become unmanageable. Shadow IT is real.", score: 1 },
      { text: "Very few or none — we haven't started.", score: 0 },
    ],
  },
  {
    dim: 4,
    text: 'Does your organisation have a Unified Namespace or single source of truth for operational data?',
    sub: 'One place where systems, devices, and data sources connect — rather than point-to-point integrations.',
    options: [
      { text: 'Yes — a single data layer that everything connects to.', score: 4 },
      { text: "Partially — we have a data warehouse or lake, but it's incomplete.", score: 2 },
      { text: 'Not really — data lives in separate systems.', score: 1 },
      { text: "No — and honestly we hadn't thought about this.", score: 0 },
    ],
  },
];

// ── SCORING HELPERS ──────────────────────────────────────────────────
function computeScores(answers: (number | null)[]): number[] {
  return DIMENSIONS.map((_, dIdx) => {
    const qs = QUESTIONS.map((q, qIdx) => ({ q, qIdx }))
      .filter(({ q, qIdx }) => q.dim === dIdx && answers[qIdx] !== null);
    if (qs.length === 0) return 0;
    const total = qs.reduce((sum, { q, qIdx }) => {
      const ansIdx = answers[qIdx];
      return sum + (ansIdx !== null ? q.options[ansIdx].score : 0);
    }, 0);
    const maxPossible = qs.length * 4;
    return Math.round((total / maxPossible) * 100);
  });
}

function getDimCommentary(dIdx: number, score: number): string {
  const comments = [
    [
      'Strong leadership foundation. AI has ownership at the top and governance is in place.',
      'Leadership awareness is there but accountability is still forming. The strategy needs an owner.',
      'AI is on the radar but not embedded in how leadership thinks and decides.',
      'Leadership alignment is the critical gap. Without it, everything else stalls.',
    ],
    [
      'Data is ready to work with. Clean, accessible, and governed — AI can be built on this.',
      'Data foundations exist but fragmentation will slow you down. Unification is the next step.',
      'Data quality and accessibility need investment before AI can deliver consistent results.',
      'Data is the foundational gap. AI built on poor data produces confident wrong answers.',
    ],
    [
      'Processes are mature enough for AI to slot in cleanly. You know what to automate.',
      'Some process clarity exists but ROI-first thinking needs to become standard practice.',
      'Processes need mapping before automation. Building on unclear processes scales the mess.',
      'Process definition comes before AI. Automating confusion creates expensive confusion.',
    ],
    [
      'Culture is genuinely AI-ready. People are curious, adaptive, and using tools meaningfully.',
      'Pockets of adoption exist but it\'s not systemic. Culture investment will unlock the tools.',
      'Adoption is the active challenge. Training and change management need prioritisation.',
      'People and culture are the primary barrier. Tools without adoption are shelf-ware.',
    ],
    [
      'Technology landscape is modern and connected. Ready for AI integration.',
      'Hybrid architecture needs rationalisation. Some integration work before AI scales cleanly.',
      'Legacy systems will create friction. A technology roadmap should accompany any AI initiative.',
      'Technology fragmentation is a significant constraint. Architecture work comes first.',
    ],
  ];
  const tier = score >= 75 ? 0 : score >= 50 ? 1 : score >= 25 ? 2 : 3;
  return comments[dIdx][tier];
}

function getOverallLabel(avg: number) {
  if (avg >= 75) return { label: 'Strong Foundation', color: '#12A090', text: "Your organisation has the foundations in place. The question isn't whether you're ready — it's what to prioritise first." };
  if (avg >= 55) return { label: 'Developing Readiness', color: '#C9973A', text: "You're further along than most. A few targeted investments across your weaker dimensions will unlock significant progress." };
  if (avg >= 35) return { label: 'Early Stage', color: '#E8420A', text: 'Real work ahead — but the gaps are identifiable and addressable. The right starting point matters more than speed.' };
  return { label: 'Foundation Gaps', color: '#E8420A', text: 'The honest picture: foundational work comes before AI deployment. The good news — organisations that do this properly move faster later.' };
}

function getInsights(dimScores: number[]) {
  const sorted = dimScores.map((s, i) => ({ i, s })).sort((a, b) => a.s - b.s);
  const weakest = sorted[0];
  const strongest = sorted[sorted.length - 1];
  const avg = Math.round(dimScores.reduce((a, b) => a + b, 0) / dimScores.length);

  return [
    {
      type: 'Biggest Opportunity', typeColor: '#C9973A',
      title: DIMENSIONS[weakest.i].label,
      text: `At ${weakest.s}%, this is where focused attention will create the most impact. It's also likely where transformation initiatives have stalled before.`,
    },
    {
      type: 'Build From Strength', typeColor: '#12A090',
      title: DIMENSIONS[strongest.i].label,
      text: `Your strongest dimension at ${strongest.s}%. Start AI initiatives here — the foundations are in place and early wins will build momentum across the organisation.`,
    },
    {
      type: 'The Honest Assessment', typeColor: '#7B5EA7',
      title: avg >= 60 ? "You're ready to move" : avg >= 40 ? 'Targeted investment needed' : 'Foundations before AI',
      text: avg >= 60
        ? "Your readiness profile is solid. The right next step is a focused use case discovery — not more assessment."
        : avg >= 40
          ? "You have real strengths to build from. A structured 60-day plan targeting your weakest dimensions would change your readiness profile significantly."
          : "The most valuable thing right now isn't an AI tool — it's a clear transformation roadmap that addresses your foundational gaps in sequence.",
    },
  ];
}

// ── RADAR CHART DRAW ──────────────────────────────────────────────────
function drawRadar(canvas: HTMLCanvasElement, scores: number[]) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const R = Math.min(cx, cy) - 28;
  const n = scores.length;
  const angles = scores.map((_, i) => (i * 2 * Math.PI) / n - Math.PI / 2);

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Grid rings
  [0.25, 0.5, 0.75, 1].forEach((r) => {
    ctx.beginPath();
    angles.forEach((a, i) => {
      const x = cx + R * r * Math.cos(a);
      const y = cy + R * r * Math.sin(a);
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Spokes
  angles.forEach((a) => {
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + R * Math.cos(a), cy + R * Math.sin(a));
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.stroke();
  });

  // Filled polygon
  ctx.beginPath();
  angles.forEach((a, i) => {
    const r = scores[i] / 100;
    const x = cx + R * r * Math.cos(a);
    const y = cy + R * r * Math.sin(a);
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = 'rgba(201,151,58,0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(201,151,58,0.7)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Dots + labels
  const shortLabels = ['Leadership', 'Data', 'Process', 'People', 'Technology'];
  DIMENSIONS.forEach((dim, i) => {
    const a = angles[i];
    const r = scores[i] / 100;
    const x = cx + R * r * Math.cos(a);
    const y = cy + R * r * Math.sin(a);
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fillStyle = dim.color;
    ctx.fill();

    const lx = cx + (R + 18) * Math.cos(a);
    const ly = cy + (R + 18) * Math.sin(a);
    ctx.font = '700 9px DM Sans, sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.textAlign = Math.abs(lx - cx) < 5 ? 'center' : lx < cx ? 'right' : 'left';
    ctx.textBaseline = ly < cy ? 'bottom' : ly > cy + 5 ? 'top' : 'middle';
    ctx.fillText(shortLabels[i], lx, ly);
  });
}

// ── STYLED COMPONENTS ──────────────────────────────────────────────────
const ink = '#080C1A';
const borderDim = 'rgba(255,255,255,0.08)';
const dimBg = 'rgba(255,255,255,0.06)';

const PageWrapper = styled.div`
  font-family: 'DM Sans', sans-serif;
  background: ${ink};
  color: #fff;
  min-height: 100vh;
  overflow-x: hidden;
`;

// ── LANDING ──
const LandingSection = styled.div`
  min-height: 100vh; display: flex; align-items: center;
  justify-content: center; padding: 100px 48px 60px;
  position: relative; overflow: hidden;
  @media (max-width: 900px) { padding: 80px 24px 40px; }
`;

const LandingBg = styled.div`
  position: absolute; inset: 0;
  background:
    radial-gradient(ellipse 70% 60% at 60% 40%, rgba(11,123,107,0.12) 0%, transparent 60%),
    radial-gradient(ellipse 40% 40% at 20% 70%, rgba(232,66,10,0.06) 0%, transparent 60%);
`;

const LandingGridBg = styled.div`
  position: absolute; inset: 0;
  background-image:
    linear-gradient(rgba(255,255,255,0.02) 1px, transparent 1px),
    linear-gradient(90deg, rgba(255,255,255,0.02) 1px, transparent 1px);
  background-size: 60px 60px;
`;

const LandingContent = styled.div`
  position: relative; z-index: 2;
  max-width: 720px; text-align: center;
`;

const blink = keyframes`
  0%,100% { opacity: 1; } 50% { opacity: 0.3; }
`;

const LandingEyebrow = styled.div`
  display: inline-flex; align-items: center; gap: 8px;
  border: 1px solid rgba(201,151,58,0.3);
  background: rgba(201,151,58,0.07);
  padding: 6px 16px; border-radius: 100px;
  font-size: 11px; font-weight: 600; letter-spacing: 2px;
  text-transform: uppercase; color: #E0B050;
  margin-bottom: 32px;
`;

const EyebrowDot = styled.div`
  width: 5px; height: 5px; border-radius: 50%;
  background: #E0B050; animation: ${blink} 2s infinite;
`;

const LandingH1 = styled.h1`
  font-family: 'Fraunces', serif;
  font-size: clamp(36px, 5vw, 64px); font-weight: 800;
  letter-spacing: -2px; line-height: 1.05;
  margin-bottom: 20px; color: #fff;
  em { font-style: italic; color: #E0B050; }
`;

const LandingP = styled.p`
  font-size: 17px; font-weight: 300; line-height: 1.75;
  color: rgba(255,255,255,0.55); max-width: 520px;
  margin: 0 auto 16px;
  strong { color: rgba(255,255,255,0.85); font-weight: 500; }
`;

const LandingMeta = styled.p`
  font-size: 13px; color: rgba(255,255,255,0.3);
  margin-bottom: 40px;
  span { margin: 0 10px; }
`;

const BtnStart = styled.button`
  background: #C9973A; color: #fff;
  padding: 16px 40px; border-radius: 4px;
  font-size: 15px; font-weight: 700; letter-spacing: 0.3px;
  border: none; cursor: pointer; transition: all 0.2s;
  font-family: 'DM Sans', sans-serif;
  &:hover { background: #E0B050; transform: translateY(-2px); box-shadow: 0 8px 32px rgba(201,151,58,0.3); }
`;

const LandingDimensions = styled.div`
  display: flex; justify-content: center; gap: 10px;
  flex-wrap: wrap; margin-top: 40px;
`;

const LandingDim = styled.div`
  font-size: 11px; font-weight: 600; letter-spacing: 0.5px;
  padding: 5px 14px; border-radius: 100px;
  border: 1px solid ${borderDim};
  color: rgba(255,255,255,0.3);
`;

// ── QUIZ ──
const QuizShell = styled.div`
  min-height: 100vh; display: flex; flex-direction: column;
  padding-top: 72px;
`;

const QuizProgress = styled.div`
  position: fixed; top: 72px; left: 0; right: 0; z-index: 150;
  height: 3px; background: ${dimBg};
`;

const QuizProgressFill = styled.div<{ width: number }>`
  height: 100%;
  background: linear-gradient(90deg, #0B7B6B, #C9973A);
  transition: width 0.5s cubic-bezier(0.4,0,0.2,1);
  border-radius: 0 2px 2px 0;
  width: ${(p) => p.width}%;
`;

const QuizProgressLabel = styled.div`
  position: fixed; top: 80px; right: 48px; z-index: 150;
  font-size: 11px; font-weight: 600; letter-spacing: 1.5px;
  text-transform: uppercase; color: rgba(255,255,255,0.25);
`;

const questionIn = keyframes`
  from { opacity: 0; transform: translateY(20px); }
  to { opacity: 1; transform: translateY(0); }
`;

const questionOut = keyframes`
  from { opacity: 1; transform: translateY(0); }
  to { opacity: 0; transform: translateY(-16px); }
`;

const QuestionScreen = styled.div<{ leaving?: boolean }>`
  display: flex; flex-direction: column; align-items: center;
  justify-content: center; min-height: calc(100vh - 72px);
  padding: 60px 48px; text-align: center;
  animation: ${(p) => (p.leaving ? css`${questionOut} 0.25s ease both` : css`${questionIn} 0.4s ease both`)};
  @media (max-width: 900px) { padding: 80px 24px 40px; }
`;

const QDimension = styled.div`
  font-size: 10px; font-weight: 700; letter-spacing: 3px;
  text-transform: uppercase; margin-bottom: 20px;
  display: flex; align-items: center; gap: 8px; justify-content: center;
`;

const QDimDot = styled.div<{ bg: string }>`
  width: 6px; height: 6px; border-radius: 50%;
  background: ${(p) => p.bg};
`;

const QNumber = styled.div`
  font-family: 'Fraunces', serif; font-size: 11px;
  font-weight: 700; letter-spacing: 2px;
  color: rgba(255,255,255,0.2); margin-bottom: 12px;
  text-transform: uppercase;
`;

const QText = styled.div`
  font-family: 'Fraunces', serif;
  font-size: clamp(22px, 3.5vw, 38px); font-weight: 700;
  letter-spacing: -0.8px; line-height: 1.2;
  max-width: 680px; margin-bottom: 12px; color: #fff;
`;

const QSubtext = styled.div`
  font-size: 14px; color: rgba(255,255,255,0.35);
  max-width: 500px; line-height: 1.6; margin-bottom: 44px;
  font-style: italic;
`;

const QOptions = styled.div`
  display: flex; flex-direction: column; gap: 10px;
  width: 100%; max-width: 560px;
`;

const QOption = styled.button<{ selected: boolean }>`
  background: ${(p) => (p.selected ? 'rgba(201,151,58,0.12)' : dimBg)};
  border: 1px solid ${(p) => (p.selected ? 'rgba(201,151,58,0.5)' : borderDim)};
  border-radius: 8px; padding: 16px 24px;
  cursor: pointer; transition: all 0.2s;
  display: flex; align-items: center; gap: 14px;
  text-align: left; font-family: 'DM Sans', sans-serif; color: #fff;
  &:hover {
    background: ${(p) => (p.selected ? 'rgba(201,151,58,0.12)' : 'rgba(255,255,255,0.09)')};
    border-color: ${(p) => (p.selected ? 'rgba(201,151,58,0.5)' : 'rgba(255,255,255,0.2)')};
    transform: translateX(4px);
  }
`;

const QOptionKey = styled.span<{ selected: boolean }>`
  width: 28px; height: 28px; border-radius: 6px; flex-shrink: 0;
  background: ${(p) => (p.selected ? '#C9973A' : 'rgba(255,255,255,0.06)')};
  display: flex; align-items: center; justify-content: center;
  font-size: 11px; font-weight: 700;
  color: ${(p) => (p.selected ? '#fff' : 'rgba(255,255,255,0.3)')};
  transition: all 0.2s;
`;

const QOptionText = styled.span<{ selected: boolean }>`
  font-size: 15px; line-height: 1.4;
  color: ${(p) => (p.selected ? '#fff' : 'rgba(255,255,255,0.75)')};
  font-weight: 400;
`;

const QNav = styled.div`
  display: flex; align-items: center; gap: 16px; margin-top: 32px;
`;

const BtnNext = styled.button<{ enabled: boolean }>`
  background: #fff; color: ${ink};
  padding: 12px 28px; border-radius: 4px;
  font-size: 14px; font-weight: 700;
  border: none; cursor: pointer; font-family: 'DM Sans', sans-serif;
  transition: all 0.2s;
  opacity: ${(p) => (p.enabled ? 1 : 0.3)};
  pointer-events: ${(p) => (p.enabled ? 'all' : 'none')};
  &:hover {
    background: #C9973A; color: #fff; transform: translateY(-1px);
  }
`;

const BtnBack = styled.button`
  font-size: 13px; color: rgba(255,255,255,0.25);
  background: none; border: none; cursor: pointer;
  font-family: 'DM Sans', sans-serif; transition: color 0.2s;
  &:hover { color: rgba(255,255,255,0.5); }
`;

// ── RESULTS ──
const ResultsShell = styled.div`
  min-height: 100vh; padding: 100px 60px 80px;
  background: ${ink}; position: relative; overflow: hidden;
  @media (max-width: 900px) { padding: 80px 24px 60px; }
`;

const ResultsBg = styled.div`
  position: absolute; inset: 0;
  background: radial-gradient(ellipse 60% 50% at 50% 30%, rgba(201,151,58,0.07) 0%, transparent 60%);
  pointer-events: none;
`;

const ResultsInner = styled.div`
  position: relative; z-index: 2; max-width: 960px; margin: 0 auto;
`;

const ResultsEyebrow = styled.div`
  font-size: 11px; font-weight: 700; letter-spacing: 3px;
  text-transform: uppercase; color: #C9973A; margin-bottom: 16px;
  display: flex; align-items: center; gap: 10px;
  &::after { content: ''; display: block; width: 32px; height: 1px; background: #C9973A; }
`;

const ResultsH2 = styled.h2`
  font-family: 'Fraunces', serif;
  font-size: clamp(28px, 4vw, 52px); font-weight: 800;
  letter-spacing: -1.5px; line-height: 1.05; color: #fff;
  margin-bottom: 12px;
  em { font-style: italic; color: #E0B050; }
`;

const ResultsTagline = styled.p`
  font-size: 16px; color: rgba(255,255,255,0.45); line-height: 1.7;
  max-width: 500px;
`;

const OverallScoreRow = styled.div`
  display: flex; align-items: center; gap: 32px;
  background: rgba(255,255,255,0.04);
  border: 1px solid ${borderDim};
  border-radius: 12px; padding: 32px 40px;
  margin: 40px 0;
  @media (max-width: 900px) { flex-wrap: wrap; gap: 20px; }
`;

const OverallScoreNum = styled.div<{ color: string }>`
  font-family: 'Fraunces', serif;
  font-size: 72px; font-weight: 800; line-height: 1;
  flex-shrink: 0; color: ${(p) => p.color};
  span { font-size: 32px; color: rgba(255,255,255,0.2); }
`;

const OverallScoreDivider = styled.div`
  width: 1px; height: 60px; background: ${borderDim}; flex-shrink: 0;
`;

const OverallScoreText = styled.div`
  h3 { font-size: 20px; font-weight: 700; margin-bottom: 8px; letter-spacing: -0.3px; }
  p { font-size: 14px; line-height: 1.7; color: rgba(255,255,255,0.5); max-width: 520px; }
`;

const ResultsGrid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 32px; margin-bottom: 40px;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const RadarWrap = styled.div`
  background: rgba(255,255,255,0.03);
  border: 1px solid ${borderDim};
  border-radius: 12px; padding: 32px;
  display: flex; flex-direction: column; align-items: center;
`;

const SectionTitle = styled.div`
  font-size: 11px; font-weight: 700; letter-spacing: 2px;
  text-transform: uppercase; color: rgba(255,255,255,0.35);
  margin-bottom: 24px;
`;

const DimensionsWrap = styled.div`
  background: rgba(255,255,255,0.03);
  border: 1px solid ${borderDim};
  border-radius: 12px; padding: 32px;
`;

const DimRow = styled.div`
  display: flex; flex-direction: column; gap: 6px;
  padding: 16px 0; border-bottom: 1px solid ${borderDim};
  &:last-child { border-bottom: none; padding-bottom: 0; }
`;

const DimRowTop = styled.div`
  display: flex; justify-content: space-between; align-items: center;
`;

const DimName = styled.div`
  font-size: 14px; font-weight: 600; color: #fff;
  display: flex; align-items: center; gap: 8px;
`;

const DimDot = styled.div<{ bg: string }>`
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
  background: ${(p) => p.bg};
`;

const DimScoreNum = styled.div<{ color: string }>`
  font-family: 'Fraunces', serif;
  font-size: 18px; font-weight: 800;
  color: ${(p) => p.color};
`;

const DimBarBg = styled.div`
  height: 4px; background: ${dimBg};
  border-radius: 2px; overflow: hidden;
`;

const DimBarFill = styled.div<{ width: number; bg: string }>`
  height: 100%; border-radius: 2px;
  background: ${(p) => p.bg};
  transition: width 1s cubic-bezier(0.4,0,0.2,1);
  width: ${(p) => p.width}%;
`;

const DimCommentary = styled.div`
  font-size: 12px; line-height: 1.6; color: rgba(255,255,255,0.4);
  margin-top: 4px; font-style: italic;
`;

const InsightsGrid = styled.div`
  display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 16px;
  margin-bottom: 40px;
  @media (max-width: 900px) { grid-template-columns: 1fr; }
`;

const InsightCard = styled.div`
  background: rgba(255,255,255,0.03);
  border: 1px solid ${borderDim};
  border-radius: 10px; padding: 24px;
  transition: border-color 0.2s;
  &:hover { border-color: rgba(201,151,58,0.25); }
`;

const InsightType = styled.div<{ color: string }>`
  font-size: 10px; font-weight: 700; letter-spacing: 2px;
  text-transform: uppercase; margin-bottom: 10px;
  color: ${(p) => p.color};
`;

const InsightTitle = styled.h4`
  font-family: 'Fraunces', serif;
  font-size: 15px; font-weight: 700; color: #fff;
  margin-bottom: 8px; letter-spacing: -0.2px;
`;

const InsightText = styled.p`
  font-size: 13px; line-height: 1.65; color: rgba(255,255,255,0.45);
`;

const ResultsCta = styled.div`
  background: rgba(201,151,58,0.08);
  border: 1px solid rgba(201,151,58,0.2);
  border-radius: 12px; padding: 36px 40px;
  display: flex; align-items: center; justify-content: space-between; gap: 32px;
  @media (max-width: 900px) { flex-direction: column; }
`;

const CtaText = styled.div`
  h3 { font-family: 'Fraunces', serif; font-size: 20px; font-weight: 700; color: #fff; margin-bottom: 8px; letter-spacing: -0.3px; }
  p { font-size: 14px; line-height: 1.7; color: rgba(255,255,255,0.5); max-width: 440px; }
`;

const CtaBtns = styled.div`
  display: flex; flex-direction: column; gap: 10px; flex-shrink: 0;
`;

const BtnBook = styled.a`
  background: #C9973A; color: #fff;
  padding: 13px 28px; border-radius: 4px;
  font-size: 14px; font-weight: 600;
  text-decoration: none; text-align: center;
  white-space: nowrap; transition: background 0.2s;
  font-family: 'DM Sans', sans-serif;
  &:hover { background: #E0B050; }
`;

const BtnRestart = styled.button`
  font-size: 12px; color: rgba(255,255,255,0.3);
  background: none; border: none; cursor: pointer;
  font-family: 'DM Sans', sans-serif; text-align: center;
  transition: color 0.2s;
  &:hover { color: rgba(255,255,255,0.6); }
`;

// ── COMPONENT ──────────────────────────────────────────────────────────
type Phase = 'landing' | 'quiz' | 'results';

export default function AssessmentPage() {
  const [phase, setPhase] = useState<Phase>('landing');
  const [current, setCurrent] = useState(0);
  const [answers, setAnswers] = useState<(number | null)[]>(new Array(QUESTIONS.length).fill(null));
  const [leaving, setLeaving] = useState(false);
  const [dimBarWidths, setDimBarWidths] = useState<number[]>(new Array(DIMENSIONS.length).fill(0));
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Scroll to top on phase change
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [phase]);

  // Draw radar + animate bars when results appear
  useEffect(() => {
    if (phase === 'results') {
      const scores = computeScores(answers);
      const timer = setTimeout(() => {
        if (canvasRef.current) drawRadar(canvasRef.current, scores);
        setDimBarWidths(scores);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [phase, answers]);

  // Keyboard navigation
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (phase !== 'quiz') return;
      const key = e.key.toUpperCase();
      const q = QUESTIONS[current];
      const idx = key.charCodeAt(0) - 65;
      if (idx >= 0 && idx < q.options.length) {
        selectOption(idx);
      }
      if (e.key === 'Enter' && answers[current] !== null) {
        handleNext();
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, current, answers],
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  function selectOption(optIdx: number) {
    setAnswers((prev) => {
      const next = [...prev];
      next[current] = optIdx;
      return next;
    });
  }

  function handleNext() {
    if (answers[current] === null) return;
    if (current < QUESTIONS.length - 1) {
      setLeaving(true);
      setTimeout(() => {
        setCurrent((prev) => prev + 1);
        setLeaving(false);
      }, 250);
    } else {
      setPhase('results');
    }
  }

  function handlePrev() {
    if (current > 0) {
      setLeaving(true);
      setTimeout(() => {
        setCurrent((prev) => prev - 1);
        setLeaving(false);
      }, 250);
    }
  }

  function restart() {
    setCurrent(0);
    setAnswers(new Array(QUESTIONS.length).fill(null));
    setDimBarWidths(new Array(DIMENSIONS.length).fill(0));
    setPhase('landing');
  }

  const dimScores = computeScores(answers);
  const avg = Math.round(dimScores.reduce((a, b) => a + b, 0) / dimScores.length);
  const overall = getOverallLabel(avg);
  const insights = getInsights(dimScores);
  const q = QUESTIONS[current];
  const dim = DIMENSIONS[q.dim];

  return (
    <PageWrapper>
      {/* LANDING */}
      {phase === 'landing' && (
        <LandingSection>
          <LandingBg />
          <LandingGridBg />
          <LandingContent>
            <LandingEyebrow>
              <EyebrowDot />
              AI Readiness Assessment &middot; 5 Dimensions &middot; ~8 Minutes
            </LandingEyebrow>
            <LandingH1>
              How ready is your<br />organisation for <em>AI?</em>
            </LandingH1>
            <LandingP>
              Not a generic quiz. A genuine diagnostic across five dimensions —{' '}
              <strong>with honest commentary on what your answers actually mean.</strong>
            </LandingP>
            <LandingMeta>
              <span>12 questions</span>&middot;<span>No email required</span>&middot;<span>Results on screen</span>
            </LandingMeta>
            <BtnStart onClick={() => setPhase('quiz')}>Start Assessment &rarr;</BtnStart>
            <LandingDimensions>
              {DIMENSIONS.map((d) => (
                <LandingDim key={d.id}>{d.label}</LandingDim>
              ))}
            </LandingDimensions>
          </LandingContent>
        </LandingSection>
      )}

      {/* QUIZ */}
      {phase === 'quiz' && (
        <QuizShell>
          <QuizProgress>
            <QuizProgressFill width={(current / QUESTIONS.length) * 100} />
          </QuizProgress>
          <QuizProgressLabel>Question {current + 1} of {QUESTIONS.length}</QuizProgressLabel>

          <QuestionScreen key={current} leaving={leaving}>
            <QNumber>Question {current + 1} of {QUESTIONS.length}</QNumber>
            <QDimension>
              <QDimDot bg={dim.color} />
              <span style={{ color: dim.color }}>{dim.label}</span>
            </QDimension>
            <QText>{q.text}</QText>
            {q.sub && <QSubtext>{q.sub}</QSubtext>}
            <QOptions>
              {q.options.map((opt, i) => (
                <QOption
                  key={i}
                  selected={answers[current] === i}
                  onClick={() => selectOption(i)}
                >
                  <QOptionKey selected={answers[current] === i}>
                    {String.fromCharCode(65 + i)}
                  </QOptionKey>
                  <QOptionText selected={answers[current] === i}>{opt.text}</QOptionText>
                </QOption>
              ))}
            </QOptions>
            <QNav>
              <BtnNext enabled={answers[current] !== null} onClick={handleNext}>
                {current < QUESTIONS.length - 1 ? 'Next \u2192' : 'See My Results \u2192'}
              </BtnNext>
              {current > 0 && <BtnBack onClick={handlePrev}>&larr; Back</BtnBack>}
            </QNav>
          </QuestionScreen>
        </QuizShell>
      )}

      {/* RESULTS */}
      {phase === 'results' && (
        <ResultsShell>
          <ResultsBg />
          <ResultsInner>
            <div style={{ marginBottom: 56 }}>
              <ResultsEyebrow>Your AI Readiness Report</ResultsEyebrow>
              <ResultsH2>
                Here's where your<br />organisation <em>actually</em> stands.
              </ResultsH2>
              <ResultsTagline>Not what you hoped. Not what your vendor told you. What your answers say.</ResultsTagline>
            </div>

            <OverallScoreRow>
              <OverallScoreNum color={overall.color}>
                {avg}<span>/100</span>
              </OverallScoreNum>
              <OverallScoreDivider />
              <OverallScoreText>
                <h3 style={{ color: overall.color }}>{overall.label}</h3>
                <p>{overall.text}</p>
              </OverallScoreText>
            </OverallScoreRow>

            <ResultsGrid>
              <RadarWrap>
                <SectionTitle>Readiness Profile</SectionTitle>
                <canvas ref={canvasRef} width={300} height={300} style={{ maxWidth: 280, maxHeight: 280 }} />
              </RadarWrap>
              <DimensionsWrap>
                <SectionTitle>Dimension Breakdown</SectionTitle>
                {DIMENSIONS.map((d, i) => (
                  <DimRow key={d.id}>
                    <DimRowTop>
                      <DimName>
                        <DimDot bg={d.color} />
                        {d.label}
                      </DimName>
                      <DimScoreNum color={d.color}>{dimScores[i]}</DimScoreNum>
                    </DimRowTop>
                    <DimBarBg>
                      <DimBarFill width={dimBarWidths[i]} bg={d.color} />
                    </DimBarBg>
                    <DimCommentary>{getDimCommentary(i, dimScores[i])}</DimCommentary>
                  </DimRow>
                ))}
              </DimensionsWrap>
            </ResultsGrid>

            <SectionTitle>What This Means For You</SectionTitle>
            <InsightsGrid>
              {insights.map((ins, i) => (
                <InsightCard key={i}>
                  <InsightType color={ins.typeColor}>{ins.type}</InsightType>
                  <InsightTitle>{ins.title}</InsightTitle>
                  <InsightText>{ins.text}</InsightText>
                </InsightCard>
              ))}
            </InsightsGrid>

            <ResultsCta>
              <CtaText>
                <h3>Want to go deeper?</h3>
                <p>A 30-minute Transformation Assessment with a Vikuna senior expert will map these findings to your actual business — with a clear, honest view of where to start.</p>
              </CtaText>
              <CtaBtns>
                <BtnBook href="/#contact">Book Free Strategy Call</BtnBook>
                <BtnRestart onClick={restart}>Retake assessment</BtnRestart>
              </CtaBtns>
            </ResultsCta>
          </ResultsInner>
        </ResultsShell>
      )}
    </PageWrapper>
  );
}
