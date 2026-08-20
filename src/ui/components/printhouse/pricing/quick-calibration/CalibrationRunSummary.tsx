/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationRunSummary.tsx
 *
 * Phase 193F — Calibration Solver Result & Performance Summary
 * Displays verified target manufacturing price, predicted forward price, and residual.
 */
import React from 'react';
import { Calculator, CheckCircle2, AlertTriangle, Sparkles, Truck, Activity } from 'lucide-react';

interface CalibrationRun {
    id: string;
    status: string;
    target_price: number;
    predicted_manufacturing_price: number;
    absolute_residual: number;
    percent_residual: number;
    evaluations_count?: number;
    proposed_patch_json?: any;
    identifiability_report_json?: any;
    aiExplanation?: string;
}

interface CalibrationRunSummaryProps {
    run: CalibrationRun;
    transportPricePerKg?: number | null;
    onExplain?: () => Promise<void>;
    explaining?: boolean;
}

export const CalibrationRunSummary: React.FC<CalibrationRunSummaryProps> = ({
    run,
    transportPricePerKg,
    onExplain,
    explaining = false
}) => {
    const isPrecise = run.absolute_residual <= 0.50;

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-5 space-y-5 shadow-sm">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 pb-4">
                <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                        <Calculator size={18} />
                    </div>
                    <div>
                        <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                            Pricing Calibration Proposal
                            <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                                {run.status}
                            </span>
                        </h4>
                        <p className="text-xs text-zinc-500 m-0">
                            Calculated by Deterministic Inverse Pricing Solver
                        </p>
                    </div>
                </div>

                {onExplain && !run.aiExplanation && (
                    <button
                        type="button"
                        onClick={onExplain}
                        disabled={explaining}
                        className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 self-start sm:self-auto"
                    >
                        <Sparkles size={13} className="text-[#dc0000]" />
                        <span>{explaining ? 'Generating Explanation...' : 'Explain Calibration'}</span>
                    </button>
                )}
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500 block mb-1">Target Price</span>
                    <span className="text-base font-bold text-zinc-900 dark:text-white">
                        {Number(run.target_price).toFixed(2)} EUR
                    </span>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500 block mb-1">Predicted Price</span>
                    <span className="text-base font-bold text-zinc-900 dark:text-white">
                        {Number(run.predicted_manufacturing_price).toFixed(2)} EUR
                    </span>
                </div>

                <div className={`p-3 rounded-lg border ${
                    isPrecise 
                        ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/60 text-emerald-900 dark:text-emerald-200' 
                        : 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800/60 text-amber-900 dark:text-amber-200'
                }`}>
                    <span className="text-xs opacity-80 block mb-1">Residual</span>
                    <span className="text-base font-bold flex items-center gap-1">
                        {Number(run.absolute_residual).toFixed(2)} EUR
                        <span className="text-[11px] font-normal opacity-80">
                            ({(Number(run.percent_residual) * 100).toFixed(2)}%)
                        </span>
                    </span>
                </div>

                <div className="p-3 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                    <span className="text-xs text-zinc-500 block mb-1 flex items-center justify-between">
                        <span>Transport Ref</span>
                        <span className="text-[9px] font-bold bg-zinc-200 dark:bg-zinc-700 px-1 py-0.5 rounded">External</span>
                    </span>
                    <span className="text-base font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                        <Truck size={14} className="text-zinc-400" />
                        <span>{transportPricePerKg ? `${Number(transportPricePerKg).toFixed(3)} €/kg` : '0.950 €/kg'}</span>
                    </span>
                </div>
            </div>

            {/* AI Natural Language Explanation (F2.17) */}
            {run.aiExplanation && (
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-zinc-900 dark:text-zinc-100">
                        <Sparkles size={14} className="text-[#dc0000]" />
                        <span>AI Assistant Explanation</span>
                        <span className="text-[10px] font-normal text-zinc-400">(Informational summary)</span>
                    </div>
                    <p className="text-xs text-zinc-700 dark:text-zinc-300 m-0 leading-relaxed whitespace-pre-wrap">
                        {run.aiExplanation}
                    </p>
                </div>
            )}
        </div>
    );
};
