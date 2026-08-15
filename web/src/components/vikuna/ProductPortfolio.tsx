// src/components/vikuna/ProductPortfolio.tsx
// The "products" act of the MVP-as-a-Service page. Two beats: the products we
// ship ourselves, then the customer operations running on them.
//
// Layout is deliberately asymmetric. All three are in customers' hands, but
// only ContractNest is public and carrying published numbers. Equal cards would
// claim they are equal things, bury the one product with hard proof, and leave
// the eye no entry point — so ContractNest anchors and the other two orbit it.
//
// Visual language is borrowed from the products' own brand pages: `// LABEL`
// rule dividers for wayfinding, a JetBrains Mono voice for anything
// instrument-like (eyebrows, status, stats, disclosures), each product's real
// logo geometry, and a small dark UI panel per card so the products are shown
// rather than only described.
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { Stethoscope, HeartPulse, Factory, Shirt, FileText, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { ContractNestMark, DristiQMark, VaNiAppMark } from './icons/ProductMarks';

// ─── Tokens ──────────────────────────────────────────────────
const INK = '#0A0F1E';
const INK_SOFT = '#2D3450';
const PAPER = '#F7F6F2';
const WHITE = '#FFFFFF';
const ACCENT = '#E8420A';
const ACCENT_LIGHT = '#FF8A3D';
const TEAL = '#12A090';
const GOLD = '#C9973A';
// DristiQ's own brand gold, kept faithful to its landing page.
const DQ_GOLD = '#E8910A';
const BORDER_LIGHT = 'rgba(10,15,30,0.1)';
const BORDER_DARK = 'rgba(255,255,255,0.12)';
const MONO = "'JetBrains Mono', ui-monospace, monospace";

const VANI_HREF = '/vani';

// ─── Shared scaffolding ──────────────────────────────────────

const Section = styled.section<{ $bg?: string }>`
  background: ${(p) => p.$bg || WHITE};
  padding: 72px 60px;

  @media (max-width: 768px) {
    padding: 44px 24px;
  }
`;

const Inner = styled.div`
  max-width: 1200px;
  margin: 0 auto;
`;

// Borrowed from the DristiQ brand pages: a hairline with a monospace glyph in
// the middle. On a page this long it does the wayfinding a sticky sub-nav would
// otherwise have to do.
const Rule = styled.div<{ $onDark?: boolean }>`
  max-width: 1200px;
  margin: 0 auto 40px;
  display: flex;
  align-items: center;
  gap: 16px;

  &::before,
  &::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${(p) => (p.$onDark ? 'rgba(232,145,10,0.22)' : BORDER_LIGHT)};
  }

  span {
    font-family: ${MONO};
    font-size: 11px;
    letter-spacing: 0.14em;
    color: ${(p) => (p.$onDark ? 'rgba(232,145,10,0.75)' : 'rgba(45,52,80,0.55)')};
    white-space: nowrap;
  }

  /* A nowrap label sets a floor on page width — on a 390px viewport that
     silently widened the whole document. Let it wrap instead. */
  @media (max-width: 760px) {
    gap: 10px;

    span {
      white-space: normal;
      text-align: center;
      font-size: 10px;
      letter-spacing: 0.1em;
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

const H2 = styled.h2<{ $onDark?: boolean }>`
  font-family: 'Fraunces', serif;
  font-size: clamp(28px, 3vw, 44px);
  font-weight: 800;
  letter-spacing: -1.2px;
  line-height: 1.15;
  color: ${(p) => (p.$onDark ? WHITE : INK)};
  margin-bottom: 12px;

  em {
    font-style: italic;
    color: ${GOLD};
  }
`;

const SectionIntro = styled.p<{ $onDark?: boolean }>`
  font-size: 16px;
  color: ${(p) => (p.$onDark ? 'rgba(255,255,255,0.62)' : INK_SOFT)};
  max-width: 640px;
  line-height: 1.8;
  margin-bottom: 44px;

  strong {
    color: ${(p) => (p.$onDark ? WHITE : INK)};
    font-weight: 500;
  }
`;

// ─── Product UI panel (shared by all three cards) ────────────
// A small, dark, instrument-style panel. Both product brand pages present their
// UI on dark surfaces, so this reads as a screenshot even inside a light card.

const Panel = styled.div`
  background: #12121B;
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 10px;
  overflow: hidden;
  font-family: ${MONO};
  font-size: 12px;
  margin-bottom: 26px;
`;

const PanelHead = styled.div<{ $accent: string }>`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 11px 14px;
  background: rgba(255, 255, 255, 0.035);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);

  .t {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.85);
    font-size: 12px;
  }

  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: ${(p) => p.$accent};
    box-shadow: 0 0 7px ${(p) => p.$accent};
    flex-shrink: 0;
  }

  .live {
    font-size: 10px;
    letter-spacing: 0.09em;
    color: ${(p) => p.$accent};
    background: ${(p) => p.$accent}1f;
    padding: 3px 8px;
    border-radius: 3px;
    white-space: nowrap;
  }
`;

const PanelRow = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);

  &:last-child {
    border-bottom: none;
  }

  .k {
    color: rgba(255, 255, 255, 0.45);
    font-size: 11.5px;
  }

  .v {
    color: rgba(255, 255, 255, 0.85);
    font-size: 11.5px;
    text-align: right;
  }
`;

const PanelBadge = styled.span<{ $color: string }>`
  font-size: 10px;
  letter-spacing: 0.06em;
  padding: 3px 8px;
  border-radius: 3px;
  white-space: nowrap;
  color: ${(p) => p.$color};
  background: ${(p) => p.$color}1f;
  border: 1px solid ${(p) => p.$color}44;
`;

const PanelMeter = styled.div<{ $accent: string; $pct: number }>`
  padding: 12px 14px;
  border-top: 1px solid rgba(255, 255, 255, 0.05);

  .lbl {
    font-size: 10.5px;
    color: rgba(255, 255, 255, 0.45);
    margin-bottom: 7px;
  }

  .bar {
    height: 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .fill {
    height: 100%;
    width: ${(p) => p.$pct}%;
    border-radius: 2px;
    background: ${(p) => p.$accent};
  }

  .out {
    margin-top: 7px;
    font-size: 10.5px;
    color: ${(p) => p.$accent};
  }
`;

const PanelFoot = styled.div`
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.035);
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.45);
  display: flex;
  justify-content: space-between;
  gap: 10px;
  flex-wrap: wrap;
`;

const ChipRow = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  padding: 14px;
`;

const Chip = styled.span<{ $accent: string; $solid?: boolean }>`
  font-size: 11px;
  letter-spacing: 0.04em;
  padding: 5px 11px;
  border-radius: 20px;
  color: ${(p) => (p.$solid ? '#0A0F1E' : 'rgba(255,255,255,0.7)')};
  background: ${(p) => (p.$solid ? p.$accent : 'rgba(255,255,255,0.06)')};
  border: 1px solid ${(p) => (p.$solid ? p.$accent : 'rgba(255,255,255,0.1)')};
  font-weight: ${(p) => (p.$solid ? 500 : 400)};
`;

// ─── Anchor card (ContractNest) ──────────────────────────────

const Anchor = styled(motion.div)`
  background: ${INK};
  border-radius: 16px;
  padding: 44px;
  position: relative;
  overflow: hidden;
  box-shadow: 0 18px 60px rgba(10, 15, 30, 0.22);

  @media (max-width: 768px) {
    padding: 28px 22px;
  }
`;

const AnchorGlow = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 70% at 88% 10%, rgba(232, 66, 10, 0.2) 0%, transparent 62%),
    radial-gradient(ellipse 40% 50% at 6% 94%, rgba(201, 151, 58, 0.09) 0%, transparent 60%);
  pointer-events: none;
`;

const AnchorGrid = styled.div`
  position: relative;
  z-index: 1;
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 44px;
  align-items: start;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
    gap: 28px;
  }
`;

const Head = styled.div`
  display: flex;
  align-items: center;
  gap: 15px;
  margin-bottom: 22px;
  flex-wrap: wrap;
`;

const MarkBox = styled.div<{ $accent: string; $size?: number }>`
  width: ${(p) => p.$size || 54}px;
  height: ${(p) => p.$size || 54}px;
  border-radius: 13px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: ${(p) => p.$accent};
  background: ${(p) => p.$accent}16;
  border: 1px solid ${(p) => p.$accent}3d;
`;

const Names = styled.div`
  flex: 1;
  min-width: 170px;
`;

const AnchorName = styled.h3`
  font-family: 'Fraunces', serif;
  font-size: clamp(27px, 3.2vw, 38px);
  font-weight: 800;
  letter-spacing: -1.2px;
  line-height: 1;
  color: ${WHITE};
  margin-bottom: 6px;

  span {
    color: ${ACCENT_LIGHT};
  }
`;

const Byline = styled.div`
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
`;

const StatusPill = styled.div<{ $color: string }>`
  align-self: flex-start;
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${(p) => p.$color};
  border: 1px solid ${(p) => p.$color}66;
  background: ${(p) => p.$color}1a;
  padding: 6px 13px;
  border-radius: 4px;
  white-space: nowrap;
`;

const Tagline = styled.div`
  font-family: 'Fraunces', serif;
  font-size: clamp(20px, 2.3vw, 26px);
  font-style: italic;
  font-weight: 600;
  letter-spacing: -0.6px;
  line-height: 1.35;
  color: ${GOLD};
  margin-bottom: 14px;
`;

const AnchorDesc = styled.p`
  font-size: 15px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.62);
  margin-bottom: 26px;

  strong {
    color: ${WHITE};
    font-weight: 500;
  }
`;

// Sits beside the product panel, so it reads two-up rather than as a wide
// four-across strip.
const StatStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  background: ${BORDER_DARK};
  border: 1px solid ${BORDER_DARK};
  border-radius: 10px;
  overflow: hidden;
  margin-top: 20px;
`;

const Stat = styled.div`
  background: rgba(255, 255, 255, 0.03);
  padding: 18px 16px;

  .v {
    font-family: 'Fraunces', serif;
    font-size: 25px;
    font-weight: 800;
    letter-spacing: -0.8px;
    line-height: 1.1;
    color: ${ACCENT_LIGHT};
    margin-bottom: 5px;
  }

  .c {
    font-family: ${MONO};
    font-size: 10px;
    line-height: 1.5;
    letter-spacing: 0.04em;
    color: rgba(255, 255, 255, 0.45);
  }
`;

const Features = styled.ul<{ $cols?: number }>`
  list-style: none;
  padding: 0;
  margin: 0 0 28px;
  display: grid;
  grid-template-columns: repeat(${(p) => p.$cols || 1}, 1fr);
  gap: 11px 30px;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }

  li {
    font-size: 13.5px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.68);
    padding-left: 20px;
    position: relative;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 7px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${TEAL};
    }
  }
`;

const CardFoot = styled.div<{ $onDark?: boolean }>`
  padding-top: 20px;
  border-top: 1px solid ${(p) => (p.$onDark ? BORDER_DARK : BORDER_LIGHT)};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const VaniBadge = styled.span`
  font-family: ${MONO};
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: ${GOLD};
`;

const CardLink = styled.a<{ $color?: string }>`
  font-family: ${MONO};
  font-size: 12.5px;
  font-weight: 500;
  color: ${(p) => p.$color || ACCENT};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const CardMuted = styled.span`
  font-family: ${MONO};
  font-size: 11.5px;
  color: rgba(45, 52, 80, 0.5);
`;

// ─── Satellites ──────────────────────────────────────────────

const SatGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  align-items: start;
  gap: 20px;
  margin-top: 20px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

// Hover reveals an accent hairline along the top, lifted from the pillar cards
// on the ContractNest and DristiQ brand pages.
const Satellite = styled(motion.div)<{ $accent: string }>`
  background: ${WHITE};
  border: 1px solid ${BORDER_LIGHT};
  border-radius: 12px;
  padding: 30px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;
  transition: box-shadow 0.25s, transform 0.25s;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
    background: ${(p) => p.$accent};
    transform: scaleX(0);
    transform-origin: left;
    transition: transform 0.4s;
  }

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 14px 44px rgba(10, 15, 30, 0.14);
  }

  &:hover::before {
    transform: scaleX(1);
  }
`;

const SatName = styled.h3`
  font-family: 'Fraunces', serif;
  font-size: 24px;
  font-weight: 800;
  letter-spacing: -0.8px;
  color: ${INK};
  line-height: 1.1;
`;

const SatLine = styled.div`
  font-family: ${MONO};
  font-size: 11px;
  letter-spacing: 0.05em;
  color: ${INK_SOFT};
  margin-top: 6px;
`;

const SatDesc = styled.p`
  font-size: 14px;
  line-height: 1.8;
  color: ${INK_SOFT};
  margin-bottom: 22px;

  strong {
    color: ${INK};
    font-weight: 600;
  }
`;

const Spacer = styled.div`
  margin-top: auto;
`;

// Regulatory note for DristiQ — it is an educational research platform and not
// SEBI registered, and its own site leads with that. Featuring it here without
// the disclosure would be a compliance problem, not just an omission.
const Disclosure = styled.p`
  font-family: ${MONO};
  font-size: 10px;
  line-height: 1.65;
  letter-spacing: 0.03em;
  color: rgba(45, 52, 80, 0.55);
  border: 1px solid ${BORDER_LIGHT};
  background: rgba(10, 15, 30, 0.03);
  border-radius: 6px;
  padding: 10px 12px;
  margin-bottom: 22px;
`;

// ─── Framework note ──────────────────────────────────────────

const FrameworkNote = styled(motion.div)`
  background: rgba(201, 151, 58, 0.08);
  border: 1px solid rgba(201, 151, 58, 0.3);
  border-left: 4px solid ${GOLD};
  border-radius: 8px;
  padding: 26px 30px;
  margin-top: 30px;
  max-width: 880px;

  h3 {
    font-family: 'Fraunces', serif;
    font-size: 18px;
    font-weight: 700;
    color: ${INK};
    margin-bottom: 8px;
  }

  p {
    font-size: 14px;
    line-height: 1.75;
    color: ${INK_SOFT};

    strong {
      color: ${INK};
    }
  }

  a {
    font-family: ${MONO};
    font-size: 12.5px;
    color: ${ACCENT};
    font-weight: 500;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`;

// ─── Customer proof rows ─────────────────────────────────────

const RowList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 10px;
`;

const Row = styled(motion.div)`
  display: grid;
  grid-template-columns: 56px 1fr auto;
  align-items: center;
  gap: 22px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid ${BORDER_DARK};
  border-left: 3px solid ${ACCENT};
  border-radius: 12px;
  padding: 20px 26px;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  @media (max-width: 800px) {
    grid-template-columns: 44px 1fr;
    gap: 15px;
    padding: 18px;
  }
`;

const RowIcon = styled.div`
  width: 52px;
  height: 52px;
  border-radius: 50%;
  border: 1px solid rgba(232, 66, 10, 0.45);
  background: rgba(232, 66, 10, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${ACCENT_LIGHT};

  @media (max-width: 800px) {
    width: 42px;
    height: 42px;
  }
`;

const RowBody = styled.div`
  min-width: 0;

  .sector {
    font-family: ${MONO};
    font-size: 10.5px;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: ${ACCENT_LIGHT};
    margin-bottom: 7px;
  }

  p {
    font-size: 15px;
    line-height: 1.65;
    color: rgba(255, 255, 255, 0.72);

    strong {
      color: ${WHITE};
      font-weight: 600;
    }
  }
`;

const RowStat = styled.div`
  text-align: right;
  flex-shrink: 0;

  .v {
    font-family: 'Fraunces', serif;
    font-size: clamp(23px, 2.5vw, 31px);
    font-weight: 800;
    letter-spacing: -1px;
    line-height: 1.05;
    color: ${ACCENT_LIGHT};
    white-space: nowrap;
  }

  .c {
    font-family: ${MONO};
    font-size: 10.5px;
    letter-spacing: 0.05em;
    color: rgba(255, 255, 255, 0.5);
    margin-top: 5px;
  }

  @media (max-width: 800px) {
    grid-column: 2;
    text-align: left;
    margin-top: 12px;
  }
`;

const Closer = styled(motion.div)`
  margin-top: 24px;
  border: 1px solid rgba(232, 66, 10, 0.4);
  background:
    radial-gradient(ellipse 60% 60% at 50% 50%, rgba(232, 66, 10, 0.16) 0%, transparent 72%),
    rgba(232, 66, 10, 0.05);
  border-radius: 14px;
  padding: 40px;
  text-align: center;

  @media (max-width: 768px) {
    padding: 28px 20px;
  }

  .lead {
    font-family: 'Fraunces', serif;
    font-size: clamp(19px, 2.2vw, 26px);
    font-weight: 700;
    letter-spacing: -0.6px;
    line-height: 1.4;
    color: ${WHITE};
    margin-bottom: 14px;

    em {
      font-style: italic;
      color: ${ACCENT_LIGHT};
    }
  }

  .sub {
    font-size: 15px;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.62);
    max-width: 560px;
    margin: 0 auto;
  }
`;

const Note = styled.p`
  font-family: ${MONO};
  font-size: 10.5px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 24px;
  line-height: 1.75;
  letter-spacing: 0.03em;
`;

// ─── Data ────────────────────────────────────────────────────

const anchorStats = [
  { v: 'Six', c: 'Industries in beta' },
  { v: '45% → 80%', c: 'Compliance, 2 months' },
  { v: '371', c: 'Customers, one deployment' },
  { v: '217', c: 'People tracked to invoice' },
];

const anchorFeatures = [
  'Digital contracts and e-signature, terms locked',
  'SLA clock starts automatically, with real-time alerts',
  'Vendors log their own work — photos, reports, certificates',
  'Work done → evidence → auto-invoice on completion',
  'Audit-ready compliance report in one click',
  'AR and AP tracked, so you never double-pay',
];

type Story = {
  sector: string;
  Icon: LucideIcon;
  stat: string;
  statCaption: string;
  text: React.ReactNode;
};

const stories: Story[] = [
  {
    sector: 'Hospital',
    Icon: Stethoscope,
    stat: '45% → 80%',
    statCaption: 'Service compliance, 2 months',
    text: (
      <>
        <strong>130 equipment AMCs</strong> — biomedical, HVAC and facilities — all on one
        calendar. Zero missed calibrations, and a foundation for NABH.
      </>
    ),
  },
  {
    sector: 'Wellness Services',
    Icon: HeartPulse,
    stat: '371',
    statCaption: 'Customers live',
    text: (
      <>
        Year-long packages — <strong>3 health provider visits, 4 diet consults, 15 yoga
        sessions</strong> — tracked per customer, after 600 packages sold in two months
        outgrew the spreadsheet.
      </>
    ),
  },
  {
    sector: 'Equipment Manufacturer',
    Icon: Factory,
    stat: '39% → 74%',
    statCaption: 'Service compliance',
    text: (
      <>
        AMCs rolled out to <strong>90 of their own customers</strong>, with digital
        calibration reports — replacing 400 machines' worth of service history living in
        engineers' WhatsApp threads.
      </>
    ),
  },
  {
    sector: 'Garments Company',
    Icon: Shirt,
    stat: '45',
    statCaption: 'Vendor contracts',
    text: (
      <>
        Outsourced vendor contracts with <strong>deliverables and payments tracked end to
        end</strong>. Pay for what is done, and never double-pay.
      </>
    ),
  },
  {
    sector: 'Payroll & Bookkeeping Firm',
    Icon: FileText,
    stat: '29',
    statCaption: 'Clients digitized',
    text: (
      <>
        Proof of work lifted out of emails and shared drives —{' '}
        <strong>traceable and audit-ready</strong>, with 250+ contracts in one place.
      </>
    ),
  },
  {
    sector: 'Manpower Company',
    Icon: Users,
    stat: '217',
    statCaption: 'Skilled people deployed',
    text: (
      <>
        Deployments, <strong>receivables and on-time invoicing</strong> — finally visible in
        one place.
      </>
    ),
  },
];

// ─── Component ───────────────────────────────────────────────

const ProductPortfolio: React.FC = () => {
  return (
    <>
      <Section id="products" $bg={PAPER}>
        <Inner>
          <Eyebrow>What we&rsquo;ve built</Eyebrow>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <H2>
              We don&rsquo;t just build products
              <br />
              for clients. We <em>ship our own.</em>
            </H2>
          </motion.div>
          <SectionIntro>
            The fastest way to judge whether a team can build your product is to look at the
            products they built for themselves — <strong>live software, real users, real
            money</strong>. Three of ours are below, in three unrelated industries. All three
            are in customers&rsquo; hands today, and the same framework sits under all of them.
          </SectionIntro>
        </Inner>

        <Rule>
          <span>// 01 · CONTRACT OPERATIONS</span>
        </Rule>

        <Inner>
          <Anchor
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <AnchorGlow />
            <AnchorGrid>
              <div>
                <Head>
                  <MarkBox $accent={ACCENT_LIGHT}>
                    <ContractNestMark size={30} />
                  </MarkBox>
                  <Names>
                    <AnchorName>
                      Contract<span>Nest</span>
                    </AnchorName>
                    <Byline>By Vikuna Technologies</Byline>
                  </Names>
                  <StatusPill $color={TEAL}>Open to the public</StatusPill>
                </Head>

                <Tagline>Un-tangle the commitments.</Tagline>

                <AnchorDesc>
                  Recurring-service contracts that run themselves, for both sides of the deal.{' '}
                  <strong>Buyers</strong> stop chasing vendors for compliance evidence;{' '}
                  <strong>sellers</strong> stop losing track of what they promised, delivered
                  and are owed. Equipment, facilities and pure services alike.
                </AnchorDesc>

                <Features $cols={2}>
                  {anchorFeatures.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </Features>

                <CardFoot $onDark>
                  <VaniBadge>Built on VaNi AI</VaniBadge>
                  <CardLink
                    href="https://www.contractnest.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    $color={ACCENT_LIGHT}
                  >
                    contractnest.com →
                  </CardLink>
                </CardFoot>
              </div>

              <div>
                <Panel>
                <PanelHead $accent={ACCENT_LIGHT}>
                  <span className="t">
                    <span className="dot" />
                    AMC Contract #CN-2847
                  </span>
                  <span className="live">ACTIVE</span>
                </PanelHead>
                <PanelRow>
                  <span className="k">Asset Type</span>
                  <span className="v">HVAC — Central AHU</span>
                </PanelRow>
                <PanelRow>
                  <span className="k">Response SLA</span>
                  <span className="v">
                    <PanelBadge $color={TEAL}>4 HRS · MET</PanelBadge>
                  </span>
                </PanelRow>
                <PanelRow>
                  <span className="k">Visits Completed</span>
                  <span className="v">9 / 12</span>
                </PanelRow>
                <PanelRow>
                  <span className="k">Evidence on File</span>
                  <span className="v">27 photos · 9 reports</span>
                </PanelRow>
                <PanelMeter $accent={ACCENT_LIGHT} $pct={73}>
                  <div className="lbl">SLA compliance — last 90 days</div>
                  <div className="bar">
                    <div className="fill" />
                  </div>
                  <div className="out">73% on-time resolution</div>
                </PanelMeter>
                <PanelFoot>
                  <span>Building B · Level 3</span>
                  <span>+2 linked contracts</span>
                </PanelFoot>
                </Panel>

                <StatStrip>
                  {anchorStats.map((s) => (
                    <Stat key={s.c}>
                      <div className="v">{s.v}</div>
                      <div className="c">{s.c}</div>
                    </Stat>
                  ))}
                </StatStrip>
              </div>
            </AnchorGrid>
          </Anchor>
        </Inner>

        <Rule>
          <span>// 02 · MARKETS &nbsp;·&nbsp; 03 · EXAMS</span>
        </Rule>

        <Inner>
          <SatGrid>
            <Satellite
              $accent={DQ_GOLD}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
            >
              <Head>
                <MarkBox $accent={DQ_GOLD} $size={48}>
                  <DristiQMark size={26} />
                </MarkBox>
                <Names>
                  <SatName>DristiQ</SatName>
                  <SatLine>Atmospheric market intelligence</SatLine>
                </Names>
              </Head>

              <StatusPill $color={DQ_GOLD} style={{ marginBottom: 20 }}>
                With beta customers
              </StatusPill>

              <SatDesc>
                Where price history meets planetary positions.{' '}
                <strong>The IMD tells you a cyclone is forming — it does not tell you whether
                to travel.</strong>{' '}
                DristiQ gives the serious Indian trader that same kind of clarity, for
                markets.
              </SatDesc>

              <Panel>
                <PanelHead $accent={DQ_GOLD}>
                  <span className="t">
                    <span className="dot" />
                    KaalaDristi · Screeners
                  </span>
                  <span className="live">NSE · 1,800+</span>
                </PanelHead>
                <PanelRow>
                  <span className="k">Breakout Surge</span>
                  <span className="v">
                    <PanelBadge $color="#4ade80">742 MET</PanelBadge>
                  </span>
                </PanelRow>
                <PanelRow>
                  <span className="k">Conviction Flow</span>
                  <span className="v">
                    <PanelBadge $color={DQ_GOLD}>94 MET</PanelBadge>
                  </span>
                </PanelRow>
                <PanelRow>
                  <span className="k">Distribution</span>
                  <span className="v">
                    <PanelBadge $color="#f87171">38 MET</PanelBadge>
                  </span>
                </PanelRow>
                <PanelFoot>
                  <span>Ten independent lenses</span>
                  <span>One convergence</span>
                </PanelFoot>
              </Panel>

              <Disclosure>
                ⚠ Educational research platform. Not registered with SEBI as an Investment
                Adviser or Research Analyst. Nothing on DristiQ is investment advice or a
                buy/sell recommendation.
              </Disclosure>

              <Spacer />
              <CardFoot>
                <VaniBadge>Built on VaNi AI</VaniBadge>
                <CardLink href="https://dristiq.com" target="_blank" rel="noopener noreferrer">
                  dristiq.com →
                </CardLink>
              </CardFoot>
            </Satellite>

            <Satellite
              $accent={TEAL}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.08 }}
            >
              <Head>
                <MarkBox $accent={TEAL} $size={48}>
                  <VaNiAppMark size={26} />
                </MarkBox>
                <Names>
                  <SatName>VaNi App</SatName>
                  <SatLine>Entrance-exam preparation</SatLine>
                </Names>
              </Head>

              <StatusPill $color={TEAL} style={{ marginBottom: 20 }}>
                With beta customers
              </StatusPill>

              {/* Copy stays minimal until product detail and launch status land.
                  Do not invent feature claims — the panel below shows only the
                  exams and languages Charan confirmed. */}
              <SatDesc>
                Preparation for India&rsquo;s two big entrance exams, built for students who
                don&rsquo;t think in English first —{' '}
                <strong>the same coaching in three languages</strong>, in a market that is
                mostly English-only.
              </SatDesc>

              <Panel>
                <PanelHead $accent={TEAL}>
                  <span className="t">
                    <span className="dot" />
                    Exams covered
                  </span>
                  <span className="live">MOBILE</span>
                </PanelHead>
                <ChipRow>
                  <Chip $accent={TEAL} $solid>
                    NEET
                  </Chip>
                  <Chip $accent={TEAL} $solid>
                    CUET
                  </Chip>
                </ChipRow>
                <PanelHead $accent={TEAL} style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
                  <span className="t">
                    <span className="dot" />
                    Languages
                  </span>
                  <span className="live">3</span>
                </PanelHead>
                <ChipRow>
                  <Chip $accent={TEAL}>English</Chip>
                  <Chip $accent={TEAL}>हिंदी</Chip>
                  <Chip $accent={TEAL}>తెలుగు</Chip>
                </ChipRow>
              </Panel>

              <Spacer />
              <CardFoot>
                <VaniBadge>Built on VaNi AI</VaniBadge>
                <CardMuted>Landing page in progress</CardMuted>
              </CardFoot>
            </Satellite>
          </SatGrid>

          <FrameworkNote
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h3>Three industries, one framework.</h3>
            <p>
              Contract operations, market intelligence and exam preparation have nothing in
              common as businesses. What they share is how they were built —{' '}
              <strong>VaNi AI</strong>: use cases mapped to ROI before anything is built,
              event-driven architecture over a unified data layer, humans kept in the loop by
              design, and outcomes measured before anything is scaled.{' '}
              <a href={VANI_HREF}>
                How VaNi works →
              </a>
            </p>
          </FrameworkNote>
        </Inner>
      </Section>

      <Section id="customer-proof" $bg={INK}>
        <Inner>
          <Eyebrow>Live from customer desks</Eyebrow>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <H2 $onDark>
              Six industries.
              <br />
              <em>One problem.</em>
            </H2>
          </motion.div>
          <SectionIntro $onDark>
            Every business either provides recurring services — or depends on them. Six very
            different companies ran ContractNest through private beta, and{' '}
            <strong>none of them look alike</strong>.
          </SectionIntro>
        </Inner>

        <Rule $onDark>
          <span>// THE RESULTS</span>
        </Rule>

        <Inner>
          <RowList>
            {stories.map((s, i) => (
              <Row
                key={s.sector}
                initial={{ opacity: 0, x: -16 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ delay: Math.min(i, 4) * 0.06 }}
              >
                <RowIcon>
                  <s.Icon size={23} strokeWidth={1.6} />
                </RowIcon>
                <RowBody>
                  <div className="sector">{s.sector}</div>
                  <p>{s.text}</p>
                </RowBody>
                <RowStat>
                  <div className="v">{s.stat}</div>
                  <div className="c">{s.statCaption}</div>
                </RowStat>
              </Row>
            ))}
          </RowList>

          <Closer
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <p className="lead">
              A hospital, a wellness brand, a factory, a garments unit, an accounting firm, a
              staffing company — <em>solving the same problem.</em>
            </p>
            <p className="sub">
              If you promised to do it again next month, ContractNest tracks it.
            </p>
          </Closer>

          <Note>
            Results from ContractNest&rsquo;s private beta, shown by sector rather than by
            name. ContractNest is now open to the public. Product panels above are interface
            illustrations, not live data. We&rsquo;ll walk you through any of these, live, on
            a call.
          </Note>
        </Inner>
      </Section>
    </>
  );
};

export default ProductPortfolio;
