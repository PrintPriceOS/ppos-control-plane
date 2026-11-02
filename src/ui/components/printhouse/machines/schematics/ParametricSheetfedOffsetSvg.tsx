import React from 'react';
import { MachineSchematicProps, getBlueprintPalette } from './types';

export const ParametricSheetfedOffsetSvg: React.FC<MachineSchematicProps> = ({
  className = 'w-full h-full',
  theme = 'dark',
  wireframeOnly = false,
  animatedTelemetry = true,
  unitsCount = 4,
  sheetFormat = 'B1',
}) => {
  const p = getBlueprintPalette(theme, wireframeOnly);
  const clampedUnits = Math.max(1, Math.min(10, Number(unitsCount || 4)));
  const towers = Array.from({ length: clampedUnits }, (_, i) => i);
  const totalUnitWidth = 560;
  const towerPitch = totalUnitWidth / clampedUnits;
  const towerW = Math.min(68, Math.max(38, towerPitch - 8));

  return (
    <svg
      viewBox="0 0 900 270"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`Parametric ${clampedUnits}-Unit ${sheetFormat} Sheetfed Offset Press Schematic`}
      data-schematic="ParametricSheetfedOffsetSvg"
      data-units={clampedUnits}
    >
      <defs>
        <pattern id="param-offset-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="900" height="270" fill={p.bg} rx="8" />
      <rect x="0" y="0" width="900" height="270" fill="url(#param-offset-grid)" rx="8" />

      <text x="450" y="22" textAnchor="middle" fill={p.labelColor} fontSize="9" fontFamily="monospace" fontWeight="bold">
        PARAMETRIC SHEETFED OFFSET ENGINE · {clampedUnits} PRINTING UNITS · FORMAT {sheetFormat}
      </text>

      {/* Base Bedplate */}
      <rect x="40" y="214" width="820" height="14" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
      <line x1="150" y1="154" x2="730" y2="154" stroke={p.mutedStroke} strokeWidth="1.2" strokeDasharray="5 3" />

      {/* Feeder (Right) */}
      <g data-hotspot="feeder">
        <rect x="750" y="96" width="100" height="118" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        <rect x="765" y="124" width="70" height="82" fill="none" stroke={p.primaryRed} strokeWidth="1.2" strokeDasharray="3 2" />
        <text x="800" y="86" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          STREAM FEEDER
        </text>
      </g>

      {/* N Dynamic Printing Towers */}
      <g data-hotspot="units">
        {towers.map((idx) => {
          const x = 735 - (idx + 1) * towerPitch + (towerPitch - towerW) / 2;
          return (
            <g key={idx}>
              <rect
                x={x}
                y="82"
                width={towerW}
                height="132"
                rx="3"
                fill={p.chassisFill}
                stroke={p.chassisStroke}
                strokeWidth="1.5"
              />
              <circle cx={x + towerW / 2} cy="112" r={Math.min(12, towerW * 0.24)} fill="none" stroke={p.primaryRed} strokeWidth="1.2" />
              <circle cx={x + towerW / 2} cy="140" r={Math.min(14, towerW * 0.28)} fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
              <circle cx={x + towerW / 2} cy="174" r={Math.min(16, towerW * 0.32)} fill="none" stroke={p.mutedStroke} strokeWidth="1.2" />
              <text x={x + towerW / 2} y="74" textAnchor="middle" fill={p.labelColor} fontSize="7.5" fontFamily="monospace">
                U{idx + 1}
              </text>
            </g>
          );
        })}
      </g>

      {/* Delivery & Dryer (Left) */}
      <g data-hotspot="delivery">
        <path
          d="M 48 128 L 112 78 L 170 78 L 170 214 L 48 214 Z"
          fill={p.chassisFill}
          stroke={p.chassisStroke}
          strokeWidth="1.6"
        />
        <rect x="62" y="146" width="68" height="60" fill="none" stroke={p.primaryRed} strokeWidth="1.2" strokeDasharray="2 2" />
        <text x="108" y="69" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          PILE DELIVERY
        </text>
      </g>

      <path
        d="M 765 138 L 720 152 L 170 152 L 95 162"
        fill="none"
        stroke={p.primaryRed}
        strokeWidth="1.5"
        strokeDasharray={animatedTelemetry ? '6 4' : 'none'}
      />

      <text x="45" y="250" fill={p.mutedStroke} fontSize="8.5" fontFamily="monospace">
        PROCEDURAL CAD GENERATOR · {clampedUnits} OFFSET TOWERS · {sheetFormat} SHEET CLASS
      </text>
      <text x="855" y="250" textAnchor="end" fill={p.primaryRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        TIER 3 PARAMETRIC
      </text>
    </svg>
  );
};

