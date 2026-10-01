// src/components/vikuna/WhyAIFailsPlaybook.tsx
// Dedicated page for the "Why AI Fails" playbook: readable substance on the
// page, full PDF + leadership checklist gated behind the n8n lead form.
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import styled from 'styled-components';
import Footer from './Footer';

const INK = '#0A0F1E';
const INK_SOFT = '#2D3450';
const PAPER = '#F7F6F2';
const PAPER_WARM = '#EEEAE0';
const WHITE = '#FFFFFF';
const ACCENT = '#E8420A';
const TEAL = '#12A090';
const GOLD = '#C9973A';
const BORDER = 'rgba(10,15,30,0.1)';

const PLAYBOOK_WEBHOOK = 'https://n8n.srv1096269.hstgr.cloud/webhook/playbook-lead';

// ─── Hero ────────────────────────────────────────────────────

const Hero = styled.section`
  background: ${INK};
  padding: 150px 60px 90px;
  position: relative;
  overflow: hidden;

  @media (max-width: 768px) {
    padding: 120px 24px 60px;
  }
`;

const HeroBg = styled.div`
  position: absolute;
  inset: 0;
  background: radial-gradient(ellipse 60% 55% at 65% 30%, rgba(232, 66, 10, 0.1) 0%, transparent 60%);
  pointer-events: none;
`;

const HeroInner = styled.div`
  position: relative;
  z-index: 2;
  max-width: 860px;
  margin: 0 auto;
`;

const Eyebrow = styled.div`
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(232, 66, 10, 0.4);
  background: rgba(232, 66, 10, 0.09);
  padding: 6px 16px;
  border-radius: 100px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 2px;
  text-transform: uppercase;
  color: ${ACCENT};
  margin-bottom: 28px;
`;

const H1 = styled.h1`
  font-family: 'Fraunces', serif;
  font-size: clamp(34px, 4.8vw, 60px);
  font-weight: 800;
  letter-spacing: -2px;
  line-height: 1.1;
  color: #fff;
  margin-bottom: 22px;

  em {
    font-style: italic;
    color: ${GOLD};
  }
`;

const HeroP = styled.p`
  font-size: 17px;
  font-weight: 300;
  line-height: 1.75;
  color: rgba(255, 255, 255, 0.6);
  max-width: 600px;

  strong {
    color: rgba(255, 255, 255, 0.9);
    font-weight: 500;
  }
`;

// ─── Content scaffolding ─────────────────────────────────────

const Section = styled.section<{ $bg?: string }>`
  background: ${(p) => p.$bg || PAPER};
  padding: 72px 60px;

  @media (max-width: 768px) {
    padding: 48px 24px;
  }
`;

const Inner = styled.div`
  max-width: 860px;
  margin: 0 auto;
`;

const Label = styled.div`
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: ${TEAL};
  margin-bottom: 18px;
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

const H2 = styled.h2`
  font-family: 'Fraunces', serif;
  font-size: clamp(26px, 3vw, 40px);
  font-weight: 800;
  letter-spacing: -1px;
  line-height: 1.15;
  color: ${INK};
  margin-bottom: 18px;

  em {
    font-style: italic;
    color: ${ACCENT};
  }
`;

const Prose = styled.p`
  font-size: 16px;
  line-height: 1.85;
  color: ${INK_SOFT};
  margin-bottom: 18px;

  strong {
    color: ${INK};
  }
`;

// ─── Story vignettes ─────────────────────────────────────────

const StoryGrid = styled.div`
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 18px;
  margin-top: 32px;

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
  }
`;

const Story = styled(motion.div)`
  background: ${WHITE};
  border: 1px solid ${BORDER};
  border-left: 3px solid ${GOLD};
  border-radius: 8px;
  padding: 24px;

  h4 {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: ${GOLD};
    margin-bottom: 10px;
  }

  p {
    font-size: 14px;
    line-height: 1.7;
    color: ${INK_SOFT};
  }
`;

// ─── Failure patterns ────────────────────────────────────────

const PatternList = styled.div`
  margin-top: 36px;
  display: flex;
  flex-direction: column;
  gap: 16px;
`;

const Pattern = styled(motion.div)`
  background: ${WHITE};
  border: 1px solid ${BORDER};
  border-radius: 10px;
  padding: 28px 32px;
  display: flex;
  gap: 24px;
  align-items: flex-start;

  @media (max-width: 600px) {
    flex-direction: column;
    gap: 12px;
  }
`;

const PatternNum = styled.div`
  font-family: 'Fraunces', serif;
  font-size: 32px;
  font-weight: 800;
  color: ${ACCENT};
  line-height: 1;
  flex-shrink: 0;
  width: 52px;
`;

const PatternBody = styled.div`
  h3 {
    font-family: 'Fraunces', serif;
    font-size: 19px;
    font-weight: 700;
    letter-spacing: -0.3px;
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
`;

// ─── 20/80 band ──────────────────────────────────────────────

const Band = styled.div`
  background: ${INK};
  border-radius: 10px;
  padding: 36px 40px;
  margin-top: 40px;

  h3 {
    font-family: 'Fraunces', serif;
    font-size: 22px;
    font-weight: 800;
    color: ${WHITE};
    margin-bottom: 10px;
    letter-spacing: -0.4px;

    em {
      font-style: italic;
      color: ${GOLD};
    }
  }

  p {
    font-size: 15px;
    line-height: 1.75;
    color: rgba(255, 255, 255, 0.65);

    strong {
      color: ${WHITE};
    }
  }

  @media (max-width: 600px) {
    padding: 28px 24px;
  }
`;

// ─── Gate card ───────────────────────────────────────────────

const GateWrap = styled.div`
  background: ${WHITE};
  border: 1px solid rgba(201, 151, 58, 0.4);
  border-radius: 12px;
  padding: 40px;
  display: grid;
  grid-template-columns: 1.2fr 1fr;
  gap: 40px;
  align-items: center;
  box-shadow: 0 12px 48px rgba(10, 15, 30, 0.08);

  @media (max-width: 860px) {
    grid-template-columns: 1fr;
    padding: 28px 24px;
  }
`;

const GateText = styled.div`
  h3 {
    font-family: 'Fraunces', serif;
    font-size: 26px;
    font-weight: 800;
    letter-spacing: -0.6px;
    color: ${INK};
    margin-bottom: 12px;

    em {
      font-style: italic;
      color: ${ACCENT};
    }
  }

  p {
    font-size: 14px;
    line-height: 1.7;
    color: ${INK_SOFT};
    margin-bottom: 16px;
  }

  ul {
    list-style: none;
    padding: 0;
    margin: 0;

    li {
      font-size: 14px;
      color: ${INK_SOFT};
      padding-left: 22px;
      position: relative;
      margin-bottom: 8px;
      line-height: 1.6;

      &::before {
        content: '✓';
        position: absolute;
        left: 0;
        color: ${TEAL};
        font-weight: 700;
      }
    }
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
  padding: 14px;
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
  margin-top: 10px;
  text-align: center;
`;

const SuccessBox = styled.div`
  text-align: center;

  .emoji {
    font-size: 38px;
    margin-bottom: 10px;
  }

  h4 {
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

// ─── Final CTA ───────────────────────────────────────────────

const FinalCta = styled.section`
  background: ${INK};
  padding: 72px 60px;
  text-align: center;

  h2 {
    font-family: 'Fraunces', serif;
    font-size: clamp(24px, 3.4vw, 40px);
    font-weight: 800;
    letter-spacing: -1px;
    color: ${WHITE};
    margin-bottom: 12px;

    em {
      font-style: italic;
      color: ${GOLD};
    }
  }

  p {
    font-size: 15px;
    color: rgba(255, 255, 255, 0.55);
    max-width: 480px;
    margin: 0 auto 30px;
    line-height: 1.7;
  }

  @media (max-width: 768px) {
    padding: 48px 24px;
  }
`;

const BtnPrimary = styled.a`
  display: inline-block;
  background: ${ACCENT};
  color: ${WHITE};
  padding: 15px 32px;
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

// ─── Data ────────────────────────────────────────────────────

const stories = [
  {
    tag: 'Healthcare · Hyderabad',
    text: 'A hospital digitised its patient workflows. Six months later, the nurses were still using the paper register. The system worked. Nobody had made it work for them.',
  },
  {
    tag: 'Pharma',
    text: "Leadership asked for a data platform and got one. The reports still came from someone's Excel — because the platform answered questions nobody on the floor was asking.",
  },
  {
    tag: 'Manufacturing',
    text: 'IoT sensors across three plants, dashboards live. The maintenance team kept coordinating on WhatsApp. Zero adoption, full invoice.',
  },
];

const patterns = [
  {
    title: 'The demo decides, not the problem',
    text: "The tool was chosen because the demo was impressive — not because a specific, costed business problem demanded it. **If you can't state the workflow and the rupee value it unlocks, the initiative is already dead;** it just doesn't know it yet.",
  },
  {
    title: 'The 20/80 inversion',
    text: 'Budgets and attention go to technology — the visible 20%. Culture, process redesign, capability, and adoption — the 80% where transformation actually happens — get leftovers. **The iceberg sinks the ship from below the waterline.**',
  },
  {
    title: 'Nobody owns the six months after',
    text: "Consultants design and disappear. Vendors deliver and close the ticket. Leadership approves but doesn't own the outcome. **Transformation doesn't fail in the boardroom — it fails in the six months after,** when no one is accountable for adoption.",
  },
  {
    title: 'Automating a broken process',
    text: "AI layered on a process that never worked just produces failure, faster. **Process comes first, intelligence second.** If the workflow is broken, fix the workflow — then automate what's proven.",
  },
  {
    title: 'The capability cliff',
    text: "The system goes live, the builders leave, and the team that must run it every day was never trained, never consulted, never made owners. **Adoption without capability is shelf-ware with a login page.**",
  },
];

// Render **bold** markers in pattern text without pulling in a md library.
function emphasize(text: string): React.ReactNode {
  const parts = text.split('**');
  return parts.map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part));
}

// ─── Component ───────────────────────────────────────────────

const WhyAIFailsPlaybook: React.FC = () => {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'done'>('idle');
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
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
          source: 'playbook-page',
          playbook: 'why-ai-fails',
          name: cleanName,
          email: cleanEmail,
          whatsapp: cleanWhatsapp.startsWith('+91') ? cleanWhatsapp : `+91${cleanWhatsapp}`,
          page: window.location.href,
          submittedAt: new Date().toISOString(),
        }),
      });
    } catch {
      // n8n handles delivery; don't block the visitor on our infra.
    }
    setStatus('done');
  }

  return (
    <>
      <Hero>
        <HeroBg />
        <HeroInner>
          <motion.div initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}>
            <Eyebrow>Playbook 01 · Free</Eyebrow>
            <H1>
              Why AI fails.
              <br />
              <em>And what the survivors do differently.</em>
            </H1>
            <HeroP>
              24 years across healthcare, pharma, and manufacturing. Dozens of
              transformations — some that held, many that quietly died.{' '}
              <strong>This is the honest post-mortem, written down.</strong>
            </HeroP>
          </motion.div>
        </HeroInner>
      </Hero>

      <Section>
        <Inner>
          <Label>The Pattern</Label>
          <H2>
            The demo goes great.
            <br />
            Then <em>nothing changes.</em>
          </H2>
          <Prose>
            Every failed AI initiative we've seen followed the same arc: an impressive
            demo, an approved budget, a launched pilot — and six months later, the
            organisation working exactly the way it did before, plus one more unused
            system. <strong>These are real engagements we were called into:</strong>
          </Prose>
          <StoryGrid>
            {stories.map((s, i) => (
              <Story
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
              >
                <h4>{s.tag}</h4>
                <p>{s.text}</p>
              </Story>
            ))}
          </StoryGrid>
          <Band>
            <h3>
              Not one of these was a <em>technology</em> failure.
            </h3>
            <p>
              The systems worked. The problem was that{' '}
              <strong>nobody stayed long enough to make them work for the people who
              had to use them every day.</strong> That distinction — technology
              failure vs. adoption failure — is the entire playbook in one sentence.
            </p>
          </Band>
        </Inner>
      </Section>

      <Section $bg={PAPER_WARM}>
        <Inner>
          <Label>The Five Failure Patterns</Label>
          <H2>
            AI initiatives don't die of one big mistake.
            <br />
            They die of <em>five familiar ones.</em>
          </H2>
          <PatternList>
            {patterns.map((p, i) => (
              <Pattern
                key={i}
                initial={{ opacity: 0, y: 16 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.07 }}
              >
                <PatternNum>0{i + 1}</PatternNum>
                <PatternBody>
                  <h3>{p.title}</h3>
                  <p>{emphasize(p.text)}</p>
                </PatternBody>
              </Pattern>
            ))}
          </PatternList>
        </Inner>
      </Section>

      <Section>
        <Inner>
          <Label>Get the Full Playbook</Label>
          <GateWrap>
            <GateText>
              <h3>
                The full playbook goes <em>deeper.</em>
              </h3>
              <p>
                The web version stops here. The PDF continues with the part you'll
                actually use in your next leadership meeting:
              </p>
              <ul>
                <li>The 12-point readiness checklist — run it in one sitting</li>
                <li>What the surviving 15% did differently, step by step</li>
                <li>How to pick a first workflow that pays for itself</li>
                <li>The questions to ask any AI vendor (including us)</li>
              </ul>
            </GateText>
            <div>
              {status === 'done' ? (
                <SuccessBox>
                  <div className="emoji">📬</div>
                  <h4>On its way!</h4>
                  <p>
                    The playbook is headed to your WhatsApp and inbox. If it hasn't
                    arrived in 10 minutes, write to{' '}
                    <a href="mailto:contact@vikuna.io">contact@vikuna.io</a>.
                  </p>
                </SuccessBox>
              ) : (
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
                    {status === 'submitting' ? 'Sending…' : '📲 Send Me the Playbook'}
                  </SubmitBtn>
                  <FormNote>🔒 No spam. One playbook, one follow-up, that's it.</FormNote>
                </form>
              )}
            </div>
          </GateWrap>
        </Inner>
      </Section>

      <FinalCta>
        <h2>
          Want to know <em>your</em> failure risk?
        </h2>
        <p>
          The free AI Readiness Assessment scores your organisation against these
          exact patterns — 12 questions, results on screen.
        </p>
        <BtnPrimary href="/assessment">Take the Readiness Assessment</BtnPrimary>
      </FinalCta>

      <Footer />
    </>
  );
};

export default WhyAIFailsPlaybook;
