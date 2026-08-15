// src/components/vikuna/ProductPortfolio.tsx
// The "products" act of the MVP-as-a-Service page. Two beats: the products we
// ship ourselves (capability, demonstrated rather than claimed), then the
// customer operations running on them. VaNi AI is the thread through both —
// every product carries the badge, which is how DristiQ already presents itself.
import React from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';

// ─── Color tokens (dark editorial, matches MVPPage) ──────────
const INK = '#0A0F1E';
const INK_SOFT = '#2D3450';
const PAPER = '#F7F6F2';
const WHITE = '#FFFFFF';
const ACCENT = '#E8420A';
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

// ─── Our own products ────────────────────────────────────────

const ProductGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;

  @media (max-width: 1000px) {
    grid-template-columns: 1fr;
  }
`;

const ProductCard = styled(motion.div)`
  background: ${WHITE};
  border: 1px solid ${BORDER_LIGHT};
  border-radius: 10px;
  padding: 32px;
  display: flex;
  flex-direction: column;
`;

const StatusTag = styled.div<{ $color: string }>`
  align-self: flex-start;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${(p) => p.$color};
  border: 1px solid ${(p) => p.$color}55;
  background: ${(p) => p.$color}12;
  padding: 5px 12px;
  border-radius: 100px;
  margin-bottom: 18px;
`;

const ProductName = styled.h3`
  font-family: 'Fraunces', serif;
  font-size: 26px;
  font-weight: 800;
  letter-spacing: -0.8px;
  color: ${INK};
  margin-bottom: 6px;
`;

const ProductLine = styled.div`
  font-size: 13px;
  font-weight: 600;
  color: ${INK_SOFT};
  margin-bottom: 16px;
`;

const ProductDesc = styled.p`
  font-size: 14px;
  line-height: 1.75;
  color: ${INK_SOFT};
  margin-bottom: 20px;

  strong {
    color: ${INK};
    font-weight: 600;
  }
`;

const FeatureList = styled.ul`
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
      top: 8px;
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: ${TEAL};
    }
  }
`;

const CardFoot = styled.div`
  margin-top: auto;
  padding-top: 20px;
  border-top: 1px solid ${BORDER_LIGHT};
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

const CardLink = styled.a`
  font-size: 13px;
  font-weight: 700;
  color: ${ACCENT};
  text-decoration: none;

  &:hover {
    text-decoration: underline;
  }
`;

const CardMuted = styled.span`
  font-size: 13px;
  font-weight: 600;
  color: rgba(45, 52, 80, 0.5);
`;

// ─── Framework note ──────────────────────────────────────────

const FrameworkNote = styled(motion.div)`
  background: rgba(201, 151, 58, 0.08);
  border: 1px solid rgba(201, 151, 58, 0.3);
  border-left: 4px solid ${GOLD};
  border-radius: 8px;
  padding: 28px 32px;
  margin-top: 40px;
  max-width: 820px;

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

// ─── Customer deployments ────────────────────────────────────

const StoryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 20px;

  @media (max-width: 1000px) {
    grid-template-columns: repeat(2, 1fr);
  }

  @media (max-width: 600px) {
    grid-template-columns: 1fr;
  }
`;

const StoryCard = styled(motion.div)`
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid ${BORDER_DARK};
  border-radius: 10px;
  padding: 26px;
  display: flex;
  flex-direction: column;
`;

const StorySector = styled.div`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${TEAL};
  margin-bottom: 14px;
`;

const StoryStat = styled.div`
  font-family: 'Fraunces', serif;
  font-size: 30px;
  font-weight: 800;
  letter-spacing: -1px;
  color: ${GOLD};
  line-height: 1.1;
  margin-bottom: 6px;
`;

const StoryStatCaption = styled.div`
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 16px;
`;

const StoryBefore = styled.p`
  font-size: 13px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.45);
  margin-bottom: 10px;
  font-style: italic;
`;

const StoryAfter = styled.p`
  font-size: 13px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.75);

  strong {
    color: ${WHITE};
    font-weight: 600;
  }
`;

const Disclaimer = styled.p`
  font-size: 12px;
  color: rgba(255, 255, 255, 0.35);
  margin-top: 28px;
  line-height: 1.7;
`;

// ─── Data ────────────────────────────────────────────────────

type Product = {
  name: string;
  status: string;
  statusColor: string;
  line: string;
  desc: React.ReactNode;
  features: string[];
  href?: string;
  hrefLabel?: string;
  pending?: string;
};

const products: Product[] = [
  {
    name: 'ContractNest',
    status: 'Private Beta',
    statusColor: TEAL,
    line: 'Contract & SLA operations, WhatsApp-native',
    desc: (
      <>
        Recurring-service contracts that run themselves — for both sides of the deal.{' '}
        <strong>Buyers</strong> stop chasing vendors for compliance evidence;{' '}
        <strong>sellers</strong> stop losing track of what they promised, delivered and are
        owed.
      </>
    ),
    features: [
      'Digital contracts and e-signature, terms locked',
      'SLA clock starts automatically, with real-time alerts',
      'Vendors log their own work — photos, reports, certificates from site',
      'Work done → evidence → auto-invoice on completion',
      'Audit-ready compliance report in one click',
    ],
    href: 'https://www.contractnest.com',
    hrefLabel: 'contractnest.com →',
  },
  {
    name: 'DristiQ',
    status: 'Building',
    statusColor: GOLD,
    line: 'Atmospheric market intelligence for Indian markets',
    desc: (
      <>
        Where price history meets planetary positions.{' '}
        <strong>
          The IMD tells you a cyclone is forming — it does not tell you whether to travel.
        </strong>{' '}
        DristiQ gives the serious Indian trader that same kind of clarity, for markets.
      </>
    ),
    features: [
      'Ten independent lenses, read for a single convergence',
      'Panchanga atmospheric engine',
      'Astro-technical confluence scoring',
      'Auto-calendar across past and forward dates',
      'Sanatan — atmospheric stock intelligence',
    ],
    href: 'https://dristiq.com',
    hrefLabel: 'dristiq.com →',
  },
  {
    name: 'VaNi App',
    status: 'In Development',
    statusColor: ACCENT,
    line: 'Exam preparation for NEET and CUET aspirants',
    // NOTE: copy deliberately minimal — awaiting product detail, launch status
    // and store links from Charan. Do not invent feature claims here.
    desc: <>A mobile app for students preparing for NEET and CUET.</>,
    features: [],
    pending: 'Landing page in progress',
  },
];

type Story = {
  sector: string;
  stat: string;
  statCaption: string;
  before: string;
  after: React.ReactNode;
};

const stories: Story[] = [
  {
    sector: 'Hospital · Buyer side',
    stat: '45% → 80%',
    statCaption: 'Service compliance, in two months',
    before: 'Equipment AMCs tracked in spreadsheets; missed visits found too late.',
    after: (
      <>
        <strong>130 equipment AMCs</strong> — biomedical, HVAC and facilities — on one
        calendar. Zero missed calibrations, and a foundation for NABH.
      </>
    ),
  },
  {
    sector: 'Industrial OEM · Seller side',
    stat: '39% → 74%',
    statCaption: 'Service compliance',
    before: '400 machines lived across the service engineers’ WhatsApp threads.',
    after: (
      <>
        AMCs rolled out to <strong>90 of their own customers</strong>, every visit logged
        with a digital calibration report.
      </>
    ),
  },
  {
    sector: 'Wellness Provider · Seller side',
    stat: '371',
    statCaption: 'Customers live',
    before: 'Drowned in its own success — 600 packages sold in two months, tracked in sheets.',
    after: (
      <>
        Year-long packages — 3 provider visits, 4 diet consults, 15 yoga sessions — tracked
        per customer. <strong>Knows exactly what is promised, delivered and owed.</strong>
      </>
    ),
  },
  {
    sector: 'Payroll & Bookkeeping',
    stat: '29 clients',
    statCaption: '250+ contracts digitised',
    before: 'Manual invoices, ledger offline, proof of work buried in email.',
    after: (
      <>
        Evidence out of inboxes and shared drives — <strong>traceable and audit-ready</strong>,
        with proposals and contracts in one place.
      </>
    ),
  },
  {
    sector: 'Manpower Company',
    stat: '217',
    statCaption: 'Skilled people deployed',
    before: 'Deployments and receivables effectively invisible.',
    after: (
      <>
        Deployments, receivables and on-time invoicing{' '}
        <strong>finally visible in one place</strong>.
      </>
    ),
  },
  {
    sector: 'Outsourced Services · Buyer side',
    stat: '45',
    statCaption: 'Vendor contracts tracked end to end',
    before: 'Invoices landed before the work was done — paying blind, no evidence.',
    after: (
      <>
        Deliverables and payments tracked end to end.{' '}
        <strong>Pay for what is done, never double-pay.</strong>
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
            money</strong>. Three of ours are below, in three unrelated industries. Same
            framework underneath all of them.
          </SectionIntro>

          <ProductGrid>
            {products.map((p, i) => (
              <ProductCard
                key={p.name}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.08 }}
              >
                <StatusTag $color={p.statusColor}>{p.status}</StatusTag>
                <ProductName>{p.name}</ProductName>
                <ProductLine>{p.line}</ProductLine>
                <ProductDesc>{p.desc}</ProductDesc>
                {p.features.length > 0 && (
                  <FeatureList>
                    {p.features.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </FeatureList>
                )}
                <CardFoot>
                  <VaniBadge>Built on VaNi AI</VaniBadge>
                  {p.href ? (
                    <CardLink href={p.href} target="_blank" rel="noopener noreferrer">
                      {p.hrefLabel}
                    </CardLink>
                  ) : (
                    <CardMuted>{p.pending}</CardMuted>
                  )}
                </CardFoot>
              </ProductCard>
            ))}
          </ProductGrid>

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
              Real operations,
              <br />
              <em>running themselves.</em>
            </H2>
          </motion.div>
          <SectionIntro $onDark>
            Shipping is one thing; surviving contact with a customer&rsquo;s messy reality is
            another. These are businesses running day-to-day operations on our software —{' '}
            <strong>with the numbers they had before, and the numbers they have now</strong>.
          </SectionIntro>

          <StoryGrid>
            {stories.map((s, i) => (
              <StoryCard
                key={s.sector}
                initial={{ opacity: 0, y: 20 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: (i % 3) * 0.08 }}
              >
                <StorySector>{s.sector}</StorySector>
                <StoryStat>{s.stat}</StoryStat>
                <StoryStatCaption>{s.statCaption}</StoryStatCaption>
                <StoryBefore>{s.before}</StoryBefore>
                <StoryAfter>{s.after}</StoryAfter>
              </StoryCard>
            ))}
          </StoryGrid>

          <Disclaimer>
            Deployments running on ContractNest during private beta. Customer names withheld
            at their request — we&rsquo;ll walk you through any of them, live, on a call.
          </Disclaimer>
        </Inner>
      </Section>
    </>
  );
};

export default ProductPortfolio;
