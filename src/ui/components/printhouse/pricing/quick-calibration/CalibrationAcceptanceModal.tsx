/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationAcceptanceModal.tsx
 *
 * Phase 193F — Governed Calibration Acceptance Confirmation Modal
 * Strict invariant: Calls only 193D POST /calibrations/:id/accept with { runId }.
 * Never sends client-crafted rates, patches, or checksums.
 */
import React from 'react';
import { ShieldCheck, AlertTriangle, CheckCircle, X, Loader2, ArrowRight } from 'lucide-react';

interface CalibrationAcceptanceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onConfirm: () => Promise<void>;
    accepting: boolean;
    nodeName: string;
    bookName: string;
    targetPrice: number;
    predictedPrice: number;
    residual: number;
    error?: string | null;
}

export const CalibrationAcceptanceModal: React.FC<CalibrationAcceptanceModalProps> = ({
    isOpen,
    onClose,
    onConfirm,
    accepting,
    nodeName,
    bookName,
    targetPrice,
    predictedPrice,
    residual,
    error
}) => {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 flex items-center justify-center">
                            <ShieldCheck size={18} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                                Confirm Governed Acceptance
                            </h3>
                            <p className="text-xs text-zinc-500 m-0">
                                Apply calibrated rate card to production node
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={accepting}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Acceptance Summary Checklist */}
                <div className="space-y-3 text-xs">
                    <div className="p-3 bg-zinc-50 dark:bg-zinc-900/60 rounded-xl space-y-2 border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between">
                            <span className="text-zinc-500">Target Production Node:</span>
                            <span className="font-bold text-zinc-900 dark:text-white">{nodeName}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-zinc-500">Reference Book:</span>
                            <span className="font-bold text-zinc-900 dark:text-white">{bookName || 'Reference Book'}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-zinc-500">Declared Manufacturing Target:</span>
                            <span className="font-mono font-bold text-zinc-900 dark:text-white">{targetPrice.toFixed(2)} EUR</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-zinc-500">Calibrated Forward Price:</span>
                            <span className="font-mono font-bold text-emerald-600">{predictedPrice.toFixed(2)} EUR</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-zinc-500">Solver Residual:</span>
                            <span className="font-mono font-bold text-zinc-700 dark:text-zinc-300">{residual.toFixed(2)} EUR</span>
                        </div>
                    </div>

                    {/* Governance Notice */}
                    <div className="p-3 bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800/50 rounded-xl text-blue-900 dark:text-blue-200 space-y-1.5">
                        <span className="font-bold block">Immutable Pricing Revision Creation</span>
                        <p className="m-0 text-[11px] leading-relaxed opacity-90">
                            Accepting will atomically verify baseline integrity, update active production rate cards for this node, and record an immutable pricing revision in the audit ledger.
                        </p>
                    </div>

                    {/* Error Banner */}
                    {error && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-900 rounded-xl flex items-center gap-2 font-medium">
                            <AlertTriangle size={15} className="text-red-600 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}
                </div>

                {/* Action Buttons */}
                <div className="flex items-center justify-end gap-3 pt-2">
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={accepting}
                        className="px-4 py-2 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={onConfirm}
                        disabled={accepting}
                        className="px-4 py-2 bg-[#dc0000] hover:bg-[#b00000] disabled:bg-zinc-400 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 shadow-sm"
                    >
                        {accepting ? (
                            <>
                                <Loader2 size={13} className="animate-spin" />
                                <span>Applying Revision...</span>
                            </>
                        ) : (
                            <>
                                <CheckCircle size={13} />
                                <span>Accept Pricing Revision</span>
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};
