// src/components/ui/textarea.tsx
import React, { TextareaHTMLAttributes } from 'react';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  className?: string;
}

const StyledTextarea = styled.textarea`
  width: 100%;
  padding: 0.75rem;
  border-radius: ${props => props.theme.borderRadius.medium};
  border: 1px solid ${props => props.theme.colors.text.hint};
  background-color: ${props => props.theme.colors.background.paper};
  color: ${props => props.theme.colors.text.primary};
  font-size: 1rem;
  font-family: inherit;
  transition: border-color 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
  resize: vertical;
  min-height: 100px;
  
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

export const Textarea: React.FC<TextareaProps> = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    const { currentTheme } = useTheme();
    
    return (
      <StyledTextarea
        className={className}
        ref={ref}
        theme={currentTheme}
        {...props}
      />
    );
  }
);

Textarea.displayName = 'Textarea';

export default Textarea;