import React from 'react';
import {
  CorporateBlueprintSvgProps,
  getCorporateBlueprintPalette,
  useBlueprintTranslation,
} from './blueprintTheme';

export const MachineryFleetIotSvg: React.FC<CorporateBlueprintSvgProps> = ({
  theme = 'dark',
  className = 'w-full h-full',
  animated = true,
}) => {
  const p = getCorporateBlueprintPalette(theme);
  const { tr } = useBlueprintTranslation();
  const towers = [0, 1, 2, 3];

  return (
    <svg
      viewBox="0 0 400 260"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="fleet-svg-title fleet-svg-desc"
      data-blueprint-svg="MachineryFleetIotSvg"
    >
      <title id="fleet-svg-title">
        {tr('blueprint.fleet.svgTitle', 'Machinery Fleet & CIP4 JMF IoT Press Cross-Section')}
      </title>
      <desc id="fleet-svg-desc">
        {tr(
          'blueprint.fleet.svgDesc',
          'Multi-unit offset press cross-section displaying cylinder nips, ink fountain keys, vacuum feeder suction heads, and real-time OEE telemetry.'
        )}
      </desc>

      <defs>
        <pattern id={`fleet-grid-${theme}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="400" height="260" fill={p.canvasBg} />
      <rect x="0" y="0" width="400" height="260" fill={`url(#fleet-grid-${theme})`} />

      <text x="20" y="22" fill={p.laserRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        CIP4 JDF 1.7 / JMF TELEMETRY · 18,000 CPH
      </text>
      <text x="380" y="22" textAnchor="end" fill={p.textMuted} fontSize="8" fontFamily="monospace">
        OEE 94.2%
      </text>

      {/* Cast-Iron Press Bedplate */}
      <rect x="20" y="198" width="360" height="12" fill={p.tintFill} stroke={p.structuralStroke} strokeWidth="1.4" />
      <line x1="14" y1="210" x2="386" y2="210" stroke={p.laserRed} strokeWidth="1.75" />

      {/* Vacuum Suction Feeder Unit (Right) */}
      <g>
        <rect x="316" y="76" width="60" height="122" fill={p.tintFill} stroke={p.laserRed} strokeWidth="1.5" />
        {/* Suction Head */}
        <rect x="298" y="92" width="26" height="12" fill={p.tintStrongFill} stroke={p.laserRed} strokeWidth="1.3" />
        <line x1="306" y1="104" x2="306" y2="116" stroke={p.laserRed} strokeWidth="1.4" />
        {/* Sheet Pile */}
        {[122, 138, 154, 170, 184].map((y) => (
          <line key={y} x1="324" y1={y} x2="368" y2={y} stroke={p.laserRed} strokeWidth="1" />
        ))}
        <text x="346" y="68" textAnchor="middle" fill={p.laserRed} fontSize="7.5" fontFamily="monospace" fontWeight="bold">
          SUCTION FEED
        </text>
      </g>

      {/* 4 High-Speed Offset Towers with Cylinder Nips & Ink Keys */}
      {towers.map((tIdx) => {
        const x = 232 - tIdx * 66;
        return (
          <g key={tIdx}>
            <rect x={x} y="62" width="54" height="136" rx="3" fill={p.tintFill} stroke={p.laserRed} strokeWidth="1.4" />
            {/* Ink Fountain Duct & Keys */}
            <polygon
              points={`${x + 8},62 ${x + 46},62 ${x + 38},76 ${x + 16},76`}
              fill={p.tintStrongFill}
              stroke={p.laserRed}
              strokeWidth="1.1"
            />
            {/* Plate, Blanket & Impression Cylinders */}
            <circle cx={x + 27} cy="96" r="10" fill="none" stroke={p.laserRed} strokeWidth="1.2" />
            <circle cx={x + 27} cy="122" r="12" fill="none" stroke={p.laserRed} strokeWidth="1.5" />
            <circle cx={x + 27} cy="154" r="15" fill="none" stroke={p.structuralStroke} strokeWidth="1.3" />
            {/* Cylinder Nip Contact Line */}
            <line x1={x + 12} y1="136" x2={x + 42} y2="136" stroke={p.laserRed} strokeWidth="1.4" />
            <text x={x + 27} y="54" textAnchor="middle" fill={p.textPrimary} fontSize="7.5" fontFamily="monospace" fontWeight="bold">
              UNIT {4 - tIdx}
            </text>
          </g>
        );
      })}

      {/* Active Sheet Web Path */}
      <path
        d="M 326 118 L 286 136 L 34 136"
        fill="none"
        stroke={p.laserRed}
        strokeWidth="1.6"
        strokeDasharray={animated ? '6 4' : undefined}
      />

      {/* Bottom Telemetry Strip */}
      <rect x="16" y="226" width="368" height="22" rx="3" fill={p.badgeBg} stroke={p.gridMajor} strokeWidth="1" />
      <text x="26" y="240" fill={p.textPrimary} fontSize="8" fontFamily="monospace">
        FORMAT: B1 (700×1000MM) · MAKE-READY: 18 MIN
      </text>
      <text x="374" y="240" textAnchor="end" fill={p.laserRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
        22 OEM PRESETS
      </text>
    </svg>
  );
};

