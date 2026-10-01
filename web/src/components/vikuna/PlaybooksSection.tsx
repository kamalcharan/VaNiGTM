// src/components/vikuna/PlaybooksSection.tsx
// Gated lead magnets: visitor picks a playbook, leaves name/email/WhatsApp,
// n8n delivers the PDF (same pattern as the BCL 2025 funnel — nothing to host here).
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';

const INK = '#0A0F1E';
const INK_SOFT = '#2D3450';
const PAPER_WARM = '#EEEAE0';
const WHITE = '#FFFFFF';
const ACCENT = '#E8420A';
const TEAL = '#12A090';
const GOLD = '#C9973A';
const BORDER = 'rgba(10,15,30,0.1)';

const PLAYBOOK_WEBHOOK = 'https://n8n.srv1096269.hstgr.cloud/webhook/playbook-lead';

// ─── Section scaffolding ─────────────────────────────────────

const Section = styled.section`
  background: ${PAPER_WARM};
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
  font-family: 'Fraunces', serif;
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
  max-width: 600px;
  line-height: 1.8;
  margin-bottom: 48px;

  strong {
    color: ${INK};
  }
`;

const Grid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 24px;

  @media (max-width: 900px) {
    grid-template-columns: 1fr;
  }
`;

const Card = styled(motion.div)<{ $accent: string }>`
  background: ${WHITE};
  border: 1px solid ${BORDER};
  border-radius: 10px;
  padding: 32px;
  display: flex;
  flex-direction: column;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: ${(p) => p.$accent};
  }
`;

const CardTag = styled.div<{ $color: string }>`
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${(p) => p.$color};
  margin-bottom: 14px;
`;

const CardTitle = styled.h3`
  font-family: 'Fraunces', serif;
  font-size: 20px;
  font-weight: 700;
  letter-spacing: -0.4px;
  color: ${INK};
  margin-bottom: 10px;
`;

const CardDesc = styled.p`
  font-size: 14px;
  color: ${INK_SOFT};
  line-height: 1.7;
  margin-bottom: 20px;
`;

const CardList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  flex: 1;

  li {
    font-size: 13px;
    color: ${INK_SOFT};
    line-height: 1.6;
    padding-left: 20px;
    position: relative;
    margin-bottom: 8px;

    &::before {
      content: '→';
      position: absolute;
      left: 0;
      color: ${TEAL};
      font-weight: 700;
    }
  }
`;

const CardBtn = styled.button<{ $accent: string }>`
  background: ${(p) => p.$accent};
  color: ${WHITE};
  border: none;
  padding: 13px 24px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  font-family: 'DM Sans', sans-serif;
  transition: opacity 0.2s, transform 0.2s;

  &:hover {
    opacity: 0.9;
    transform: translateY(-1px);
  }
`;

// ─── Modal ───────────────────────────────────────────────────

const Overlay = styled.div`
  position: fixed;
  inset: 0;
  z-index: 1000;
  background: rgba(10, 15, 30, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
`;

const Modal = styled.div`
  background: ${WHITE};
  border-radius: 12px;
  padding: 36px;
  max-width: 440px;
  width: 100%;
  position: relative;

  h3 {
    font-family: 'Fraunces', serif;
    font-size: 20px;
    font-weight: 800;
    color: ${INK};
    margin-bottom: 8px;
    letter-spacing: -0.4px;
  }

  > p {
    font-size: 14px;
    color: ${INK_SOFT};
    line-height: 1.65;
    margin-bottom: 20px;
  }
`;

const ModalClose = styled.button`
  position: absolute;
  top: 14px;
  right: 14px;
  background: none;
  border: none;
  font-size: 20px;
  color: ${INK_SOFT};
  cursor: pointer;

  &:hover {
    color: ${INK};
  }
`;

const Field = styled.input`
  width: 100%;
  padding: 12px 14px;
  margin-bottom: 10px;
  border: 1px solid rgba(10, 15, 30, 0.18);
  border-radius: 6px;
  font-size: 14px;
  font-family: 'DM Sans', sans-serif;
  color: ${INK};

  &:focus {
    outline: none;
    border-color: ${TEAL};
  }
`;

const SubmitBtn = styled.button<{ $busy: boolean }>`
  width: 100%;
  padding: 13px;
  background: ${(p) => (p.$busy ? 'rgba(232,66,10,0.5)' : ACCENT)};
  color: ${WHITE};
  border: none;
  border-radius: 6px;
  font-size: 14px;
  font-weight: 700;
  cursor: ${(p) => (p.$busy ? 'wait' : 'pointer')};
  font-family: 'DM Sans', sans-serif;
`;

const FormError = styled.div`
  font-size: 12px;
  color: ${ACCENT};
  margin-bottom: 10px;
`;

const FormNote = styled.div`
  font-size: 11px;
  color: rgba(10, 15, 30, 0.45);
  margin-top: 12px;
  text-align: center;
`;

const SuccessBox = styled.div`
  text-align: center;
  padding: 12px 0;

  .emoji {
    font-size: 40px;
    margin-bottom: 12px;
  }

  h3 {
    font-family: 'Fraunces', serif;
    font-size: 20px;
    color: ${INK};
    margin-bottom: 8px;
  }

  p {
    font-size: 14px;
    color: ${INK_SOFT};
    line-height: 1.65;
  }
`;

// ─── Data ────────────────────────────────────────────────────

interface Playbook {
  id: string;
  tag: string;
  accent: string;
  title: string;
  desc: string;
  contents: string[];
}

const playbooks: Playbook[] = [
  {
    id: 'why-ai-fails',
    tag: 'For Every Leader',
    accent: ACCENT,
    title: 'Why AI Fails',
    desc: 'The 80% below the waterline. What actually kills AI initiatives after the demo — and the checklist that keeps yours alive.',
    contents: [
      'The 5 failure patterns we saw across 24 years',
      'The 20/80 iceberg: where transformation really happens',
      'A readiness checklist you can run in one leadership meeting',
    ],
  },
  {
    id: 'vani-approach',
    tag: 'Our AI Approach',
    accent: GOLD,
    title: 'The VaNi Playbook',
    desc: 'How we build AI that survives production: event-driven, ROI-first, human-in-the-loop. The exact approach behind our own products.',
    contents: [
      'Why 70–80% automation beats chasing 100%',
      'Human-in-the-loop design that teams actually adopt',
      'The 4–5 month path from workflow to production',
    ],
  },
  {
    id: 'contractnest-compliance',
    tag: 'From ContractNest',
    accent: TEAL,
    title: 'Compliance-Ready Contracts',
    desc: 'Lessons from building ContractNest: putting regulatory compliance and SLA discipline inside your contract and AMC operations.',
    contents: [
      'Where contract compliance silently breaks in SMEs',
      'SLA tracking that survives audits',
      'What AI can (and cannot) automate in regulated workflows',
    ],
  },
];

// ─── Component ───────────────────────────────────────────────

const PlaybooksSection: React.FC = () => {
  const [selected, setSelected] = useState<Playbook | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState('');

  function openModal(pb: Playbook) {
    setSelected(pb);
    setStatus('idle');
    setError('');
  }

  function closeModal() {
    setSelected(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const cleanWhatsapp = whatsapp.replace(/[^\d+]/g, '');

    if (cleanName.length < 2) { setError('Please enter your name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) { setError('Please enter a valid email.'); return; }
    if (!/^(\+91)?[6-9]\d{9}$/.test(cleanWhatsapp)) { setError('Please enter a valid 10-digit WhatsApp number.'); return; }

    setError('');
    setStatus('submitting');

    try {
      await fetch(PLAYBOOK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          source: 'playbook',
          playbook: selected.id,
          name: cleanName,
          email: cleanEmail,
          whatsapp: cleanWhatsapp.startsWith('+91') ? cleanWhatsapp : `+91${cleanWhatsapp}`,
          page: window.location.href,
          submittedAt: new Date().toISOString(),
        }),
      });
    } catch {
      // Deliver-by-n8n means there's nothing to fall back to client-side;
      // still show success so the visitor isn't stuck — the retry burden is ours.
    }
    setStatus('done');
  }

  return (
    <Section id="playbooks">
      <Inner>
        <SectionLabel>Free Playbooks</SectionLabel>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <Heading>
            Steal what we've learned.
            <br />
            Before you spend a rupee.
          </Heading>
        </motion.div>

        <Intro>
          Everything in these playbooks comes from real engagements and our own
          products — <strong>not recycled theory.</strong> Pick one, tell us where to
          send it, and it lands on your WhatsApp and inbox in minutes.
        </Intro>

        <Grid>
          {playbooks.map((pb, i) => (
            <Card
              key={pb.id}
              $accent={pb.accent}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
            >
              <CardTag $color={pb.accent}>{pb.tag}</CardTag>
              <CardTitle>{pb.title}</CardTitle>
              <CardDesc>{pb.desc}</CardDesc>
              <CardList>
                {pb.contents.map((c, idx) => (
                  <li key={idx}>{c}</li>
                ))}
              </CardList>
              <CardBtn $accent={pb.accent} onClick={() => openModal(pb)}>
                Get This Playbook →
              </CardBtn>
            </Card>
          ))}
        </Grid>
      </Inner>

      {selected && (
        <Overlay onClick={closeModal}>
          <Modal onClick={(e) => e.stopPropagation()}>
            <ModalClose onClick={closeModal} aria-label="Close">✕</ModalClose>
            {status === 'done' ? (
              <SuccessBox>
                <div className="emoji">📬</div>
                <h3>On its way!</h3>
                <p>
                  <strong>{selected.title}</strong> is headed to your WhatsApp and
                  inbox. If it hasn't arrived in 10 minutes, write to{' '}
                  <a href="mailto:contact@vikuna.io">contact@vikuna.io</a>.
                </p>
              </SuccessBox>
            ) : (
              <>
                <h3>Get "{selected.title}"</h3>
                <p>Tell us where to send it — delivered by WhatsApp and email.</p>
                <form onSubmit={handleSubmit}>
                  <Field
                    type="text"
                    placeholder="Your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                  <Field
                    type="email"
                    placeholder="Work email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                  <Field
                    type="tel"
                    placeholder="WhatsApp number"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                  />
                  {error && <FormError>{error}</FormError>}
                  <SubmitBtn type="submit" $busy={status === 'submitting'}>
                    {status === 'submitting' ? 'Sending…' : '📲 Send It to Me'}
                  </SubmitBtn>
                </form>
                <FormNote>🔒 No spam. One playbook, one follow-up, that's it.</FormNote>
              </>
            )}
          </Modal>
        </Overlay>
      )}
    </Section>
  );
};

export default PlaybooksSection;
