import React from 'react';

interface FamilyKnowsIconProps {
  className?: string;
  style?: React.CSSProperties;
}

const FamilyKnowsIcon: React.FC<FamilyKnowsIconProps> = ({ className, style }) => {
  return (
    <svg
      viewBox="0 0 200 200"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={style}
    >
      {/* House Base */}
      <path
        d="M100 45 L160 85 L160 165 L40 165 L40 85 Z"
        fill="white"
        stroke="rgba(255,255,255,0.8)"
        strokeWidth="2"
      />

      {/* Roof */}
      <path
        d="M30 95 L100 40 L170 95"
        stroke="white"
        strokeWidth="4"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />

      {/* Door */}
      <rect x="85" y="130" width="30" height="35" rx="4" fill="#36f2fa" opacity="0.6"/>

      {/* Windows */}
      <rect x="55" y="105" width="20" height="20" rx="2" fill="#36f2fa" opacity="0.4"/>
      <rect x="125" y="105" width="20" height="20" rx="2" fill="#36f2fa" opacity="0.4"/>

      {/* Shield (Vault/Security) - Front and Center */}
      <path
        d="M100 75 L115 82 L115 105 C115 115 110 122 100 128 C90 122 85 115 85 105 L85 82 Z"
        fill="#FF6F61"
        stroke="white"
        strokeWidth="2"
      />

      {/* Lock Icon in Shield */}
      <circle cx="100" cy="100" r="4" fill="white"/>
      <path
        d="M96 100 L96 95 C96 92.8 97.8 91 100 91 C102.2 91 104 92.8 104 95 L104 100"
        stroke="white"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
      />
      <rect x="96" y="100" width="8" height="8" rx="1" fill="white"/>

      {/* Family Members Silhouettes (Simple) */}
      <g opacity="0.3">
        <circle cx="60" cy="145" r="6" fill="white"/>
        <circle cx="100" cy="140" r="7" fill="white"/>
        <circle cx="140" cy="145" r="6" fill="white"/>
      </g>

      {/* Document Icons (Asset Management) */}
      <g opacity="0.5">
        <rect x="50" y="135" width="8" height="10" rx="1" fill="#36f2fa"/>
        <rect x="142" y="135" width="8" height="10" rx="1" fill="#36f2fa"/>
      </g>

      {/* Subtle Glow */}
      <circle cx="100" cy="110" r="70" fill="url(#familyGlow)" opacity="0.1"/>

      <defs>
        <radialGradient id="familyGlow">
          <stop offset="0%" stopColor="#36f2fa"/>
          <stop offset="100%" stopColor="transparent"/>
        </radialGradient>
      </defs>
    </svg>
  );
};

export default FamilyKnowsIcon;
