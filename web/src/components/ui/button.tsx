// src/components/ui/button.tsx
import React, { ReactNode, ButtonHTMLAttributes } from 'react';
import styled, { css } from 'styled-components';
import useTheme from '../../hooks/useTheme';

type ButtonVariant = 'default' | 'outline' | 'ghost';
type ButtonSize = 'default' | 'sm' | 'lg' | 'icon';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: ButtonVariant;
  size?: ButtonSize;
  className?: string;
  textColor?: string;
  backgroundColor?: string;
  hoverColor?: string;
}

const ButtonBase = styled.button<{
  $variant: ButtonVariant;
  $size: ButtonSize;
  $textColor?: string;
  $backgroundColor?: string;
  $hoverColor?: string;
}>`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: ${props => props.theme.borderRadius.medium};
  font-weight: ${props => props.theme.typography.fontWeightMedium};
  transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;
  cursor: pointer;
  
  /* Size variants */
  ${props => props.$size === 'default' && css`
    padding: 0.5rem 1rem;
    font-size: 0.875rem;
  `}
  
  ${props => props.$size === 'sm' && css`
    padding: 0.375rem 0.75rem;
    font-size: 0.75rem;
  `}
  
  ${props => props.$size === 'lg' && css`
    padding: 0.75rem 2rem;
    font-size: 1rem;
  `}
  
  ${props => props.$size === 'icon' && css`
    padding: 0.5rem;
    width: 2.5rem;
    height: 2.5rem;
  `}
  
  /* Style variants */
  ${props => props.$variant === 'default' && css`
    background-color: ${props.$backgroundColor || props.theme.colors.primary.main};
    color: ${props.$textColor || props.theme.colors.primary.contrastText};
    border: none;
    
    &:hover:not(:disabled) {
      background-color: ${props.$hoverColor || props.theme.colors.primary.dark};
    }
  `}
  
  ${props => props.$variant === 'outline' && css`
    background-color: transparent;
    color: ${props.$textColor || props.theme.colors.primary.main};
    border: 1px solid ${props.$backgroundColor || props.theme.colors.primary.main};
    
    &:hover:not(:disabled) {
      background-color: ${props.$hoverColor || 'rgba(37, 99, 235, 0.1)'};
    }
  `}
  
  ${props => props.$variant === 'ghost' && css`
    background-color: transparent;
    color: ${props.$textColor || props.theme.colors.primary.main};
    border: none;
    padding-left: 0;
    padding-right: 0;
    
    &:hover:not(:disabled) {
      background-color: transparent;
      color: ${props.$hoverColor || props.theme.colors.primary.dark};
    }
  `}
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &:focus {
    outline: none;
    ring: 2px solid ${props => props.theme.colors.primary.main};
    ring-offset: 2px;
  }
`;

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'default',
  size = 'default',
  className,
  textColor,
  backgroundColor,
  hoverColor,
  ...props
}) => {
  const { currentTheme } = useTheme();
  
  return (
    <ButtonBase
      $variant={variant}
      $size={size}
      $textColor={textColor}
      $backgroundColor={backgroundColor}
      $hoverColor={hoverColor}
      className={className}
      theme={currentTheme}
      {...props}
    >
      {children}
    </ButtonBase>
  );
};

export default Button;