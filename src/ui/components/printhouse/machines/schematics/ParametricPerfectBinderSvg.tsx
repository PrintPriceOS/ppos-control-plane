import React from 'react';
import { MachineSchematicProps, getBlueprintPalette } from './types';

export const ParametricPerfectBinderSvg: React.FC<MachineSchematicProps> = ({
  className = 'w-full h-full',
  theme = 'dark',
  wireframeOnly = false,
  animatedTelemetry = true,
  unitsCount = 8,
}) => {
  const p = getBlueprintPalette(theme, wireframeOnly);
  const clampCount = Math.max(4, Math.min(16, Number(unitsCount || 8)));
  const clamps = Array.from({ length: clampCount }, (_, i) => i);

  return (
    <svg
      viewBox="0 0 860 270"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Parametric PUR/EVA Perfect Binder Line Schematic"
      data-schematic="ParametricPerfectBinderSvg"
    >
      <defs>
        <pattern id="param-binder-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="860" height="270" fill={p.bg} rx="8" />
      <rect x="0" y="0" width="860" height="270" fill="url(#param-binder-grid)" rx="8" />

      <text x="430" y="22" textAnchor="middle" fill={p.labelColor} fontSize="9" fontFamily="monospace" fontWeight="bold">
        PARAMETRIC PERFECT BINDER & HARDCOVER LINE · {clampCount} CLAMPS · MILLING & PUR/EVA GLUING
      </text>

      <rect x="45" y="212" width="770" height="14" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />

      {/* Book-Block Infeed */}
      <g data-hotspot="feeder">
        <rect x="52" y="114" width="120" height="98" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.5" />
        <text x="112" y="102" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          BLOCK INFEED
        </text>
      </g>

      {/* Rotating Clamp Track */}
      <g data-hotspot="clamps">
        <rect x="186" y="82" width="465" height="130" rx="34" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        <rect
          x="212"
          y="104"
          width="412"
          height="58"
          rx="22"
          fill="none"
          stroke={p.primaryRed}
          strokeWidth="1.4"
          strokeDasharray={animatedTelemetry ? '6 4' : 'none'}
        />
        {clamps.map((c) => (
          <rect
            key={c}
            x={226 + c * (380 / clampCount)}
            y="96"
            width="16"
            height="14"
            fill={p.bg}
            stroke={p.primaryRed}
            strokeWidth="1.2"
          />
        ))}
        <text x="418" y="72" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          CAROUSEL CLAMP TRACK ({clampCount} CLAMPS)
        </text>
      </g>

      {/* Milling & Gluing Unit */}
      <g data-hotspot="dryer">
        <rect x="240" y="170" width="175" height="36" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.4" />
        <text x="327" y="192" textAnchor="middle" fill={p.labelColor} fontSize="7.5" fontFamily="monospace">
          MILLING + PUR/EVA GLUE POT
        </text>
      </g>

      {/* Cover Pressing Station & Delivery Stacker */}
      <g data-hotspot="delivery">
        <rect x="440" y="170" width="180" height="36" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.4" />
        <text x="530" y="192" textAnchor="middle" fill={p.labelColor} fontSize="7.5" fontFamily="monospace">
          COVER NIPPING & PRESSING
        </text>
        <rect x="665" y="110" width="142" height="102" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        <text x="736" y="98" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          DELIVERY CONVEYOR
        </text>
      </g>

      <text x="45" y="250" fill={p.mutedStroke} fontSize="8.5" fontFamily="monospace">
        PROCEDURAL CAD GENERATOR · BOOKBINDING & FINISHING LINE
      </text>
      <text x="815" y="250" textAnchor="end" fill={p.primaryRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        TIER 3 PARAMETRIC
      </text>
    </svg>
  );
};

