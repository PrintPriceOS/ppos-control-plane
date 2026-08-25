/**
 * src/ui/components/printhouse/pricing/PricingHawkEyePanel.tsx
 *
 * Executive-level overview of pricing health, representative anchors,
 * domain completeness, and hydration integrity.
 *
 * Pure read-only aggregation over canonical PrinthouseRates (ph.rates).
 */

import React from 'react';
import {
    CheckCircleIcon,
    ExclamationTriangleIcon,
    InformationCircleIcon,
    ShieldCheckIcon,
    DocumentTextIcon,
    ServerStackIcon,
    CubeIcon,
    ArrowRightIcon,
    CheckBadgeIcon
} from '@heroicons/react/24/outline';
import { Printhouse } from '../../../pages/os/PrinthousesPage';
import { PricingDetailTab } from '../../../types/printhousePricing';
import { getPricingHawkEyeState } from '../../../lib/pricingHawkEyeHelper';

interface PricingHawkEyePanelProps {
    ph: Printhouse;
    onNavigateTab?: (tabName: PricingDetailTab) => void;
}

export const PricingHawkEyePanel: React.FC<PricingHawkEyePanelProps> = ({ ph, onNavigateTab }) => {
    const state = getPricingHawkEyeState(ph.rates);

    // Formatting helper for rate numbers with precision preservation
    const formatRate = (val: number | null | undefined): string => {
        if (val === null || val === undefined) return '—';
        if (val === 0) return '0.0000';
        return val.toFixed(4);
    };

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className="flex items-center gap-1.5">
                <h2 className="text-sm font-bold text-zinc-900 dark:text-zinc-100">
                    Pricing Hawk-Eye
                </h2>
                <InformationCircleIcon className="w-4 h-4 text-zinc-400 cursor-help" title="Read-only canonical pricing health, representative calibrated anchors, and domain completeness." />
            </div>

            {/* 1. Top KPI Row (6 cards) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
                {/* A. Pricing Coverage */}
                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 flex flex-col justify-between shadow-none relative">
                    <div className="flex items-center justify-between mb-2">
                        <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <span className="text-xs font-black">◎</span>
                        </div>
                        {state.coveragePercent === 100 ? (
                            <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                        ) : (
                            <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pricing Coverage</p>
                        <p className="text-xl font-black text-zinc-900 dark:text-zinc-100 mt-0.5">{state.coveragePercent}%</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                            {state.coveragePercent === 100 ? 'All domains configured' : `${state.configuredDomains} of ${state.totalDomains} domains`}
                        </p>
                    </div>
                </div>

                {/* B. Configured Domains */}
                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 flex flex-col justify-between shadow-none">
                    <div className="flex items-center justify-between mb-2">
                        <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <CubeIcon className="w-4 h-4" />
                        </div>
                        {state.configuredDomains === state.totalDomains ? (
                            <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                        ) : (
                            <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Configured Domains</p>
                        <p className="text-xl font-black text-zinc-900 dark:text-zinc-100 mt-0.5">{state.configuredDomains} / {state.totalDomains}</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                            {state.configuredDomains === state.totalDomains ? 'All domains active' : `${state.totalDomains - state.configuredDomains} incomplete`}
                        </p>
                    </div>
                </div>

                {/* C. Missing Key Anchors */}
                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 flex flex-col justify-between shadow-none">
                    <div className="flex items-center justify-between mb-2">
                        <div className={`w-7 h-7 flex items-center justify-center ${state.missingCriticalRates === 0 ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400' : 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400'}`}>
                            <ShieldCheckIcon className="w-4 h-4" />
                        </div>
                        {state.missingCriticalRates === 0 ? (
                            <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                        ) : (
                            <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Missing Key Anchors</p>
                        <p className="text-xl font-black text-zinc-900 dark:text-zinc-100 mt-0.5">{state.missingCriticalRates}</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">
                            {state.missingCriticalRates === 0 ? 'No gaps detected' : `${state.missingCriticalRates} rate gaps`}
                        </p>
                    </div>
                </div>

                {/* D. Pricing State */}
                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 flex flex-col justify-between shadow-none">
                    <div className="flex items-center justify-between mb-2">
                        <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <CheckBadgeIcon className="w-4 h-4" />
                        </div>
                        {state.pricingState === 'Configured' ? (
                            <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                        ) : (
                            <ExclamationTriangleIcon className="w-4 h-4 text-amber-500" />
                        )}
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Pricing State</p>
                        <p className="text-base font-black text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">{state.pricingState}</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{state.pricingStateSubtitle}</p>
                    </div>
                </div>

                {/* E. Active Revision */}
                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 flex flex-col justify-between shadow-none">
                    <div className="flex items-center justify-between mb-2">
                        <div className="w-7 h-7 bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 flex items-center justify-center">
                            <DocumentTextIcon className="w-4 h-4" />
                        </div>
                        <span className="w-2 h-2 rounded-full bg-zinc-300 dark:bg-zinc-700" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Active Revision</p>
                        <p className="text-base font-black text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">Not exposed</p>
                        <p className="text-[11px] text-zinc-400 dark:text-zinc-500 mt-0.5 truncate">Not exposed in Admin API</p>
                    </div>
                </div>

                {/* F. Canonical Source */}
                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3.5 flex flex-col justify-between shadow-none">
                    <div className="flex items-center justify-between mb-2">
                        <div className="w-7 h-7 bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
                            <ServerStackIcon className="w-4 h-4" />
                        </div>
                        <CheckCircleIcon className="w-4 h-4 text-emerald-500" />
                    </div>
                    <div>
                        <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Canonical Source</p>
                        <p className="text-base font-black text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">{state.canonicalSource}</p>
                        <p className="text-[11px] text-zinc-500 dark:text-zinc-400 mt-0.5 truncate">{state.sourceSubtitle}</p>
                    </div>
                </div>
            </div>

            {/* 2. Three Column Section (Anchors + Modules + Verification) */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Column 1: Key Pricing Anchors */}
                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col justify-between shadow-none">
                    <div>
                        <div className="flex items-center gap-1.5 mb-3">
                            <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                                Key Pricing Anchors
                            </h3>
                            <InformationCircleIcon className="w-3.5 h-3.5 text-zinc-400 cursor-help" title="Representative calibrated anchor rates from the canonical rate card." />
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-xs">
                                <thead>
                                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-[10px] font-bold text-zinc-400 uppercase tracking-wide">
                                        <th className="text-left pb-2 font-bold">Anchor</th>
                                        <th className="text-right pb-2 font-bold">Fixed (€)</th>
                                        <th className="text-right pb-2 font-bold">Variable (€)</th>
                                        <th className="text-right pb-2 font-bold pr-1">Unit</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-900">
                                    {state.anchors.map((a, idx) => (
                                        <tr key={idx} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                                            <td className="py-2.5 text-[11px] font-medium text-zinc-800 dark:text-zinc-200 flex items-center gap-1.5">
                                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${a.isConfigured ? 'bg-emerald-500' : 'bg-zinc-300 dark:bg-zinc-700'}`} />
                                                <span className="truncate">{a.label}</span>
                                            </td>
                                            <td className="py-2.5 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                                                {formatRate(a.fixed)}
                                            </td>
                                            <td className="py-2.5 text-right font-mono font-bold text-zinc-900 dark:text-zinc-100">
                                                {a.variable !== undefined ? formatRate(a.variable) : '—'}
                                            </td>
                                            <td className="py-2.5 text-right text-[10px] text-zinc-400 font-medium pr-1">
                                                {a.unit}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 mt-2">
                        <button
                            type="button"
                            onClick={() => onNavigateTab?.('Interior')}
                            className="text-xs font-bold text-[#dc0000] hover:text-red-700 dark:hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                            View detailed rates <ArrowRightIcon className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* Column 2: Pricing Modules */}
                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col justify-between shadow-none">
                    <div>
                        <div className="flex items-center gap-1.5 mb-3">
                            <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                                Pricing Modules
                            </h3>
                            <InformationCircleIcon className="w-3.5 h-3.5 text-zinc-400 cursor-help" title="Health and structural completeness per pricing domain." />
                        </div>

                        <div className="space-y-2">
                            {state.moduleList.map((m) => (
                                <div
                                    key={m.key}
                                    onClick={() => onNavigateTab?.(m.targetTab)}
                                    className="flex items-center justify-between p-2 hover:bg-zinc-50 dark:hover:bg-zinc-900 border border-zinc-100 dark:border-zinc-800/80 transition-colors cursor-pointer group"
                                >
                                    <div className="flex items-center gap-2">
                                        {m.status === 'CONFIGURED' ? (
                                            <CheckCircleIcon className="w-4 h-4 text-emerald-500 group-hover:scale-110 transition-transform" />
                                        ) : m.status === 'PARTIAL' ? (
                                            <ExclamationTriangleIcon className="w-4 h-4 text-amber-500 group-hover:scale-110 transition-transform" />
                                        ) : (
                                            <span className="w-4 h-4 rounded-full border border-zinc-300 dark:border-zinc-700 flex items-center justify-center text-[10px] text-zinc-400">×</span>
                                        )}
                                        <span className="text-xs font-bold text-zinc-800 dark:text-zinc-200">
                                            {m.label}
                                        </span>
                                    </div>
                                    <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 ${
                                        m.status === 'CONFIGURED'
                                            ? 'text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60'
                                            : m.status === 'PARTIAL'
                                            ? 'text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/60'
                                            : 'text-zinc-500 dark:text-zinc-400 bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700'
                                    }`}>
                                        {m.status === 'CONFIGURED' ? 'ACTIVE' : m.status}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 mt-2">
                        <button
                            type="button"
                            onClick={() => onNavigateTab?.('Interior')}
                            className="text-xs font-bold text-[#dc0000] hover:text-red-700 dark:hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                            Open module details <ArrowRightIcon className="w-3 h-3" />
                        </button>
                    </div>
                </div>

                {/* Column 3: Pricing Verification */}
                <div className="bg-white dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-4 flex flex-col justify-between shadow-none">
                    <div>
                        <div className="flex items-center gap-1.5 mb-3">
                            <h3 className="text-xs font-bold text-zinc-900 dark:text-zinc-100 uppercase tracking-wider">
                                Pricing Verification
                            </h3>
                            <InformationCircleIcon className="w-3.5 h-3.5 text-zinc-400 cursor-help" title="Read-only pricing structure and hydration status from the admin payload." />
                        </div>

                        {/* Pricing Readiness Banner */}
                        <div className={`p-3 border mb-3 flex items-start gap-2.5 ${
                            state.pricingReadiness === 'READY'
                                ? 'bg-emerald-50/60 dark:bg-emerald-950/30 border-emerald-100 dark:border-emerald-900/40'
                                : state.pricingReadiness === 'PARTIAL'
                                ? 'bg-amber-50/60 dark:bg-amber-950/30 border-amber-100 dark:border-amber-900/40'
                                : 'bg-zinc-50 dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800'
                        }`}>
                            <ShieldCheckIcon className={`w-5 h-5 shrink-0 mt-0.5 ${
                                state.pricingReadiness === 'READY' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                            }`} />
                            <div>
                                <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-600 dark:text-zinc-400">
                                    Pricing Readiness
                                </p>
                                <p className={`text-sm font-black ${
                                    state.pricingReadiness === 'READY' ? 'text-emerald-900 dark:text-emerald-200' : 'text-zinc-900 dark:text-zinc-100'
                                }`}>
                                    {state.pricingReadiness}
                                </p>
                                <p className="text-[11px] text-zinc-600 dark:text-zinc-400 mt-0.5">
                                    {state.readinessSubtitle}
                                </p>
                            </div>
                        </div>

                        {/* Verification Key-Values */}
                        <div className="space-y-2 text-xs divide-y divide-zinc-100 dark:divide-zinc-900">
                            <div className="flex justify-between items-center pt-1.5 first:pt-0">
                                <span className="text-zinc-400 font-medium">Pricing source</span>
                                <span className="text-zinc-800 dark:text-zinc-200 font-medium">Canonical rates_json</span>
                            </div>
                            <div className="flex justify-between items-center pt-1.5">
                                <span className="text-zinc-400 font-medium">Admin hydration</span>
                                <span className="text-emerald-600 dark:text-emerald-400 font-bold">
                                    {state.hasRates ? 'Loaded' : 'Unavailable'}
                                </span>
                            </div>
                            <div className="flex justify-between items-center pt-1.5">
                                <span className="text-zinc-400 font-medium">Rate-card structure</span>
                                <span className="text-zinc-800 dark:text-zinc-200 font-medium">
                                    {state.pricingState === 'Configured' ? 'Complete' : state.pricingState}
                                </span>
                            </div>
                            <div className="flex justify-between items-center pt-1.5">
                                <span className="text-zinc-400 font-medium">Active revision</span>
                                <span className="text-zinc-400 dark:text-zinc-500 font-medium">Not exposed</span>
                            </div>
                            <div className="flex justify-between items-center pt-1.5">
                                <span className="text-zinc-400 font-medium">Calibration metadata</span>
                                <span className="text-zinc-400 dark:text-zinc-500 font-medium">Not exposed</span>
                            </div>
                            <div className="flex justify-between items-center pt-1.5">
                                <span className="text-zinc-400 font-medium">Quote capability</span>
                                <span className={`font-medium ${state.quoteCapability === 'Available' ? 'text-emerald-600 dark:text-emerald-400' : 'text-zinc-400'}`}>
                                    {state.quoteCapability}
                                </span>
                            </div>
                            <div className="flex justify-between items-center pt-1.5">
                                <span className="text-zinc-400 font-medium">Quote engine</span>
                                <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900/60 px-1.5 py-0.5">
                                    Canonical Engine
                                </span>
                            </div>
                        </div>
                    </div>

                    <div className="pt-3 border-t border-zinc-100 dark:border-zinc-800 mt-2">
                        <button
                            type="button"
                            onClick={() => onNavigateTab?.('Interior')}
                            className="text-xs font-bold text-[#dc0000] hover:text-red-700 dark:hover:text-red-400 flex items-center gap-1 transition-colors cursor-pointer"
                        >
                            Open pricing details <ArrowRightIcon className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
