import React from 'react';
import { MachineSchematicProps, getBlueprintPalette } from './types';

export const HeidelbergSpeedmasterXL106Svg: React.FC<MachineSchematicProps> = ({
  className = 'w-full h-full',
  theme = 'dark',
  wireframeOnly = false,
  animatedTelemetry = true,
  sheetFormat = 'B1',
}) => {
  const p = getBlueprintPalette(theme, wireframeOnly);
  const towers = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <svg
      viewBox="0 0 960 280"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Heidelberg Speedmaster XL 106 8-Unit B1 Offset Schematic"
      data-schematic="HeidelbergSpeedmasterXL106Svg"
    >
      <defs>
        <pattern id="xl106-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      {/* Canvas Background & Tactical Grid */}
      <rect x="0" y="0" width="960" height="280" fill={p.bg} rx="8" />
      <rect x="0" y="0" width="960" height="280" fill="url(#xl106-grid)" rx="8" />

      {/* CAD Dimension Line Top */}
      <line x1="40" y1="26" x2="920" y2="26" stroke={p.dimLine} strokeWidth="1" strokeDasharray="3 3" />
      <line x1="40" y1="20" x2="40" y2="32" stroke={p.primaryRed} strokeWidth="1.2" />
      <line x1="920" y1="20" x2="920" y2="32" stroke={p.primaryRed} strokeWidth="1.2" />
      <text x="480" y="21" textAnchor="middle" fill={p.labelColor} fontSize="9" fontFamily="monospace" fontWeight="bold">
        HEIDELBERG SPEEDMASTER XL 106-8-P+L · {sheetFormat} (750×1060 MM) · L=18,420 MM · 18,000 SPH
      </text>

      {/* Heavy Cast-Iron Bedplate Base */}
      <rect x="35" y="218" width="890" height="16" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
      <line x1="25" y1="234" x2="935" y2="234" stroke={p.primaryRed} strokeWidth="2" />

      {/* Operator Gallery Catwalk & Safety Railing */}
      <line x1="120" y1="158" x2="770" y2="158" stroke={p.mutedStroke} strokeWidth="1.5" />
      <line x1="120" y1="132" x2="770" y2="132" stroke={p.primaryRed} strokeWidth="0.9" strokeDasharray="6 3" />

      {/* Preset Plus Feeder (Right Side Infeed) */}
      <g data-hotspot="feeder">
        <rect x="815" y="96" width="95" height="122" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        {/* Paper Pile */}
        <rect x="828" y="128" width="68" height="82" fill="none" stroke={p.primaryRed} strokeWidth="1.2" strokeDasharray="2 2" />
        <line x1="832" y1="145" x2="892" y2="145" stroke={p.primaryRed} strokeWidth="0.8" />
        <line x1="832" y1="165" x2="892" y2="165" stroke={p.primaryRed} strokeWidth="0.8" />
        <line x1="832" y1="185" x2="892" y2="185" stroke={p.primaryRed} strokeWidth="0.8" />
        {/* Suction Head & Feedboard */}
        <rect x="780" y="114" width="42" height="14" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.3" />
        <text x="862" y="88" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          FEEDER
        </text>
      </g>

      {/* 8 Offset Printing Units + Perfecting Drum after Unit 4 */}
      <g data-hotspot="units">
        {towers.map((idx) => {
          const x = 710 - idx * 68 - (idx >= 4 ? 26 : 0);
          return (
            <g key={idx}>
              <rect
                x={x}
                y="78"
                width="58"
                height="140"
                rx="3"
                fill={p.chassisFill}
                stroke={p.chassisStroke}
                strokeWidth="1.5"
              />
              {/* Plate, Blanket & Impression Cylinders */}
              <circle cx={x + 29} cy="108" r="12" fill="none" stroke={p.primaryRed} strokeWidth="1.2" />
              <circle cx={x + 29} cy="136" r="14" fill="none" stroke={p.primaryRed} strokeWidth="1.4" />
              <circle cx={x + 29} cy="168" r="16" fill="none" stroke={p.mutedStroke} strokeWidth="1.2" />
              {/* AutoPlate Pro Hood */}
              <line x1={x + 8} y1="90" x2={x + 50} y2="90" stroke={p.primaryRed} strokeWidth="1" />
              <text x={x + 29} y="71" textAnchor="middle" fill={p.labelColor} fontSize="7.5" fontFamily="monospace">
                U{idx + 1}
              </text>
            </g>
          );
        })}

        {/* Perfecting Transfer Module between U4 and U5 */}
        <rect x="470" y="112" width="22" height="106" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.4" />
        <circle cx="481" cy="158" r="8" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
        <text x="481" y="105" textAnchor="middle" fill={p.primaryRed} fontSize="7" fontFamily="monospace" fontWeight="bold">
          PERF
        </text>
      </g>

      {/* Anilox Coater & DryStar Combination Hood */}
      <g data-hotspot="dryer">
        <rect x="132" y="88" width="54" height="130" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.6" />
        <circle cx="159" cy="128" r="13" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
        <circle cx="159" cy="162" r="15" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
        <text x="159" y="80" textAnchor="middle" fill={p.primaryRed} fontSize="7.5" fontFamily="monospace" fontWeight="bold">
          COAT+IR
        </text>
      </g>

      {/* Preset Plus Extended Delivery (Left Side Outfeed) */}
      <g data-hotspot="delivery">
        <path
          d="M 42 130 L 95 76 L 132 76 L 132 218 L 42 218 Z"
          fill={p.chassisFill}
          stroke={p.chassisStroke}
          strokeWidth="1.6"
        />
        {/* Non-Stop Delivery Pile */}
        <rect x="52" y="148" width="62" height="64" fill="none" stroke={p.primaryRed} strokeWidth="1.2" strokeDasharray="2 2" />
        {/* Prinect Press Center XL Console */}
        <rect x="18" y="156" width="20" height="62" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.3" />
        <line x1="18" y1="156" x2="36" y2="142" stroke={p.primaryRed} strokeWidth="1.6" />
        <text x="85" y="68" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          DELIVERY X3
        </text>
      </g>

      {/* Active Sheet Transport Path */}
      <path
        d="M 825 135 L 770 150 L 135 150 L 75 160"
        fill="none"
        stroke={p.primaryRed}
        strokeWidth="1.5"
        strokeDasharray={animatedTelemetry ? '6 4' : 'none'}
      />

      {/* Footer Technical Strip */}
      <text x="40" y="258" fill={p.mutedStroke} fontSize="8.5" fontFamily="monospace">
        CAD-REF: HDM-XL106-8PL · PRINECT INPRESS CONTROL 3 · AUTOPLATE XL 3
      </text>
      <text x="920" y="258" textAnchor="end" fill={p.primaryRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        SCALE 1:50 · ISO 12647-2
      </text>
    </svg>
  );
};

