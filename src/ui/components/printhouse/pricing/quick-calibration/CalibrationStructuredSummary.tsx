/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationStructuredSummary.tsx
 *
 * Phase 193F — Structured Book Specification Review
 * Visualizes the complete physical book spec with semantic confidence status badges.
 */
import React from 'react';
import { BookOpen, Layers, Sparkles, Check, AlertCircle, Edit2 } from 'lucide-react';

interface BookSpec {
    copies: number;
    book_width_mm: number;
    book_height_mm: number;
    orientation?: string;
    interior_pages: number;
    interior_print: string;
    paper_type_interior: string;
    paper_weight_interior: number;
    cover_pages?: number;
    cover_print: string;
    paper_type_cover: string;
    paper_weight_cover: number;
    lamination?: string;
    uv_varnish?: boolean;
    binding_method: string;
    endpapers?: boolean;
    paper_type_endpapers?: string;
    paper_weight_endpapers?: number;
    delivery_country?: string;
}

interface CalibrationStructuredSummaryProps {
    spec: Partial<BookSpec>;
    onFieldChange?: (field: keyof BookSpec, value: any) => void;
    readOnly?: boolean;
    extractedFields?: string[];
    confirmedFields?: string[];
    missingFields?: string[];
}

export const CalibrationStructuredSummary: React.FC<CalibrationStructuredSummaryProps> = ({
    spec,
    onFieldChange,
    readOnly = false,
    extractedFields = [],
    confirmedFields = [],
    missingFields = []
}) => {
    const getBadge = (field: string, val: any) => {
        if (val === undefined || val === null || val === '') {
            return (
                <span className="text-[10px] font-semibold text-rose-700 bg-rose-100 dark:bg-rose-950/60 dark:text-rose-300 px-1.5 py-0.5 rounded">
                    Missing
                </span>
            );
        }
        if (confirmedFields.includes(field)) {
            return (
                <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <Check size={10} /> Confirmed
                </span>
            );
        }
        if (extractedFields.includes(field)) {
            return (
                <span className="text-[10px] font-semibold text-blue-700 bg-blue-100 dark:bg-blue-950/60 dark:text-blue-300 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                    <Sparkles size={10} /> AI Extracted
                </span>
            );
        }
        return (
            <span className="text-[10px] font-semibold text-amber-700 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-1.5 py-0.5 rounded">
                Draft
            </span>
        );
    };

    return (
        <div className="bg-white dark:bg-[#18181b] border border-zinc-200 dark:border-[#27272a] rounded-xl p-5 space-y-5">
            <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
                <h4 className="text-sm font-bold text-zinc-900 dark:text-white flex items-center gap-2">
                    <BookOpen size={16} className="text-[#dc0000]" />
                    <span>Physical Book Specification</span>
                </h4>
                <div className="text-xs text-zinc-500">
                    Source of Truth for Inverse Pricing Solver
                </div>
            </div>

            {/* Section 1: Book Format & Volume */}
            <div>
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    1. Format & Volume
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-zinc-500">Copies</span>
                            {getBadge('copies', spec.copies)}
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white">
                            {spec.copies ? `${spec.copies.toLocaleString()} copies` : '—'}
                        </div>
                    </div>
                    <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-zinc-500">Dimensions</span>
                            {getBadge('book_width_mm', spec.book_width_mm)}
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white">
                            {spec.book_width_mm && spec.book_height_mm
                                ? `${spec.book_width_mm} × ${spec.book_height_mm} mm`
                                : '—'}
                        </div>
                    </div>
                    <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-zinc-500">Interior Pages</span>
                            {getBadge('interior_pages', spec.interior_pages)}
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white">
                            {spec.interior_pages ? `${spec.interior_pages} pages` : '—'}
                        </div>
                    </div>
                    <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-zinc-500">Destination</span>
                            {getBadge('delivery_country', spec.delivery_country)}
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white">
                            {spec.delivery_country || 'ES (Spain)'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 2: Interior & Printing */}
            <div>
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    2. Interior Pages & Printing
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-zinc-500">Print Mode</span>
                            {getBadge('interior_print', spec.interior_print)}
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white">
                            {spec.interior_print === '4/4' ? '4/4 Full Colour' : spec.interior_print === '1/1' ? '1/1 Black & White' : spec.interior_print || '—'}
                        </div>
                    </div>
                    <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-zinc-500">Paper Type</span>
                            {getBadge('paper_type_interior', spec.paper_type_interior)}
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white capitalize">
                            {spec.paper_type_interior || '—'}
                        </div>
                    </div>
                    <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-zinc-500">Grammage (GSM)</span>
                            {getBadge('paper_weight_interior', spec.paper_weight_interior)}
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white">
                            {spec.paper_weight_interior ? `${spec.paper_weight_interior} g/m²` : '—'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Section 3: Cover, Lamination & Binding */}
            <div>
                <div className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-2">
                    3. Cover, Finishing & Binding
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                    <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-zinc-500">Cover Print</span>
                            {getBadge('cover_print', spec.cover_print)}
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white">
                            {spec.cover_print ? `${spec.cover_print} Colour` : '—'}
                        </div>
                    </div>
                    <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-zinc-500">Cover Paper</span>
                            {getBadge('paper_weight_cover', spec.paper_weight_cover)}
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white">
                            {spec.paper_weight_cover ? `${spec.paper_weight_cover}g ${spec.paper_type_cover || 'mc'}` : '—'}
                        </div>
                    </div>
                    <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-zinc-500">Lamination</span>
                            {getBadge('lamination', spec.lamination)}
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white capitalize">
                            {spec.lamination || 'None'}
                        </div>
                    </div>
                    <div className="p-2.5 bg-zinc-50 dark:bg-zinc-900/50 rounded-lg border border-zinc-200 dark:border-zinc-800">
                        <div className="flex justify-between items-center mb-1">
                            <span className="text-xs text-zinc-500">Binding Method</span>
                            {getBadge('binding_method', spec.binding_method)}
                        </div>
                        <div className="text-sm font-bold text-zinc-900 dark:text-white capitalize">
                            {spec.binding_method || '—'}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
