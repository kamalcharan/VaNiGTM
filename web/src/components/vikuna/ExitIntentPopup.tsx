// src/components/vikuna/ExitIntentPopup.tsx
import React, { useState, useEffect } from 'react';
import styled from 'styled-components';
import { X, TrendingUp, CheckCircle } from 'lucide-react';
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

const CTAButton = styled.a`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
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
  text-decoration: none;
  width: 100%;

  &:hover {
    background: ${props => props.theme?.colors?.secondary?.dark || '#e55a4a'};
    transform: translateY(-2px);
    box-shadow: 0 6px 20px ${props => props.theme?.colors?.secondary?.main || '#FF6F61'}40;
  }

  svg {
    width: 20px;
    height: 20px;
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

interface ExitIntentPopupProps {
  delayMs?: number; // Delay before allowing popup to show (ms)
  disableExitIntent?: boolean; // Disable exit intent trigger
}

const ExitIntentPopup: React.FC<ExitIntentPopupProps> = ({
  delayMs = 10000, // Increased to 10 seconds
  disableExitIntent = false
}) => {
  const [isVisible, setIsVisible] = useState(false);
  const [canShow, setCanShow] = useState(false);
  const { currentTheme } = useTheme();

  useEffect(() => {
    // Check if user has already interacted with popup
    const hasInteracted = localStorage.getItem('aiScorePopupInteracted');
    if (hasInteracted) return;

    // Delay before allowing popup
    const timer = setTimeout(() => {
      setCanShow(true);
    }, delayMs);

    return () => clearTimeout(timer);
  }, [delayMs]);

  useEffect(() => {
    if (!canShow || disableExitIntent) return;

    let hasShownPopup = false;

    const handleMouseLeave = (e: MouseEvent) => {
      // Only trigger if mouse leaves at the top of the viewport
      // and popup hasn't been shown yet in this session
      if (e.clientY <= 0 && !hasShownPopup && !isVisible) {
        hasShownPopup = true;
        setIsVisible(true);
      }
    };

    // Use mouseleave on document instead of mouseout
    document.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      document.removeEventListener('mouseleave', handleMouseLeave);
    };
  }, [canShow, isVisible, disableExitIntent]);

  const handleClose = () => {
    setIsVisible(false);
    // Mark as interacted so it doesn't show again
    localStorage.setItem('aiScorePopupInteracted', 'true');
  };

  const handleCTAClick = () => {
    // Mark as interacted when user clicks the CTA
    localStorage.setItem('aiScorePopupInteracted', 'true');
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <Overlay $isVisible={isVisible} onClick={handleClose}>
      <PopupContainer onClick={(e) => e.stopPropagation()}>
        <CloseButton onClick={handleClose} theme={currentTheme}>
          <X />
        </CloseButton>

        <PopupHeader theme={currentTheme}>
          <IconWrapper theme={currentTheme}>
            <TrendingUp />
          </IconWrapper>
          <Headline theme={currentTheme}>Before You Go...</Headline>
          <Subheadline theme={currentTheme}>
            Discover Your AI Readiness Score in 8 Minutes
          </Subheadline>
        </PopupHeader>

        <PopupBody>
          <BenefitsList>
            <BenefitItem theme={currentTheme}>
              <CheckCircle />
              <span>12 questions across 5 dimensions of AI maturity</span>
            </BenefitItem>
            <BenefitItem theme={currentTheme}>
              <CheckCircle />
              <span>Identify gaps and opportunities in your AI journey</span>
            </BenefitItem>
            <BenefitItem theme={currentTheme}>
              <CheckCircle />
              <span>Get personalized recommendations from AI experts</span>
            </BenefitItem>
          </BenefitsList>

          <CTAButton
            href="/assessment"
            theme={currentTheme}
            onClick={handleCTAClick}
          >
            Take AI Readiness Assessment
            <TrendingUp />
          </CTAButton>

          <TrustBadge theme={currentTheme}>
            🔒 100% Free • No Credit Card Required • Instant Results
          </TrustBadge>
        </PopupBody>
      </PopupContainer>
    </Overlay>
  );
};

export default ExitIntentPopup;
