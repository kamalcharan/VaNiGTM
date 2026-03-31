'use client';

import { type ReactNode } from 'react';
import s from './card.module.css';

interface CardProps {
  children: ReactNode;
  variant?: 'default' | 'glass' | 'outline';
  padding?: 'none' | 'sm' | 'md' | 'lg';
  className?: string;
  onClick?: () => void;
  selected?: boolean;
}

export default function Card({
  children,
  variant = 'default',
  padding = 'md',
  className,
  onClick,
  selected,
}: CardProps) {
  return (
    <div
      className={`${s.card} ${s[variant]} ${s[`pad-${padding}`]} ${selected ? s.selected : ''} ${onClick ? s.clickable : ''} ${className || ''}`}
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  );
}
