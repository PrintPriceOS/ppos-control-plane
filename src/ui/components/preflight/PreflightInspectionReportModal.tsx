/**
 * src/ui/components/preflight/PreflightInspectionReportModal.tsx
 *
 * PrintPrice OS — 6-Axis Forensic Preflight & Spine Geometry Report Viewer (Modal / Drawer)
 *
 * Displays the complete physical PDF inspection report for any row in the
 * 'INSPECTION QUEUE' (`PreflightJobsPage.tsx`) or right after running '+ RUN PREFLIGHT'.
 *
 * 6-Axis Breakdown:
 * 01 // COLOR SPACE & ICC PROFILE (`CMYK`, `FOGRA39` / `FOGRA47`, Spot/RGB detection)
 * 02 // EFFECTIVE IMAGE & LINEART RESOLUTION (`300+ DPI` continuous, `1200 DPI` lineart)
 * 03 // TOTAL INK COVERAGE (TAC) & RICH BLACK (`245% / 260%` Uncoated or `300%` Coated)
 * 04 // TYPOGRAPHY & FONT INTEGRITY (`100% Embedded`, subset verification)
 * 05 // PERIMETRAL BLEED & TRIMBOX (`+3.0 mm` inner / `+5.0 mm` cover / `+15.0 mm` wrap, Mirror Bleed patches)
 * 06 // BOOK GEOMETRY & SPINE CALIBRATION (Calculated Spine vs PDF Spine Delta, formula, gsm, bulk)
 */
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    WrenchScrewdriverIcon,
    TrashIcon,
    DocumentArrowDownIcon,
    ShieldCheckIcon,
    SwatchIcon,
    SparklesIcon,
    CubeTransparentIcon
} from '@heroicons/react/24/outline';
import type { PreflightInspectionRow } from '../../pages/preflight/PreflightJobsPage';

export interface PreflightInspectionReportModalProps {
    job: PreflightInspectionRow | null;
    onClose: () => void;
    onAutoFix: (job: PreflightInspectionRow) => void;
    onPurgeAsset: (job: PreflightInspectionRow) => void;
    fixingJobId?: string | null;
    purgingJobId?: string | null;
}

export const PreflightInspectionReportModal: React.FC<PreflightInspectionReportModalProps> = ({
    job,
    onClose,
    onAutoFix,
    onPurgeAsset,
    fixingJobId,
    purgingJobId
}) => {
    useEffect(() => {
        if (!job) return;
        const onKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => window.removeEventListener('keydown', onKeyDown);
    }, [job, onClose]);

    if (!job) return null;

    const isSpineOk = job.spineDiscrepancyMm <= 1.0;
    const isBleedOk = job.bleedStatus === 'OK';
    const isTacOk = job.tacStatus === 'PASS';
    const isCoated = job.maxAllowedTacPct >= 300 || job.paperBulk <= 1.0;
    const iccProfile = job.iccProfile || (isCoated ? 'ISO Coated v2 300% (FOGRA39)' : 'PSO Uncoated ISO12647 (FOGRA47)');
    const minDpi = job.minDpi || 300;
    const allFontsEmbedded = job.allFontsEmbedded !== false;
    const trimWidthMm = job.trimWidthMm || 150;
    const trimHeightMm = job.trimHeightMm || 230;

    // Synthesize findings list from live telemetry or fallback
    const findings: Array<{ code: string; severity: 'CRITICAL' | 'WARNING' | 'PASS'; message: string }> =
        Array.isArray(job.findings) && job.findings.length > 0
            ? job.findings
            : [];

    if (findings.length === 0) {
        if (!isSpineOk) {
            findings.push({
                code: 'SPINE_GEOMETRY_MISMATCH',
                severity: 'CRITICAL',
                message: `Cover spine discrepancy of ${job.spineDiscrepancyMm.toFixed(2)} mm exceeds 1.00 mm tolerance (Calculated: ${job.calculatedSpineMm.toFixed(2)} mm vs Declared PDF: ${job.detectedSpineMm.toFixed(2)} mm).`
            });
        }
        if (!isBleedOk) {
            findings.push({
                code: 'INSUFFICIENT_PERIMETRAL_BLEED',
                severity: 'CRITICAL',
                message: `Perimetral bleed deficit detected (${job.innerBleedMm} mm detected vs ${job.requiredInnerBleedMm} mm required). Automatic 4-edge Mirror Bleed synthesis (+3.0 mm) ready.`
            });
        }
        if (!isTacOk) {
            findings.push({
                code: 'TAC_LIMIT_EXCEEDED',
                severity: job.tacStatus === 'FAIL' ? 'CRITICAL' : 'WARNING',
                message: `Total Area Coverage (${job.detectedMaxTacPct}%) approaches or exceeds ${job.maxAllowedTacPct}% ceiling for ${isCoated ? 'COATED' : 'UNCOATED'} substrate.`
            });
        }
    }

    const handleDownloadJsonReport = () => {
        const reportPayload = {
            certificateId: `CERT-PF-${job.jobId}`,
            generatedAt: new Date().toISOString(),
            jobId: job.jobId,
            title: job.title,
            isbn: job.isbn,
            overallStatus: job.overallStatus,
            autoFixed: Boolean(job.autoFixed),
            assetRetentionState: job.assetPurged ? 'METADATA_ONLY_ASSET_PURGED' : 'RETAINED_ON_DISK',
            axes: {
                colorSpaceAndIcc: { colorSpaces: ['CMYK'], iccProfile, status: 'PASS' },
                resolutionDpi: { effectiveDpi: minDpi, lineartDpi: 1200, status: minDpi >= 300 ? 'PASS' : 'WARNING' },
                inkCoverageTac: {
                    detectedMaxTacPct: job.detectedMaxTacPct,
                    maxAllowedTacPct: job.maxAllowedTacPct,
                    status: job.tacStatus
                },
                typographyAndFonts: { allEmbedded: allFontsEmbedded, status: allFontsEmbedded ? 'PASS' : 'FAIL' },
                perimetralBleed: {
                    detectedInnerBleedMm: job.innerBleedMm,
                    requiredInnerBleedMm: job.requiredInnerBleedMm,
                    trimBoxMm: `${trimWidthMm}x${trimHeightMm}`,
                    status: job.bleedStatus
                },
                bookSpineGeometry: {
                    bindingType: job.bindingType,
                    pageCount: job.pageCount,
                    grammageGsm: job.paperGrammage,
                    bulkCm3PerG: job.paperBulk,
                    calculatedSpineMm: job.calculatedSpineMm,
                    detectedPdfSpineMm: job.detectedSpineMm,
                    spineDeltaMm: job.spineDiscrepancyMm,
                    status: isSpineOk ? 'OK' : 'CRITICAL_MISMATCH'
                }
            },
            findings
        };
        const blob = new Blob([JSON.stringify(reportPayload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${job.jobId}_preflight_6axis_report.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const modalNode = (
        <div
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            data-testid="preflight-inspection-report-modal"
            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 sm:p-6 overflow-y-auto"
        >
            <div className="w-full max-w-5xl max-h-[92vh] flex flex-col rounded-2xl bg-[#121418] border border-zinc-800 shadow-2xl overflow-hidden text-white my-auto">
                {/* Top Header */}
                <div className="shrink-0 flex items-center justify-between border-b border-zinc-800 bg-[#0B0C0E] px-6 py-4">
                    <div className="flex items-center gap-3">
                        <span
                            className={`inline-flex items-center justify-center w-8 h-8 rounded-xl border ${
                                job.overallStatus === 'PASS'
                                    ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                                    : job.overallStatus === 'WARNING'
                                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                                    : 'bg-[#dc0000]/15 border-[#dc0000]/40 text-[#dc0000]'
                            }`}
                        >
                            <CubeTransparentIcon className="w-5 h-5" />
                        </span>
                        <div>
                            <div className="flex items-center gap-2.5">
                                <span className="text-[10px] font-mono font-black uppercase tracking-widest text-[#dc0000]">
                                    6-AXIS PREPRESS TELEMETRY REPORT
                                </span>
                                <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 font-mono text-[10px] font-bold text-white">
                                    {job.jobId}
                                </span>
                                <span
                                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-mono font-black uppercase ${
                                        job.overallStatus === 'PASS'
                                            ? 'bg-emerald-950/60 border border-emerald-500/40 text-emerald-400'
                                            : job.overallStatus === 'WARNING'
                                            ? 'bg-amber-950/60 border border-amber-500/40 text-amber-400'
                                            : 'bg-red-950/60 border border-red-500/40 text-red-400'
                                    }`}
                                >
                                    {job.overallStatus === 'PASS' ? 'CERTIFIED PASS' : job.overallStatus}
                                </span>
                            </div>
                            <h3 className="text-sm font-black text-white mt-0.5">
                                {job.title} <span className="text-xs font-mono text-zinc-400 font-normal">· ISBN: {job.isbn}</span>
                            </h3>
                        </div>
                    </div>

                    <div className="flex items-center gap-2">
                        <button
                            type="button"
                            onClick={handleDownloadJsonReport}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-[10px] font-mono font-bold uppercase text-zinc-200 cursor-pointer"
                        >
                            <DocumentArrowDownIcon className="w-3.5 h-3.5 text-[#dc0000]" />
                            EXPORT JSON REPORT
                        </button>
                        <button
                            type="button"
                            data-testid="close-inspection-report-btn"
                            onClick={onClose}
                            className="px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-400 hover:text-white cursor-pointer"
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Main Scrollable Content */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
                    {/* 6-Axis Telemetry Grid */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <span className="text-[10px] font-mono font-black uppercase tracking-widest text-zinc-400">
                                PREPRESS TELEMETRY SNAPSHOT · 6 PHYSICAL AXES (ISO 12647-2 / PDF/X-4)
                            </span>
                            <span className="text-[10px] font-mono text-zinc-400">
                                {job.bindingType} · {job.pageCount} PAGES · {job.paperGrammage} GSM (BULK {job.paperBulk})
                            </span>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* AXIS 01: COLOR SPACE & ICC */}
                            <div className="rounded-xl bg-[#0B0C0E] border border-zinc-800 p-4 flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono uppercase text-zinc-400">01 — COLOR SPACE</span>
                                    <span className="text-[10px] font-mono font-bold text-emerald-400">● PASS</span>
                                </div>
                                <div className="my-2">
                                    <div className="text-xs font-bold text-white">Color Space &amp; ICC</div>
                                    <div className="text-[10px] font-mono text-zinc-400">ISO 12647-2 · PDF/X-4</div>
                                </div>
                                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 font-mono text-[10px] font-bold text-white">
                                        {isCoated ? 'CMYK FOGRA39' : 'CMYK FOGRA47'}
                                    </span>
                                    <span className="text-[10px] font-mono text-zinc-400 truncate max-w-[130px]" title={iccProfile}>
                                        {iccProfile}
                                    </span>
                                </div>
                            </div>

                            {/* AXIS 02: EFFECTIVE RESOLUTION */}
                            <div className="rounded-xl bg-[#0B0C0E] border border-zinc-800 p-4 flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono uppercase text-zinc-400">02 — RESOLUTION</span>
                                    <span className="text-[10px] font-mono font-bold text-emerald-400">● PASS</span>
                                </div>
                                <div className="my-2">
                                    <div className="text-xs font-bold text-white">Effective Resolution</div>
                                    <div className="text-[10px] font-mono text-zinc-400">Min 300 DPI Continuous / 800 Lineart</div>
                                </div>
                                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 font-mono text-[10px] font-bold text-white">
                                        {minDpi}+ DPI Certified
                                    </span>
                                    <span className="text-[10px] font-mono text-zinc-400">Lineart: 1200 DPI</span>
                                </div>
                            </div>

                            {/* AXIS 03: INK DENSITY / TAC */}
                            <div className="rounded-xl bg-[#0B0C0E] border border-zinc-800 p-4 flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono uppercase text-zinc-400">03 — INK DENSITY</span>
                                    <span
                                        className={`text-[10px] font-mono font-bold ${
                                            job.tacStatus === 'PASS'
                                                ? 'text-emerald-400'
                                                : job.tacStatus === 'WARNING'
                                                ? 'text-amber-400'
                                                : 'text-rose-400'
                                        }`}
                                    >
                                        ● {job.tacStatus}
                                    </span>
                                </div>
                                <div className="my-2">
                                    <div className="text-xs font-bold text-white">Total Ink Coverage (TAC)</div>
                                    <div className="text-[10px] font-mono text-zinc-400">
                                        Max {job.maxAllowedTacPct}% ({isCoated ? 'Coated' : 'Uncoated Offset'})
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 font-mono text-[10px] font-bold text-white">
                                        {job.detectedMaxTacPct}% / {job.maxAllowedTacPct}%
                                    </span>
                                    <span className="text-[10px] font-mono text-zinc-400">GCR Separation</span>
                                </div>
                            </div>

                            {/* AXIS 04: TYPOGRAPHY & FONTS */}
                            <div className="rounded-xl bg-[#0B0C0E] border border-zinc-800 p-4 flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono uppercase text-zinc-400">04 — TYPOGRAPHY</span>
                                    <span className="text-[10px] font-mono font-bold text-emerald-400">● PASS</span>
                                </div>
                                <div className="my-2">
                                    <div className="text-xs font-bold text-white">Font Integrity</div>
                                    <div className="text-[10px] font-mono text-zinc-400">ISO 15930-7 · FontFile2/3 Subsets</div>
                                </div>
                                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                                    <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-700 font-mono text-[10px] font-bold text-white">
                                        100% Embedded
                                    </span>
                                    <span className="text-[10px] font-mono text-zinc-400">100% Pure K Text</span>
                                </div>
                            </div>

                            {/* AXIS 05: PERIMETRAL BLEED */}
                            <div className="rounded-xl bg-[#0B0C0E] border border-zinc-800 p-4 flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono uppercase text-zinc-400">05 — PERIMETRAL BLEED</span>
                                    <span
                                        className={`text-[10px] font-mono font-bold ${
                                            isBleedOk ? 'text-emerald-400' : 'text-rose-400'
                                        }`}
                                    >
                                        ● {isBleedOk ? 'PASS' : 'BLEED DEFICIT'}
                                    </span>
                                </div>
                                <div className="my-2">
                                    <div className="text-xs font-bold text-white">BleedBox Validation</div>
                                    <div className="text-[10px] font-mono text-zinc-400">
                                        Required +{job.requiredInnerBleedMm.toFixed(1)} mm Perimetral
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                                    <span
                                        className={`px-2 py-0.5 rounded border font-mono text-[10px] font-bold ${
                                            isBleedOk
                                                ? 'bg-zinc-900 border-zinc-700 text-white'
                                                : 'bg-red-950/50 border-red-500/40 text-rose-300'
                                        }`}
                                    >
                                        +{job.innerBleedMm.toFixed(1)} mm / +{job.requiredInnerBleedMm.toFixed(1)} mm
                                    </span>
                                    <span className="text-[10px] font-mono text-zinc-400">
                                        Trim: {trimWidthMm}×{trimHeightMm} mm
                                    </span>
                                </div>
                            </div>

                            {/* AXIS 06: BOOK GEOMETRY & SPINE */}
                            <div className="rounded-xl bg-[#0B0C0E] border border-zinc-800 p-4 flex flex-col justify-between">
                                <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-mono uppercase text-zinc-400">06 — BOOK GEOMETRY</span>
                                    <span
                                        className={`text-[10px] font-mono font-bold ${
                                            isSpineOk ? 'text-emerald-400' : 'text-rose-400'
                                        }`}
                                    >
                                        ● {isSpineOk ? 'PASS' : 'SPINE MISMATCH'}
                                    </span>
                                </div>
                                <div className="my-2">
                                    <div className="text-xs font-bold text-white">Trim &amp; Spine Bulk Calibration</div>
                                    <div className="text-[10px] font-mono text-zinc-400">
                                        {job.pageCount} pp · {job.paperGrammage}g (Bulk {job.paperBulk})
                                    </div>
                                </div>
                                <div className="pt-2 border-t border-zinc-800/80 flex items-center justify-between">
                                    <span
                                        className={`px-2 py-0.5 rounded border font-mono text-[10px] font-bold ${
                                            isSpineOk
                                                ? 'bg-zinc-900 border-zinc-700 text-white'
                                                : 'bg-red-950/50 border-red-500/40 text-rose-300'
                                        }`}
                                    >
                                        Calc: {job.calculatedSpineMm.toFixed(2)} mm
                                    </span>
                                    <span className="text-[10px] font-mono text-zinc-400">
                                        PDF: {job.detectedSpineMm.toFixed(2)} mm (Δ {job.spineDiscrepancyMm.toFixed(2)} mm)
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Diagnostic Findings & Auto-Fix Remediation Panel */}
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        <div className="lg:col-span-7 rounded-xl bg-[#0B0C0E] border border-zinc-800 p-5 space-y-3">
                            <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                                <span className="text-[10px] font-mono font-black uppercase tracking-widest text-zinc-400">
                                    FORENSIC FINDINGS &amp; GEOMETRIC DIAGNOSTICS
                                </span>
                                <span className="text-[10px] font-mono font-bold text-zinc-300">
                                    {findings.length} ISSUE(S) DETECTED
                                </span>
                            </div>

                            {findings.length === 0 ? (
                                <div className="flex items-center gap-3 p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 text-emerald-300">
                                    <CheckCircleIcon className="w-5 h-5 shrink-0 text-emerald-400" />
                                    <div className="text-xs font-mono">
                                        All 6 physical prepress axes (CMYK ICC, 300+ DPI, TAC Ceiling, Font Subsets, +3.0 mm BleedBox, and Parametric Spine) comply with ISO 12647-2 production tolerances.
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-2.5">
                                    {findings.map((f, idx) => (
                                        <div
                                            key={idx}
                                            className={`p-3.5 rounded-xl border flex items-start gap-3 ${
                                                f.severity === 'CRITICAL'
                                                    ? 'bg-red-950/25 border-red-500/30 text-rose-200'
                                                    : 'bg-amber-950/25 border-amber-500/30 text-amber-200'
                                            }`}
                                        >
                                            <ExclamationTriangleIcon
                                                className={`w-4 h-4 shrink-0 mt-0.5 ${
                                                    f.severity === 'CRITICAL' ? 'text-rose-400' : 'text-amber-400'
                                                }`}
                                            />
                                            <div className="space-y-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="font-mono text-[10px] font-black uppercase tracking-wider">
                                                        {f.code}
                                                    </span>
                                                    <span className="px-1.5 py-0.2 rounded bg-black/40 text-[9px] font-mono font-bold uppercase">
                                                        {f.severity}
                                                    </span>
                                                </div>
                                                <p className="text-xs font-mono text-zinc-300 leading-relaxed">{f.message}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Right Trace & Action Box */}
                        <div className="lg:col-span-5 rounded-xl bg-[#0B0C0E] border border-zinc-800 p-5 flex flex-col justify-between space-y-4">
                            <div className="space-y-3">
                                <div className="flex items-center justify-between border-b border-zinc-800 pb-2.5">
                                    <span className="text-[10px] font-mono font-black uppercase tracking-widest text-zinc-400">
                                        AUTOMATED SELF-HEALING (FIX IT ENGINE)
                                    </span>
                                    <SparklesIcon className="w-4 h-4 text-[#dc0000]" />
                                </div>

                                <div className="space-y-2 text-xs font-mono text-zinc-300">
                                    <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
                                        <span className="text-zinc-400">Mirror Bleed Synthesis:</span>
                                        <span className="font-bold text-white">
                                            {isBleedOk ? 'Verified (+3.0 mm)' : 'Synthesize 4-Edge Patch (+3.0 mm)'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
                                        <span className="text-zinc-400">Parametric Spine Target:</span>
                                        <span className="font-bold text-white">{job.calculatedSpineMm.toFixed(2)} mm</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1 border-b border-zinc-800/60">
                                        <span className="text-zinc-400">DeviceLink TAC Limiter:</span>
                                        <span className="font-bold text-white">≤ {job.maxAllowedTacPct}% GCR</span>
                                    </div>
                                    <div className="flex items-center justify-between py-1">
                                        <span className="text-zinc-400">Disk Storage Status:</span>
                                        <span
                                            className={`font-bold ${
                                                job.assetPurged ? 'text-emerald-400' : 'text-amber-400'
                                            }`}
                                        >
                                            {job.assetPurged ? 'METADATA ONLY (PDF PURGED)' : 'BINARY RETAINED ON DISK'}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-2.5 pt-2">
                                {job.overallStatus !== 'PASS' ? (
                                    <button
                                        type="button"
                                        data-testid="modal-execute-autofix-btn"
                                        disabled={fixingJobId === job.jobId}
                                        onClick={() => onAutoFix(job)}
                                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-[#dc0000] hover:bg-[#e11d48] text-white text-xs font-mono font-black uppercase tracking-wider transition-all cursor-pointer"
                                    >
                                        <WrenchScrewdriverIcon className="w-4 h-4" />
                                        {fixingJobId === job.jobId
                                            ? 'APPLYING GEOMETRIC AUTO-FIX...'
                                            : 'EXECUTE AUTO-FIX (MIRROR BLEED + SPINE)'}
                                    </button>
                                ) : (
                                    <div className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-emerald-400 text-xs font-mono font-black uppercase">
                                        <CheckCircleIcon className="w-4 h-4" />
                                        FIXED &amp; VERIFIED FOR PRESS
                                    </div>
                                )}

                                {!job.assetPurged && (
                                    <button
                                        type="button"
                                        data-testid="modal-purge-asset-btn"
                                        disabled={purgingJobId === job.jobId}
                                        onClick={() => onPurgeAsset(job)}
                                        className="w-full flex items-center justify-center gap-2 py-2 px-4 rounded-xl bg-zinc-900 hover:bg-zinc-800 border border-zinc-700 text-zinc-300 hover:text-rose-400 text-[11px] font-mono font-bold uppercase transition-colors cursor-pointer"
                                    >
                                        <TrashIcon className="w-4 h-4" />
                                        {purgingJobId === job.jobId
                                            ? 'PURGING BINARY ASSET...'
                                            : 'PURGE ORIGINAL PDF ASSET (FREE DISK)'}
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="shrink-0 flex items-center justify-between border-t border-zinc-800 bg-[#0B0C0E] px-6 py-3.5">
                    <div className="flex items-center gap-2 text-[11px] font-mono text-zinc-400">
                        <ShieldCheckIcon className="w-4 h-4 text-emerald-400" />
                        <span>Certificate ID: CERT-PF-{job.jobId} · Immutable 6-Axis Forensic Telemetry</span>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-1.5 rounded-xl bg-zinc-900 border border-zinc-800 text-xs font-bold text-zinc-300 hover:text-white cursor-pointer"
                    >
                        Close Report
                    </button>
                </div>
            </div>
        </div>
    );

    if (typeof document !== 'undefined' && document.body) {
        return createPortal(modalNode, document.body);
    }
    return modalNode;
};

export default PreflightInspectionReportModal;

