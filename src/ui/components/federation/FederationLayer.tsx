import React from 'react';

export const FederationLayer: React.FC = () => {
  return (
    <g className="federation-base-layer">
      {/* 
        Tactical Europe Projection 
        Simplified but geographically accurate for an operational view.
      */}
      <path 
        d="M25,15 L28,12 L35,10 L45,10 L55,12 L65,15 L70,20 L75,30 L72,40 L65,45 L55,48 L45,45 L35,42 L25,35 Z" 
        fill="currentColor" 
        className="text-white/[0.02] dark:text-white/[0.03]" 
      />
      
      {/* 
        Detailed Europe Region (approximate SVG for tactical feel)
        We focus on the industrial core: UK, France, Germany, Spain, Italy, Nordics.
      */}
      <g fill="none" stroke="currentColor" strokeWidth="0.05" className="text-white/[0.05]">
        {/* UK/Ireland */}
        <path d="M28,25 L32,20 L35,22 L33,28 Z" />
        {/* Iberian Peninsula */}
        <path d="M25,45 L30,42 L35,45 L33,52 L28,55 Z" />
        {/* France */}
        <path d="M35,45 L42,40 L48,42 L45,48 L38,50 Z" />
        {/* Central Europe (DE/AT/CH/PL/CZ) */}
        <path d="M48,42 L55,38 L62,40 L65,45 L60,50 L52,52 L48,48 Z" />
        {/* Italy */}
        <path d="M52,52 L55,55 L58,65 L62,68 L58,58 Z" />
        {/* Nordics */}
        <path d="M45,20 L50,15 L55,15 L60,20 L58,35 L52,38 Z" />
        {/* Balkans / East */}
        <path d="M62,40 L70,38 L75,42 L78,50 L72,55 L65,50 Z" />
      </g>

      {/* Grid Overlay inside the map projection */}
      <defs>
        <pattern id="tactical-grid-inner" width="5" height="5" patternUnits="userSpaceOnUse">
          <path d="M 5 0 L 0 0 0 5" fill="none" stroke="currentColor" strokeWidth="0.02" className="text-white/[0.05]" />
        </pattern>
      </defs>
      <rect x="20" y="10" width="60" height="65" fill="url(#tactical-grid-inner)" pointerEvents="none" />
    </g>
  );
};
