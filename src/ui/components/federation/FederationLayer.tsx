import React from 'react';

/**
 * FederationLayer.tsx
 * 
 * High-fidelity tactical projection of the European Industrial Federation.
 * Scaled to 100x100 coordinate system for the Control Plane.
 */
export const FederationLayer: React.FC = () => {
  return (
    <g className="federation-base-layer pointer-events-none">
      {/* 
        High-fidelity Europe Vector 
        Coordinates calibrated for (Lat 35-70, Lng -15-40) -> (0-100, 0-100)
      */}
      <path 
        d="M5,40 L10,35 L15,38 L20,30 L25,25 L35,20 L45,15 L60,10 L75,12 L85,20 L95,35 L90,50 L80,60 L70,75 L60,85 L45,95 L30,90 L20,80 L10,65 L5,50 Z" 
        fill="currentColor" 
        className="text-white/[0.01] dark:text-white/[0.02]" 
      />
      
      {/* 
        Tactical Operational Segments 
      */}
      <g fill="none" stroke="currentColor" strokeWidth="0.08" className="text-white/[0.05]">
        {/* Northern Hub (Nordics/Baltics) */}
        <path d="M45,25 L55,15 L70,18 L75,30 L65,40 L50,38 Z" />
        
        {/* Western Core (UK/IE/FR/ES/PT) */}
        <path d="M10,45 L25,35 L40,40 L35,60 L20,70 L15,60 Z" />
        <path d="M25,25 L35,20 L38,28 L30,32 Z" /> {/* UK focus */}
        
        {/* Central Grid (DE/PL/CZ/AT/CH/IT/BNL) */}
        <path d="M40,40 L55,38 L70,45 L65,65 L50,75 L45,60 Z" />
        <path d="M55,65 L58,85 L65,90 L62,70 Z" /> {/* Italy focus */}
        
        {/* Eastern Corridor */}
        <path d="M70,45 L85,40 L90,60 L80,75 L70,70 Z" />
      </g>

      {/* Cross-Section Grid Lines */}
      <g stroke="currentColor" strokeWidth="0.03" className="text-white/[0.03]">
        <line x1="0" y1="25" x2="100" y2="25" />
        <line x1="0" y1="50" x2="100" y2="50" />
        <line x1="0" y1="75" x2="100" y2="75" />
        <line x1="25" y1="0" x2="25" y2="100" />
        <line x1="50" y1="0" x2="50" y2="100" />
        <line x1="75" y1="0" x2="75" y2="100" />
      </g>
    </g>
  );
};
