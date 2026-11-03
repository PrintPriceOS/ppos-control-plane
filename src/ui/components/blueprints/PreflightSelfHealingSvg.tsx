import React from 'react';
import {
  CorporateBlueprintSvgProps,
  getCorporateBlueprintPalette,
  useBlueprintTranslation,
} from './blueprintTheme';

export const PreflightSelfHealingSvg: React.FC<CorporateBlueprintSvgProps> = ({
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
      aria-labelledby="pf-svg-title pf-svg-desc"
      data-blueprint-svg="PreflightSelfHealingSvg"
    >
      <title id="pf-svg-title">
        {tr('blueprint.preflight.svgTitle', 'Preflight 2GB & Automated Spine/Bleed Self-Healing Blueprint')}
      </title>
      <desc id="pf-svg-desc">
        {tr(
          'blueprint.preflight.svgDesc',
          'Technical CAD diagram showing 3.0mm bleed synthesis vectors, parametric spine width caliper, and 6-axis PDF/X-4 validation.'
        )}
      </desc>

      <defs>
        <pattern id={`pf-grid-${theme}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="400" height="260" fill={p.canvasBg} />
      <rect x="0" y="0" width="400" height="260" fill={`url(#pf-grid-${theme})`} />

      {/* Top Dimension Label */}
      <text x="20" y="22" fill={p.laserRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        FIX-IT ENGINE · 2GB STREAMING · PDF/X-4:2010
      </text>
      <text x="380" y="22" textAnchor="end" fill={p.textMuted} fontSize="8" fontFamily="monospace">
        FOGRA39 · TAC ≤300%
      </text>

      {/* Outer Bleed Box (+3.0 mm synthesized extension) */}
      <rect
        x="48"
        y="46"
        width="216"
        height="156"
        fill={p.tintFill}
        stroke={p.laserRed}
        strokeWidth="1.25"
        strokeDasharray={animated ? '5 3' : undefined}
      />

      {/* Inner TrimBox (Back Cover + Spine + Front Cover Spread) */}
      <rect x="60" y="58" width="192" height="132" fill="none" stroke={p.textPrimary} strokeWidth="1.4" />

      {/* Parametric Spine Channel */}
      <rect
        x="146"
        y="58"
        width="20"
        height="132"
        fill={p.tintStrongFill}
        stroke={p.laserRed}
        strokeWidth="1.5"
      />
      <line x1="156" y1="50" x2="156" y2="198" stroke={p.laserRed} strokeWidth="0.9" strokeDasharray="3 2" />

      {/* Spine Caliper Dimension Arrows */}
      <line x1="146" y1="40" x2="166" y2="40" stroke={p.laserRed} strokeWidth="1.3" />
      <line x1="146" y1="35" x2="146" y2="45" stroke={p.laserRed} strokeWidth="1.3" />
      <line x1="166" y1="35" x2="166" y2="45" stroke={p.laserRed} strokeWidth="1.3" />
      <text x="156" y="34" textAnchor="middle" fill={p.laserRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
        SPINE 14.8 MM
      </text>

      {/* Corner Crop Marks */}
      <path
        d="M 42 58 L 55 58 M 60 40 L 60 53 M 257 58 L 270 58 M 252 40 L 252 53 M 42 190 L 55 190 M 60 195 L 60 208 M 257 190 L 270 190 M 252 195 L 252 208"
        stroke={p.laserRed}
        strokeWidth="1.3"
      />

      {/* Bleed Synthesis Expansion Vectors */}
      <path d="M 60 124 L 48 124 M 252 124 L 264 124" stroke={p.laserRed} strokeWidth="1.5" />
      <text x="82" y="82" fill={p.textMuted} fontSize="7.5" fontFamily="monospace">
        VERSO (C4)
      </text>
      <text x="186" y="82" fill={p.textMuted} fontSize="7.5" fontFamily="monospace">
        RECTO (C1)
      </text>
      <text x="156" y="214" textAnchor="middle" fill={p.laserRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
        +3.0 MM MIRROR BLEED SYNTHESIS
      </text>

      {/* Right Side 6-Axis Forensic Telemetry Matrix */}
      <g transform="translate(282, 46)">
        <rect x="0" y="0" width="102" height="156" rx="4" fill={p.badgeBg} stroke={p.structuralStroke} strokeWidth="1.1" />
        <text x="10" y="18" fill={p.laserRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          6-AXIS FORENSIC
        </text>
        {[
          { k: '01 TRIM/BLEED', v: 'OK' },
          { k: '02 SPINE Δ', v: '0.0mm' },
          { k: '03 DPI ≥300', v: '300' },
          { k: '04 CMYK ICC', v: 'FOGRA' },
          { k: '05 FONTS', v: '100%' },
          { k: '06 TAC INK', v: '284%' },
        ].map((row, idx) => (
          <g key={row.k} transform={`translate(8, ${32 + idx * 20})`}>
            <text x="0" y="0" fill={p.textPrimary} fontSize="7.2" fontFamily="monospace">
              {row.k}
            </text>
            <text x="86" y="0" textAnchor="end" fill={p.laserRed} fontSize="7.2" fontFamily="monospace" fontWeight="bold">
              {row.v}
            </text>
            <line x1="0" y1="5" x2="86" y2="5" stroke={p.gridMajor} strokeWidth="0.7" />
          </g>
        ))}
      </g>

      {/* Bottom Formula Bar */}
      <rect x="16" y="226" width="368" height="22" rx="3" fill={p.badgeBg} stroke={p.gridMajor} strokeWidth="1" />
      <text x="26" y="240" fill={p.textPrimary} fontSize="8" fontFamily="monospace">
        W_spine = (Pages / 2) × (GSM × Bulk / 1000)
      </text>
      <text x="374" y="240" textAnchor="end" fill={p.laserRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
        FIXED PDF READY
      </text>
    </svg>
  );
};

