// src/components/vikuna/icons/ProductMarks.tsx
// Product brand marks, redrawn from each product's own brand page so the
// portfolio section uses real identities rather than letter monograms.
// All strokes/fills use currentColor so a mark inherits its card's accent.
import React from 'react';

type MarkProps = { size?: number };

// ContractNest — a hub with four linked satellites: contracts connected to the
// assets, people and obligations they govern.
export const ContractNestMark: React.FC<MarkProps> = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="16" cy="16" r="3" fill="currentColor" />
    <circle cx="6" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="26" cy="8" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="6" cy="24" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="26" cy="24" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <line x1="8" y1="9.5" x2="13.5" y2="14.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
    <line x1="24" y1="9.5" x2="18.5" y2="14.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
    <line x1="8" y1="22.5" x2="13.5" y2="17.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
    <line x1="24" y1="22.5" x2="18.5" y2="17.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
  </svg>
);

// DristiQ — an eye with rays. "Dristi" is sight; the rays are the lenses.
export const DristiQMark: React.FC<MarkProps> = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 28 28" fill="none" aria-hidden="true">
    <ellipse cx="14" cy="14" rx="12" ry="7" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="14" cy="14" r="4" fill="currentColor" fillOpacity="0.9" />
    <circle cx="14" cy="14" r="1.9" fill="#0A0F1E" />
    <line x1="14" y1="2" x2="14" y2="6" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
    <line x1="14" y1="22" x2="14" y2="26" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
    <line x1="2" y1="14" x2="5" y2="14" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
    <line x1="23" y1="14" x2="26" y2="14" stroke="currentColor" strokeWidth="1" strokeOpacity="0.5" />
  </svg>
);

// VaNi App — one voice carried in three tongues: a core with three orbiting
// nodes, echoing ContractNest's hub geometry so the family reads as a family.
export const VaNiAppMark: React.FC<MarkProps> = ({ size = 32 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <circle cx="16" cy="16" r="3.2" fill="currentColor" />
    <circle cx="16" cy="5.5" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="25" cy="21.5" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="7" cy="21.5" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    <line x1="16" y1="8" x2="16" y2="12.8" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
    <line x1="23" y1="19.8" x2="18.9" y2="17.6" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
    <line x1="9" y1="19.8" x2="13.1" y2="17.6" stroke="currentColor" strokeWidth="1" strokeOpacity="0.6" />
    <circle cx="16" cy="16" r="12.5" stroke="currentColor" strokeWidth="1" strokeOpacity="0.22" />
  </svg>
);
