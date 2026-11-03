import React from 'react';
import {
  CorporateBlueprintSvgProps,
  getCorporateBlueprintPalette,
  useBlueprintTranslation,
} from './blueprintTheme';

export const AlgorithmicRoutingMapSvg: React.FC<CorporateBlueprintSvgProps> = ({
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
      aria-labelledby="routing-svg-title routing-svg-desc"
      data-blueprint-svg="AlgorithmicRoutingMapSvg"
    >
      <title id="routing-svg-title">
        {tr('blueprint.routing.svgTitle', '5-Axis Algorithmic Routing & European Freight Topology Blueprint')}
      </title>
      <desc id="routing-svg-desc">
        {tr(
          'blueprint.routing.svgDesc',
          'Vector topological European freight map showing geodesic dispatch lines, EPAL pallet bounds, node hubs, and 5-axis scoring weights.'
        )}
      </desc>

      <defs>
        <pattern id={`routing-grid-${theme}`} width="20" height="20" patternUnits="userSpaceOnUse">
          <path d="M 20 0 L 0 0 0 20" fill="none" stroke={p.gridMinor} strokeWidth="0.7" />
        </pattern>
      </defs>

      <rect x="0" y="0" width="400" height="260" fill={p.canvasBg} />
      <rect x="0" y="0" width="400" height="260" fill={`url(#routing-grid-${theme})`} />

      <text x="20" y="22" fill={p.laserRed} fontSize="8.5" fontFamily="monospace" fontWeight="bold">
        5-AXIS ROUTING ENGINE · SSE + HMAC WEBHOOKS
      </text>
      <text x="380" y="22" textAnchor="end" fill={p.textMuted} fontSize="8" fontFamily="monospace">
        SCORE: 96.4 / 100
      </text>

      {/* Stylized European Geodesic Topology Frame */}
      <g transform="translate(16, 36)">
        <rect x="0" y="0" width="234" height="174" rx="4" fill={p.tintFill} stroke={p.structuralStroke} strokeWidth="1.2" />

        {/* Radar Range Rings centered on Central Hub */}
        <circle cx="132" cy="88" r="36" fill="none" stroke={p.gridMajor} strokeWidth="0.9" strokeDasharray="3 3" />
        <circle cx="132" cy="88" r="68" fill="none" stroke={p.gridMajor} strokeWidth="0.9" strokeDasharray="3 3" />

        {/* Geodesic Dispatch Vectors */}
        {/* Barcelona Hub (58, 138) -> Frankfurt Hub (132, 88) */}
        <path
          d="M 58 138 Q 88 96 132 88"
          fill="none"
          stroke={p.laserRed}
          strokeWidth="1.75"
          strokeDasharray={animated ? '5 3' : undefined}
        />
        {/* Frankfurt Hub (132, 88) -> Leipzig / Berlin (168, 62) */}
        <path
          d="M 132 88 Q 148 70 168 62"
          fill="none"
          stroke={p.laserRed}
          strokeWidth="1.6"
        />
        {/* Frankfurt Hub (132, 88) -> Milan Hub (138, 126) */}
        <path
          d="M 132 88 L 138 126"
          fill="none"
          stroke={p.structuralStroke}
          strokeWidth="1.2"
          strokeDasharray="3 2"
        />
        {/* Paris Buyer Node (86, 86) -> Frankfurt Hub (132, 88) */}
        <path
          d="M 86 86 L 132 88"
          fill="none"
          stroke={p.laserRed}
          strokeWidth="1.5"
        />

        {/* Node Hubs */}
        {[
          { x: 58, y: 138, label: 'BCN-NODE-01', primary: true },
          { x: 132, y: 88, label: 'FRA-HUB-DE', primary: true },
          { x: 168, y: 62, label: 'LEJ-PRESS', primary: false },
          { x: 86, y: 86, label: 'PAR-DEST', primary: false },
          { x: 138, y: 126, label: 'MIL-NODE', primary: false },
        ].map((node) => (
          <g key={node.label}>
            <circle
              cx={node.x}
              cy={node.y}
              r={node.primary ? '6' : '4'}
              fill={node.primary ? p.laserGlow : 'none'}
              stroke={p.laserRed}
              strokeWidth="1.4"
            />
            <circle cx={node.x} cy={node.y} r="2.2" fill={p.laserRed} />
            <text
              x={node.x + 8}
              y={node.y + 3}
              fill={node.primary ? p.laserRed : p.textPrimary}
              fontSize="7"
              fontFamily="monospace"
              fontWeight="bold"
            >
              {node.label}
            </text>
          </g>
        ))}

        <text x="10" y="164" fill={p.textMuted} fontSize="7.2" fontFamily="monospace">
          41.3542° N, 2.1287° E · 0.4 LDM = 740 KG
        </text>
      </g>

      {/* Right Side: 5-Axis Scoring Matrix + 3D EPAL Cubing Box */}
      <g transform="translate(260, 36)">
        <rect x="0" y="0" width="124" height="102" rx="4" fill={p.badgeBg} stroke={p.structuralStroke} strokeWidth="1.1" />
        <text x="8" y="15" fill={p.laserRed} fontSize="7.5" fontFamily="monospace" fontWeight="bold">
          5-AXIS WEIGHTS
        </text>
        {[
          { k: 'LANDED COST', w: '40%' },
          { k: 'EPAL FREIGHT', w: '30%' },
          { k: 'SLA LEAD TIME', w: '20%' },
          { k: 'OEE / RELIAB.', w: '10%' },
        ].map((item, idx) => (
          <g key={item.k} transform={`translate(8, ${30 + idx * 18})`}>
            <text x="0" y="0" fill={p.textPrimary} fontSize="7" fontFamily="monospace">
              {item.k}
            </text>
            <text x="108" y="0" textAnchor="end" fill={p.laserRed} fontSize="7" fontFamily="monospace" fontWeight="bold">
              {item.w}
            </text>
          </g>
        ))}

        {/* Isometric EPAL Euro-Pallet Wireframe (1200x800mm) */}
        <rect x="0" y="110" width="124" height="64" rx="4" fill={p.badgeBg} stroke={p.laserRed} strokeWidth="1.2" />
        <polygon
          points="62,118 104,132 62,146 20,132"
          fill={p.tintStrongFill}
          stroke={p.laserRed}
          strokeWidth="1.2"
        />
        <polyline
          points="20,132 20,148 62,162 104,148 104,132"
          fill="none"
          stroke={p.laserRed}
          strokeWidth="1.2"
        />
        <line x1="62" y1="146" x2="62" y2="162" stroke={p.laserRed} strokeWidth="1.2" />
        <text x="62" y="170" textAnchor="middle" fill={p.textPrimary} fontSize="6.8" fontFamily="monospace">
          EPAL 120×80 · SSCC-18
        </text>
      </g>

      {/* Bottom Formula Bar */}
      <rect x="16" y="226" width="368" height="22" rx="3" fill={p.badgeBg} stroke={p.gridMajor} strokeWidth="1" />
      <text x="26" y="240" fill={p.textPrimary} fontSize="7.8" fontFamily="monospace">
        HARD GATE: FORMAT + GSM + BINDING + CONGESTION &lt;92%
      </text>
      <text x="374" y="240" textAnchor="end" fill={p.laserRed} fontSize="8" fontFamily="monospace" fontWeight="bold">
        TOP-1 OPTIMAL
      </text>
    </svg>
  );
};

