import React from 'react';
import { MachineSchematicProps, getBlueprintPalette } from './types';

export const ParametricWebRotarySvg: React.FC<MachineSchematicProps> = ({
  className = 'w-full h-full',
  theme = 'dark',
  wireframeOnly = false,
  animatedTelemetry = true,
  unitsCount = 4,
}) => {
  const p = getBlueprintPalette(theme, wireframeOnly);

  return (
    <svg
      viewBox="0 0 920 270"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Parametric Continuous Web Rotary Press Schematic"
      data-schematic="ParametricWebRotarySvg"
    >
      <defs>
        <pattern id="param-web-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="920" height="270" fill={p.bg} rx="8" />
      <rect x="0" y="0" width="920" height="270" fill="url(#param-web-grid)" rx="8" />

      <text x="460" y="22" textAnchor="middle" fill={p.labelColor} fontSize="9" fontFamily="monospace" fontWeight="bold">
        PARAMETRIC CONTINUOUS WEB ROTARY / HIGH-SPEED INKJET · {unitsCount} TOWERS · REEL-TO-SIGNATURE
      </text>

      <rect x="35" y="214" width="850" height="14" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />

      {/* Unwind Reel Stand & Dancer Rollers (Left) */}
      <g data-hotspot="feeder">
        <rect x="42" y="92" width="145" height="122" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        <circle cx="95" cy="154" r="38" fill="none" stroke={p.primaryRed} strokeWidth="1.6" />
        <circle cx="95" cy="154" r="10" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
        <circle cx="158" cy="120" r="8" fill="none" stroke={p.primaryRed} strokeWidth="1.2" />
        <circle cx="158" cy="184" r="8" fill="none" stroke={p.primaryRed} strokeWidth="1.2" />
        <text x="114" y="82" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          REEL UNWINDER
        </text>
      </g>

      {/* Printing Arch / Blanket-to-Blanket Towers */}
      <g data-hotspot="units">
        {[0, 1, 2, 3].map((t) => {
          const x = 205 + t * 82;
          return (
            <g key={t}>
              <rect x={x} y="74" width="68" height="140" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.5" />
              <circle cx={x + 34} cy="112" r="13" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
              <circle cx={x + 34} cy="140" r="13" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
              <circle cx={x + 34} cy="168" r="13" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
              <circle cx={x + 34} cy="194" r="13" fill="none" stroke={p.mutedStroke} strokeWidth="1.2" />
              <text x={x + 34} y="66" textAnchor="middle" fill={p.labelColor} fontSize="7.5" fontFamily="monospace">
                W{t + 1}
              </text>
            </g>
          );
        })}
      </g>

      {/* Flotation Dryer & Chill Rolls */}
      <g data-hotspot="dryer">
        <rect x="540" y="102" width="175" height="68" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.6" />
        <text x="627" y="92" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          HOT-AIR DRYER + CHILL ROLLS
        </text>
      </g>

      {/* Rotary Folder Superstructure (Right) */}
      <g data-hotspot="delivery">
        <polygon
          points="730,214 730,68 815,68 875,135 875,214"
          fill={p.chassisFill}
          stroke={p.chassisStroke}
          strokeWidth="1.6"
        />
        <polygon points="755,82 805,82 780,145" fill="none" stroke={p.primaryRed} strokeWidth="1.5" />
        <circle cx="805" cy="176" r="20" fill="none" stroke={p.primaryRed} strokeWidth="1.4" />
        <text x="802" y="58" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          ROTARY FOLDER
        </text>
      </g>

      {/* Continuous Paper Web Path */}
      <path
        d="M 95 116 L 158 120 L 205 152 L 540 136 L 730 136 L 805 176"
        fill="none"
        stroke={p.primaryRed}
        strokeWidth="1.6"
        strokeDasharray={animatedTelemetry ? '8 4' : 'none'}
      />

      <text x="42" y="250" fill={p.mutedStroke} fontSize="8.5" fontFamily="monospace">
        PROCEDURAL CAD GENERATOR · CONTINUOUS WEB ROTARY · AUTO-SPLICE & FOLDER
      </text>
      <text x="878" y="250" textAnchor="end" fill={p.primaryRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        TIER 3 PARAMETRIC
      </text>
    </svg>
  );
};

