import React from 'react';
import { MachineSchematicProps, getBlueprintPalette } from './types';

export const StahlfolderTH82Svg: React.FC<MachineSchematicProps> = ({
  className = 'w-full h-full',
  theme = 'dark',
  wireframeOnly = false,
  animatedTelemetry = true,
}) => {
  const p = getBlueprintPalette(theme, wireframeOnly);

  return (
    <svg
      viewBox="0 0 860 270"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Heidelberg Stahlfolder TH 82 Buckle Folding Machine Schematic"
      data-schematic="StahlfolderTH82Svg"
    >
      <defs>
        <pattern id="th82-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="860" height="270" fill={p.bg} rx="8" />
      <rect x="0" y="0" width="860" height="270" fill="url(#th82-grid)" rx="8" />

      <text x="430" y="22" textAnchor="middle" fill={p.labelColor} fontSize="9" fontFamily="monospace" fontWeight="bold">
        HEIDELBERG STAHLFOLDER TH 82-P · 6/6/4 BUCKLE SIGNATURE FOLDER · 16,000 CYCLES/H
      </text>

      {/* Pallet Feeder PFH 82 (Left) */}
      <g data-hotspot="feeder">
        <rect x="48" y="96" width="136" height="120" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        <rect x="64" y="128" width="104" height="80" fill="none" stroke={p.primaryRed} strokeWidth="1.2" strokeDasharray="3 2" />
        <text x="116" y="86" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          PFH-82 PALLET FEEDER
        </text>
      </g>

      {/* Station 1 & Station 2 Buckle Folding Plates */}
      <g data-hotspot="clamps">
        {[0, 1, 2].map((station) => {
          const x = 200 + station * 155;
          return (
            <g key={station}>
              <rect
                x={x}
                y="92"
                width="140"
                height="124"
                rx="4"
                fill={p.chassisFill}
                stroke={p.chassisStroke}
                strokeWidth="1.5"
              />
              {/* Upper & Lower Angled Buckle Plates */}
              {[0, 1, 2].map((pocket) => (
                <line
                  key={pocket}
                  x1={x + 22 + pocket * 36}
                  y1="92"
                  x2={x + 48 + pocket * 36}
                  y2="56"
                  stroke={p.primaryRed}
                  strokeWidth="1.6"
                />
              ))}
              {/* Spiral Folding Rollers */}
              {[0, 1, 2, 3].map((r) => (
                <circle
                  key={r}
                  cx={x + 30 + r * 26}
                  cy="148"
                  r="10"
                  fill="none"
                  stroke={p.primaryRed}
                  strokeWidth="1.3"
                />
              ))}
              <text x={x + 70} y="48" textAnchor="middle" fill={p.labelColor} fontSize="7.5" fontFamily="monospace">
                BUCKLE UNIT {station + 1}
              </text>
            </g>
          );
        })}
      </g>

      {/* Palamides / SBP Shingle Stacker Delivery (Right) */}
      <g data-hotspot="delivery">
        <rect x="670" y="118" width="142" height="98" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        <line x1="682" y1="158" x2="798" y2="158" stroke={p.primaryRed} strokeWidth="1.6" strokeDasharray={animatedTelemetry ? '5 3' : 'none'} />
        <text x="741" y="108" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          SIGNATURE STACKER
        </text>
      </g>

      <text x="48" y="250" fill={p.mutedStroke} fontSize="8.5" fontFamily="monospace">
        CAD-REF: HDM-TH82P · SHINGLED STREAM INFEED · AUTOMATED SLITTER SHAFTS
      </text>
      <text x="812" y="250" textAnchor="end" fill={p.primaryRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        SCALE 1:35 · BUCKLE FOLDER
      </text>
    </svg>
  );
};

