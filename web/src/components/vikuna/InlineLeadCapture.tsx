// src/components/vikuna/InlineLeadCapture.tsx
import React, { useState } from 'react';
import styled from 'styled-components';
import { ArrowRight, Download, CheckCircle } from 'lucide-react';
import useTheme from '../../hooks/useTheme';

const safeColor = (theme: any, path: string, fallback: string = '#000000'): string => {
  const parts = path.split('.');
  let current = theme;
  for (const part of parts) {
    if (current === undefined || current === null) return fallback;
    current = current[part];
  }
  return current || fallback;
};

const Container = styled.div`
  background: linear-gradient(135deg,
    ${props => safeColor(props.theme, 'colors.primary.main', '#39d2c0')} 0%,
    ${props => safeColor(props.theme, 'colors.primary.dark', '#1aaa99')} 100%
  );
  padding: 60px 24px;
  margin: 80px 0;
  position: relative;
  overflow: hidden;

  &::before {
    content: '';
    position: absolute;
    top: -50%;
    right: -10%;
    width: 500px;
    height: 500px;
    background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
  }
`;

const Content = styled.div`
  max-width: 800px;
  margin: 0 auto;
  text-align: center;
  position: relative;
  z-index: 1;
`;

const Icon = styled.div`
  width: 64px;
  height: 64px;
  background: rgba(255, 255, 255, 0.2);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 24px;

  svg {
    width: 32px;
    height: 32px;
    color: white;
  }
`;

const Headline = styled.h3`
  font-size: clamp(1.75rem, 3vw, 2.25rem);
  font-weight: 700;
  color: white;
  margin-bottom: 12px;
  line-height: 1.2;
`;

const Subheadline = styled.p`
  font-size: 1.125rem;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 32px;
  line-height: 1.6;
`;

const Form = styled.form<{ $isSubmitted: boolean }>`
  display: ${props => props.$isSubmitted ? 'none' : 'flex'};
  gap: 12px;
  max-width: 600px;
  margin: 0 auto 16px;

  @media (max-width: 768px) {
    flex-direction: column;
  }
`;

const Input = styled.input`
  flex: 1;
  padding: 16px 20px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  background: white;
  color: ${props => safeColor(props.theme, 'colors.text.primary', '#1a1f24')};

  &::placeholder {
    color: ${props => safeColor(props.theme, 'colors.text.disabled', '#95a1ac')};
  }

  &:focus {
    outline: none;
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.3);
  }
`;

const SubmitButton = styled.button`
  padding: 16px 32px;
  background: rgba(255, 255, 255, 0.9);
  color: ${props => safeColor(props.theme, 'colors.secondary.main', '#FF6F61')};
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 8px;
  white-space: nowrap;
  transition: all 0.3s ease;

  &:hover {
    background: white;
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
  }

  svg {
    width: 18px;
    height: 18px;
  }

  @media (max-width: 768px) {
    width: 100%;
    justify-content: center;
  }
`;

const TrustBadge = styled.div`
  font-size: 0.875rem;
  color: rgba(255, 255, 255, 0.8);
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;

  svg {
    width: 14px;
    height: 14px;
  }
`;

const SuccessMessage = styled.div`
  text-align: center;
  color: white;

  svg {
    width: 48px;
    height: 48px;
    margin-bottom: 16px;
  }

  h4 {
    font-size: 1.5rem;
    font-weight: 700;
    margin-bottom: 8px;
  }

  p {
    font-size: 1rem;
    opacity: 0.9;
  }
`;

interface InlineLeadCaptureProps {
  headline?: string;
  subheadline?: string;
  buttonText?: string;
  placeholder?: string;
  icon?: React.ReactNode;
}

const InlineLeadCapture: React.FC<InlineLeadCaptureProps> = ({
  headline = "Ready to Transform Your Business with AI?",
  subheadline = "Get your free AI Readiness Scorecard and personalized recommendations.",
  buttonText = "Get My Scorecard",
  placeholder = "Enter your work email",
  icon = <Download />
}) => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const { currentTheme } = useTheme();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // TODO: Send to your email service/CRM
    console.log('Lead captured:', email);

    setIsSubmitted(true);

    // Reset after 5 seconds
    setTimeout(() => {
      setIsSubmitted(false);
      setEmail('');
    }, 5000);
  };

  return (
    <Container theme={currentTheme}>
      <Content>
        {!isSubmitted ? (
          <>
            <Icon>{icon}</Icon>
            <Headline>{headline}</Headline>
            <Subheadline>{subheadline}</Subheadline>

            <Form onSubmit={handleSubmit} $isSubmitted={isSubmitted}>
              <Input
                type="email"
                placeholder={placeholder}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                theme={currentTheme}
              />
              <SubmitButton type="submit" theme={currentTheme}>
                {buttonText}
                <ArrowRight />
              </SubmitButton>
            </Form>

            <TrustBadge>
              🔒 100% Secure • No Spam • Unsubscribe Anytime
            </TrustBadge>
          </>
        ) : (
          <SuccessMessage>
            <CheckCircle />
            <h4>Thank You!</h4>
            <p>Check your email for your AI Readiness Scorecard.</p>
          </SuccessMessage>
        )}
      </Content>
    </Container>
  );
};

export default InlineLeadCapture;
