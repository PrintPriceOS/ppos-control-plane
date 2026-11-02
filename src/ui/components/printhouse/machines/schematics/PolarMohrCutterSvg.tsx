import React from 'react';
import { MachineSchematicProps, getBlueprintPalette } from './types';

export const PolarMohrCutterSvg: React.FC<MachineSchematicProps> = ({
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
      aria-label="Polar Mohr High-Speed Guillotine Cutter Schematic"
      data-schematic="PolarMohrCutterSvg"
    >
      <defs>
        <pattern id="polar-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="780" height="270" fill={p.bg} rx="8" />
      <rect x="0" y="0" width="780" height="270" fill="url(#polar-grid)" rx="8" />

      <text x="390" y="22" textAnchor="middle" fill={p.labelColor} fontSize="9" fontFamily="monospace" fontWeight="bold">
        POLAR MOHR N 115 / 137 PRO HD · HIGH-SPEED GUILLOTINE · AIR-BED & OPTICAL CUT-LINE
      </text>

      {/* Left & Right Cast-Iron Air Side Tables */}
      <g data-hotspot="feeder">
        <rect x="75" y="138" width="165" height="14" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.5" />
        <rect x="115" y="152" width="26" height="66" fill={p.chassisFill} stroke={p.mutedStroke} strokeWidth="1.4" />
        <text x="155" y="128" textAnchor="middle" fill={p.labelColor} fontSize="8" fontFamily="monospace">
          LEFT AIR TABLE
        </text>
      </g>

      <g data-hotspot="delivery">
        <rect x="540" y="138" width="165" height="14" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.5" />
        <rect x="638" y="152" width="26" height="66" fill={p.chassisFill} stroke={p.mutedStroke} strokeWidth="1.4" />
        <text x="622" y="128" textAnchor="middle" fill={p.labelColor} fontSize="8" fontFamily="monospace">
          RIGHT AIR TABLE
        </text>
      </g>

      {/* Central Guillotine Portal Arch & Hydraulic Knife Beam */}
      <g data-hotspot="clamps">
        <rect x="240" y="54" width="300" height="166" rx="4" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.8" />
        {/* Arch Head & Capacitive 21.5" Touch Display */}
        <rect x="355" y="64" width="70" height="36" rx="3" fill={p.bg} stroke={p.primaryRed} strokeWidth="1.5" />
        {/* Diagonal Hydraulic Knife Beam & Clamp Bar */}
        <polygon
          points="275,108 505,124 505,136 275,136"
          fill={p.chassisFill}
          stroke={p.primaryRed}
          strokeWidth="1.6"
        />
        {/* Optical Cut-Line Laser Indicator */}
        <line x1="270" y1="138" x2="510" y2="138" stroke={p.primaryRed} strokeWidth="2.2" strokeDasharray="4 2" />
        {/* Main Air-Jet Cutting Table */}
        <rect x="255" y="140" width="270" height="14" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.5" />
        {/* Pedestal Base */}
        <rect x="265" y="154" width="250" height="66" fill="none" stroke={p.mutedStroke} strokeWidth="1.3" />
        <text x="390" y="46" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          HYDRAULIC KNIFE PORTAL + OPTILINE
        </text>
      </g>

      <text x="75" y="250" fill={p.mutedStroke} fontSize="8.5" fontFamily="monospace">
        CAD-REF: POLAR-N137-PRO · COMPUCUT JDF · ±0.01 MM BACKGAUGE SERVO
      </text>
      <text x="705" y="250" textAnchor="end" fill={p.primaryRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        SCALE 1:25 · GUILLOTINE CUTTER
      </text>
    </svg>
  );
};

