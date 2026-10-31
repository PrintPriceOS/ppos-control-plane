/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationSessionsHistoryModal.tsx
 *
 * Phase 193H — Calibration Sessions & Reference Book History Drawer / Modal
 * Displays history of calibration sessions and reference book configurations.
 */
import React, { useState, useEffect } from 'react';
import { BookOpen, X, Clock, User, CheckCircle2, AlertCircle, RefreshCw, Loader2, Sparkles } from 'lucide-react';
import { printhouseCalibrationApi } from '../../../../lib/printhouseCalibrationApi';

interface CalibrationSessionsHistoryModalProps {
    isOpen: boolean;
    onClose: () => void;
    printerNodeId?: string;
    onSelectSession?: (session: any) => void;
}

export const CalibrationSessionsHistoryModal: React.FC<CalibrationSessionsHistoryModalProps> = ({
    isOpen,
    onClose,
    printerNodeId,
    onSelectSession
}) => {
    const [sessions, setSessions] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (isOpen) {
            fetchSessions();
        }
    }, [isOpen, printerNodeId]);

    const fetchSessions = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await printhouseCalibrationApi.listSessions(printerNodeId);
            setSessions(data || []);
        } catch (err: any) {
            setError(err.message || 'Failed to load calibration sessions');
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'ACCEPTED':
                return (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1">
                        <CheckCircle2 size={11} />
                        Active / Accepted
                    </span>
                );
            case 'CALCULATED':
                return (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300 border border-blue-200 dark:border-blue-800 flex items-center gap-1">
                        <Sparkles size={11} />
                        Calculated
                    </span>
                );
            case 'READY':
                return (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                        Ready for Solver
                    </span>
                );
            case 'DRAFT':
                return (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700">
                        Draft Spec
                    </span>
                );
            case 'REJECTED':
                return (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300 border border-red-200 dark:border-red-800 flex items-center gap-1">
                        <AlertCircle size={11} />
                        Rejected / Superseded
                    </span>
                );
            default:
                return (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-zinc-100 text-zinc-700">
                        {status}
                    </span>
                );
        }
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-end p-0 sm:p-4">
            <div className="bg-white dark:bg-[#18181b] border-l sm:border border-zinc-200 dark:border-[#27272a] sm:rounded-2xl h-full sm:h-[90vh] max-w-xl w-full p-6 shadow-2xl flex flex-col space-y-4 animate-in slide-in-from-right duration-200">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-950/60 text-[#dc0000] flex items-center justify-center">
                            <BookOpen size={18} />
                        </div>
                        <div>
                            <h3 className="text-base font-bold text-zinc-900 dark:text-white">
                                Calibrated Books History
                            </h3>
                            <p className="text-xs text-zinc-500 m-0">
                                Past reference book calibration sessions & target price models
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
                            <span>Loading calibration history...</span>
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-red-50 text-red-900 text-xs rounded-xl border border-red-200">
                            {error}
                        </div>
                    ) : sessions.length === 0 ? (
                        <div className="h-64 flex flex-col items-center justify-center text-center p-6 text-zinc-500">
                            <BookOpen size={32} className="text-zinc-300 mb-2" />
                            <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300 m-0">No Calibration Sessions Yet</p>
                            <p className="text-[11px] text-zinc-400 mt-1 max-w-xs">
                                When you configure a reference book in the Pricing Assistant, session records will be tracked here.
                            </p>
                        </div>
                    ) : (
                        sessions.map((sess, idx) => {
                            const spec = sess.bookSpec || {};
                            const createdAt = sess.createdAt || sess.created_at;
                            const createdDate = createdAt ? new Date(createdAt) : null;
                            const validDate = createdDate && !isNaN(createdDate.getTime())
                                ? createdDate.toLocaleString()
                                : 'Recorded session';

                            const author = typeof sess.createdBy === 'object' && sess.createdBy !== null
                                ? (sess.createdBy.email || sess.createdBy.id || 'User')
                                : (sess.created_by_email || sess.created_by || 'User');

                            const price = sess.targetManufacturingPrice ?? sess.target_manufacturing_price;
                            const currency = sess.currency || 'EUR';

                            return (
                                <div
                                    key={sess.id || idx}
                                    className="p-4 bg-zinc-50 dark:bg-zinc-900/60 border border-zinc-200 dark:border-zinc-800 rounded-xl space-y-3 text-xs"
                                >
                                    {/* Session Header */}
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-zinc-900 dark:text-white">
                                                {spec.copies ? `${spec.copies.toLocaleString()} copies` : 'Book Session'}
                                            </span>
                                            {spec.book_width_mm && spec.book_height_mm && (
                                                <span className="text-[11px] text-zinc-500">
                                                    ({spec.book_width_mm} × {spec.book_height_mm} mm)
                                                </span>
                                            )}
                                        </div>
                                        {getStatusBadge(sess.status)}
                                    </div>

                                    {/* Physical Specs Pills */}
                                    <div className="flex flex-wrap gap-1.5 text-[11px]">
                                        {spec.interior_pages && (
                                            <span className="px-2 py-0.5 bg-white dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                                                {spec.interior_pages} pp
                                            </span>
                                        )}
                                        {spec.interior_print && (
                                            <span className="px-2 py-0.5 bg-white dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                                                {spec.interior_print}
                                            </span>
                                        )}
                                        {(spec.paper_type_interior || spec.paper_weight_interior) && (
                                            <span className="px-2 py-0.5 bg-white dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300">
                                                {spec.paper_type_interior || ''} {spec.paper_weight_interior ? `${spec.paper_weight_interior}g` : ''}
                                            </span>
                                        )}
                                        {spec.binding_method && (
                                            <span className="px-2 py-0.5 bg-white dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 capitalize">
                                                {spec.binding_method}
                                            </span>
                                        )}
                                        {spec.lamination && (
                                            <span className="px-2 py-0.5 bg-white dark:bg-zinc-800 rounded-md border border-zinc-200 dark:border-zinc-700 text-zinc-700 dark:text-zinc-300 capitalize">
                                                {spec.lamination} lam
                                            </span>
                                        )}
                                    </div>

                                    {/* Commercial Target & Metadata */}
                                    <div className="p-2.5 bg-white dark:bg-zinc-800/80 rounded-lg border border-zinc-200/70 dark:border-zinc-700/50 flex justify-between items-center text-[11px]">
                                        <div>
                                            <span className="text-zinc-500">Target Cost: </span>
                                            <span className="font-bold text-zinc-900 dark:text-white">
                                                {price !== null && price !== undefined ? `${Number(price).toFixed(2)} ${currency}` : '—'}
                                            </span>
                                            {spec.copies && price ? (
                                                <span className="text-[10px] text-zinc-400 ml-1.5">
                                                    ({(Number(price) / spec.copies).toFixed(3)} €/u)
                                                </span>
                                            ) : null}
                                        </div>
                                        <span className="font-mono text-[10px] text-zinc-400">{sess.id}</span>
                                    </div>

                                    {/* Footer Info */}
                                    <div className="grid grid-cols-2 gap-2 text-[10px] text-zinc-400">
                                        <div className="flex items-center gap-1.5 truncate">
                                            <Clock size={11} className="shrink-0" />
                                            <span className="truncate">{validDate}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5 truncate">
                                            <User size={11} className="shrink-0" />
                                            <span className="truncate" title={author}>{author}</span>
                                        </div>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer */}
                <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 flex justify-between items-center">
                    <button
                        type="button"
                        onClick={fetchSessions}
                        disabled={loading}
                        className="px-3 py-1.5 text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                        <RefreshCw size={13} className={loading ? 'animate-spin' : ''} />
                        <span>Refresh</span>
                    </button>
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700 text-zinc-800 dark:text-zinc-200 font-semibold rounded-lg text-xs transition-colors cursor-pointer"
                    >
                        Close
                    </button>
                </div>
            </div>
        </div>
    );
};
