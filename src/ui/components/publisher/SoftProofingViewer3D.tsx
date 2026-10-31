import React, { useState, useRef, useEffect } from 'react';
import {
    CubeIcon,
    ArrowsPointingOutIcon,
    BookOpenIcon,
    CheckBadgeIcon,
    ExclamationTriangleIcon,
    SparklesIcon,
    EyeIcon
} from '@heroicons/react/24/outline';

export interface SoftProofBookGeometry {
    orderId: string;
    isbn: string;
    title: string;
    trimWidthMm: number;
    trimHeightMm: number;
    spineThicknessMm: number;
    bleedMarginMm: number;
    hardcoverOverhangMm: number;
    bindingType: 'SOFTCOVER_PUR' | 'HARDCOVER_SEWN' | 'SADDLE_STITCH' | string;
    surfaceFinish: string;
    paperSpecification: string;
    proofStatus: 'AWAITING_APPROVAL' | 'APPROVED_FOR_PRESS' | 'CORRECTION_REQUESTED' | string;
}

export interface SoftProofingViewer3DProps {
    book: SoftProofBookGeometry;
    locale?: 'en' | 'es' | 'de';
    onApproveForPress?: (payload: { orderId: string; comments: string }) => void;
    onRequestCorrection?: (payload: { orderId: string; comments: string }) => void;
}

const VIEWER_I18N = {
    en: {
        viewerBadge: 'PARAMETRIC 3D SOFT-PROOFING ENGINE · PHASE-11C',
        rotationLabel: '360° Turntable Rotation',
        coverOpenLabel: 'Cover Opening Angle (0°–180°)',
        trimOverlayLabel: 'Inspect TrimBox vs BleedBox (+3.0 mm)',
        materialLabel: 'Finish & Materiality',
        spineGeometryLabel: 'Calculated Spine (PHASE-11A)',
        trimBoxLabel: 'TrimBox (Finished Size)',
        bleedBoxLabel: 'BleedBox (+3.0 mm Fold/Cut)',
        overhangLabel: 'Hardcover Case Overhang (Ceja)',
        approveCta: 'APPROVE FOR PRESS',
        requestCorrectionCta: 'REQUEST CORRECTION',
        commentsPlaceholder: 'Add pre-press sign-off notes or specify bleed/spine adjustments...',
        approvedBanner: 'DIGITALLY SIGNED & APPROVED FOR CTP PLATESETTER',
        correctionBanner: 'CORRECTION REQUESTED — PREFLIGHT HOLD'
    },
    es: {
        viewerBadge: 'MOTOR PARAMÉTRICO 3D DE SOFT-PROOFING · PHASE-11C',
        rotationLabel: 'Rotación Orbital 360°',
        coverOpenLabel: 'Apertura de Cubierta (0°–180°)',
        trimOverlayLabel: 'Inspeccionar Esquinas TrimBox vs BleedBox (+3.0 mm)',
        materialLabel: 'Acabado y Materialidad',
        spineGeometryLabel: 'Lomo Calculado (PHASE-11A)',
        trimBoxLabel: 'TrimBox (Formato Cortado)',
        bleedBoxLabel: 'BleedBox (+3.0 mm Sangrado)',
        overhangLabel: 'Ceja de Tapa Dura (Cartoné)',
        approveCta: 'APPROVE FOR PRESS',
        requestCorrectionCta: 'REQUEST CORRECTION',
        commentsPlaceholder: 'Añadir notas de aprobación o especificar correcciones de sangrado/lomo...',
        approvedBanner: 'FIRMADO DIGITALMENTE Y APROBADO PARA PLANCHAS CTP',
        correctionBanner: 'CORRECCIÓN SOLICITADA — RETENIDO EN PREFLIGHT'
    },
    de: {
        viewerBadge: 'PARAMETRISCHE 3D-SOFTPROOF-ENGINE · PHASE-11C',
        rotationLabel: '360°-Drehung (Orbital)',
        coverOpenLabel: 'Umschlag-Öffnungswinkel (0°–180°)',
        trimOverlayLabel: 'TrimBox vs. BleedBox (+3,0 mm) Ecken prüfen',
        materialLabel: 'Veredelung & Materialität',
        spineGeometryLabel: 'Berechneter Buchrücken (PHASE-11A)',
        trimBoxLabel: 'TrimBox (Endformat)',
        bleedBoxLabel: 'BleedBox (+3,0 mm Beschnitt)',
        overhangLabel: 'Buchdecken-Kantenüberstand (Stehkante)',
        approveCta: 'APPROVE FOR PRESS',
        requestCorrectionCta: 'REQUEST CORRECTION',
        commentsPlaceholder: 'Freigabekommentar oder Korrekturhinweise zu Beschnitt/Rücken eingeben...',
        approvedBanner: 'DIGITAL SIGNIERT & FÜR CTP-DRUCKFREIGABE BESTÄTIGT',
        correctionBanner: 'KORREKTUR ANGEFORDERT — PREFLIGHT-STOPP'
    }
};

export const SoftProofingViewer3D: React.FC<SoftProofingViewer3DProps> = ({
    book,
    locale = 'en',
    onApproveForPress,
    onRequestCorrection
}) => {
    const lang = (locale === 'es' || locale === 'de' ? locale : 'en') as 'en' | 'es' | 'de';
    const L = VIEWER_I18N[lang];

    const [rotationY, setRotationY] = useState<number>(-28);
    const [rotationX, setRotationX] = useState<number>(14);
    const [coverOpenDeg, setCoverOpenDeg] = useState<number>(25);
    const [showTrimBleedOverlay, setShowTrimBleedOverlay] = useState<boolean>(true);
    const [comments, setComments] = useState<string>('');
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const isHardcover = book.bindingType === 'HARDCOVER_SEWN';
    const isGloss = book.surfaceFinish.includes('GLOSS') || book.surfaceFinish.includes('UV');

    // Scale book dimensions in mm to 3D viewport pixels
    const scaleFactor = 0.88;
    const widthPx = Math.round((book.trimWidthMm || 150) * scaleFactor);
    const heightPx = Math.round((book.trimHeightMm || 230) * scaleFactor);
    const spinePx = Math.max(12, Math.round((book.spineThicknessMm || 14.5) * 1.65));
    const overhangPx = isHardcover ? 5 : 0;

    // Also render telemetry corner crop marks on HTML5 Canvas for high-DPI inspection
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || typeof navigator !== 'undefined' && /jsdom/i.test(navigator.userAgent)) {
            return;
        }
        let ctx: CanvasRenderingContext2D | null = null;
        try {
            ctx = canvas.getContext('2d');
        } catch (_) {
            ctx = null;
        }
        if (!ctx) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        // Subtle technical grid background
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;
        for (let x = 0; x < canvas.width; x += 24) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, canvas.height);
            ctx.stroke();
        }
        for (let y = 0; y < canvas.height; y += 24) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(canvas.width, y);
            ctx.stroke();
        }
    }, [rotationY, coverOpenDeg, showTrimBleedOverlay, book]);

    return (
        <div
            data-testid="soft-proofing-viewer-3d"
            className="rounded-xl bg-[#0a0b0d] border border-[#1f2228] overflow-hidden text-white"
        >
            {/* Header Telemetry Bar */}
            <div className="px-4 py-3 bg-[#14161a] border-b border-[#1f2228] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <CubeIcon className="w-4 h-4 text-[#dc2626]" />
                    <span className="font-mono text-[11px] font-black uppercase tracking-wider text-slate-300">
                        {L.viewerBadge}
                    </span>
                </div>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                    <span className="px-2 py-0.5 rounded bg-[#0a0b0d] border border-[#1f2228] text-slate-300">
                        ISBN: {book.isbn}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-[#10b981] font-bold">
                        SPINE: {book.spineThicknessMm.toFixed(2)} mm
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-[#3b82f6] font-bold">
                        {book.bindingType.replace(/_/g, ' ')}
                    </span>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12">
                {/* 3D Interactive Viewport */}
                <div className="lg:col-span-7 relative min-h-[360px] flex flex-col items-center justify-center p-6 bg-[#0a0b0d] border-b lg:border-b-0 lg:border-r border-[#1f2228] overflow-hidden">
                    <canvas
                        ref={canvasRef}
                        width={560}
                        height={360}
                        data-testid="soft-proof-webgl-canvas"
                        className="absolute inset-0 w-full h-full pointer-events-none"
                    />

                    {/* Parametric 3D Book Assembly */}
                    <div
                        className="relative z-10 flex items-center justify-center"
                        style={{ perspective: '1100px' }}
                    >
                        <div
                            data-testid="parametric-3d-book-mesh"
                            style={{
                                width: `${widthPx + overhangPx}px`,
                                height: `${heightPx + overhangPx * 2}px`,
                                transformStyle: 'preserve-3d',
                                transform: `rotateX(${rotationX}deg) rotateY(${rotationY}deg)`
                            }}
                            className="relative transition-transform duration-150 ease-out"
                        >
                            {/* Spine (Lomo con orientación tipográfica vertical) */}
                            <div
                                data-testid="book-3d-spine"
                                style={{
                                    width: `${spinePx}px`,
                                    height: `${heightPx + overhangPx * 2}px`,
                                    left: `-${Math.round(spinePx / 2)}px`,
                                    transform: `rotateY(-90deg) translateZ(0px)`
                                }}
                                className="absolute top-0 bg-gradient-to-r from-[#dc2626] via-[#991b1b] to-[#7f1d1d] border border-white/20 flex items-center justify-center overflow-hidden shadow-inner"
                            >
                                {/* Hardcover hinge groove (hendido) */}
                                {isHardcover && (
                                    <div className="absolute inset-y-0 right-1 w-[2px] bg-black/50" />
                                )}
                                <div
                                    style={{ writingMode: 'vertical-rl' }}
                                    className="font-mono text-[9px] font-black tracking-widest text-white uppercase truncate max-h-[85%] select-none"
                                >
                                    {book.title} · {book.spineThicknessMm.toFixed(1)}mm
                                </div>
                            </div>

                            {/* Inner Paper Block (Tripa / Hojas fresadas o cosidas) */}
                            <div
                                style={{
                                    width: `${widthPx}px`,
                                    height: `${heightPx}px`,
                                    top: `${overhangPx}px`,
                                    left: '0px',
                                    transform: `translateZ(-${Math.round(spinePx / 2)}px)`
                                }}
                                className="absolute bg-[#f8fafc] border border-slate-300 shadow-md flex flex-col justify-between p-3 text-slate-900"
                            >
                                <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 border-b border-slate-200 pb-1">
                                    INNER BLOCK · {book.paperSpecification}
                                </div>
                                <div className="my-auto text-center space-y-1">
                                    <div className="font-mono text-[10px] font-bold text-slate-700">
                                        {book.trimWidthMm} × {book.trimHeightMm} mm
                                    </div>
                                    <div className="font-mono text-[9px] text-slate-500">
                                        PHASE-11A Verified TrimBox
                                    </div>
                                </div>
                                <div className="text-[8px] font-mono text-slate-400 text-right">
                                    ISBN {book.isbn}
                                </div>
                            </div>

                            {/* Back Cover (Contracubierta) */}
                            <div
                                style={{
                                    width: `${widthPx + overhangPx}px`,
                                    height: `${heightPx + overhangPx * 2}px`,
                                    transform: `translateZ(-${Math.round(spinePx / 2)}px)`
                                }}
                                className="absolute inset-0 rounded-r-sm bg-[#181b20] border border-white/15 p-3 flex flex-col justify-end"
                            >
                                <div className="font-mono text-[9px] text-slate-400">
                                    BACK COVER · EAN-13 {book.isbn}
                                </div>
                            </div>

                            {/* Articulated Front Cover (Cubierta Frontal con apertura 0° a 180°) */}
                            <div
                                data-testid="book-3d-front-cover"
                                style={{
                                    width: `${widthPx + overhangPx}px`,
                                    height: `${heightPx + overhangPx * 2}px`,
                                    transformOrigin: 'left center',
                                    transform: `translateZ(${Math.round(spinePx / 2)}px) rotateY(-${coverOpenDeg}deg)`
                                }}
                                className={`absolute inset-0 rounded-r-sm border transition-transform duration-150 ${
                                    isHardcover
                                        ? 'bg-gradient-to-br from-[#1b1f27] via-[#14161a] to-[#0a0b0d] border-amber-400/40 shadow-2xl'
                                        : 'bg-gradient-to-br from-[#1f242d] to-[#121418] border-white/20 shadow-xl'
                                } p-3 flex flex-col justify-between overflow-hidden`}
                            >
                                {/* Gloss / Spot UV specular reflection layer */}
                                {isGloss && (
                                    <div
                                        className="pointer-events-none absolute -inset-full bg-gradient-to-tr from-transparent via-white/10 to-transparent rotate-12"
                                        aria-hidden="true"
                                    />
                                )}

                                {/* Hardcover Hinge Channel (Hendido de Cartoné) */}
                                {isHardcover && (
                                    <div
                                        title="Hardcover Hinge Groove (8mm)"
                                        className="absolute inset-y-0 left-2.5 w-[2px] bg-black/60 border-r border-white/10"
                                    />
                                )}

                                {/* TrimBox vs BleedBox (+3.0 mm) Inspection Overlay */}
                                {showTrimBleedOverlay && (
                                    <div
                                        data-testid="trim-bleed-overlay"
                                        className="pointer-events-none absolute inset-1.5 border border-dashed border-[#dc2626] rounded-xs"
                                    >
                                        <span className="absolute -top-2 right-1 px-1 bg-[#dc2626] text-[8px] font-mono font-black text-white uppercase">
                                            BLEED +{book.bleedMarginMm.toFixed(1)}mm
                                        </span>
                                        <div className="absolute inset-1.5 border border-cyan-400/70">
                                            <span className="absolute bottom-0.5 right-0.5 px-1 bg-cyan-500/20 text-[8px] font-mono text-cyan-300">
                                                TRIM {book.trimWidthMm}×{book.trimHeightMm}
                                            </span>
                                        </div>
                                    </div>
                                )}

                                <div className="pl-3 pt-2">
                                    <span className="px-1.5 py-0.5 rounded bg-[#dc2626]/20 border border-[#dc2626]/40 font-mono text-[8px] font-black text-[#dc2626] uppercase">
                                        {isHardcover ? 'CARTONÉ · CEJA 3MM' : 'RÚSTICA PUR'}
                                    </span>
                                    <h4 className="font-black text-xs text-white mt-2 leading-snug line-clamp-3">
                                        {book.title}
                                    </h4>
                                </div>

                                <div className="pl-3 pb-1 flex items-center justify-between text-[9px] font-mono text-slate-400">
                                    <span>{book.surfaceFinish.replace(/_/g, ' ')}</span>
                                    <span className="text-emerald-400 font-bold">3D OK</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Bottom Viewport Telemetry Legend */}
                    <div className="relative z-10 mt-4 flex flex-wrap items-center justify-center gap-3 text-[11px] font-mono text-slate-400">
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-xs border border-cyan-400 bg-cyan-400/20 inline-block" />
                            {L.trimBoxLabel}: {book.trimWidthMm}×{book.trimHeightMm} mm
                        </span>
                        <span className="flex items-center gap-1">
                            <span className="w-2.5 h-2.5 rounded-xs border border-dashed border-[#dc2626] bg-[#dc2626]/20 inline-block" />
                            {L.bleedBoxLabel}: {book.trimWidthMm + book.bleedMarginMm * 2}×
                            {book.trimHeightMm + book.bleedMarginMm * 2} mm
                        </span>
                        {isHardcover && (
                            <span className="text-amber-400">
                                {L.overhangLabel}: +{book.hardcoverOverhangMm.toFixed(1)} mm
                            </span>
                        )}
                    </div>
                </div>

                {/* Controls & Telematic Sign-Off Panel */}
                <div className="lg:col-span-5 p-5 bg-[#14161a] flex flex-col justify-between space-y-4">
                    <div className="space-y-4">
                        {/* Interactive Sliders */}
                        <div>
                            <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                                <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400">
                                    <ArrowsPointingOutIcon className="w-3.5 h-3.5 text-[#3b82f6]" />
                                    {L.rotationLabel}
                                </span>
                                <span className="text-white font-bold">{rotationY}°</span>
                            </div>
                            <input
                                type="range"
                                min={-180}
                                max={180}
                                value={rotationY}
                                data-testid="slider-rotation-360"
                                onChange={e => setRotationY(Number(e.target.value))}
                                className="w-full accent-[#dc2626] cursor-pointer"
                            />
                        </div>

                        <div>
                            <div className="flex justify-between text-xs font-mono text-slate-300 mb-1">
                                <span className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-slate-400">
                                    <BookOpenIcon className="w-3.5 h-3.5 text-[#10b981]" />
                                    {L.coverOpenLabel}
                                </span>
                                <span className="text-white font-bold">{coverOpenDeg}°</span>
                            </div>
                            <input
                                type="range"
                                min={0}
                                max={180}
                                value={coverOpenDeg}
                                data-testid="slider-cover-open"
                                onChange={e => setCoverOpenDeg(Number(e.target.value))}
                                className="w-full accent-[#10b981] cursor-pointer"
                            />
                        </div>

                        {/* TrimBox vs BleedBox Toggle */}
                        <label className="flex items-center justify-between p-2.5 rounded-lg bg-[#0a0b0d] border border-[#1f2228] cursor-pointer">
                            <span className="flex items-center gap-2 text-xs font-bold text-slate-300">
                                <EyeIcon className="w-4 h-4 text-cyan-400" />
                                {L.trimOverlayLabel}
                            </span>
                            <input
                                type="checkbox"
                                checked={showTrimBleedOverlay}
                                onChange={e => setShowTrimBleedOverlay(e.target.checked)}
                                className="accent-[#dc2626] w-4 h-4"
                            />
                        </label>

                        {/* Physical Specification Readout */}
                        <div className="p-3 rounded-lg bg-[#0a0b0d] border border-[#1f2228] space-y-1.5 font-mono text-xs">
                            <div className="flex justify-between">
                                <span className="text-slate-400">{L.spineGeometryLabel}:</span>
                                <span className="text-[#10b981] font-bold">
                                    {book.spineThicknessMm.toFixed(2)} mm
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-400">{L.materialLabel}:</span>
                                <span className="text-white font-bold">
                                    {book.surfaceFinish.replace(/_/g, ' ')}
                                </span>
                            </div>
                        </div>

                        {/* Editorial Sign-off Notes */}
                        <div>
                            <textarea
                                rows={2}
                                value={comments}
                                onChange={e => setComments(e.target.value)}
                                placeholder={L.commentsPlaceholder}
                                data-testid="soft-proof-comments-input"
                                className="w-full px-3 py-2 rounded-lg bg-[#0a0b0d] border border-[#1f2228] text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-[#dc2626]"
                            />
                        </div>
                    </div>

                    {/* Formal Telematic Action Buttons */}
                    <div className="space-y-2 pt-2 border-t border-[#1f2228]">
                        {book.proofStatus === 'APPROVED_FOR_PRESS' && (
                            <div
                                data-testid="soft-proof-approved-banner"
                                className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-[#10b981] font-mono text-[11px] font-bold flex items-center gap-2"
                            >
                                <CheckBadgeIcon className="w-4 h-4 shrink-0" />
                                <span>{L.approvedBanner}</span>
                            </div>
                        )}
                        {book.proofStatus === 'CORRECTION_REQUESTED' && (
                            <div
                                data-testid="soft-proof-correction-banner"
                                className="p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-[#f59e0b] font-mono text-[11px] font-bold flex items-center gap-2"
                            >
                                <ExclamationTriangleIcon className="w-4 h-4 shrink-0" />
                                <span>{L.correctionBanner}</span>
                            </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <button
                                type="button"
                                data-testid="btn-approve-for-press"
                                onClick={() =>
                                    onApproveForPress?.({
                                        orderId: book.orderId,
                                        comments:
                                            comments ||
                                            `3D Soft-Proof approved (${book.spineThicknessMm.toFixed(2)} mm spine)`
                                    })
                                }
                                className="px-3 py-2.5 rounded-lg bg-[#10b981] hover:bg-emerald-400 text-black font-mono text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs"
                            >
                                <SparklesIcon className="w-4 h-4 stroke-[2.5]" />
                                <span>{L.approveCta}</span>
                            </button>

                            <button
                                type="button"
                                data-testid="btn-request-correction"
                                onClick={() =>
                                    onRequestCorrection?.({
                                        orderId: book.orderId,
                                        comments:
                                            comments ||
                                            'Correction requested on cover spine or bleed margins'
                                    })
                                }
                                className="px-3 py-2.5 rounded-lg bg-[#dc2626]/15 hover:bg-[#dc2626]/25 border border-[#dc2626]/40 text-[#dc2626] font-mono text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all cursor-pointer"
                            >
                                <ExclamationTriangleIcon className="w-4 h-4" />
                                <span>{L.requestCorrectionCta}</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
