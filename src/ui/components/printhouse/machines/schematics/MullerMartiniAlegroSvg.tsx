import React from 'react';
import { MachineSchematicProps, getBlueprintPalette } from './types';

export const MullerMartiniAlegroSvg: React.FC<MachineSchematicProps> = ({
  className = 'w-full h-full',
  theme = 'dark',
  wireframeOnly = false,
  animatedTelemetry = true,
}) => {
  const p = getBlueprintPalette(theme, wireframeOnly);
  const clamps = Array.from({ length: 16 }, (_, i) => i);

  return (
    <svg
      viewBox="0 0 920 270"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Müller Martini Alegro 16-Clamp PUR Perfect Binder Schematic"
      data-schematic="MullerMartiniAlegroSvg"
    >
      <defs>
        <pattern id="alegro-grid" width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="920" height="270" fill={p.bg} rx="8" />
      <rect x="0" y="0" width="920" height="270" fill="url(#alegro-grid)" rx="8" />

      <text x="460" y="22" textAnchor="middle" fill={p.labelColor} fontSize="9" fontFamily="monospace" fontWeight="bold">
        MÜLLER MARTINI ALEGRO A7 · 16-CLAMP MOTION CONTROL PUR BINDER · 7,000 CYCLES/H
      </text>

      {/* Base Frame */}
      <rect x="35" y="214" width="850" height="14" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />

      {/* Gathering Channel & Book Block Infeed (Left) */}
      <g data-hotspot="feeder">
        <rect x="42" y="114" width="136" height="100" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.5" />
        {[0, 1, 2, 3].map((hop) => (
          <rect
            key={hop}
            x={52 + hop * 30}
            y="84"
            width="22"
            height="30"
            fill="none"
            stroke={p.primaryRed}
            strokeWidth="1.2"
          />
        ))}
        <text x="110" y="75" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          GATHERER INFEED
        </text>
      </g>

      {/* Oval 16-Clamp Carousel Track */}
      <g data-hotspot="clamps">
        <rect
          x="190"
          y="78"
          width="520"
          height="136"
          rx="42"
          fill={p.chassisFill}
          stroke={p.chassisStroke}
          strokeWidth="1.7"
        />
        <rect
          x="216"
          y="100"
          width="468"
          height="64"
          rx="26"
          fill="none"
          stroke={p.primaryRed}
          strokeWidth="1.4"
          strokeDasharray={animatedTelemetry ? '8 4' : 'none'}
        />
        {clamps.map((c) => {
          const x = 228 + c * 28;
          return (
            <rect
              key={c}
              x={x}
              y="92"
              width="16"
              height="16"
              rx="2"
              fill={p.bg}
              stroke={p.primaryRed}
              strokeWidth="1.3"
            />
          );
        })}
        <text x="450" y="68" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          16 SERVO CLAMPS (INDIVIDUAL DRIVE)
        </text>
      </g>

      {/* Spine Milling, Micro-Notching & PUR Nozzle Premelter */}
      <g data-hotspot="dryer">
        <rect x="270" y="168" width="110" height="42" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.5" />
        <circle cx="300" cy="188" r="11" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
        <circle cx="345" cy="188" r="11" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
        <rect x="400" y="168" width="120" height="42" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.5" />
        <text x="325" y="162" textAnchor="middle" fill={p.labelColor} fontSize="7.5" fontFamily="monospace">
          SPINE MILLING
        </text>
        <text x="460" y="162" textAnchor="middle" fill={p.primaryRed} fontSize="7.5" fontFamily="monospace" fontWeight="bold">
          PUR PREMELTER + NOZZLE
        </text>
      </g>

      {/* Rotary Cover Feeder & Nipping Station */}
      <g data-hotspot="units">
        <rect x="545" y="168" width="135" height="42" fill={p.chassisFill} stroke={p.primaryRed} strokeWidth="1.5" />
        <text x="612" y="192" textAnchor="middle" fill={p.labelColor} fontSize="7.5" fontFamily="monospace">
          COVER SCORING & NIPPER
        </text>
      </g>

      {/* Cooling Conveyor & Solit 3-Knife Trimmer Outfeed (Right) */}
      <g data-hotspot="delivery">
        <rect x="725" y="106" width="152" height="108" fill={p.chassisFill} stroke={p.chassisStroke} strokeWidth="1.6" />
        <line x1="738" y1="158" x2="862" y2="158" stroke={p.primaryRed} strokeWidth="1.5" strokeDasharray="5 3" />
        <rect x="780" y="120" width="76" height="68" fill="none" stroke={p.primaryRed} strokeWidth="1.3" />
        <text x="801" y="96" textAnchor="middle" fill={p.primaryRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          3-KNIFE TRIMMER
        </text>
      </g>

      <text x="42" y="250" fill={p.mutedStroke} fontSize="8.5" fontFamily="monospace">
        CAD-REF: MM-ALEGRO-16C · CONNEX DATA SYSTEM · ASN LASER SPINE CONTROL
      </text>
      <text x="878" y="250" textAnchor="end" fill={p.primaryRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        SCALE 1:45 · PUR BINDING LINE
      </text>
    </svg>
  );
};

