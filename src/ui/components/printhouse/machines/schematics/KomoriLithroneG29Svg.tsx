import React from 'react';
import { MachineSchematicProps, getBlueprintPalette } from './types';

export const KomoriLithroneG29Svg: React.FC<MachineSchematicProps> = ({
  className = 'w-full h-full',
  theme = 'dark',
  wireframeOnly = false,
  animatedTelemetry = true,
  sheetFormat = 'B2',
}) => {
  const p = getBlueprintPalette(theme, wireframeOnly);
  const towers = [0, 1, 2, 3, 4];

  return (
    <svg
      viewBox="0 0 860 270"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Komori Lithrone G29 5-Unit B2 Offset + Coater Schematic"
      data-schematic="KomoriLithroneG29Svg"
    >
      <defs>
        <pattern id="g29-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="860" height="270" fill={p.bg} rx="8" />
      <rect x="0" y="0" width="860" height="270" fill="url(#g29-grid)" rx="8" />

      {/* Top Dimension Line */}
      <line x1="45" y1="26" x2="815" y2="26" stroke={p.dimLine} strokeWidth="1" strokeDasharray="3 3" />
      <text x="430" y="20" textAnchor="middle" fill={p.labelColor} fontSize="9" fontFamily="monospace" fontWeight="bold">
        KOMORI LITHRONE G29-5+C · {sheetFormat} HALF-SIZE (530×750 MM) · H-UV LED · 16,500 SPH
      </text>

      {/* Base Frame */}
      <rect x="45" y="212" width="770" height="15" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />

      {/* Komori High-Speed Feeder */}
      <g data-hotspot="feeder">
        <rect x="705" y="94" width="102" height="118" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        <rect x="720" y="122" width="72" height="82" fill="none" stroke={p.primaryRed} strokeWidth="1.2" strokeDasharray="3 2" />
        <text x="756" y="85" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          KHS-AI FEEDER
        </text>
      </g>

      {/* 5 Lithrone G29 Offset Units */}
      <g data-hotspot="units">
        {towers.map((idx) => {
          const x = 605 - idx * 82;
          return (
            <g key={idx}>
              <rect
                x={x}
                y="78"
                width="70"
                height="134"
                rx="4"
                fill={p.chassisFill}
                stroke={p.chassisStroke}
                strokeWidth="1.5"
              />
              {/* Double-Diameter Impression & Transfer Cylinders */}
              <circle cx={x + 35} cy="108" r="12" fill="none" stroke={p.primaryRed} strokeWidth="1.2" />
              <circle cx={x + 35} cy="136" r="14" fill="none" stroke={p.primaryRed} strokeWidth="1.4" />
              <circle cx={x + 35} cy="172" r="19" fill="none" stroke={p.mutedStroke} strokeWidth="1.3" />
              <text x={x + 35} y="70" textAnchor="middle" fill={p.labelColor} fontSize="8" fontFamily="monospace">
                GL-{idx + 1}
              </text>
            </g>
          );
        })}
      </g>

      {/* Anilox Coater & H-UV Curing Bridge */}
      <g data-hotspot="dryer">
        <rect x="195" y="88" width="66" height="124" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.6" />
        <circle cx="228" cy="128" r="13" fill="none" stroke={p.primaryRed} strokeWidth="1.4" />
        <circle cx="228" cy="166" r="17" fill="none" stroke={p.primaryRed} strokeWidth="1.4" />
        <text x="228" y="80" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          ANILOX+H-UV
        </text>
      </g>

      {/* Extended Delivery Hood */}
      <g data-hotspot="delivery">
        <path
          d="M 50 124 L 118 74 L 195 74 L 195 212 L 50 212 Z"
          fill={p.chassisFill}
          stroke={p.chassisStroke}
          strokeWidth="1.6"
        />
        <rect x="64" y="142" width="76" height="62" fill="none" stroke={p.primaryRed} strokeWidth="1.2" strokeDasharray="2 2" />
        <text x="120" y="66" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          EXTENDED DELIVERY
        </text>
      </g>

      {/* Sheet Path */}
      <path
        d="M 720 135 L 675 152 L 195 152 L 95 162"
        fill="none"
        stroke={p.primaryRed}
        strokeWidth="1.5"
        strokeDasharray={animatedTelemetry ? '6 4' : 'none'}
      />

      <text x="45" y="250" fill={p.mutedStroke} fontSize="8.5" fontFamily="monospace">
        CAD-REF: KMR-GL529-C · PDC-SX SPECTROPHOTOMETER · FULL-APC
      </text>
      <text x="815" y="250" textAnchor="end" fill={p.primaryRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        SCALE 1:40 · B2 SHEETFED
      </text>
    </svg>
  );
};

