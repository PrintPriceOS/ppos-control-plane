/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationWarnings.tsx
 *
 * Phase 193F — Calibration Warnings & One-Book Limitation UX
 */
import React from 'react';
import { AlertCircle, Info, ShieldAlert, Sparkles } from 'lucide-react';

interface CalibrationWarningsProps {
    warnings?: string[];
    isCalculated?: boolean;
    residual?: number | null;
}

export const CalibrationWarnings: React.FC<CalibrationWarningsProps> = ({
    warnings = [],
    isCalculated = false,
    residual = null
}) => {
    return (
        <div className="space-y-3">
            {/* One-Book Limitation Contextual Notice (F2.16) */}
            <div className="p-3.5 bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-lg text-xs text-blue-900 dark:text-blue-200 flex gap-2.5 items-start">
                <Info size={16} className="text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div>
                    <span className="font-semibold block mb-0.5">Reference Book Calibration Scope</span>
                    <span>
                        Calibration from one reference book sets a starting baseline for active production paths. 
                        Only rates relevant to this job are adjusted; unrelated rates remain unchanged.
                    </span>
                </div>
            </div>

            {/* High Residual Warning */}
            {residual !== null && residual > 0.50 && (
                <div className="p-3.5 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/50 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex gap-2.5 items-start">
                    <AlertCircle size={16} className="text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                    <div>
                        <span className="font-semibold block mb-0.5">Solver Residual Notice ({residual.toFixed(2)} EUR)</span>
                        <span>
                            The calibrated rate combination has an absolute residual exceeding 0.50 EUR against your declared cost. 
                            Review the rate comparison before accepting.
                        </span>
                    </div>
                </div>
            )}

            {/* Explicit Warnings List */}
            {warnings && warnings.length > 0 && (
                <div className="p-3.5 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-lg text-xs text-zinc-700 dark:text-zinc-300">
                    <div className="flex items-center gap-1.5 font-semibold text-zinc-900 dark:text-zinc-100 mb-1.5">
                        <ShieldAlert size={14} className="text-zinc-500" />
                        <span>System Notes & Safeguards</span>
                    </div>
                    <ul className="list-disc list-inside space-y-1 text-zinc-600 dark:text-zinc-400">
                        {warnings.map((w, idx) => (
                            <li key={idx}>
                                {w === 'FORBIDDEN_CONTROL_FIELDS_REJECTED' 
                                    ? 'Restricted control fields were intercepted and discarded for safety.' 
                                    : w}
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};
