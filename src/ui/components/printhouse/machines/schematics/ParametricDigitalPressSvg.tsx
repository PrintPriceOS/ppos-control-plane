import React from 'react';
import { MachineSchematicProps, getBlueprintPalette } from './types';

export const ParametricDigitalPressSvg: React.FC<MachineSchematicProps> = ({
  className = 'w-full h-full',
  theme = 'dark',
  wireframeOnly = false,
  animatedTelemetry = true,
  sheetFormat = 'SRA3',
}) => {
  const p = getBlueprintPalette(theme, wireframeOnly);

  return (
    <svg
      viewBox="0 0 820 270"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`Parametric ${sheetFormat} Digital Production Press Schematic`}
      data-schematic="ParametricDigitalPressSvg"
    >
      <defs>
        <pattern id="param-dig-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="820" height="270" fill={p.bg} rx="8" />
      <rect x="0" y="0" width="820" height="270" fill="url(#param-dig-grid)" rx="8" />

      <text x="410" y="22" textAnchor="middle" fill={p.labelColor} fontSize="9" fontFamily="monospace" fontWeight="bold">
        PARAMETRIC DIGITAL PRODUCTION PRESS · {sheetFormat} ENGINE · VDP & INLINE SPECTRO
      </text>

      <rect x="55" y="212" width="710" height="12" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.5" />

      {/* Vacuum Paper Deck Drawers + Bypass (Right) */}
      <g data-hotspot="feeder">
        <rect x="595" y="88" width="155" height="124" rx="4" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        <rect x="610" y="102" width="125" height="30" fill="none" stroke={p.primaryRed} strokeWidth="1.2" />
        <rect x="610" y="138" width="125" height="30" fill="none" stroke={p.primaryRed} strokeWidth="1.2" />
        <rect x="610" y="174" width="125" height="28" fill="none" stroke={p.primaryRed} strokeWidth="1.2" />
        <line x1="750" y1="122" x2="778" y2="112" stroke={p.primaryRed} strokeWidth="1.8" />
        <text x="672" y="78" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          VACUUM DECKS + BYPASS
        </text>
      </g>

      {/* Central Digital Imaging Core & Fuser Unit */}
      <g data-hotspot="units">
        <rect x="255" y="70" width="330" height="142" rx="5" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.7" />
        {/* Operator Control Arm & Screen */}
        <rect x="495" y="42" width="46" height="24" rx="2" fill={p.bg} stroke={p.primaryRed} strokeWidth="1.4" />
        <line x1="518" y1="66" x2="518" y2="70" stroke={p.primaryRed} strokeWidth="2" />
        {/* 4 CMYK Imaging Drums + Intermediate Belt */}
        <polygon points="300,118 530,118 515,134 315,134" fill="none" stroke={p.primaryRed} strokeWidth="1.4" />
        {[335, 385, 435, 485].map((cx, i) => (
          <circle key={i} cx={cx} cy="102" r="11" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
        ))}
        {/* Fuser & Duplex Loop */}
        <circle cx="315" cy="164" r="14" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
        <rect x="360" y="156" width="175" height="34" rx="10" fill="none" stroke={p.mutedStroke} strokeWidth="1.2" strokeDasharray="4 2" />
        <text x="420" y="62" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          CMYK+ IMAGING CORE & FUSER
        </text>
      </g>

      {/* High-Capacity Stacker & Finisher (Left) */}
      <g data-hotspot="delivery">
        <rect x="65" y="92" width="180" height="120" rx="4" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        <rect x="85" y="128" width="140" height="72" fill="none" stroke={p.primaryRed} strokeWidth="1.2" strokeDasharray="3 2" />
        <text x="155" y="82" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          HIGH-CAPACITY STACKER
        </text>
      </g>

      <path
        d="M 610 142 L 290 142 L 155 150"
        fill="none"
        stroke={p.primaryRed}
        strokeWidth="1.5"
        strokeDasharray={animatedTelemetry ? '5 3' : 'none'}
      />

      <text x="55" y="250" fill={p.mutedStroke} fontSize="8.5" fontFamily="monospace">
        PROCEDURAL CAD GENERATOR · DIGITAL TONER / INKJET SHEETFED · {sheetFormat}
      </text>
      <text x="765" y="250" textAnchor="end" fill={p.primaryRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        TIER 3 PARAMETRIC
      </text>
    </svg>
  );
};

