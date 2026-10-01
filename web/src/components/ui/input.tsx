// src/components/ui/input.tsx
import React, { InputHTMLAttributes } from 'react';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  className?: string;
}

const StyledInput = styled.input`
  width: 100%;
  padding: 0.75rem;
  border-radius: ${props => props.theme.borderRadius.medium};
  border: 1px solid ${props => props.theme.colors.text.hint};
  background-color: ${props => props.theme.colors.background.paper};
  color: ${props => props.theme.colors.text.primary};
  font-size: 1rem;
  transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
  
  &:focus {
    outline: none;
    border-color: ${props => props.theme.colors.primary.main};
    box-shadow: 0 0 0 2px ${props => props.theme.colors.primary.main}15;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  
  &::placeholder {
    color: ${props => props.theme.colors.text.hint};
  }
`;

export const Input: React.FC<InputProps> = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, ...props }, ref) => {
    const { currentTheme } = useTheme();
    
    return (
      <StyledInput
        className={className}
        ref={ref}
        theme={currentTheme}
        {...props}
      />
    );
  }
);

Input.displayName = 'Input';

export default Input;