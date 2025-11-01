// src/components/vikuna/ExitIntentPopup.tsx
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { X, Download, CheckCircle } from 'lucide-react';
import useTheme from '../../hooks/useTheme';

const Overlay = styled.div<{ $isVisible: boolean }>`
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(4px);
  z-index: 10000;
  display: ${props => props.$isVisible ? 'flex' : 'none'};
  align-items: center;
  justify-content: center;
  padding: 20px;
  animation: fadeIn 0.3s ease;

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
`;

const PopupContainer = styled.div`
  background: white;
  border-radius: 16px;
  max-width: 520px;
  width: 100%;
  position: relative;
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
  animation: slideUp 0.4s ease;

  @keyframes slideUp {
    from {
      transform: translateY(30px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }

  @media (max-width: 768px) {
    max-width: 100%;
    margin: 0 16px;
  }
`;

const CloseButton = styled.button`
  position: absolute;
  top: 16px;
  right: 16px;
  background: none;
  border: none;
  color: ${props => props.theme?.colors?.text?.secondary || '#656a85'};
  cursor: pointer;
  padding: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  transition: all 0.2s;

  &:hover {
    background: ${props => props.theme?.colors?.background?.default || '#f1f4f8'};
    color: ${props => props.theme?.colors?.text?.primary || '#1a1f24'};
  }

  svg {
    width: 20px;
    height: 20px;
  }
`;

const PopupHeader = styled.div`
  padding: 32px 32px 16px;
  text-align: center;

  @media (max-width: 768px) {
    padding: 24px 24px 12px;
  }
`;

const IconWrapper = styled.div`
  width: 64px;
  height: 64px;
  background: linear-gradient(135deg, ${props => props.theme?.colors?.primary?.main || '#39d2c0'} 0%, ${props => props.theme?.colors?.primary?.dark || '#1aaa99'} 100%);
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 16px;

  svg {
    width: 32px;
    height: 32px;
    color: white;
  }
`;

const Headline = styled.h2`
  font-size: 1.75rem;
  font-weight: 700;
  color: ${props => props.theme?.colors?.text?.primary || '#1a1f24'};
  margin: 0 0 8px;
  line-height: 1.3;

  @media (max-width: 768px) {
    font-size: 1.5rem;
  }
`;

const Subheadline = styled.p`
  font-size: 1rem;
  color: ${props => props.theme?.colors?.text?.secondary || '#656a85'};
  margin: 0;
  line-height: 1.6;
`;

const PopupBody = styled.div`
  padding: 0 32px 32px;

  @media (max-width: 768px) {
    padding: 0 24px 24px;
  }
`;

const BenefitsList = styled.ul`
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
`;

const BenefitItem = styled.li`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
  font-size: 0.95rem;
  color: ${props => props.theme?.colors?.text?.primary || '#1a1f24'};

  svg {
    width: 20px;
    height: 20px;
    color: ${props => props.theme?.colors?.success?.main || '#165070'};
    flex-shrink: 0;
    margin-top: 2px;
  }
`;

const Form = styled.form`
  display: flex;
  flex-direction: column;
  gap: 12px;
`;

const InputGroup = styled.div`
  display: flex;
  flex-direction: column;
  gap: 6px;
`;

const Label = styled.label`
  font-size: 0.875rem;
  font-weight: 500;
  color: ${props => props.theme?.colors?.text?.primary || '#1a1f24'};
`;

const Input = styled.input`
  padding: 12px 16px;
  border: 2px solid ${props => props.theme?.colors?.background?.default || '#f1f4f8'};
  border-radius: 8px;
  font-size: 1rem;
  transition: all 0.2s;
  outline: none;

  &:focus {
    border-color: ${props => props.theme?.colors?.primary?.main || '#39d2c0'};
    box-shadow: 0 0 0 3px ${props => props.theme?.colors?.primary?.main || '#39d2c0'}20;
  }

  &::placeholder {
    color: ${props => props.theme?.colors?.text?.disabled || '#95a1ac'};
  }
`;

const SubmitButton = styled.button`
  background: ${props => props.theme?.colors?.secondary?.main || '#FF6F61'};
  color: white;
  padding: 14px 24px;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s;
  margin-top: 8px;

  &:hover {
    background: ${props => props.theme?.colors?.secondary?.dark || '#e55a4a'};
    transform: translateY(-2px);
    box-shadow: 0 6px 20px ${props => props.theme?.colors?.secondary?.main || '#FF6F61'}40;
  }

  &:disabled {
    background: ${props => props.theme?.colors?.text?.disabled || '#95a1ac'};
    cursor: not-allowed;
    transform: none;
  }
`;

const TrustBadge = styled.div`
  text-align: center;
  padding-top: 16px;
  border-top: 1px solid ${props => props.theme?.colors?.background?.default || '#f1f4f8'};
  margin-top: 16px;
  font-size: 0.8125rem;
  color: ${props => props.theme?.colors?.text?.secondary || '#656a85'};
`;

const SuccessMessage = styled.div`
  text-align: center;
  padding: 32px;

  svg {
    width: 64px;
    height: 64px;
    color: ${props => props.theme?.colors?.success?.main || '#165070'};
    margin-bottom: 16px;
  }

  h3 {
    font-size: 1.5rem;
    font-weight: 700;
    color: ${props => props.theme?.colors?.text?.primary || '#1a1f24'};
    margin: 0 0 8px;
  }

  p {
    font-size: 1rem;
    color: ${props => props.theme?.colors?.text?.secondary || '#656a85'};
    margin: 0;
  }
`;

interface ExitIntentPopupProps {
  delayMs?: number; // Delay before allowing popup to show (ms)
}

const ExitIntentPopup: React.FC<ExitIntentPopupProps> = ({ delayMs = 5000 }) => {
  const [isVisible, setIsVisible] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [canShow, setCanShow] = useState(false);
  const [formData, setFormData] = useState({ name: '', email: '' });
  const { currentTheme } = useTheme();

  useEffect(() => {
    // Check if user has already seen/submitted popup
    const hasSeenPopup = localStorage.getItem('exitIntentShown');
    if (hasSeenPopup) return;

    // Delay before allowing popup
    const timer = setTimeout(() => {
      setCanShow(true);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [delayMs]);

  useEffect(() => {
    if (!canShow) return;

    const handleMouseLeave = (e: MouseEvent) => {
      // Check if mouse is leaving from top of page
      if (e.clientY <= 0 && !isVisible) {
        setIsVisible(true);
        localStorage.setItem('exitIntentShown', 'true');
      }
    };

    document.addEventListener('mouseout', handleMouseLeave);

    return () => {
      document.removeEventListener('mouseout', handleMouseLeave);
    };
  }, [canShow, isVisible]);

  const handleClose = () => {
    setIsVisible(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // TODO: Send data to your email service/CRM
    console.log('Lead captured:', formData);

    setIsSubmitted(true);

    // Close popup after 3 seconds
    setTimeout(() => {
      setIsVisible(false);
    }, 3000);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  if (!isVisible) return null;

  return (
    <Overlay $isVisible={isVisible} onClick={handleClose}>
      <PopupContainer onClick={(e) => e.stopPropagation()}>
        {!isSubmitted ? (
          <>
            <CloseButton onClick={handleClose} theme={currentTheme}>
              <X />
            </CloseButton>

            <PopupHeader theme={currentTheme}>
              <IconWrapper theme={currentTheme}>
                <Download />
              </IconWrapper>
              <Headline theme={currentTheme}>Before You Go...</Headline>
              <Subheadline theme={currentTheme}>
                Get Your Free AI Readiness Scorecard
              </Subheadline>
            </PopupHeader>

            <PopupBody>
              <BenefitsList>
                <BenefitItem theme={currentTheme}>
                  <CheckCircle />
                  <span>Assess your organization's AI readiness in 2 minutes</span>
                </BenefitItem>
                <BenefitItem theme={currentTheme}>
                  <CheckCircle />
                  <span>Get personalized recommendations from AI experts</span>
                </BenefitItem>
                <BenefitItem theme={currentTheme}>
                  <CheckCircle />
                  <span>Join 1,000+ leaders transforming with AI</span>
                </BenefitItem>
              </BenefitsList>

              <Form onSubmit={handleSubmit}>
                <InputGroup>
                  <Label theme={currentTheme}>Your Name</Label>
                  <Input
                    type="text"
                    name="name"
                    placeholder="John Doe"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    theme={currentTheme}
                  />
                </InputGroup>

                <InputGroup>
                  <Label theme={currentTheme}>Work Email</Label>
                  <Input
                    type="email"
                    name="email"
                    placeholder="john@company.com"
                    value={formData.email}
                    onChange={handleInputChange}
                    required
                    theme={currentTheme}
                  />
                </InputGroup>

                <SubmitButton type="submit" theme={currentTheme}>
                  Send My Free Scorecard
                </SubmitButton>
              </Form>

              <TrustBadge theme={currentTheme}>
                🔒 Your information is 100% secure. We never spam.
              </TrustBadge>
            </PopupBody>
          </>
        ) : (
          <SuccessMessage theme={currentTheme}>
            <CheckCircle />
            <h3>Thank You!</h3>
            <p>Check your email for your AI Readiness Scorecard.<br />We'll be in touch soon!</p>
          </SuccessMessage>
        )}
      </PopupContainer>
    </Overlay>
  );
};

export default ExitIntentPopup;
