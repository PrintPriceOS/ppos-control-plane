import React from 'react';
import {
  CorporateBlueprintSvgProps,
  getCorporateBlueprintPalette,
  useBlueprintTranslation,
} from './blueprintTheme';

export const TechnicalCtaBackdropSvg: React.FC<CorporateBlueprintSvgProps> = ({
  theme = 'dark',
  className = 'w-full h-full',
  animated = true,
}) => {
  const p = getCorporateBlueprintPalette(theme);
  const { tr } = useBlueprintTranslation();

  return (
    <svg
      viewBox="0 0 1200 420"
      preserveAspectRatio="xMidYMid slice"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="cta-svg-title cta-svg-desc"
      data-blueprint-svg="TechnicalCtaBackdropSvg"
    >
      <title id="cta-svg-title">
        {tr('blueprint.cta.svgTitle', 'Wide-Angle Industrial Printing Plant Architectural Blueprint Backdrop')}
      </title>
      <desc id="cta-svg-desc">
        {tr(
          'blueprint.cta.svgDesc',
          'Perspective CAD wireframe of an automated European book manufacturing facility fading into high-contrast dark vignettes behind conversion actions.'
        )}
      </desc>

      <defs>
        <pattern id={`cta-grid-${theme}`} width="30" height="30" patternUnits="userSpaceOnUse">
          <path d="M 30 0 L 0 0 0 30" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
        <radialGradient id={`cta-vignette-${theme}`} cx="50%" cy="50%" r="60%">
          <stop offset="0%" stopColor={p.canvasBg} stopOpacity="0.88" />
          <stop offset="55%" stopColor={p.canvasBg} stopOpacity="0.62" />
          <stop offset="100%" stopColor={p.canvasBg} stopOpacity="0.96" />
        </radialGradient>
        <radialGradient id={`cta-red-glow-${theme}`} cx="50%" cy="50%" r="45%">
          <stop offset="0%" stopColor={p.laserRed} stopOpacity="0.16" />
          <stop offset="100%" stopColor={p.laserRed} stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect x="0" y="0" width="1200" height="420" fill={p.canvasBg} />
      <rect x="0" y="0" width="1200" height="420" fill={`url(#cta-grid-${theme})`} />

      {/* Perspective Factory Floor Vanishing Lines */}
      <g opacity="0.45">
        {[-300, -100, 100, 300, 500, 700, 900, 1100, 1300, 1500].map((xBottom, idx) => (
          <line
            key={idx}
            x1="600"
            y1="145"
            x2={xBottom}
            y2="420"
            stroke={idx % 2 === 0 ? p.laserRed : p.structuralStroke}
            strokeWidth="1"
          />
        ))}
        {[185, 225, 270, 320, 375].map((yLine) => (
          <line key={yLine} x1="0" y1={yLine} x2="1200" y2={yLine} stroke={p.structuralStroke} strokeWidth="0.9" />
        ))}
      </g>

      {/* Left Wing: B1 Sheetfed Press Silhouettes */}
      <g opacity="0.55" transform="translate(40, 140)">
        {[0, 1, 2, 3, 4, 5].map((u) => (
          <g key={u} transform={`translate(${u * 44}, 0)`}>
            <rect x="0" y="0" width="36" height="120" fill="none" stroke={p.laserRed} strokeWidth="1.2" />
            <circle cx="18" cy="34" r="9" fill="none" stroke={p.laserRed} strokeWidth="1" />
            <circle cx="18" cy="68" r="11" fill="none" stroke={p.structuralStroke} strokeWidth="1" />
          </g>
        ))}
        <line x1="-10" y1="120" x2="275" y2="120" stroke={p.laserRed} strokeWidth="1.6" />
        <text x="0" y="-10" fill={p.laserRed} fontSize="9" fontFamily="monospace" fontWeight="bold">
          BAY A · B1 OFFSET LINE (18,000 CPH)
        </text>
      </g>

      {/* Right Wing: Automated PUR Binding & EPAL Dispatch Dock */}
      <g opacity="0.55" transform="translate(880, 140)">
        <rect x="0" y="18" width="160" height="102" fill="none" stroke={p.laserRed} strokeWidth="1.2" />
        <rect x="180" y="42" width="84" height="78" fill="none" stroke={p.laserRed} strokeWidth="1.2" />
        <line x1="0" y1="120" x2="275" y2="120" stroke={p.laserRed} strokeWidth="1.6" />
        <text x="264" y="-10" textAnchor="end" fill={p.laserRed} fontSize="9" fontFamily="monospace" fontWeight="bold">
          BAY B · PUR BINDERY &amp; GS1-128 EPAL DOCK
        </text>
      </g>

      {/* Continuous Laser Telemetry Bus */}
      <path
        d="M 0 260 L 1200 260"
        fill="none"
        stroke={p.laserRed}
        strokeWidth="1.4"
        strokeDasharray={animated ? '10 6' : undefined}
        opacity="0.6"
      />

      {/* Center Readability Vignette & Crimson Atmospheric Glow */}
      <rect x="0" y="0" width="1200" height="420" fill={`url(#cta-vignette-${theme})`} />
      <ellipse cx="600" cy="210" rx="420" ry="180" fill={`url(#cta-red-glow-${theme})`} />
    </svg>
  );
};

