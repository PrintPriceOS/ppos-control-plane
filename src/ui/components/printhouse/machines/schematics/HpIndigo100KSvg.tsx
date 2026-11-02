import React from 'react';
import { MachineSchematicProps, getBlueprintPalette } from './types';

export const HpIndigo100KSvg: React.FC<MachineSchematicProps> = ({
  className = 'w-full h-full',
  theme = 'dark',
  wireframeOnly = false,
  animatedTelemetry = true,
  sheetFormat = 'B2',
}) => {
  const p = getBlueprintPalette(theme, wireframeOnly);

  return (
    <svg
      viewBox="0 0 840 270"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="HP Indigo 100K B2 Digital Press Schematic"
      data-schematic="HpIndigo100KSvg"
    >
      <defs>
        <pattern id="indigo100k-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="840" height="270" fill={p.bg} rx="8" />
      <rect x="0" y="0" width="840" height="270" fill="url(#indigo100k-grid)" rx="8" />

      <text x="420" y="22" textAnchor="middle" fill={p.labelColor} fontSize="9" fontFamily="monospace" fontWeight="bold">
        HP INDIGO 100K DIGITAL PRESS · {sheetFormat} (750×530 MM) · LEP ELECTROINK · 6,000 SPH NON-STOP
      </text>

      {/* Main Chassis Base */}
      <rect x="45" y="212" width="750" height="14" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />

      {/* Multi-Drawer Feeder Tower + Pallet Feeder (Right) */}
      <g data-hotspot="feeder">
        <rect x="615" y="72" width="168" height="140" rx="4" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        {/* 4 Internal Drawers + Pallet Bay */}
        <rect x="628" y="86" width="68" height="24" fill="none" stroke={p.primaryRed} strokeWidth="1.2" />
        <rect x="628" y="116" width="68" height="24" fill="none" stroke={p.primaryRed} strokeWidth="1.2" />
        <rect x="628" y="146" width="68" height="24" fill="none" stroke={p.primaryRed} strokeWidth="1.2" />
        <rect x="628" y="176" width="68" height="24" fill="none" stroke={p.primaryRed} strokeWidth="1.2" />
        <rect x="706" y="96" width="64" height="104" fill="none" stroke={p.primaryRed} strokeWidth="1.2" strokeDasharray="3 2" />
        <text x="699" y="64" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          5-SOURCE FEEDER TOWER
        </text>
      </g>

      {/* Central LEP Imaging Engine, PIP Drum & ITM Blanket */}
      <g data-hotspot="units">
        <rect x="275" y="64" width="330" height="148" rx="6" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.8" />
        {/* Curved Panoramic Window */}
        <path
          d="M 300 84 Q 440 72 580 84 L 580 128 Q 440 136 300 128 Z"
          fill="none"
          stroke={p.primaryRed}
          strokeWidth="1.4"
        />
        {/* PIP Photoreceptor Drum, ITM Blanket & Impression Drum */}
        <circle cx="440" cy="146" r="24" fill="none" stroke={p.primaryRed} strokeWidth="1.6" />
        <circle cx="400" cy="176" r="18" fill="none" stroke={p.primaryRed} strokeWidth="1.4" />
        <circle cx="480" cy="176" r="18" fill="none" stroke={p.mutedStroke} strokeWidth="1.3" />
        {/* 7 ElectroInk BID Stations around PIP */}
        {[-50, -30, -10, 10, 30, 50].map((dx, i) => (
          <rect
            key={i}
            x={436 + dx}
            y="102"
            width="8"
            height="16"
            fill="none"
            stroke={p.primaryRed}
            strokeWidth="1"
          />
        ))}
        <text x="440" y="56" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          LEP PIP / ITM ENGINE (7-INK BID)
        </text>
      </g>

      {/* Conditioning & Inline Spectrophotometer Bridge */}
      <g data-hotspot="dryer">
        <rect x="210" y="88" width="60" height="124" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.4" />
        <circle cx="240" cy="148" r="14" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
        <text x="240" y="79" textAnchor="middle" fill={p.labelColor} fontSize="7.5" fontFamily="monospace">
          DUPLEX/IR
        </text>
      </g>

      {/* Non-Stop Palletized Stacker (Left) */}
      <g data-hotspot="delivery">
        <rect x="52" y="82" width="152" height="130" rx="4" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        <rect x="70" y="118" width="114" height="84" fill="none" stroke={p.primaryRed} strokeWidth="1.2" strokeDasharray="3 2" />
        <text x="128" y="73" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          PALLET STACKER
        </text>
      </g>

      {/* Paper Transport Trajectory */}
      <path
        d="M 628 150 L 480 162 L 400 162 L 210 150 L 120 150"
        fill="none"
        stroke={p.primaryRed}
        strokeWidth="1.5"
        strokeDasharray={animatedTelemetry ? '5 4' : 'none'}
      />

      <text x="45" y="250" fill={p.mutedStroke} fontSize="8.5" fontFamily="monospace">
        CAD-REF: HPI-100K-B2 · PRINTOS COLOR BEAT · GRIPPER-TO-GRIPPER TRANSPORT
      </text>
      <text x="795" y="250" textAnchor="end" fill={p.primaryRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        SCALE 1:35 · DIGITAL B2
      </text>
    </svg>
  );
};

