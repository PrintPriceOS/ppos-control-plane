/**
 * src/ui/components/printhouse/pricing/quick-calibration/CommercialCalibrationPanel.tsx
 *
 * Phase 195F — Commercial Calibration & Fine-Tuning Knobs Panel.
 *
 * Provides a printer-facing preview flow:
 * Ingested Quotation -> Benchmark Price Points -> Baseline PPOS Prediction ->
 * Suggested Commercial Fit -> 7 Fine-Tuning Knobs -> Live Recalculation -> Residual Metrics
 *
 * Invariants:
 * - Status: NOT ACTIVE (Preview mode only, zero rate card mutation).
 * - Machine routing: NOT REQUIRED.
 * - Transport is strictly excluded from manufacturing price comparisons.
 * - Visual tolerance badges: Green (<=2%), Amber (2%-5%), Red (>5%).
 */

import React, { useState, useEffect } from 'react';
import { printhouseCalibrationApi } from '../../../../lib/printhouseCalibrationApi';
import { Sliders, RefreshCw, Sparkles, AlertCircle, CheckCircle2, RotateCcw, Shield, FileText, Layers } from 'lucide-react';

interface CommercialCalibrationPanelProps {
    printerNodeId?: string;
    bookSpec?: any;
    quoteEvidence?: any;
    baselineRates?: any;
    onClose?: () => void;
}

const DEFAULT_BOOK_SPEC = {
    copies: 500,
    book_width_mm: 148,
    book_height_mm: 210,
    interior_pages: 128,
    interior_print: '4/4',
    paper_type_interior: 'offset',
    paper_weight_interior: 80,
    cover_print: '4/0',
    paper_type_cover: 'mc',
    paper_weight_cover: 250,
    lamination: 'matt',
    binding_method: 'perfect bound',
    delivery_country: 'ES'
};

const DEFAULT_QUOTE_POINTS: Record<number, number> = {
    500: 4321,
    600: 4604,
    700: 4846
};

export const CommercialCalibrationPanel: React.FC<CommercialCalibrationPanelProps> = ({
    printerNodeId = 'node-default-1',
    bookSpec = DEFAULT_BOOK_SPEC,
    quoteEvidence,
    baselineRates,
    onClose
}) => {
    // ── Local Knob Adjustments State (All Option A Multipliers default to 1.0x) ──
    const [adjustments, setAdjustments] = useState<Record<string, number>>({
        printingSetupAdjustment: 1.0,
        printingRunMultiplier: 1.0,
        paperCostMultiplier: 1.0,
        bindingSetupAdjustment: 1.0,
        bindingRunMultiplier: 1.0,
        laminationSetupAdjustment: 1.0,
        laminationRunMultiplier: 1.0
    });

    const [quantities, setQuantities] = useState<number[]>([500, 600, 700]);
    const [previewData, setPreviewData] = useState<any | null>(null);
    const [fitData, setFitData] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [showAdvanced, setShowAdvanced] = useState(false);

    // ── Phase 195G Acceptance Modal State ──
    const [showAcceptModal, setShowAcceptModal] = useState(false);
    const [accepting, setAccepting] = useState(false);
    const [acceptanceResult, setAcceptanceResult] = useState<any | null>(null);

    // Initial load & calculation
    useEffect(() => {
        executePreview(adjustments);
    }, []);

    const executePreview = async (currentAdj: Record<string, number>) => {
        setLoading(true);
        setError(null);
        try {
            const rawAdjustments = {
                printingSetupAdjustment: { type: 'MULTIPLIER', value: currentAdj.printingSetupAdjustment || 1.0 },
                printingRunMultiplier: { type: 'MULTIPLIER', value: currentAdj.printingRunMultiplier || 1.0 },
                paperCostMultiplier: { type: 'MULTIPLIER', value: currentAdj.paperCostMultiplier || 1.0 },
                bindingSetupAdjustment: { type: 'MULTIPLIER', value: currentAdj.bindingSetupAdjustment || 1.0 },
                bindingRunMultiplier: { type: 'MULTIPLIER', value: currentAdj.bindingRunMultiplier || 1.0 },
                laminationSetupAdjustment: { type: 'MULTIPLIER', value: currentAdj.laminationSetupAdjustment || 1.0 },
                laminationRunMultiplier: { type: 'MULTIPLIER', value: currentAdj.laminationRunMultiplier || 1.0 }
            };

            const data = await printhouseCalibrationApi.previewCommercialKnobs({
                printhouseId: printerNodeId,
                bookSpec,
                quantities,
                adjustments: rawAdjustments,
                quotePoints: quoteEvidence ? undefined : DEFAULT_QUOTE_POINTS,
                quoteEvidenceId: quoteEvidence?.id
            });

            setPreviewData(data);
        } catch (err: any) {
            setError(err.message || 'Failed to calculate commercial preview');
        } finally {
            setLoading(false);
        }
    };

    const handleKnobChange = (key: string, val: number) => {
        const next = { ...adjustments, [key]: val };
        setAdjustments(next);
        executePreview(next);
    };

    const handleSuggestFit = async () => {
        setLoading(true);
        try {
            const fit = await printhouseCalibrationApi.fitCommercialCurve({
                printhouseId: printerNodeId,
                bookSpec,
                quantities,
                quotePoints: quoteEvidence ? undefined : DEFAULT_QUOTE_POINTS,
                quoteEvidenceId: quoteEvidence?.id
            });

            setFitData(fit);

            if (fit && fit.suggestedAdjustments) {
                const sugg = fit.suggestedAdjustments;
                const newAdj = {
                    printingSetupAdjustment: sugg.printingSetupAdjustment?.value || 1.0,
                    printingRunMultiplier: sugg.printingRunMultiplier?.value || 1.0,
                    paperCostMultiplier: sugg.paperCostMultiplier?.value || 1.0,
                    bindingSetupAdjustment: sugg.bindingSetupAdjustment?.value || 1.0,
                    bindingRunMultiplier: sugg.bindingRunMultiplier?.value || 1.0,
                    laminationSetupAdjustment: sugg.laminationSetupAdjustment?.value || 1.0,
                    laminationRunMultiplier: sugg.laminationRunMultiplier?.value || 1.0
                };
                setAdjustments(newAdj);
                await executePreview(newAdj);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to compute commercial fit');
        } finally {
            setLoading(false);
        }
    };

    const handleResetAll = () => {
        const neutral = {
            printingSetupAdjustment: 1.0,
            printingRunMultiplier: 1.0,
            paperCostMultiplier: 1.0,
            bindingSetupAdjustment: 1.0,
            bindingRunMultiplier: 1.0,
            laminationSetupAdjustment: 1.0,
            laminationRunMultiplier: 1.0
        };
        setAdjustments(neutral);
        setFitData(null);
        executePreview(neutral);
    };

    // ── Phase 195G Governed Acceptance Execution ──
    const handleConfirmAcceptance = async () => {
        if (!previewData?.metadata?.baselineRatesChecksum || accepting) return;
        setAccepting(true);
        setError(null);
        try {
            const rawAdjustments = {
                printingSetupAdjustment: { type: 'MULTIPLIER', value: adjustments.printingSetupAdjustment || 1.0 },
                printingRunMultiplier: { type: 'MULTIPLIER', value: adjustments.printingRunMultiplier || 1.0 },
                paperCostMultiplier: { type: 'MULTIPLIER', value: adjustments.paperCostMultiplier || 1.0 },
                bindingSetupAdjustment: { type: 'MULTIPLIER', value: adjustments.bindingSetupAdjustment || 1.0 },
                bindingRunMultiplier: { type: 'MULTIPLIER', value: adjustments.bindingRunMultiplier || 1.0 },
                laminationSetupAdjustment: { type: 'MULTIPLIER', value: adjustments.laminationSetupAdjustment || 1.0 },
                laminationRunMultiplier: { type: 'MULTIPLIER', value: adjustments.laminationRunMultiplier || 1.0 }
            };

            const result = await printhouseCalibrationApi.acceptCommercialCalibration({
                printhouseId: printerNodeId,
                printerNodeId,
                baselineRatesChecksum: previewData.metadata.baselineRatesChecksum,
                adjustments: rawAdjustments,
                quoteEvidenceId: quoteEvidence?.id,
                quotePoints: quoteEvidence ? undefined : DEFAULT_QUOTE_POINTS,
                bookSpec
            });

            setAcceptanceResult(result);
            setShowAcceptModal(false);
            // Re-run preview with freshly loaded DB baseline to reflect active state
            await executePreview(adjustments);
        } catch (err: any) {
            let msg = err.message || 'Failed to accept commercial calibration';
            if (err.code === 'STALE_COMMERCIAL_CALIBRATION_BASELINE') {
                msg = 'Active rates have changed since preview was loaded. Please review current baseline.';
            } else if (err.code === 'CANDIDATE_CHECKSUM_MISMATCH') {
                msg = 'Candidate rates checksum mismatch. Please re-run preview.';
            }
            setError(msg);
        } finally {
            setAccepting(false);
        }
    };

    // Tolerance badge color helper
    const getToleranceBadge = (residualPct: number) => {
        const absPct = Math.abs(residualPct);
        if (absPct <= 2.0) {
            return { label: 'Within Governance', bg: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' };
        } else if (absPct <= 5.0) {
            return { label: 'Review Suggested', bg: 'bg-amber-500/10 text-amber-400 border-amber-500/20' };
        } else {
            return { label: 'Outside Governance', bg: 'bg-rose-500/10 text-rose-400 border-rose-500/20' };
        }
    };

    const allKnobs = previewData?.knobs || [
        { id: 'printingSetupAdjustment', label: 'Printing Setup', unit: '×', type: 'MULTIPLIER', min: 0.50, max: 2.00, step: 0.05, category: 'PRIMARY', description: 'Adjusts printing setup rate table proportionally (+10% = 1.10×)' },
        { id: 'printingRunMultiplier', label: 'Printing Running Cost', unit: '×', type: 'MULTIPLIER', min: 0.75, max: 1.25, step: 0.01, category: 'PRIMARY', description: 'Scales print per-thousand running rates' },
        { id: 'paperCostMultiplier', label: 'Paper Cost', unit: '×', type: 'MULTIPLIER', min: 0.80, max: 1.20, step: 0.01, category: 'ADVANCED', description: 'Scales interior and cover paper sheet prices' },
        { id: 'bindingSetupAdjustment', label: 'Binding Setup', unit: '×', type: 'MULTIPLIER', min: 0.50, max: 2.00, step: 0.05, category: 'ADVANCED', description: 'Scales binding makeready setup table' },
        { id: 'bindingRunMultiplier', label: 'Binding Per Copy', unit: '×', type: 'MULTIPLIER', min: 0.75, max: 1.25, step: 0.01, category: 'ADVANCED', description: 'Scales per-copy binding and folding rates' },
        { id: 'laminationSetupAdjustment', label: 'Lamination Setup', unit: '×', type: 'MULTIPLIER', min: 0.50, max: 2.00, step: 0.05, category: 'ADVANCED', description: 'Scales cover lamination setup rates' },
        { id: 'laminationRunMultiplier', label: 'Lamination Per Copy', unit: '×', type: 'MULTIPLIER', min: 0.75, max: 1.25, step: 0.01, category: 'ADVANCED', description: 'Scales lamination per-copy running rates' }
    ];

    const primaryKnobs = allKnobs.filter((k: any) => k.category === 'PRIMARY' || k.id === 'printingSetupAdjustment' || k.id === 'printingRunMultiplier');
    const advancedKnobs = allKnobs.filter((k: any) => !primaryKnobs.some((pk: any) => pk.id === k.id));

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-2xl space-y-6">
            
            {/* Top Status Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                    <div className="flex items-center gap-2">
                        <Sliders className="w-5 h-5 text-indigo-400" />
                        <h2 className="text-lg font-bold text-white tracking-wide">COMMERCIAL CALIBRATION PREVIEW</h2>
                        {acceptanceResult ? (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3" /> ACTIVE ({acceptanceResult.revisionId})
                            </span>
                        ) : (
                            <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                NOT ACTIVE
                            </span>
                        )}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                        {acceptanceResult ? 'Governed revision active in database' : 'No changes have been applied to live pricing'} • <span className="text-slate-300 font-mono">Node: {printerNodeId}</span>
                        {previewData?.metadata?.baselineRatesChecksum && (
                            <span className="ml-2 text-[11px] font-mono text-indigo-300">[Baseline: {previewData.metadata.baselineRatesChecksum.substring(0, 15)}...]</span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSuggestFit}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600/80 hover:bg-indigo-500 text-white transition flex items-center gap-1.5"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        Suggest Calibration
                    </button>
                    <button
                        onClick={() => setShowAcceptModal(true)}
                        disabled={loading || Boolean(acceptanceResult)}
                        className="px-3 py-1.5 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 cursor-pointer"
                    >
                        <Shield className="w-3.5 h-3.5" />
                        Accept Calibration
                    </button>
                    <button
                        onClick={handleResetAll}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset All
                    </button>
                    {onClose && (
                        <button
                            onClick={onClose}
                            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 transition"
                        >
                            Close
                        </button>
                    )}
                </div>
            </div>

            {error && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-lg text-rose-300 text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-400 flex-shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            {/* Price Points & Quote Comparison Table */}
            <div className="space-y-3">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <FileText className="w-4 h-4 text-indigo-400" />
                        Quote Benchmark & Prediction Comparison
                    </h3>
                    {previewData?.metrics && (
                        <div className="flex items-center gap-3 text-xs">
                            <span className="text-slate-400">Baseline MAE: <strong className="text-slate-200">€{previewData.metrics.baselineMAE}</strong></span>
                            <span className="text-slate-400">Adjusted MAE: <strong className="text-emerald-400">€{previewData.metrics.adjustedMAE}</strong> ({previewData.metrics.adjustedMAPE}%)</span>
                        </div>
                    )}
                </div>

                <div className="overflow-x-auto rounded-lg border border-slate-800 bg-slate-950">
                    <table className="w-full text-xs text-left">
                        <thead className="bg-slate-900 text-slate-400 font-semibold border-b border-slate-800">
                            <tr>
                                <th className="p-3">Quantity</th>
                                <th className="p-3">Source Quoted (Mfg)</th>
                                <th className="p-3">Baseline PPOS</th>
                                <th className="p-3">Adjusted PPOS</th>
                                <th className="p-3">Residual (€)</th>
                                <th className="p-3">Residual (%)</th>
                                <th className="p-3 text-right">Governance</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                            {previewData?.quantities?.map((item: any) => {
                                const quoted = item.quotedManufacturingPrice;
                                const residualPct = quoted ? ((item.adjustedPrice - quoted) / quoted) * 100 : 0;
                                const badge = getToleranceBadge(residualPct);

                                return (
                                    <tr key={item.quantity} className="hover:bg-slate-900/50 transition">
                                        <td className="p-3 font-semibold text-indigo-300">{item.quantity} copies</td>
                                        <td className="p-3 text-white">{quoted ? `€${quoted.toFixed(2)}` : 'N/A'}</td>
                                        <td className="p-3 text-slate-400">€{item.baselinePrice.toFixed(2)}</td>
                                        <td className="p-3 font-bold text-indigo-200">€{item.adjustedPrice.toFixed(2)}</td>
                                        <td className={`p-3 ${item.adjustedResidual > 0 ? 'text-amber-400' : item.adjustedResidual < 0 ? 'text-emerald-400' : 'text-slate-400'}`}>
                                            {item.adjustedResidual !== undefined ? `${item.adjustedResidual >= 0 ? '+' : ''}€${item.adjustedResidual.toFixed(2)}` : '-'}
                                        </td>
                                        <td className="p-3 text-slate-300">
                                            {quoted ? `${residualPct >= 0 ? '+' : ''}${residualPct.toFixed(2)}%` : '-'}
                                        </td>
                                        <td className="p-3 text-right">
                                            <span className={`px-2 py-0.5 text-[10px] font-sans font-semibold rounded border ${badge.bg}`}>
                                                {badge.label}
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Diagnostic Curve Fit Info (If available) */}
            {fitData && (
                <div className="p-3 bg-indigo-950/30 border border-indigo-800/40 rounded-lg text-xs space-y-1 text-slate-300">
                    <div className="flex items-center justify-between font-semibold text-indigo-300">
                        <span>Commercial Curve Fit (Least Squares)</span>
                        <span>Identifiability: {fitData.identifiabilityStatus}</span>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-1 font-mono text-[11px]">
                        <div>Fixed Setup (c): <strong>€{fitData.commercialFixed}</strong></div>
                        <div>Marginal Run (m): <strong>€{fitData.commercialMarginal}/copy</strong></div>
                        <div>R² Fit Score: <strong>{fitData.fitMetrics?.r2}</strong></div>
                        <div>Max Residual: <strong>€{fitData.fitMetrics?.maxResidual}</strong></div>
                    </div>
                </div>
            )}

            {/* Fine-Tuning Controls (PRIMARY & ADVANCED UX Hierarchy) */}
            <div className="space-y-4 pt-2">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sliders className="w-4 h-4 text-indigo-400" />
                        Primary Commercial Controls
                    </h3>
                    <button
                        onClick={() => setShowAdvanced(!showAdvanced)}
                        className="text-xs text-indigo-400 hover:text-indigo-300 font-medium underline flex items-center gap-1"
                    >
                        {showAdvanced ? 'Hide Advanced Controls' : 'Show Advanced Controls (Paper & Finishing)'}
                    </button>
                </div>

                {/* Primary Knobs */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {primaryKnobs.map((knob: any) => {
                        const currentVal = adjustments[knob.id] !== undefined ? adjustments[knob.id] : 1.0;
                        const isModified = currentVal !== 1.0;
                        const pctStr = `${(currentVal - 1.0) >= 0 ? '+' : ''}${((currentVal - 1.0) * 100).toFixed(0)}%`;

                        return (
                            <div key={knob.id} className="p-4 bg-slate-950 border border-indigo-900/40 rounded-lg space-y-2 hover:border-indigo-700/60 transition shadow-inner">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-bold text-indigo-200">{knob.label}</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`font-mono font-bold text-sm ${isModified ? 'text-indigo-400' : 'text-slate-400'}`}>
                                            {currentVal.toFixed(2)}× ({pctStr})
                                        </span>
                                        {isModified && (
                                            <button
                                                onClick={() => handleKnobChange(knob.id, 1.0)}
                                                className="text-[10px] text-slate-500 hover:text-slate-300 underline"
                                            >
                                                Reset
                                            </button>
                                        )}
                                    </div>
                                </div>
                                <p className="text-[11px] text-slate-400">{knob.description || 'Proportional rate table scaling'}</p>
                                <input
                                    type="range"
                                    min={knob.min}
                                    max={knob.max}
                                    step={knob.step}
                                    value={currentVal}
                                    onChange={(e) => handleKnobChange(knob.id, parseFloat(e.target.value))}
                                    className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                />
                                <div className="flex justify-between text-[10px] font-mono text-slate-500">
                                    <span>{knob.min}× (-50%)</span>
                                    <span>Baseline (1.0×)</span>
                                    <span>{knob.max}× (+100%)</span>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Advanced Knobs (Collapsible) */}
                {showAdvanced && (
                    <div className="space-y-3 pt-3 border-t border-slate-800">
                        <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                            Advanced Secondary Controls
                        </h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {advancedKnobs.map((knob: any) => {
                                const currentVal = adjustments[knob.id] !== undefined ? adjustments[knob.id] : 1.0;
                                const isModified = currentVal !== 1.0;
                                const pctStr = `${(currentVal - 1.0) >= 0 ? '+' : ''}${((currentVal - 1.0) * 100).toFixed(0)}%`;

                                return (
                                    <div key={knob.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg space-y-2 hover:border-slate-700 transition">
                                        <div className="flex items-center justify-between text-xs">
                                            <span className="font-semibold text-slate-300">{knob.label}</span>
                                            <div className="flex items-center gap-2">
                                                <span className={`font-mono font-bold ${isModified ? 'text-indigo-400' : 'text-slate-400'}`}>
                                                    {currentVal.toFixed(2)}× ({pctStr})
                                                </span>
                                                {isModified && (
                                                    <button
                                                        onClick={() => handleKnobChange(knob.id, 1.0)}
                                                        className="text-[10px] text-slate-500 hover:text-slate-300 underline"
                                                    >
                                                        Reset
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                        <p className="text-[11px] text-slate-400">{knob.description}</p>
                                        <input
                                            type="range"
                                            min={knob.min}
                                            max={knob.max}
                                            step={knob.step}
                                            value={currentVal}
                                            onChange={(e) => handleKnobChange(knob.id, parseFloat(e.target.value))}
                                            className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                                        />
                                        <div className="flex justify-between text-[10px] font-mono text-slate-500">
                                            <span>{knob.min}×</span>
                                            <span>Baseline (1.0×)</span>
                                            <span>{knob.max}×</span>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>

            {/* Phase 195G Explicit Two-Step Acceptance Confirmation Modal */}
            {showAcceptModal && (
                <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-900 border border-slate-700 rounded-xl max-w-2xl w-full p-6 text-slate-100 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                            <div className="flex items-center gap-2">
                                <Shield className="w-5 h-5 text-emerald-400" />
                                <h3 className="text-base font-bold text-white">Governed Commercial Calibration Acceptance</h3>
                            </div>
                            <button
                                onClick={() => setShowAcceptModal(false)}
                                className="text-slate-400 hover:text-white text-xs"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="space-y-3 text-xs">
                            <div className="grid grid-cols-2 gap-3 p-3 bg-slate-950 rounded-lg border border-slate-800 font-mono">
                                <div>Node: <strong className="text-slate-200">{printerNodeId}</strong></div>
                                <div>Mode: <strong className="text-indigo-400">{quoteEvidence ? 'EVIDENCE_CALIBRATED' : 'OPERATOR_ADJUSTED'}</strong></div>
                                <div className="truncate">Baseline: <strong className="text-slate-300">{previewData?.metadata?.baselineRatesChecksum ? `${previewData.metadata.baselineRatesChecksum.substring(0, 16)}...` : 'N/A'}</strong></div>
                                <div className="truncate">Candidate: <strong className="text-emerald-400">{previewData?.metadata?.baselineRatesChecksum ? `${previewData.metadata.baselineRatesChecksum.substring(0, 16)}...` : 'RECOMPUTED'}</strong></div>
                            </div>

                            {/* Applied Adjustments Summary */}
                            <div className="space-y-1">
                                <h4 className="font-semibold text-slate-300 uppercase tracking-wider text-[11px]">Applied Commercial Adjustments</h4>
                                <div className="grid grid-cols-2 gap-2 text-[11px] font-mono">
                                    {allKnobs.map((k: any) => {
                                        const val = adjustments[k.id] !== undefined ? adjustments[k.id] : 1.0;
                                        const pct = `${(val - 1.0) >= 0 ? '+' : ''}${((val - 1.0) * 100).toFixed(0)}%`;
                                        return (
                                            <div key={k.id} className="p-2 bg-slate-950 rounded border border-slate-800 flex justify-between">
                                                <span className="text-slate-400">{k.label}:</span>
                                                <span className={val !== 1.0 ? 'text-indigo-400 font-bold' : 'text-slate-400'}>{val.toFixed(2)}× ({pct})</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Benchmark Metrics */}
                            {previewData?.metrics && (
                                <div className="p-3 bg-indigo-950/40 border border-indigo-800/50 rounded-lg flex justify-between items-center text-xs">
                                    <span>Baseline MAE: <strong>€{previewData.metrics.baselineMAE}</strong></span>
                                    <span>Candidate MAE: <strong className="text-emerald-400">€{previewData.metrics.adjustedMAE}</strong></span>
                                    <span>Candidate MAPE: <strong className="text-emerald-400">{previewData.metrics.adjustedMAPE}%</strong></span>
                                </div>
                            )}

                            {/* Governance Warning */}
                            <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg text-amber-300 text-[11px] flex items-start gap-2">
                                <AlertCircle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                                <span>
                                    This will create a new immutable pricing revision, update printer_nodes.rates_json, and make it the current governed pricing configuration for node <strong className="font-mono text-white">{printerNodeId}</strong>.
                                </span>
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-3 border-t border-slate-800 pt-4">
                            <button
                                onClick={() => setShowAcceptModal(false)}
                                disabled={accepting}
                                className="px-4 py-2 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleConfirmAcceptance}
                                disabled={accepting}
                                className="px-4 py-2 text-xs font-bold rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center gap-1.5 shadow-lg shadow-emerald-600/30 cursor-pointer"
                            >
                                <CheckCircle2 className="w-4 h-4" />
                                {accepting ? 'Activating Pricing Revision...' : 'Confirm & Activate Pricing Revision'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
