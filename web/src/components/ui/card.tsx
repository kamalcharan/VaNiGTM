// src/components/ui/card.tsx
import React, { ReactNode } from 'react';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';

interface CardProps {
  className?: string;
  children: ReactNode;
  borderTopColor?: string;
}

const CardContainer = styled.div<{ $borderTopColor?: string }>`
  background: ${props => props.theme.colors.background.paper};
  border-radius: ${props => props.theme.borderRadius.large};
  box-shadow: ${props => props.theme.shadows.small};
  border: 1px solid rgba(0, 0, 0, 0.1);
  border-top: ${props => props.$borderTopColor ? `4px solid ${props.$borderTopColor}` : '1px solid rgba(0, 0, 0, 0.1)'};
  overflow: hidden;
  transition: box-shadow 0.3s ease, transform 0.3s ease;
  
  &:hover {
    box-shadow: ${props => props.theme.shadows.medium};
  }
`;

const Card: React.FC<CardProps> = ({ className, children, borderTopColor }) => {
  const { currentTheme } = useTheme();
  
  return (
    <CardContainer className={className} $borderTopColor={borderTopColor} theme={currentTheme}>
      {children}
    </CardContainer>
  );
};

const CardHeaderContainer = styled.div`
  padding: 1.5rem 1.5rem 0;
`;

interface CardComponentProps {
  className?: string;
  children: ReactNode;
}

export const CardHeader: React.FC<CardComponentProps> = ({ className, children }) => {
  const { currentTheme } = useTheme();
  
  return (
    <CardHeaderContainer className={className} theme={currentTheme}>
      {children}
    </CardHeaderContainer>
  );
};

const CardTitleStyled = styled.h3`
  font-size: 1.25rem;
  font-weight: ${props => props.theme.typography.fontWeightBold};
  margin-bottom: 0.5rem;
  color: ${props => props.theme.colors.text.primary};
`;

export const CardTitle: React.FC<CardComponentProps> = ({ className, children }) => {
  const { currentTheme } = useTheme();
  
  return (
    <CardTitleStyled className={className} theme={currentTheme}>
      {children}
    </CardTitleStyled>
  );
};

const CardDescriptionStyled = styled.p`
  font-size: 0.875rem;
  color: ${props => props.theme.colors.text.secondary};
  margin-bottom: 0.5rem;
`;

export const CardDescription: React.FC<CardComponentProps> = ({ className, children }) => {
  const { currentTheme } = useTheme();
  
  return (
    <CardDescriptionStyled className={className} theme={currentTheme}>
      {children}
    </CardDescriptionStyled>
  );
};

const CardContentContainer = styled.div`
  padding: 1.5rem;
`;

export const CardContent: React.FC<CardComponentProps> = ({ className, children }) => {
  const { currentTheme } = useTheme();
  
  return (
    <CardContentContainer className={className} theme={currentTheme}>
      {children}
    </CardContentContainer>
  );
};

const CardFooterContainer = styled.div`
  padding: 0 1.5rem 1.5rem;
  display: flex;
`;

export const CardFooter: React.FC<CardComponentProps> = ({ className, children }) => {
  const { currentTheme } = useTheme();
  
  return (
    <CardFooterContainer className={className} theme={currentTheme}>
      {children}
    </CardFooterContainer>
  );
};

export default Card;