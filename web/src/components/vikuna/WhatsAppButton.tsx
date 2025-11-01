// src/components/vikuna/WhatsAppButton.tsx
import React from 'react';
import styled, { keyframes } from 'styled-components';
import { MessageCircle } from 'lucide-react';

const pulse = keyframes`
  0% {
    box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(37, 211, 102, 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(37, 211, 102, 0);
  }
`;

const WhatsAppFloat = styled.a`
  position: fixed;
  bottom: 20px;
  left: 20px;
  width: 60px;
  height: 60px;
  background-color: #25D366; /* WhatsApp green */
  color: white;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 30px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 1000;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.3s ease;
  animation: ${pulse} 2s infinite;

  &:hover {
    transform: scale(1.1);
    box-shadow: 0 6px 20px rgba(37, 211, 102, 0.4);
  }

  svg {
    width: 32px;
    height: 32px;
  }

  @media (max-width: 768px) {
    bottom: 80px; /* Higher on mobile to avoid conflicts with bottom nav */
    left: 15px;
    width: 56px;
    height: 56px;

    svg {
      width: 28px;
      height: 28px;
    }
  }
`;

const Tooltip = styled.span`
  position: absolute;
  left: 70px;
  background-color: #fff;
  color: #333;
  padding: 8px 12px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.3s ease;

  ${WhatsAppFloat}:hover & {
    opacity: 1;
  }

  &::before {
    content: '';
    position: absolute;
    left: -6px;
    top: 50%;
    transform: translateY(-50%);
    width: 0;
    height: 0;
    border-top: 6px solid transparent;
    border-bottom: 6px solid transparent;
    border-right: 6px solid #fff;
  }

  @media (max-width: 768px) {
    display: none;
  }
`;

interface WhatsAppButtonProps {
  phoneNumber?: string;
  message?: string;
  tooltipText?: string;
}

const WhatsAppButton: React.FC<WhatsAppButtonProps> = ({
  phoneNumber = '917702864233', // Default to your number with country code
  message = 'Hi Vikuna, I\'m interested in AI consulting services',
  tooltipText = 'Chat on WhatsApp'
}) => {
  const encodedMessage = encodeURIComponent(message);
  const whatsappUrl = `https://wa.me/${phoneNumber}?text=${encodedMessage}`;

  return (
    <WhatsAppFloat
      href={whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chat on WhatsApp"
    >
      <MessageCircle />
      <Tooltip>{tooltipText}</Tooltip>
    </WhatsAppFloat>
  );
};

export default WhatsAppButton;
