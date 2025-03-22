// src/components/ui/progress.tsx
import React from 'react';
import styled from 'styled-components';
import useTheme from '../../hooks/useTheme';

export interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number;
  max?: number;
  className?: string;
  indicatorClassName?: string;
}

const ProgressContainer = styled.div`
  position: relative;
  overflow: hidden;
  background-color: rgba(0, 0, 0, 0.1);
  border-radius: 9999px;
  width: 100%;
  height: 0.5rem;
`;

const ProgressIndicator = styled.div<{ $value: number; $max: number; $color?: string }>`
  width: ${props => (props.$value / props.$max) * 100}%;
  height: 100%;
  background-color: ${props => props.$color || '#2563EB'};
  transition: width 0.3s ease;
`;

export const Progress: React.FC<ProgressProps> = ({
  value = 0,
  max = 100,
  className,
  indicatorClassName,
  ...props
}) => {
  const { currentTheme } = useTheme();
  
  return (
    <ProgressContainer className={className} {...props}>
      <ProgressIndicator 
        $value={value} 
        $max={max} 
        $color={indicatorClassName?.includes('bg-') 
          ? indicatorClassName.replace('bg-', '').trim() === 'blue-600' 
            ? currentTheme.colors.primary.main
            : indicatorClassName.replace('bg-', '').trim() === 'green-600'
              ? '#10B981'
              : currentTheme.colors.primary.main
          : undefined} 
        className={indicatorClassName}
      />
    </ProgressContainer>
  );
};

export default Progress;