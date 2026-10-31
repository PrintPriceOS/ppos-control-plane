/**
 * src/ui/components/printhouse/pricing/quick-calibration/CalibrationRateComparison.tsx
 *
 * Phase 193F — Proposed Rate Change Review Table
 * Renders server-provided rate diffs grouped by category.
 * Invariant: Renders server evidence only. Zero client-side derivation or patch calculations.
 */
import React from 'react';
import { Layers, ArrowRight, CheckCircle2, Lock, Tag } from 'lucide-react';

interface RateComparisonItem {
    path: string;
    category: string;
    label: string;
    currentValue: number;
    proposedValue: number;
    unit: string;
    status: 'CALIBRATED' | 'PRIOR_ANCHORED' | 'EXISTING_NODE_VALUE' | 'LOCKED' | 'NOT_IDENTIFIABLE';
}

interface CalibrationRateComparisonProps {
    items: RateComparisonItem[];
}

export const CalibrationRateComparison: React.FC<CalibrationRateComparisonProps> = ({ items }) => {
    if (!items || items.length === 0) {
        return (
            <div className="p-6 text-center text-xs text-zinc-500 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800">
                No active rate changes proposed. Run calibration to generate proposal.
            </div>
        );
    }

    // Group items by category
    const categories: Record<string, RateComparisonItem[]> = {};
    for (const item of items) {
        const cat = item.category || 'Other';
        if (!categories[cat]) categories[cat] = [];
        categories[cat].push(item);
    }

    const getStatusBadge = (status: string) => {
        switch (status) {
            case 'CALIBRATED':
                return (
                    <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-100 dark:bg-emerald-950/60 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                        Calibrated Active
                    </span>
                );
            case 'PRIOR_ANCHORED':
                return (
                    <span className="text-[10px] font-semibold text-purple-700 bg-purple-100 dark:bg-purple-950/60 dark:text-purple-300 px-2 py-0.5 rounded-full">
                        Prior-Anchored
                    </span>
                );
            case 'LOCKED':
                return (
                    <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Lock size={10} /> Locked
                    </span>
                );
            default:
                return (
                    <span className="text-[10px] font-semibold text-zinc-600 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                        {status}
                    </span>
                );
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <h5 className="text-xs font-bold uppercase tracking-wider text-zinc-700 dark:text-zinc-300 flex items-center gap-1.5">
                    <Layers size={14} className="text-[#dc0000]" />
                    <span>Proposed Rate Card Adjustments</span>
                </h5>
                <span className="text-[11px] text-zinc-500">
                    {items.length} active parameters evaluated
                </span>
            </div>

            <div className="space-y-4">
                {Object.keys(categories).map(catName => (
                    <div key={catName} className="border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden shadow-sm">
                        <div className="px-4 py-2.5 bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
                            <span className="text-xs font-bold text-zinc-900 dark:text-white capitalize">
                                {catName} Pricing
                            </span>
                            <span className="text-[10px] text-zinc-500">
                                {categories[catName].length} rates
                            </span>
                        </div>

                        <div className="divide-y divide-zinc-100 dark:divide-zinc-800/60 bg-white dark:bg-[#18181b]">
                            {categories[catName].map((rate, rIdx) => {
                                const isChanged = Math.abs(rate.currentValue - rate.proposedValue) > 0.0001;
                                return (
                                    <div key={rIdx} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                                        <div className="flex-1">
                                            <div className="font-semibold text-zinc-900 dark:text-zinc-100">
                                                {rate.label}
                                            </div>
                                            <div className="text-[10px] font-mono text-zinc-400 mt-0.5">
                                                {rate.path}
                                            </div>
                                        </div>

                                        <div className="flex items-center gap-4">
                                            <div className="flex items-center gap-2 font-mono">
                                                <span className="text-zinc-400 line-through">
                                                    {rate.currentValue.toFixed(3)} {rate.unit}
                                                </span>
                                                <ArrowRight size={13} className="text-zinc-400" />
                                                <span className={`font-bold ${isChanged ? 'text-[#dc0000] dark:text-red-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                                                    {rate.proposedValue.toFixed(3)} {rate.unit}
                                                </span>
                                            </div>
                                            <div>
                                                {getStatusBadge(rate.status)}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};
