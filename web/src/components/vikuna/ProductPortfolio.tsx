// src/components/vikuna/ProductPortfolio.tsx
// The "products" act of the MVP-as-a-Service page. Two beats: the products we
// ship ourselves, then the customer operations running on them.
//
// Layout is deliberately asymmetric. All three are in customers' hands, but
// only ContractNest is public and carrying published numbers. Equal cards would
// claim they are equal things, bury the one product with hard proof, and leave
// the eye no entry point — so ContractNest anchors and the other two orbit it.
// VaNi AI is the thread: every product carries the badge, which is how DristiQ
// already presents itself.
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import { Stethoscope, HeartPulse, Factory, Shirt, FileText, Users } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

// ─── Color tokens (dark editorial, matches MVPPage) ──────────
const INK = '#0A0F1E';
const INK_SOFT = '#2D3450';
const PAPER = '#F7F6F2';
const WHITE = '#FFFFFF';
const ACCENT = '#E8420A';
const ACCENT_LIGHT = '#FF8A3D';
const TEAL = '#12A090';
const GOLD = '#C9973A';
const BORDER_LIGHT = 'rgba(10,15,30,0.1)';
const BORDER_DARK = 'rgba(255,255,255,0.12)';

const VANI_HREF = '/vani-page.html';

// ─── Shared scaffolding ──────────────────────────────────────

const Section = styled.section<{ $bg?: string }>`
  background: ${(p) => p.$bg || WHITE};
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
  color: ${(p) => (p.$onDark ? 'rgba(255,255,255,0.6)' : INK_SOFT)};
  max-width: 640px;
  line-height: 1.8;
  margin-bottom: 48px;

  strong {
    color: ${(p) => (p.$onDark ? WHITE : INK)};
    font-weight: 500;
  }
`;

// ─── Product monogram ────────────────────────────────────────

const Monogram = styled.div<{ $from: string; $to: string; $size?: number }>`
  width: ${(p) => p.$size || 56}px;
  height: ${(p) => p.$size || 56}px;
  border-radius: ${(p) => (p.$size || 56) * 0.28}px;
  background: linear-gradient(140deg, ${(p) => p.$from}, ${(p) => p.$to});
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Fraunces', serif;
  font-size: ${(p) => (p.$size || 56) * 0.36}px;
  font-weight: 800;
  letter-spacing: -0.5px;
  color: ${WHITE};
  flex-shrink: 0;
  box-shadow: 0 6px 20px ${(p) => p.$to}55;
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
    padding: 30px 24px;
  }
`;

const AnchorGlow = styled.div`
  position: absolute;
  inset: 0;
  background:
    radial-gradient(ellipse 60% 70% at 88% 12%, rgba(232, 66, 10, 0.22) 0%, transparent 62%),
    radial-gradient(ellipse 40% 50% at 8% 92%, rgba(201, 151, 58, 0.1) 0%, transparent 60%);
  pointer-events: none;
`;

const AnchorInner = styled.div`
  position: relative;
  z-index: 1;
`;

const AnchorHead = styled.div`
  display: flex;
  align-items: center;
  gap: 18px;
  margin-bottom: 26px;
  flex-wrap: wrap;
`;

const AnchorNames = styled.div`
  flex: 1;
  min-width: 180px;
`;

const AnchorName = styled.h3`
  font-family: 'Fraunces', serif;
  font-size: clamp(28px, 3.4vw, 40px);
  font-weight: 800;
  letter-spacing: -1.2px;
  line-height: 1;
  color: ${WHITE};
  margin-bottom: 6px;

  span {
    color: ${ACCENT_LIGHT};
  }
`;

const AnchorByline = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2.5px;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
`;

const StatusPill = styled.div<{ $color: string }>`
  align-self: flex-start;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${(p) => p.$color};
  border: 1px solid ${(p) => p.$color}66;
  background: ${(p) => p.$color}1a;
  padding: 7px 16px;
  border-radius: 100px;
  white-space: nowrap;
`;

const AnchorTagline = styled.div`
  font-family: 'Fraunces', serif;
  font-size: clamp(20px, 2.4vw, 27px);
  font-style: italic;
  font-weight: 600;
  letter-spacing: -0.6px;
  line-height: 1.35;
  color: ${GOLD};
  margin-bottom: 16px;
  max-width: 720px;
`;

const AnchorDesc = styled.p`
  font-size: 15px;
  line-height: 1.8;
  color: rgba(255, 255, 255, 0.62);
  max-width: 720px;
  margin-bottom: 30px;

  strong {
    color: ${WHITE};
    font-weight: 500;
  }
`;

const StatStrip = styled.div`
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 1px;
  background: ${BORDER_DARK};
  border: 1px solid ${BORDER_DARK};
  border-radius: 10px;
  overflow: hidden;
  margin-bottom: 32px;

  @media (max-width: 700px) {
    grid-template-columns: repeat(2, 1fr);
  }
`;

const Stat = styled.div`
  background: rgba(255, 255, 255, 0.03);
  padding: 20px 18px;
`;

const StatValue = styled.div`
  font-family: 'Fraunces', serif;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.8px;
  line-height: 1.1;
  color: ${ACCENT_LIGHT};
  margin-bottom: 5px;
`;

const StatCaption = styled.div`
  font-size: 11px;
  font-weight: 600;
  line-height: 1.5;
  color: rgba(255, 255, 255, 0.45);
`;

const AnchorFeatures = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 32px;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 12px 32px;

  @media (max-width: 700px) {
    grid-template-columns: 1fr;
  }

  li {
    font-size: 13.5px;
    line-height: 1.6;
    color: rgba(255, 255, 255, 0.68);
    padding-left: 22px;
    position: relative;

    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 7px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: ${TEAL};
    }
  }
`;

const CardFoot = styled.div<{ $onDark?: boolean }>`
  padding-top: 22px;
  border-top: 1px solid ${(p) => (p.$onDark ? BORDER_DARK : BORDER_LIGHT)};
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
`;

const VaniBadge = styled.span`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  color: ${GOLD};
`;

const CardLink = styled.a<{ $color?: string }>`
  font-size: 13.5px;
  font-weight: 700;
  color: ${(p) => p.$color || ACCENT};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const CardMuted = styled.span<{ $onDark?: boolean }>`
  font-size: 13px;
  font-weight: 600;
  color: ${(p) => (p.$onDark ? 'rgba(255,255,255,0.4)' : 'rgba(45,52,80,0.5)')};
`;

// ─── Satellite cards (DristiQ, VaNi App) ─────────────────────

const SatelliteGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 22px;
  margin-top: 22px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Satellite = styled(motion.div)<{ $accent: string }>`
  background: ${WHITE};
  border: 1px solid ${BORDER_LIGHT};
  border-top: 3px solid ${(p) => p.$accent};
  border-radius: 12px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-3px);
    box-shadow: 0 14px 44px rgba(10, 15, 30, 0.14);
  }
`;

const SatHead = styled.div`
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 18px;
`;

const SatName = styled.h3`
  font-family: 'Fraunces', serif;
  font-size: 25px;
  font-weight: 800;
  letter-spacing: -0.8px;
  color: ${INK};
  line-height: 1.1;
`;

const SatLine = styled.div`
  font-size: 12.5px;
  font-weight: 600;
  color: ${INK_SOFT};
  margin-top: 4px;
`;

const SatDesc = styled.p`
  font-size: 14px;
  line-height: 1.8;
  color: ${INK_SOFT};
  margin-bottom: 20px;

  strong {
    color: ${INK};
    font-weight: 600;
  }
`;

const SatFeatures = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  display: flex;
  flex-direction: column;
  gap: 9px;

  li {
    font-size: 13px;
    line-height: 1.6;
    color: ${INK_SOFT};
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

const SatSpacer = styled.div`
  margin-top: auto;
`;

// ─── Framework note ──────────────────────────────────────────

const FrameworkNote = styled(motion.div)`
  background: rgba(201, 151, 58, 0.08);
  border: 1px solid rgba(201, 151, 58, 0.3);
  border-left: 4px solid ${GOLD};
  border-radius: 8px;
  padding: 28px 32px;
  margin-top: 34px;
  max-width: 860px;

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
    color: ${ACCENT};
    font-weight: 700;
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
`;

// ─── Customer proof rows ─────────────────────────────────────
// Row layout rather than a card grid: the stats align in one right-hand
// column, so the eye can run down and compare six numbers without
// re-anchoring on each card.

const RowList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const Row = styled(motion.div)`
  display: grid;
  grid-template-columns: 60px 1fr auto;
  align-items: center;
  gap: 24px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid ${BORDER_DARK};
  border-left: 3px solid ${ACCENT};
  border-radius: 12px;
  padding: 22px 28px;
  transition: background 0.2s;

  &:hover {
    background: rgba(255, 255, 255, 0.07);
  }

  @media (max-width: 800px) {
    grid-template-columns: 48px 1fr;
    gap: 16px;
    padding: 20px;
  }
`;

const RowIcon = styled.div`
  width: 56px;
  height: 56px;
  border-radius: 50%;
  border: 1px solid rgba(232, 66, 10, 0.45);
  background: rgba(232, 66, 10, 0.1);
  display: flex;
  align-items: center;
  justify-content: center;
  color: ${ACCENT_LIGHT};

  @media (max-width: 800px) {
    width: 44px;
    height: 44px;
  }
`;

const RowBody = styled.div`
  min-width: 0;
`;

const RowSector = styled.div`
  font-size: 10.5px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${ACCENT_LIGHT};
  margin-bottom: 7px;
`;

const RowText = styled.p`
  font-size: 15px;
  line-height: 1.65;
  color: rgba(255, 255, 255, 0.72);

  strong {
    color: ${WHITE};
    font-weight: 600;
  }
`;

const RowStat = styled.div`
  text-align: right;
  flex-shrink: 0;

  @media (max-width: 800px) {
    grid-column: 2;
    text-align: left;
    margin-top: 12px;
  }
`;

const RowStatValue = styled.div`
  font-family: 'Fraunces', serif;
  font-size: clamp(24px, 2.6vw, 32px);
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 1.05;
  color: ${ACCENT_LIGHT};
  white-space: nowrap;
`;

const RowStatCaption = styled.div`
  font-size: 11.5px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.45);
  margin-top: 4px;
`;

// ─── Closing panel ───────────────────────────────────────────

const Closer = styled(motion.div)`
  margin-top: 26px;
  border: 1px solid rgba(232, 66, 10, 0.4);
  background: linear-gradient(140deg, rgba(232, 66, 10, 0.14), rgba(201, 151, 58, 0.06));
  border-radius: 14px;
  padding: 40px;
  text-align: center;

  @media (max-width: 768px) {
    padding: 28px 22px;
  }
`;

const CloserLead = styled.p`
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
`;

const CloserSub = styled.p`
  font-size: 15px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.6);
  max-width: 560px;
  margin: 0 auto;
`;

const Disclaimer = styled.p`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 26px;
  line-height: 1.7;
`;

// ─── Data ────────────────────────────────────────────────────

const anchorStats = [
  { value: 'Six', caption: 'Industries in private beta' },
  { value: '45% → 80%', caption: 'Service compliance, two months' },
  { value: '371', caption: 'Customers live on one deployment' },
  { value: '217', caption: 'Skilled people tracked to invoice' },
];

const anchorFeatures = [
  'Digital contracts and e-signature, terms locked',
  'SLA clock starts automatically, with real-time alerts',
  'Vendors log their own work — photos, reports, certificates',
  'Work done → evidence → auto-invoice on completion',
  'Audit-ready compliance report in one click',
  'AR and AP tracked, so you never double-pay',
];

type Satellite = {
  name: string;
  initials: string;
  from: string;
  to: string;
  status: string;
  line: string;
  desc: React.ReactNode;
  features: string[];
  href?: string;
  hrefLabel?: string;
  pending?: string;
};

const satellites: Satellite[] = [
  {
    name: 'DristiQ',
    initials: 'DQ',
    from: '#E0B65C',
    to: GOLD,
    status: 'With Beta Customers',
    line: 'Atmospheric market intelligence for Indian markets',
    desc: (
      <>
        Where price history meets planetary positions.{' '}
        <strong>The IMD tells you a cyclone is forming — it does not tell you whether to
        travel.</strong>{' '}
        DristiQ gives the serious Indian trader that same kind of clarity, for markets.
      </>
    ),
    features: [
      'Ten independent lenses, read for a single convergence',
      'Panchanga atmospheric engine',
      'Astro-technical confluence scoring',
      'Sanatan — atmospheric stock intelligence',
    ],
    href: 'https://dristiq.com',
    hrefLabel: 'dristiq.com →',
  },
  {
    name: 'VaNi App',
    initials: 'VA',
    from: '#2CC3AE',
    to: TEAL,
    status: 'With Beta Customers',
    line: 'NEET & CUET preparation, in three languages',
    // NOTE: copy stays minimal until the product detail and launch status land.
    // Do not invent feature claims here — the landing page comes later.
    desc: (
      <>
        Entrance-exam preparation for NEET and CUET aspirants —{' '}
        <strong>in English, Hindi and Telugu</strong>, in a market that is mostly
        English-only.
      </>
    ),
    features: [],
    pending: 'Landing page in progress',
  },
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
          <SectionLabel>What We&rsquo;ve Built</SectionLabel>
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

          <Anchor
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
          >
            <AnchorGlow />
            <AnchorInner>
              <AnchorHead>
                <Monogram $from={ACCENT_LIGHT} $to={ACCENT} $size={62}>
                  CN
                </Monogram>
                <AnchorNames>
                  <AnchorName>
                    Contract<span>Nest</span>
                  </AnchorName>
                  <AnchorByline>By Vikuna Technologies</AnchorByline>
                </AnchorNames>
                <StatusPill $color={TEAL}>Now Open to the Public</StatusPill>
              </AnchorHead>

              <AnchorTagline>Un-tangle the commitments.</AnchorTagline>

              <AnchorDesc>
                Recurring-service contracts that run themselves, for both sides of the deal.{' '}
                <strong>Buyers</strong> stop chasing vendors for compliance evidence;{' '}
                <strong>sellers</strong> stop losing track of what they promised, delivered
                and are owed. Equipment, facilities and pure services alike.
              </AnchorDesc>

              <StatStrip>
                {anchorStats.map((s) => (
                  <Stat key={s.caption}>
                    <StatValue>{s.value}</StatValue>
                    <StatCaption>{s.caption}</StatCaption>
                  </Stat>
                ))}
              </StatStrip>

              <AnchorFeatures>
                {anchorFeatures.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </AnchorFeatures>

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
            </AnchorInner>
          </Anchor>

          <SatelliteGrid>
            {satellites.map((s, i) => (
              <Satellite
                key={s.name}
                $accent={s.to}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <SatHead>
                  <Monogram $from={s.from} $to={s.to} $size={50}>
                    {s.initials}
                  </Monogram>
                  <div>
                    <SatName>{s.name}</SatName>
                    <SatLine>{s.line}</SatLine>
                  </div>
                </SatHead>

                <StatusPill $color={s.to} style={{ marginBottom: 18 }}>
                  {s.status}
                </StatusPill>

                <SatDesc>{s.desc}</SatDesc>

                {s.features.length > 0 && (
                  <SatFeatures>
                    {s.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </SatFeatures>
                )}

                <SatSpacer />
                <CardFoot>
                  <VaniBadge>Built on VaNi AI</VaniBadge>
                  {s.href ? (
                    <CardLink href={s.href} target="_blank" rel="noopener noreferrer">
                      {s.hrefLabel}
                    </CardLink>
                  ) : (
                    <CardMuted>{s.pending}</CardMuted>
                  )}
                </CardFoot>
              </Satellite>
            ))}
          </SatelliteGrid>

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
              <a href={VANI_HREF} target="_blank" rel="noopener noreferrer">
                How VaNi works →
              </a>
            </p>
          </FrameworkNote>
        </Inner>
      </Section>

      <Section id="customer-proof" $bg={INK}>
        <Inner>
          <SectionLabel>Live From Customer Desks</SectionLabel>
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
                  <s.Icon size={24} strokeWidth={1.6} />
                </RowIcon>
                <RowBody>
                  <RowSector>{s.sector}</RowSector>
                  <RowText>{s.text}</RowText>
                </RowBody>
                <RowStat>
                  <RowStatValue>{s.stat}</RowStatValue>
                  <RowStatCaption>{s.statCaption}</RowStatCaption>
                </RowStat>
              </Row>
            ))}
          </RowList>

          <Closer
            initial={{ opacity: 0, y: 18 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <CloserLead>
              A hospital, a wellness brand, a factory, a garments unit, an accounting firm, a
              staffing company — <em>solving the same problem.</em>
            </CloserLead>
            <CloserSub>
              If you promised to do it again next month, ContractNest tracks it.
            </CloserSub>
          </Closer>

          <Disclaimer>
            Results from ContractNest&rsquo;s private beta, shown by sector rather than by
            name. ContractNest is now open to the public. We&rsquo;ll walk you through any of
            these, live, on a call.
          </Disclaimer>
        </Inner>
      </Section>
    </>
  );
};

export default ProductPortfolio;
