import React from 'react';

interface ContractNestIconProps {
  className?: string;
  style?: React.CSSProperties;
}

const ContractNestIcon: React.FC<ContractNestIconProps> = ({ className, style }) => {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      {/* Document Stack Background */}
      <g opacity="0.3">
        <rect x="45" y="55" width="90" height="120" rx="8" fill="white" opacity="0.6"/>
        <rect x="55" y="65" width="90" height="120" rx="8" fill="white" opacity="0.8"/>
      </g>

      {/* Main Document */}
      <rect x="65" y="75" width="90" height="120" rx="8" fill="white" stroke="rgba(255,255,255,0.8)" strokeWidth="2"/>

      {/* Document Lines */}
      <line x1="80" y1="100" x2="140" y2="100" stroke="#36f2fa" strokeWidth="3" strokeLinecap="round"/>
      <line x1="80" y1="115" x2="130" y2="115" stroke="#36f2fa" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
      <line x1="80" y1="130" x2="135" y2="130" stroke="#36f2fa" strokeWidth="3" strokeLinecap="round" opacity="0.6"/>
      <line x1="80" y1="145" x2="125" y2="145" stroke="#36f2fa" strokeWidth="3" strokeLinecap="round" opacity="0.4"/>

      {/* Checkmark Circle (Automation) */}
      <circle cx="140" cy="160" r="25" fill="#FF6F61"/>
      <path
        d="M130 160 L137 167 L150 154"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Connection Nodes (Collaboration) */}
      <circle cx="75" cy="85" r="4" fill="#36f2fa"/>
      <circle cx="145" cy="85" r="4" fill="#36f2fa"/>
      <circle cx="110" cy="75" r="4" fill="#36f2fa"/>

      {/* Subtle Glow Effect */}
      <circle cx="100" cy="135" r="60" fill="url(#glow)" opacity="0.15"/>

      <defs>
        <radialGradient id="glow">
          <stop offset="0%" stopColor="#36f2fa"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
      </defs>
    </svg>
  );
};

export default ContractNestIcon;
