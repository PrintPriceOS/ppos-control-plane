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
    // ── Local Knob Adjustments State ──
    const [adjustments, setAdjustments] = useState<Record<string, number>>({
        printingSetupAdjustment: 0,
        printingRunMultiplier: 1.0,
        paperCostMultiplier: 1.0,
        bindingSetupAdjustment: 0,
        bindingRunMultiplier: 1.0,
        laminationSetupAdjustment: 0,
        laminationRunMultiplier: 1.0
    });

    const [quantities, setQuantities] = useState<number[]>([500, 600, 700]);
    const [previewData, setPreviewData] = useState<any | null>(null);
    const [fitData, setFitData] = useState<any | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Initial load & calculation
    useEffect(() => {
        executePreview(adjustments);
    }, []);

    const executePreview = async (currentAdj: Record<string, number>) => {
        setLoading(true);
        setError(null);
        try {
            const rawAdjustments = {
                printingSetupAdjustment: { type: 'DELTA', amount: currentAdj.printingSetupAdjustment || 0 },
                printingRunMultiplier: { type: 'MULTIPLIER', value: currentAdj.printingRunMultiplier || 1.0 },
                paperCostMultiplier: { type: 'MULTIPLIER', value: currentAdj.paperCostMultiplier || 1.0 },
                bindingSetupAdjustment: { type: 'DELTA', amount: currentAdj.bindingSetupAdjustment || 0 },
                bindingRunMultiplier: { type: 'MULTIPLIER', value: currentAdj.bindingRunMultiplier || 1.0 },
                laminationSetupAdjustment: { type: 'DELTA', amount: currentAdj.laminationSetupAdjustment || 0 },
                laminationRunMultiplier: { type: 'MULTIPLIER', value: currentAdj.laminationRunMultiplier || 1.0 }
            };

            const data = await printhouseCalibrationApi.previewCommercialKnobs({
                printhouseId: printerNodeId,
                bookSpec,
                quantities,
                adjustments: rawAdjustments,
                baselineRates,
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
                baselineRates,
                quotePoints: quoteEvidence ? undefined : DEFAULT_QUOTE_POINTS,
                quoteEvidenceId: quoteEvidence?.id
            });

            setFitData(fit);

            if (fit && fit.suggestedAdjustments) {
                const sugg = fit.suggestedAdjustments;
                const newAdj = {
                    printingSetupAdjustment: sugg.printingSetupAdjustment?.amount || 0,
                    printingRunMultiplier: sugg.printingRunMultiplier?.value || 1.0,
                    paperCostMultiplier: sugg.paperCostMultiplier?.value || 1.0,
                    bindingSetupAdjustment: sugg.bindingSetupAdjustment?.amount || 0,
                    bindingRunMultiplier: sugg.bindingRunMultiplier?.value || 1.0,
                    laminationSetupAdjustment: sugg.laminationSetupAdjustment?.amount || 0,
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
            printingSetupAdjustment: 0,
            printingRunMultiplier: 1.0,
            paperCostMultiplier: 1.0,
            bindingSetupAdjustment: 0,
            bindingRunMultiplier: 1.0,
            laminationSetupAdjustment: 0,
            laminationRunMultiplier: 1.0
        };
        setAdjustments(neutral);
        setFitData(null);
        executePreview(neutral);
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

    const knobsList = previewData?.knobs || [
        { id: 'printingSetupAdjustment', label: 'Printing Setup', unit: '€', type: 'DELTA', min: -500, max: 500, step: 5 },
        { id: 'printingRunMultiplier', label: 'Printing Running Cost', unit: '×', type: 'MULTIPLIER', min: 0.75, max: 1.25, step: 0.01 },
        { id: 'paperCostMultiplier', label: 'Paper Cost', unit: '×', type: 'MULTIPLIER', min: 0.80, max: 1.20, step: 0.01 },
        { id: 'bindingSetupAdjustment', label: 'Binding Setup', unit: '€', type: 'DELTA', min: -300, max: 300, step: 5 },
        { id: 'bindingRunMultiplier', label: 'Binding Per Copy', unit: '×', type: 'MULTIPLIER', min: 0.75, max: 1.25, step: 0.01 },
        { id: 'laminationSetupAdjustment', label: 'Lamination Setup', unit: '€', type: 'DELTA', min: -150, max: 150, step: 5 },
        { id: 'laminationRunMultiplier', label: 'Lamination Per Copy', unit: '×', type: 'MULTIPLIER', min: 0.75, max: 1.25, step: 0.01 }
    ];

    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-6 text-slate-100 shadow-2xl space-y-6">
            
            {/* Top Status Banner */}
            <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-slate-800">
                <div>
                    <div className="flex items-center gap-2">
                        <Sliders className="w-5 h-5 text-indigo-400" />
                        <h2 className="text-lg font-bold text-white tracking-wide">COMMERCIAL CALIBRATION PREVIEW</h2>
                        <span className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            NOT ACTIVE
                        </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-1">
                        Commercial price reproduction & operator fine-tuning knobs • <span className="text-slate-300 font-mono">Machine routing: NOT REQUIRED</span>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={handleSuggestFit}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center gap-1.5 shadow-lg shadow-indigo-600/20"
                    >
                        <Sparkles className="w-3.5 h-3.5" />
                        Suggest Calibration
                    </button>
                    <button
                        onClick={handleResetAll}
                        disabled={loading}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition flex items-center gap-1.5"
                    >
                        <RotateCcw className="w-3.5 h-3.5" />
                        Reset All Knobs
                    </button>
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

            {/* Fine-Tuning Controls (Knobs) */}
            <div className="space-y-4 pt-2">
                <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-indigo-400" />
                    Simple Fine-Tuning Controls (7 Commercial Knobs)
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {knobsList.map((knob: any) => {
                        const currentVal = adjustments[knob.id] !== undefined ? adjustments[knob.id] : (knob.type === 'DELTA' ? 0 : 1.0);
                        const isModified = knob.type === 'DELTA' ? currentVal !== 0 : currentVal !== 1.0;

                        return (
                            <div key={knob.id} className="p-3.5 bg-slate-950 border border-slate-800 rounded-lg space-y-2 hover:border-slate-700 transition">
                                <div className="flex items-center justify-between text-xs">
                                    <span className="font-semibold text-slate-200">{knob.label}</span>
                                    <div className="flex items-center gap-2">
                                        <span className={`font-mono font-bold ${isModified ? 'text-indigo-400' : 'text-slate-400'}`}>
                                            {knob.type === 'DELTA' ? `${currentVal >= 0 ? '+' : ''}€${currentVal}` : `${currentVal.toFixed(2)}×`}
                                        </span>
                                        {isModified && (
                                            <button
                                                onClick={() => handleKnobChange(knob.id, knob.type === 'DELTA' ? 0 : 1.0)}
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
                                    <span>{knob.type === 'DELTA' ? `${knob.min}€` : `${knob.min}×`}</span>
                                    <span>Baseline ({knob.type === 'DELTA' ? '0€' : '1.0×'})</span>
                                    <span>{knob.type === 'DELTA' ? `+${knob.max}€` : `${knob.max}×`}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
