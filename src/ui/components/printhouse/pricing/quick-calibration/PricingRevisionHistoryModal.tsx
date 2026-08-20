/**
 * src/ui/components/printhouse/pricing/quick-calibration/PricingRevisionHistoryModal.tsx
 *
 * Phase 193F — Read-Only Pricing Revision History Drawer / Modal
 * Displays immutable revision history from 193D (printhouse_pricing_revisions).
 */
import React, { useState, useEffect } from 'react';
import { History, X, Clock, User, ShieldCheck, ArrowRight, Loader2, Tag } from 'lucide-react';
import { printhouseCalibrationApi } from '../../../../lib/printhouseCalibrationApi';

interface PricingRevisionHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    printerNodeId?: string;
}

export const PricingRevisionHistoryModal: React.FC<PricingRevisionHistoryModalProps> = ({
    isOpen,
    onClose,
    printerNodeId
}) => {
    const [revisions, setRevisions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchRevisions();
        }
    }, [isOpen, printerNodeId]);

    const fetchRevisions = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await printhouseCalibrationApi.listRevisions(printerNodeId);
            setRevisions(data || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load pricing revisions');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-end p-0 sm:p-4">
            <div className="bg-white dark:bg-[#18181b] border-l sm:border border-zinc-200 dark:border-[#27272a] sm:rounded-2xl h-full sm:h-[90vh] max-w-xl w-full p-6 shadow-2xl flex flex-col space-y-4 animate-in slide-in-from-right duration-200">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 flex items-center justify-center">
                            <History size={18} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                                Pricing Revision History
                            </h3>
                            <p className="text-xs text-zinc-500 m-0">
                                Immutable governance ledger of accepted rate adjustments
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto space-y-3">
                    {loading ? (
                        <div className="h-64 flex flex-col items-center justify-center text-xs text-zinc-500 gap-2">
                            <Loader2 size={20} className="animate-spin text-[#dc0000]" />
                            <span>Loading revision ledger...</span>
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-red-50 text-red-900 text-xs rounded-xl border border-red-200">
                            {error}
                        </div>
                    ) : revisions.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-zinc-500">
                            <ShieldCheck size={32} className="text-zinc-300 mb-2" />
                            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 m-0">No Pricing Revisions Yet</p>
                            <p className="text-[11px] text-zinc-400 mt-1 max-w-xs">
                                When you accept a Quick Pricing Calibration run, an immutable revision record will appear here.
                            </p>
                        </div>
                    ) : (
                        revisions.map((rev, idx) => (
                            <div
                                key={rev.id || idx}
                                className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-2.5 text-xs"
                            >
                                <div className="flex items-center justify-between">
                                    <span className="font-bold text-zinc-900 dark:text-white flex items-center gap-1.5">
                                        <Tag size={13} className="text-[#dc0000]" />
                                        Revision #{revisions.length - idx}
                                    </span>
                                    <span className="text-[11px] font-mono text-zinc-400">
                                        {rev.rates_checksum ? rev.rates_checksum.substring(0, 12) + '...' : ''}
                                    </span>
                                </div>

                                <div className="grid grid-cols-2 gap-2 text-[11px] text-zinc-600 dark:text-zinc-400">
                                    <div className="flex items-center gap-1.5">
                                        <Clock size={12} className="text-zinc-400" />
                                        <span>{new Date(rev.created_at).toLocaleString()}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                        <User size={12} className="text-zinc-400" />
                                        <span>{rev.created_by_email || rev.created_by || 'System'}</span>
                                    </div>
                                </div>

                                <div className="p-2 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200/70 dark:border-zinc-700/50 flex justify-between items-center text-[11px]">
                                    <span className="text-zinc-500">Source:</span>
                                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                                        {rev.source === 'CALIBRATION' ? 'Quick Calibration (193D)' : rev.source || 'MANUAL_SAVE'}
                                    </span>
                                </div>

                                {rev.engine_version && (
                                    <div className="text-[10px] text-zinc-400">
                                        Engine: {rev.engine_version}
                                    </div>
                                )}
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex justify-end">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold rounded-lg text-xs transition-colors"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
