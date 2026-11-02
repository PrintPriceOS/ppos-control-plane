import React from 'react';
import { MachineSchematicProps, getBlueprintPalette } from './types';

export const ParametricFinishingCutterSvg: React.FC<MachineSchematicProps> = ({
  className = 'w-full h-full',
  theme = 'dark',
  wireframeOnly = false,
}) => {
  const p = getBlueprintPalette(theme, wireframeOnly);

  return (
    <svg
      viewBox="0 0 780 270"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Parametric Industrial Finishing & Guillotine Cutter Schematic"
      data-schematic="ParametricFinishingCutterSvg"
    >
      <defs>
        <pattern id="param-cutter-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="780" height="270" fill={p.bg} rx="8" />
      <rect x="0" y="0" width="780" height="270" fill="url(#param-cutter-grid)" rx="8" />

      <text x="390" y="22" textAnchor="middle" fill={p.labelColor} fontSize="9" fontFamily="monospace" fontWeight="bold">
        PARAMETRIC FINISHING / HYDRAULIC CUTTER & LAMINATION CHASSIS
      </text>

      <g data-hotspot="feeder">
        <rect x="85" y="140" width="160" height="14" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.5" />
        <rect x="120" y="154" width="24" height="64" fill={p.chassisFill} stroke={p.mutedStroke} strokeWidth="1.3" />
      </g>

      <g data-hotspot="clamps">
        <rect x="245" y="60" width="290" height="158" rx="4" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.8" />
        <rect x="355" y="70" width="70" height="30" rx="2" fill={p.bg} stroke={p.primaryRed} strokeWidth="1.4" />
        <polygon points="275,112 505,126 505,138 275,138" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.5" />
        <line x1="270" y1="140" x2="510" y2="140" stroke={p.primaryRed} strokeWidth="2" strokeDasharray="4 2" />
        <text x="390" y="50" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          HEAVY-DUTY FINISHING / CUTTER PORTAL
        </text>
      </g>

      <g data-hotspot="delivery">
        <rect x="535" y="140" width="160" height="14" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.5" />
        <rect x="636" y="154" width="24" height="64" fill={p.chassisFill} stroke={p.mutedStroke} strokeWidth="1.3" />
      </g>

      <text x="85" y="250" fill={p.mutedStroke} fontSize="8.5" fontFamily="monospace">
        PROCEDURAL CAD GENERATOR · HYDRAULIC CUTTING & FINISHING STATION
      </text>
      <text x="695" y="250" textAnchor="end" fill={p.primaryRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        TIER 3 PARAMETRIC
      </text>
    </svg>
  );
};

