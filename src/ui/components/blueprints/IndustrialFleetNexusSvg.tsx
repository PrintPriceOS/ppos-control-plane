import React from 'react';
import {
  BlueprintHotspot,
  CorporateBlueprintSvgProps,
  getCorporateBlueprintPalette,
  useBlueprintTranslation,
} from './blueprintTheme';

export const INDUSTRIAL_FLEET_NEXUS_HOTSPOTS: BlueprintHotspot[] = [
  {
    id: 'preflight-gate',
    x: 92,
    y: 165,
    code: 'PF-01',
    titleKey: 'blueprint.nexus.hs.preflight.title',
    titleFallback: 'Preflight 2GB Gate',
    metricKey: 'blueprint.nexus.hs.preflight.metric',
    metricFallback: 'PDF/X-4 · 3.0mm Bleed Auto-Fix',
    specKey: 'blueprint.nexus.hs.preflight.spec',
    specFallback: '6-axis forensic scanner & parametric spine caliper',
  },
  {
    id: 'b1-offset-line',
    x: 345,
    y: 145,
    code: 'PR-08',
    titleKey: 'blueprint.nexus.hs.press.title',
    titleFallback: '8-Unit B1 Offset Line',
    metricKey: 'blueprint.nexus.hs.press.metric',
    metricFallback: 'B1 Feeder: 18,000 cph · 4/4 Perfecting',
    specKey: 'blueprint.nexus.hs.press.spec',
    specFallback: '700×1000mm sheetfed · Closed-loop spectrophotometry',
  },
  {
    id: 'conveyor-bridge',
    x: 590,
    y: 170,
    code: 'CV-03',
    titleKey: 'blueprint.nexus.hs.conveyor.title',
    titleFallback: 'Signature Conveyor Bridge',
    metricKey: 'blueprint.nexus.hs.conveyor.metric',
    metricFallback: '16pp Signatures · CIP4 JDF Sync',
    specKey: 'blueprint.nexus.hs.conveyor.spec',
    specFallback: 'Automated signature buffer & optical barcode verification',
  },
  {
    id: 'pur-binder',
    x: 745,
    y: 155,
    code: 'BN-12',
    titleKey: 'blueprint.nexus.hs.binder.title',
    titleFallback: 'Automated PUR Binder',
    metricKey: 'blueprint.nexus.hs.binder.metric',
    metricFallback: 'PUR Spine Milling · 7,000 books/h',
    specKey: 'blueprint.nexus.hs.binder.spec',
    specFallback: '18-clamp rotary gatherer + inline 3-knife trimmer',
  },
  {
    id: 'epal-robot',
    x: 910,
    y: 165,
    code: 'LG-18',
    titleKey: 'blueprint.nexus.hs.pallet.title',
    titleFallback: 'EPAL Palletizing Robot',
    metricKey: 'blueprint.nexus.hs.pallet.metric',
    metricFallback: 'SSCC-18 Label · 120×80cm Euro-Pallet',
    specKey: 'blueprint.nexus.hs.pallet.spec',
    specFallback: '3D FEFCO 0201 carton cubing & automated CMR dispatch',
  },
];

export const IndustrialFleetNexusSvg: React.FC<CorporateBlueprintSvgProps> = ({
  theme = 'dark',
  className = 'w-full h-full',
  animated = true,
  activeHotspotId = null,
  onHoverHotspot,
  sandboxMode = 'offset',
}) => {
  const p = getCorporateBlueprintPalette(theme);
  const { tr } = useBlueprintTranslation();
  const units = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <svg
      viewBox="0 0 1000 340"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-labelledby="nexus-svg-title nexus-svg-desc"
      data-blueprint-svg="IndustrialFleetNexusSvg"
    >
      <title id="nexus-svg-title">
        {tr(
          'blueprint.nexus.svgTitle',
          'PrintPrice OS End-to-End Industrial Elevation Schematic (Preflight to EPAL Dispatch)'
        )}
      </title>
      <desc id="nexus-svg-desc">
        {tr(
          'blueprint.nexus.svgDesc',
          'Technical CAD elevation cross-section showing the Digital Preflight Sensor Gate, 8-Unit B1 Offset Press Line, Conveyor Bridge, Automated PUR Binder, and EPAL Palletizing Robot.'
        )}
      </desc>

      <defs>
        <pattern id={`nexus-grid-minor-${theme}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
        <pattern id={`nexus-grid-major-${theme}`} width="100" height="100" patternUnits="userSpaceOnUse">
          <rect width="100" height="100" fill={`url(#nexus-grid-minor-${theme})`} />
          <path d="M 100 0 L 0 0 0 100" fill="none" stroke={p.gridMajor} strokeWidth="1.1" />
        </pattern>
        <radialGradient id={`nexus-laser-glow-${theme}`} cx="50%" cy="50%" r="55%">
          <stop offset="0%" stopColor={p.laserRed} stopOpacity={theme === 'dark' ? '0.18' : '0.08'} />
          <stop offset="100%" stopColor={p.laserRed} stopOpacity="0" />
        </radialGradient>

        {/* Reusable Offset Printing Unit Tower */}
        <g id="nexus-press-tower">
          <rect x="0" y="0" width="32" height="108" rx="2" fill={p.tintFill} stroke={p.laserRed} strokeWidth="1.35" />
          <circle cx="16" cy="24" r="7" fill="none" stroke={p.laserRed} strokeWidth="1.1" />
          <circle cx="16" cy="46" r="8.5" fill="none" stroke={p.laserRed} strokeWidth="1.3" />
          <circle cx="16" cy="72" r="10" fill="none" stroke={p.structuralStroke} strokeWidth="1.1" />
          <line x1="4" y1="92" x2="28" y2="92" stroke={p.mutedStroke} strokeWidth="1" />
        </g>
      </defs>

      {/* Canvas & Millimeter Blueprint Grid */}
      <rect x="0" y="0" width="1000" height="340" fill={p.canvasBg} />
      <rect x="0" y="0" width="1000" height="340" fill={`url(#nexus-grid-major-${theme})`} />
      <ellipse cx="500" cy="175" rx="440" ry="135" fill={`url(#nexus-laser-glow-${theme})`} />

      {/* Top CAD Dimension Ruler */}
      <g>
        <line x1="30" y1="28" x2="970" y2="28" stroke={p.dimensionLine} strokeWidth="1" strokeDasharray="4 3" />
        <line x1="30" y1="21" x2="30" y2="35" stroke={p.laserRed} strokeWidth="1.5" />
        <line x1="970" y1="21" x2="970" y2="35" stroke={p.laserRed} strokeWidth="1.5" />
        <text x="500" y="21" textAnchor="middle" fill={p.textPrimary} fontSize="9.5" fontFamily="monospace" fontWeight="bold">
          PPOS-SCADA-NEXUS · L=34,800 MM · {sandboxMode === 'digital' ? 'HP INDIGO 100K B2 + HORIZON BQ' : sandboxMode === 'logistics' ? '3D CUBING + GS1-128 EPAL DISPATCH' : 'HEIDELBERG XL 106-8P + MÜLLER MARTINI ALEGRO'} · SCALE 1:75
        </text>
      </g>

      {/* Plant Floor Datum Line */}
      <rect x="24" y="252" width="952" height="10" fill={p.tintFill} stroke={p.structuralStroke} strokeWidth="1.2" />
      <line x1="16" y1="262" x2="984" y2="262" stroke={p.laserRed} strokeWidth="1.75" />

      {/* STAGE 1: DIGITAL PREFLIGHT SENSOR GATE (X: 36 -> 148) */}
      <g
        data-hotspot-id="preflight-gate"
        onMouseEnter={() => onHoverHotspot?.(INDUSTRIAL_FLEET_NEXUS_HOTSPOTS[0])}
        style={{ cursor: 'pointer' }}
      >
        <rect
          x="38"
          y="108"
          width="106"
          height="144"
          rx="4"
          fill={activeHotspotId === 'preflight-gate' ? p.tintStrongFill : p.tintFill}
          stroke={p.laserRed}
          strokeWidth={activeHotspotId === 'preflight-gate' ? '2' : '1.5'}
        />
        {/* Optical Laser Scanner Portal */}
        <rect x="52" y="126" width="78" height="58" fill="none" stroke={p.structuralStroke} strokeWidth="1.1" />
        <line x1="52" y1="155" x2="130" y2="155" stroke={p.laserRed} strokeWidth="1.6" strokeDasharray="3 2" />
        <line x1="91" y1="126" x2="91" y2="184" stroke={p.laserRed} strokeWidth="1" strokeDasharray="2 2" />
        {/* Spine & Bleed Caliper Iconography */}
        <rect x="68" y="136" width="46" height="38" fill="none" stroke={p.laserRed} strokeWidth="1.3" />
        <rect x="63" y="131" width="56" height="48" fill="none" stroke={p.laserRed} strokeWidth="0.8" strokeDasharray="2 2" />
        <text x="91" y="98" textAnchor="middle" fill={p.laserRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
          01 · PREFLIGHT 2GB GATE
        </text>
        <text x="91" y="204" textAnchor="middle" fill={p.textPrimary} fontSize="8" fontFamily="monospace">
          PDF/X-4 · +3MM BLEED
        </text>
        <text x="91" y="218" textAnchor="middle" fill={p.textMuted} fontSize="7.5" fontFamily="monospace">
          SPINE Δ ±0.1 MM
        </text>
      </g>

      {/* STAGE 2: 8-UNIT B1 OFFSET PRESS LINE / DIGITAL PRESS (X: 175 -> 535) */}
      <g
        data-hotspot-id="b1-offset-line"
        onMouseEnter={() => onHoverHotspot?.(INDUSTRIAL_FLEET_NEXUS_HOTSPOTS[1])}
        style={{ cursor: 'pointer' }}
      >
        {/* Feeder Infeed */}
        <rect
          x="175"
          y="128"
          width="44"
          height="124"
          fill={activeHotspotId === 'b1-offset-line' ? p.tintStrongFill : p.tintFill}
          stroke={p.laserRed}
          strokeWidth="1.5"
        />
        <line x1="183" y1="155" x2="211" y2="155" stroke={p.laserRed} strokeWidth="1" />
        <line x1="183" y1="175" x2="211" y2="175" stroke={p.laserRed} strokeWidth="1" />
        <line x1="183" y1="195" x2="211" y2="195" stroke={p.laserRed} strokeWidth="1" />

        {/* 8 Printing Units via <use> */}
        {units.map((u) => {
          const x = 224 + u * 35 + (u >= 4 ? 16 : 0);
          return (
            <g key={u} transform={`translate(${x}, 144)`}>
              <use href="#nexus-press-tower" />
              <text x="16" y="-6" textAnchor="middle" fill={p.textMuted} fontSize="7.5" fontFamily="monospace">
                U{u + 1}
              </text>
            </g>
          );
        })}

        {/* Perfecting Drum between U4 and U5 */}
        <rect x="364" y="164" width="14" height="88" fill={p.tintStrongFill} stroke={p.laserRed} strokeWidth="1.3" />
        <circle cx="371" cy="196" r="5" fill="none" stroke={p.laserRed} strokeWidth="1.2" />

        {/* Overhead Gallery Catwalk */}
        <line x1="175" y1="122" x2="532" y2="122" stroke={p.structuralStroke} strokeWidth="1.2" strokeDasharray="6 3" />
        <text x="355" y="98" textAnchor="middle" fill={p.laserRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
          {sandboxMode === 'digital'
            ? '02 · B2 DIGITAL LEP / INKJET DUPLEX LINE (6,000 SPH)'
            : '02 · 8-UNIT B1 SHEETFED OFFSET LINE (18,000 CPH)'}
        </text>
      </g>

      {/* STAGE 3: CONVEYOR BRIDGE & JDF BUFFER (X: 545 -> 635) */}
      <g
        data-hotspot-id="conveyor-bridge"
        onMouseEnter={() => onHoverHotspot?.(INDUSTRIAL_FLEET_NEXUS_HOTSPOTS[2])}
        style={{ cursor: 'pointer' }}
      >
        <rect
          x="546"
          y="168"
          width="86"
          height="32"
          rx="3"
          fill={activeHotspotId === 'conveyor-bridge' ? p.tintStrongFill : p.tintFill}
          stroke={p.laserRed}
          strokeWidth="1.4"
        />
        <line x1="560" y1="200" x2="560" y2="252" stroke={p.structuralStroke} strokeWidth="1.4" />
        <line x1="618" y1="200" x2="618" y2="252" stroke={p.structuralStroke} strokeWidth="1.4" />
        {/* Rollers */}
        {[558, 574, 590, 606, 622].map((cx) => (
          <circle key={cx} cx={cx} cy="184" r="5" fill="none" stroke={p.laserRed} strokeWidth="1.1" />
        ))}
        <text x="589" y="152" textAnchor="middle" fill={p.laserRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
          03 · JDF BRIDGE
        </text>
      </g>

      {/* STAGE 4: AUTOMATED PUR PERFECT BINDER & 3-KNIFE TRIMMER (X: 646 -> 825) */}
      <g
        data-hotspot-id="pur-binder"
        onMouseEnter={() => onHoverHotspot?.(INDUSTRIAL_FLEET_NEXUS_HOTSPOTS[3])}
        style={{ cursor: 'pointer' }}
      >
        <rect
          x="648"
          y="126"
          width="174"
          height="126"
          rx="4"
          fill={activeHotspotId === 'pur-binder' ? p.tintStrongFill : p.tintFill}
          stroke={p.laserRed}
          strokeWidth={activeHotspotId === 'pur-binder' ? '2' : '1.5'}
        />
        {/* Spine Milling & PUR Glue Pot */}
        <rect x="664" y="148" width="46" height="44" fill="none" stroke={p.laserRed} strokeWidth="1.3" />
        <circle cx="687" cy="170" r="11" fill="none" stroke={p.laserRed} strokeWidth="1.3" strokeDasharray="3 2" />
        {/* Cover Nipping & 3-Knife Trimmer */}
        <rect x="720" y="148" width="42" height="44" fill="none" stroke={p.structuralStroke} strokeWidth="1.2" />
        <rect x="770" y="140" width="38" height="60" fill="none" stroke={p.laserRed} strokeWidth="1.4" />
        <line x1="776" y1="152" x2="802" y2="188" stroke={p.laserRed} strokeWidth="1.5" />
        <text x="735" y="98" textAnchor="middle" fill={p.laserRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
          04 · PUR BINDER &amp; 3-KNIFE TRIMMER
        </text>
        <text x="735" y="218" textAnchor="middle" fill={p.textPrimary} fontSize="8" fontFamily="monospace">
          MILLING 3.0MM · PUR NOZZLE 140°C
        </text>
      </g>

      {/* STAGE 5: EPAL PALLETIZING ROBOT & GS1-128 SSCC GATE (X: 838 -> 965) */}
      <g
        data-hotspot-id="epal-robot"
        onMouseEnter={() => onHoverHotspot?.(INDUSTRIAL_FLEET_NEXUS_HOTSPOTS[4])}
        style={{ cursor: 'pointer' }}
      >
        {/* Articulated Robotic Arm */}
        <rect x="846" y="218" width="28" height="34" fill={p.tintFill} stroke={p.laserRed} strokeWidth="1.5" />
        <path
          d="M 860 218 L 876 154 L 916 144 L 916 168"
          fill="none"
          stroke={p.laserRed}
          strokeWidth="2"
        />
        <circle cx="860" cy="218" r="5" fill={p.laserRed} />
        <circle cx="876" cy="154" r="5" fill={p.laserRed} />
        {/* Vacuum Gripper & Stacked EPAL Pallet */}
        <line x1="904" y1="168" x2="928" y2="168" stroke={p.laserRed} strokeWidth="2" />
        <rect
          x="892"
          y="176"
          width="64"
          height="64"
          fill={activeHotspotId === 'epal-robot' ? p.tintStrongFill : p.tintFill}
          stroke={p.laserRed}
          strokeWidth="1.4"
        />
        {/* FEFCO Cartons Grid */}
        <line x1="892" y1="198" x2="956" y2="198" stroke={p.laserRed} strokeWidth="1" />
        <line x1="892" y1="220" x2="956" y2="220" stroke={p.laserRed} strokeWidth="1" />
        <line x1="924" y1="176" x2="924" y2="240" stroke={p.laserRed} strokeWidth="1" />
        {/* Euro-Pallet Base */}
        <rect x="888" y="240" width="72" height="12" fill={p.tintStrongFill} stroke={p.laserRed} strokeWidth="1.5" />
        <text x="908" y="98" textAnchor="middle" fill={p.laserRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
          05 · EPAL + SSCC-18
        </text>
      </g>

      {/* ACTIVE PULSING LASER TELEMETRY STREAM ACROSS ENTIRE PLANT */}
      <path
        d="M 90 165 L 195 165 L 365 184 L 590 184 L 735 175 L 924 195"
        fill="none"
        stroke={p.laserRed}
        strokeWidth="1.75"
        strokeDasharray={animated ? '8 5' : undefined}
      >
        {animated && (
          <animate
            attributeName="stroke-dashoffset"
            from="52"
            to="0"
            dur="2.2s"
            repeatCount="indefinite"
          />
        )}
      </path>

      {/* Hotspot Beacon Markers */}
      {INDUSTRIAL_FLEET_NEXUS_HOTSPOTS.map((hs) => {
        const isActive = activeHotspotId === hs.id;
        return (
          <g
            key={hs.id}
            onMouseEnter={() => onHoverHotspot?.(hs)}
            style={{ cursor: 'pointer' }}
          >
            <circle
              cx={hs.x}
              cy={hs.y}
              r={isActive ? '9' : '6'}
              fill={p.laserGlow}
              stroke={p.laserRed}
              strokeWidth="1.2"
            />
            <circle cx={hs.x} cy={hs.y} r="3" fill={p.laserRed} />
          </g>
        );
      })}

      {/* Bottom SCADA Telemetry Strip */}
      <rect x="24" y="282" width="952" height="36" rx="4" fill={p.badgeBg} stroke={p.gridMajor} strokeWidth="1" />
      <text x="40" y="304" fill={p.laserRed} fontSize="9" fontFamily="monospace" fontWeight="bold">
        LIVE TELEMETRY BUS · SSE &lt;500MS
      </text>
      <text x="275" y="304" fill={p.textPrimary} fontSize="8.5" fontFamily="monospace">
        CTP PLATES: AUTO-IMPOSED
      </text>
      <text x="465" y="304" fill={p.textPrimary} fontSize="8.5" fontFamily="monospace">
        CROSSOVER Q*: 1,150 COPIES
      </text>
      <text x="670" y="304" fill={p.textPrimary} fontSize="8.5" fontFamily="monospace">
        ESCROW MoR: SHA-256 LOCKED
      </text>
      <text x="958" y="304" textAnchor="end" fill={p.laserRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        ISO 12647-2 · EN 16931
      </text>
    </svg>
  );
};

