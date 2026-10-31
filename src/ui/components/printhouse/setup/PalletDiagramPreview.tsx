import React from 'react';
import { Layers, ShieldCheck, Maximize2, ArrowUpDown } from 'lucide-react';

export interface PalletDiagramPreviewProps {
    locale?: 'en' | 'de' | 'es';
    maxHeightMm?: number;
    perimeterSetbackMm?: number;
    layersCount?: number;
}

const DIAGRAM_I18N = {
    en: {
        headerTitle: '3D ISOMETRIC PALLETIZATION BLUEPRINT (EUR-EPAL 1200 × 800 MM)',
        scaleBadge: '3D Isometric Scale • Editorial Hub Compliant',
        topCardboard: 'Top protective cardboard',
        edgeProtector: 'Edge protector',
        stretchFoil: 'Stretch foil',
        interlockingLayers: 'Book cartons in interlocking layers',
        bottomCardboard: 'Bottom gray cardboard',
        strappingBands: 'Plastic strapping bands',
        epalPallet: 'EPAL Euro-pallet',
        palletContentSheet: 'Pallet Content Label (GS1-128 / SSCC)',
        maxHeightLabel: 'max height',
        kpiFootprint: 'Standard EPAL Footprint',
        kpiFootprintVal: '1,200 × 800 mm (0.4 LDM)',
        kpiTiling: 'Interlocked Tiling Pattern',
        kpiTilingVal: 'Cross-stacked FEFCO 0201 layers',
        kpiHeight: 'Max Height Limit (1,200mm / 1,300mm)',
        kpiHeightVal: '1,200 mm (Zeitfracht) / 1,300 mm (VVA)',
        kpiMargin: 'Edge Margin: 30mm',
        kpiMarginVal: 'Zero overhang • 30 mm setback'
    },
    de: {
        headerTitle: '3D-ISOMETRISCHES PALETTIERSCHEMA (EUR-EPAL 1200 × 800 MM)',
        scaleBadge: '3D-Isometrie • Verlagsauslieferung-konform',
        topCardboard: 'Obere Schutzpappe (Deckel)',
        edgeProtector: 'Kantenschutzleisten',
        stretchFoil: 'Stretchfolie (Wicklung)',
        interlockingLayers: 'Buchkartons im Kreuzverband',
        bottomCardboard: 'Untere Graupappe (Zwischenlage)',
        strappingBands: 'Kunststoff-Umreifungsbänder',
        epalPallet: 'EPAL-Europalette',
        palletContentSheet: 'Paletten-Inhaltsblatt (GS1-128 / NVE)',
        maxHeightLabel: 'max. Gesamthöhe',
        kpiFootprint: 'Standard EPAL Footprint',
        kpiFootprintVal: '1.200 × 800 mm (0,4 LDM)',
        kpiTiling: 'Interlocked Tiling Pattern',
        kpiTilingVal: 'Kreuzverband FEFCO 0201 Lagen',
        kpiHeight: 'Max Height Limit (1,200mm / 1,300mm)',
        kpiHeightVal: '1.200 mm (Zeitfracht) / 1.300 mm (VVA)',
        kpiMargin: 'Edge Margin: 30mm',
        kpiMarginVal: 'Kein Überstand • 30 mm Rücksprung'
    }
} as const;

export const PalletDiagramPreview: React.FC<PalletDiagramPreviewProps> = ({
    locale = 'en',
    maxHeightMm = 1200,
    perimeterSetbackMm = 30
}) => {
    const lang = locale === 'de' ? 'de' : 'en';
    const copy = DIAGRAM_I18N[lang];

    return (
        <div
            data-testid="pallet-diagram-preview"
            className="rounded-xl border border-zinc-800 bg-[#14171f] text-zinc-100 p-4 shadow-md space-y-4"
        >
            {/* Top Technical Bar */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-800/80 pb-3">
                <div className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full bg-[#dc0000]" />
                    <span className="text-[11px] font-bold tracking-wider uppercase text-zinc-200">
                        {copy.headerTitle}
                    </span>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700/80 text-zinc-400">
                    {copy.scaleBadge}
                </span>
            </div>

            {/* Isometric Technical SVG Blueprint */}
            <div className="relative w-full overflow-hidden rounded-lg bg-[#191d26] border border-zinc-800/90 p-2">
                <svg
                    viewBox="0 0 880 430"
                    className="w-full h-auto max-h-[340px] select-none"
                    role="img"
                    aria-label={copy.headerTitle}
                >
                    <defs>
                        <pattern id="isoGrid" width="24" height="24" patternUnits="userSpaceOnUse">
                            <path
                                d="M 24 0 L 0 0 0 24"
                                fill="none"
                                stroke="#262b38"
                                strokeWidth="0.7"
                            />
                        </pattern>
                        <linearGradient id="cartonLeftFace" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#9c8468" />
                            <stop offset="100%" stopColor="#806a50" />
                        </linearGradient>
                        <linearGradient id="cartonRightFace" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#8b7357" />
                            <stop offset="100%" stopColor="#6e5941" />
                        </linearGradient>
                        <linearGradient id="topLidGrad" x1="0" y1="0" x2="1" y2="1">
                            <stop offset="0%" stopColor="#9ca3af" />
                            <stop offset="100%" stopColor="#6b7280" />
                        </linearGradient>
                    </defs>

                    {/* Technical Blueprint Grid */}
                    <rect x="8" y="8" width="864" height="414" fill="url(#isoGrid)" stroke="#2e3444" strokeWidth="1" />

                    {/* ================= EPAL EURO-PALLET BASE (1200 x 800 mm) ================= */}
                    {/* Pallet Left Base Side (800 mm) */}
                    <polygon
                        points="260,295 405,375 405,402 260,322"
                        fill="#2d333f"
                        stroke="#94a3b8"
                        strokeWidth="1.2"
                    />
                    {/* Pallet Right Base Side (1200 mm) */}
                    <polygon
                        points="405,375 615,260 615,287 405,402"
                        fill="#232832"
                        stroke="#94a3b8"
                        strokeWidth="1.2"
                    />
                    {/* Pallet Deck Top Rim */}
                    <polygon
                        points="260,295 470,180 615,260 405,375"
                        fill="#3b4252"
                        stroke="#cbd5e1"
                        strokeWidth="1.1"
                    />
                    {/* Pallet Forklift Cavities (Left 800mm side) */}
                    <polygon points="282,315 322,337 322,350 282,328" fill="#111318" stroke="#64748b" strokeWidth="0.8" />
                    <polygon points="348,351 388,373 388,386 348,364" fill="#111318" stroke="#64748b" strokeWidth="0.8" />
                    {/* Pallet Forklift Cavities (Right 1200mm side) */}
                    <polygon points="435,365 488,336 488,350 435,379" fill="#111318" stroke="#64748b" strokeWidth="0.8" />
                    <polygon points="528,314 580,285 580,299 528,328" fill="#111318" stroke="#64748b" strokeWidth="0.8" />
                    {/* EPAL Stamp Badges */}
                    <ellipse cx="416" cy="382" rx="11" ry="6" fill="#1e293b" stroke="#cbd5e1" strokeWidth="1" />
                    <text x="416" y="385" textAnchor="middle" fill="#e2e8f0" fontSize="6.5" fontWeight="bold">EPAL</text>
                    <ellipse cx="601" cy="280" rx="11" ry="6" fill="#1e293b" stroke="#cbd5e1" strokeWidth="1" />
                    <text x="601" y="283" textAnchor="middle" fill="#e2e8f0" fontSize="6.5" fontWeight="bold">EPAL</text>

                    {/* ================= BOTTOM GRAY CARDBOARD SLIP SHEET ================= */}
                    <polygon
                        points="268,288 470,177 607,253 405,364"
                        fill="#6b7280"
                        stroke="#d1d5db"
                        strokeWidth="1"
                    />

                    {/* ================= STACKED BOOK CARTONS (INTERLOCKED LAYERS) ================= */}
                    {/* Left Carton Stack Face (800 mm width minus 30mm setback) */}
                    <polygon
                        points="268,128 405,204 405,364 268,288"
                        fill="url(#cartonLeftFace)"
                        stroke="#e5e7eb"
                        strokeWidth="1.2"
                    />
                    {/* Right Carton Stack Face (1200 mm length minus 30mm setback) */}
                    <polygon
                        points="405,204 607,93 607,253 405,364"
                        fill="url(#cartonRightFace)"
                        stroke="#e5e7eb"
                        strokeWidth="1.2"
                    />

                    {/* Horizontal Layer Joint Lines (5 layers on Left Face) */}
                    {[1, 2, 3, 4].map((layerIdx) => {
                        const yLeft = 128 + layerIdx * 32;
                        const yMid = 204 + layerIdx * 32;
                        const yRight = 93 + layerIdx * 32;
                        return (
                            <g key={layerIdx} stroke="#3f3326" strokeWidth="1.1">
                                <line x1="268" y1={yLeft} x2="405" y2={yMid} />
                                <line x1="405" y1={yMid} x2="607" y2={yRight} />
                            </g>
                        );
                    })}

                    {/* Interlocked Vertical Brick Joints on Right Face */}
                    <line x1="472" y1="167" x2="472" y2="199" stroke="#3f3326" strokeWidth="1.1" />
                    <line x1="540" y1="130" x2="540" y2="162" stroke="#3f3326" strokeWidth="1.1" />
                    <line x1="505" y1="181" x2="505" y2="213" stroke="#3f3326" strokeWidth="1.1" />
                    <line x1="568" y1="146" x2="568" y2="178" stroke="#3f3326" strokeWidth="1.1" />
                    <line x1="472" y1="231" x2="472" y2="263" stroke="#3f3326" strokeWidth="1.1" />
                    <line x1="540" y1="194" x2="540" y2="226" stroke="#3f3326" strokeWidth="1.1" />
                    <line x1="505" y1="245" x2="505" y2="277" stroke="#3f3326" strokeWidth="1.1" />
                    <line x1="472" y1="295" x2="472" y2="327" stroke="#3f3326" strokeWidth="1.1" />

                    {/* ================= TOP PROTECTIVE CARDBOARD LID ================= */}
                    <polygon
                        points="268,128 470,17 607,93 405,204"
                        fill="url(#topLidGrad)"
                        stroke="#f3f4f6"
                        strokeWidth="1.4"
                    />

                    {/* ================= CORNER EDGE PROTECTORS (BROWN KRAFT ANGLES) ================= */}
                    <polygon points="268,128 286,118 286,142 268,152" fill="#b4834e" stroke="#27272a" strokeWidth="1" />
                    <polygon points="268,128 284,137 284,160 268,151" fill="#9a6b3b" stroke="#27272a" strokeWidth="1" />
                    <polygon points="405,204 388,194 405,184 422,194" fill="#c08e57" stroke="#27272a" strokeWidth="1" />
                    <polygon points="405,204 388,194 388,218 405,228" fill="#9a6b3b" stroke="#27272a" strokeWidth="1" />
                    <polygon points="405,204 422,194 422,218 405,228" fill="#855a2f" stroke="#27272a" strokeWidth="1" />
                    <polygon points="607,93 589,83 607,73 607,93" fill="#b4834e" stroke="#27272a" strokeWidth="1" />

                    {/* ================= PLASTIC STRAPPING BANDS (2X2 CROSS BANDS) ================= */}
                    {/* Band 1 & 2 across Left Face -> Top Lid */}
                    <line x1="312" y1="313" x2="312" y2="152" stroke="#1f2937" strokeWidth="4" />
                    <line x1="312" y1="152" x2="514" y2="41" stroke="#1f2937" strokeWidth="4" />
                    <line x1="364" y1="341" x2="364" y2="181" stroke="#1f2937" strokeWidth="4" />
                    <line x1="364" y1="181" x2="566" y2="70" stroke="#1f2937" strokeWidth="4" />

                    {/* Band 3 & 4 across Right Face -> Top Lid */}
                    <line x1="468" y1="329" x2="468" y2="169" stroke="#1f2937" strokeWidth="4" />
                    <line x1="331" y1="93" x2="468" y2="169" stroke="#1f2937" strokeWidth="4" />
                    <line x1="546" y1="286" x2="546" y2="126" stroke="#1f2937" strokeWidth="4" />
                    <line x1="409" y1="50" x2="546" y2="126" stroke="#1f2937" strokeWidth="4" />

                    {/* ================= GS1-128 / SSCC PALLET CONTENT SHEET ================= */}
                    <polygon
                        points="318,185 362,210 362,265 318,240"
                        fill="#f8fafc"
                        stroke="#475569"
                        strokeWidth="1.1"
                    />
                    <line x1="323" y1="198" x2="357" y2="217" stroke="#0f172a" strokeWidth="1.5" />
                    <line x1="323" y1="206" x2="352" y2="222" stroke="#64748b" strokeWidth="1" />
                    <line x1="323" y1="214" x2="355" y2="232" stroke="#64748b" strokeWidth="1" />
                    <line x1="323" y1="226" x2="357" y2="245" stroke="#0f172a" strokeWidth="2.2" strokeDasharray="2,1" />

                    {/* ================= RED TECHNICAL DIMENSION CALLOUTS ================= */}
                    {/* 800 mm Width Dimension (Bottom Left) */}
                    <line x1="252" y1="330" x2="395" y2="410" stroke="#dc0000" strokeWidth="1.8" />
                    <line x1="260" y1="322" x2="245" y2="335" stroke="#dc0000" strokeWidth="1" />
                    <line x1="405" y1="402" x2="390" y2="415" stroke="#dc0000" strokeWidth="1" />
                    <text
                        x="312"
                        y="386"
                        fill="#ef4444"
                        fontSize="12"
                        fontWeight="bold"
                        transform="rotate(29 312,386)"
                    >
                        800 mm
                    </text>

                    {/* 1200 mm Length Dimension (Bottom Right) */}
                    <line x1="418" y1="410" x2="625" y2="295" stroke="#dc0000" strokeWidth="1.8" />
                    <line x1="405" y1="402" x2="422" y2="414" stroke="#dc0000" strokeWidth="1" />
                    <line x1="615" y1="287" x2="630" y2="298" stroke="#dc0000" strokeWidth="1" />
                    <text
                        x="518"
                        y="372"
                        fill="#ef4444"
                        fontSize="12"
                        fontWeight="bold"
                        transform="rotate(-29 518,372)"
                    >
                        1200 mm
                    </text>

                    {/* <= 1200 mm / 1300 mm Height Limit Callout (Right Vertical) */}
                    <line x1="607" y1="93" x2="652" y2="68" stroke="#dc0000" strokeWidth="1" />
                    <line x1="615" y1="287" x2="652" y2="266" stroke="#dc0000" strokeWidth="1" />
                    <line x1="646" y1="72" x2="646" y2="269" stroke="#dc0000" strokeWidth="1.8" />
                    <polygon points="646,72 642,81 650,81" fill="#dc0000" />
                    <polygon points="646,269 642,260 650,260" fill="#dc0000" />
                    <text
                        x="666"
                        y="175"
                        fill="#ef4444"
                        fontSize="12"
                        fontWeight="bold"
                        textAnchor="middle"
                        transform="rotate(-90 666,175)"
                    >
                        {`<= ${maxHeightMm} mm`}
                    </text>
                    <text
                        x="682"
                        y="175"
                        fill="#94a3b8"
                        fontSize="10"
                        textAnchor="middle"
                        transform="rotate(-90 682,175)"
                    >
                        {copy.maxHeightLabel}
                    </text>

                    {/* ================= CALLOUT LEADER LINES & ANNOTATIONS ================= */}
                    {/* Top Protective Cardboard */}
                    <polyline points="415,82 375,42 290,42" fill="none" stroke="#cbd5e1" strokeWidth="1" />
                    <circle cx="415" cy="82" r="2.5" fill="#fbbf24" />
                    <text x="284" y="45" textAnchor="end" fill="#f8fafc" fontSize="11" fontWeight="600">
                        {copy.topCardboard}
                    </text>

                    {/* Edge Protector */}
                    <polyline points="275,134 240,98 195,98" fill="none" stroke="#cbd5e1" strokeWidth="1" />
                    <circle cx="275" cy="134" r="2.5" fill="#fbbf24" />
                    <text x="189" y="101" textAnchor="end" fill="#f8fafc" fontSize="11" fontWeight="600">
                        {copy.edgeProtector}
                    </text>

                    {/* Stretch Foil */}
                    <polyline points="274,195 215,195" fill="none" stroke="#cbd5e1" strokeWidth="1" />
                    <circle cx="274" cy="195" r="2.5" fill="#fbbf24" />
                    <text x="209" y="198" textAnchor="end" fill="#f8fafc" fontSize="11" fontWeight="600">
                        {copy.stretchFoil}
                    </text>

                    {/* Interlocking Layers */}
                    <polyline points="302,250 230,250" fill="none" stroke="#cbd5e1" strokeWidth="1" />
                    <circle cx="302" cy="250" r="2.5" fill="#fbbf24" />
                    <text x="224" y="253" textAnchor="end" fill="#f8fafc" fontSize="11" fontWeight="600">
                        {copy.interlockingLayers}
                    </text>

                    {/* Bottom Gray Cardboard */}
                    <polyline points="270,290 225,302 195,302" fill="none" stroke="#cbd5e1" strokeWidth="1" />
                    <circle cx="270" cy="290" r="2.5" fill="#fbbf24" />
                    <text x="189" y="305" textAnchor="end" fill="#f8fafc" fontSize="11" fontWeight="600">
                        {copy.bottomCardboard}
                    </text>

                    {/* Plastic Strapping Bands */}
                    <polyline points="546,245 612,320 655,320" fill="none" stroke="#cbd5e1" strokeWidth="1" />
                    <circle cx="546" cy="245" r="2.5" fill="#fbbf24" />
                    <text x="662" y="323" textAnchor="start" fill="#f8fafc" fontSize="11" fontWeight="600">
                        {copy.strappingBands}
                    </text>

                    {/* EPAL Euro-Pallet */}
                    <polyline points="424,386 458,412 505,412" fill="none" stroke="#cbd5e1" strokeWidth="1" />
                    <circle cx="424" cy="386" r="2.5" fill="#fbbf24" />
                    <text x="512" y="415" textAnchor="start" fill="#f8fafc" fontSize="11" fontWeight="600">
                        {copy.epalPallet}
                    </text>
                </svg>
            </div>

            {/* 4 Key Plant Operator Indicators */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
                <div className="p-2.5 rounded-lg bg-[#1d222d] border border-zinc-800 flex items-start gap-2.5">
                    <Maximize2 size={15} className="text-[#dc0000] shrink-0 mt-0.5" />
                    <div>
                        <div className="text-[11px] font-bold text-zinc-100">
                            {copy.kpiFootprint}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                            {copy.kpiFootprintVal}
                        </div>
                    </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#1d222d] border border-zinc-800 flex items-start gap-2.5">
                    <Layers size={15} className="text-[#dc0000] shrink-0 mt-0.5" />
                    <div>
                        <div className="text-[11px] font-bold text-zinc-100">
                            {copy.kpiTiling}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                            {copy.kpiTilingVal}
                        </div>
                    </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#1d222d] border border-zinc-800 flex items-start gap-2.5">
                    <ArrowUpDown size={15} className="text-[#dc0000] shrink-0 mt-0.5" />
                    <div>
                        <div className="text-[11px] font-bold text-zinc-100">
                            {copy.kpiHeight}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                            {copy.kpiHeightVal}
                        </div>
                    </div>
                </div>

                <div className="p-2.5 rounded-lg bg-[#1d222d] border border-zinc-800 flex items-start gap-2.5">
                    <ShieldCheck size={15} className="text-[#dc0000] shrink-0 mt-0.5" />
                    <div>
                        <div className="text-[11px] font-bold text-zinc-100">
                            {`Edge Margin: ${perimeterSetbackMm}mm`}
                        </div>
                        <div className="text-[11px] text-zinc-400">
                            {copy.kpiMarginVal}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

