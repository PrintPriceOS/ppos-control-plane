import React from 'react';
import {
  CorporateBlueprintSvgProps,
  getCorporateBlueprintPalette,
  useBlueprintTranslation,
} from './blueprintTheme';

export const PricingHawkEyeSvg: React.FC<CorporateBlueprintSvgProps> = ({
  theme = 'dark',
  className = 'w-full h-full',
  animated = true,
}) => {
  const p = getCorporateBlueprintPalette(theme);
  const { tr } = useBlueprintTranslation();

  return (
    <svg
      viewBox="0 0 400 260"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="pricing-svg-title pricing-svg-desc"
      data-blueprint-svg="PricingHawkEyeSvg"
    >
      <title id="pricing-svg-title">
        {tr('blueprint.pricing.svgTitle', 'Pricing Intelligence & 5-Axis Hawk-Eye Calibrator Blueprint')}
      </title>
      <desc id="pricing-svg-desc">
        {tr(
          'blueprint.pricing.svgDesc',
          'Technical cost balance scale and Digital vs. Offset crossover curve comparing substrate kg cost, CTP plates by signatures, make-ready, press-run hours, and unit margins.'
        )}
      </desc>

      <defs>
        <pattern id={`pricing-grid-${theme}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="400" height="260" fill={p.canvasBg} />
      <rect x="0" y="0" width="400" height="260" fill={`url(#pricing-grid-${theme})`} />

      <text x="20" y="22" fill={p.laserRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        HAWK-EYE 5-AXIS CALIBRATOR · SHA-256 GOVERNED
      </text>
      <text x="380" y="22" textAnchor="end" fill={p.textMuted} fontSize="8" fontFamily="monospace">
        Q* = 1,150 EX.
      </text>

      {/* Left Side: Precision Metrology Balance Scale */}
      <g transform="translate(20, 42)">
        {/* Central Fulcrum Pillar */}
        <line x1="90" y1="30" x2="90" y2="152" stroke={p.structuralStroke} strokeWidth="2" />
        <polygon points="72,152 108,152 90,132" fill={p.tintStrongFill} stroke={p.laserRed} strokeWidth="1.4" />
        <line x1="56" y1="152" x2="124" y2="152" stroke={p.laserRed} strokeWidth="2" />

        {/* Balance Beam */}
        <line x1="26" y1="44" x2="154" y2="44" stroke={p.laserRed} strokeWidth="1.75" />
        <circle cx="90" cy="44" r="5" fill={p.laserRed} />

        {/* Left Pan: Paper Substrate + CTP Plates + Make-Ready */}
        <line x1="36" y1="44" x2="22" y2="82" stroke={p.structuralStroke} strokeWidth="1.1" />
        <line x1="36" y1="44" x2="50" y2="82" stroke={p.structuralStroke} strokeWidth="1.1" />
        <rect x="12" y="82" width="52" height="34" rx="2" fill={p.tintFill} stroke={p.laserRed} strokeWidth="1.4" />
        <text x="38" y="96" textAnchor="middle" fill={p.textPrimary} fontSize="7" fontFamily="monospace" fontWeight="bold">
          PAPER KG
        </text>
        <text x="38" y="108" textAnchor="middle" fill={p.laserRed} fontSize="7" fontFamily="monospace">
          +32 CTP
        </text>

        {/* Right Pan: Press Run Hours + PUR Binding + Margin */}
        <line x1="144" y1="44" x2="130" y2="82" stroke={p.structuralStroke} strokeWidth="1.1" />
        <line x1="144" y1="44" x2="158" y2="82" stroke={p.structuralStroke} strokeWidth="1.1" />
        <rect x="118" y="82" width="52" height="34" rx="2" fill={p.tintFill} stroke={p.laserRed} strokeWidth="1.4" />
        <text x="144" y="96" textAnchor="middle" fill={p.textPrimary} fontSize="7" fontFamily="monospace" fontWeight="bold">
          RUN EUR/H
        </text>
        <text x="144" y="108" textAnchor="middle" fill={p.laserRed} fontSize="7" fontFamily="monospace">
          +BINDING
        </text>
      </g>

      {/* Right Side: Digital vs Offset Crossover Graph */}
      <g transform="translate(212, 46)">
        <rect x="0" y="0" width="172" height="154" rx="4" fill={p.badgeBg} stroke={p.structuralStroke} strokeWidth="1.1" />
        <text x="10" y="16" fill={p.laserRed} fontSize="7.5" fontFamily="monospace" fontWeight="bold">
          OFFSET VS DIGITAL CROSSOVER
        </text>

        {/* Graph Axes */}
        <line x1="20" y1="130" x2="158" y2="130" stroke={p.structuralStroke} strokeWidth="1.2" />
        <line x1="20" y1="28" x2="20" y2="130" stroke={p.structuralStroke} strokeWidth="1.2" />

        {/* Digital Linear Cost Curve (Flat unit cost) */}
        <path
          d="M 24 114 L 154 44"
          fill="none"
          stroke={p.textMuted}
          strokeWidth="1.4"
          strokeDasharray="4 3"
        />

        {/* Offset Hyperbolic Unit Cost Curve (High make-ready, low marginal cost) */}
        <path
          d="M 24 38 Q 68 82 154 96"
          fill="none"
          stroke={p.laserRed}
          strokeWidth="1.75"
        />

        {/* Crossover Point Marker Q* */}
        <circle cx="84" cy="82" r="5" fill={p.laserRed} />
        <line x1="84" y1="82" x2="84" y2="130" stroke={p.laserRed} strokeWidth="1" strokeDasharray={animated ? '2 2' : undefined} />
        <text x="86" y="74" fill={p.laserRed} fontSize="7.5" fontFamily="monospace" fontWeight="bold">
          Q* 1,150
        </text>
        <text x="26" y="144" fill={p.textMuted} fontSize="7" fontFamily="monospace">
          DIG (0 CTP)
        </text>
        <text x="154" y="144" textAnchor="end" fill={p.laserRed} fontSize="7" fontFamily="monospace" fontWeight="bold">
          B1 OFFSET
        </text>
      </g>

      {/* Bottom 5-Axis Breakdown Bar */}
      <rect x="16" y="226" width="368" height="22" rx="3" fill={p.badgeBg} stroke={p.gridMajor} strokeWidth="1" />
      <text x="26" y="240" fill={p.textPrimary} fontSize="7.8" fontFamily="monospace">
        PAPER 42% · CTP 11% · MAKE-READY 9% · RUN 21% · BIND 17%
      </text>
      <text x="374" y="240" textAnchor="end" fill={p.laserRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
        €2.48 / UNIT
      </text>
    </svg>
  );
};

