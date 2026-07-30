// src/components/vikuna/AlignmentCTA.tsx
// Bridge banner between Fractional Leadership and the /training page.
import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import styled from 'styled-components';

const INK = '#0A0F1E';
const GOLD = '#C9973A';
const ACCENT = '#E8420A';

const Section = styled.section`
  background: ${INK};
  padding: 72px 60px;

  @media (max-width: 768px) {
    padding: 48px 24px;
  }
`;

const Inner = styled(motion.div)`
  max-width: 1000px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 40px;

  @media (max-width: 900px) {
    flex-direction: column;
    text-align: center;
  }
`;

const Text = styled.div`
  h2 {
    font-family: 'Fraunces', serif;
    font-size: clamp(24px, 3vw, 38px);
    font-weight: 800;
    letter-spacing: -1px;
    line-height: 1.2;
    color: #fff;
    margin-bottom: 10px;

    em {
      font-style: italic;
      color: ${GOLD};
    }
  }

  p {
    font-size: 15px;
    line-height: 1.7;
    color: rgba(255, 255, 255, 0.55);
    max-width: 560px;
  }
`;

const Btn = styled.button`
  background: ${ACCENT};
  color: #fff;
  border: none;
  padding: 16px 36px;
  border-radius: 4px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
  white-space: nowrap;
  flex-shrink: 0;
  font-family: 'DM Sans', sans-serif;
  transition: transform 0.2s, box-shadow 0.2s;

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 8px 32px rgba(232, 66, 10, 0.35);
  }
`;

const AlignmentCTA: React.FC = () => {
  const navigate = useNavigate();

  return (
    <Section>
      <Inner
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
      >
        <Text>
          <h2>
            Digital &amp; AI leadership is most critical to growth.
            <br />
            Is your organisation <em>aligned?</em>
          </h2>
          <p>
            Leadership sets the direction — but transformation holds only when your
            people can carry it. That's a capability question, not a technology one.
          </p>
        </Text>
        <Btn onClick={() => navigate('/training')}>Build the Capability →</Btn>
      </Inner>
    </Section>
  );
};

export default AlignmentCTA;
